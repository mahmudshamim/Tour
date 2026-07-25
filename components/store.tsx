"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useMemo,
  useRef,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { MEMBER_COLORS, type CategoryId } from "./constants";
import {
  EMPTY,
  DEFAULT_SETTINGS,
  uid,
  diff,
  computeBalances,
  isPoolTxn,
  deviceLabel,
  deviceId,
  timezone,
  newTrip,
  pickActiveTrip,
  tripToSettings,
  withSettings,
  type State,
  type Trip,
  type Member,
  type Txn,
  type TxnDraft,
  type AuditEntry,
  type Settings,
  type Balances,
  type Place,
} from "./models";
import {
  db,
  dbConfigured,
  loadTrips,
  loadTripData,
  flush,
  type TripData,
} from "./db";
import * as outbox from "./outbox";

export type { Member, Txn, AuditEntry, Settings, Balances, Trip } from "./models";
export { computeBalances, isPoolTxn } from "./models";

/** The trip that pre-multi-trip data is migrated onto. Deliberately a
 *  fixed id so the SQL migration and every device agree on it. */
export const LEGACY_TRIP_ID = "trip-legacy";

/* ---- local cache (instant paint + offline) ---- */

const TRIPS_KEY = "terra.trips.v1";
const LEGACY_KEY = "terraexplore.v1"; // single-trip cache, pre-migration
const dataKey = (tripId: string) => `terra.trip.${tripId}.v1`;

const EMPTY_DATA: TripData = { members: [], txns: [], audit: [] };

type TripsCache = { trips: Trip[]; activeTripId: string };

function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Pre-multi-trip installs kept one flat blob. Fold it onto the legacy
 * trip so nothing on the device is lost, then leave the old key alone
 * (harmless, and a safety net if this goes wrong).
 */
function migrateLegacyCache(): TripsCache | null {
  const old = readJSON<any>(LEGACY_KEY);
  if (!old) return null;
  const s: Settings = { ...DEFAULT_SETTINGS, ...(old.settings ?? {}) };
  const trip: Trip = {
    id: LEGACY_TRIP_ID,
    name: s.tripName || "Sylhet",
    status: "active",
    budget: s.budget,
    currency: s.currency,
    selfId: s.selfId,
    createdAt: Date.now(),
  };
  const stamp = <T,>(rows: T[]): T[] =>
    (rows ?? []).map((r) => ({ ...r, tripId: LEGACY_TRIP_ID }));
  writeJSON(dataKey(LEGACY_TRIP_ID), {
    members: stamp(old.members ?? []),
    txns: stamp(old.txns ?? []),
    audit: stamp(old.audit ?? []),
  });
  const cache: TripsCache = { trips: [trip], activeTripId: trip.id };
  writeJSON(TRIPS_KEY, cache);
  return cache;
}

function loadTripsCache(): TripsCache | null {
  const c = readJSON<TripsCache>(TRIPS_KEY);
  if (c && Array.isArray(c.trips)) return c;
  return migrateLegacyCache();
}

const loadDataCache = (tripId: string): TripData | null =>
  readJSON<TripData>(dataKey(tripId));

/* ---- reducer (pure local application of already-built payloads) ---- */
type Action =
  | { type: "setTrips"; trips: Trip[] }
  | { type: "setActive"; tripId: string; trips?: Trip[] }
  | { type: "setData"; tripId: string; data: TripData }
  | { type: "upsertMember"; member: Member }
  | { type: "removeMember"; id: string }
  | { type: "upsertTxn"; txn: Txn; prepend?: boolean }
  | { type: "removeTxn"; id: string }
  | { type: "addAudit"; entry: AuditEntry }
  | { type: "setSettings"; settings: Settings }
  | { type: "reset" };

/** Keep `settings` and the active trip's row from drifting apart. */
function project(state: State, trips: Trip[], tripId: string): State {
  const active = trips.find((t) => t.id === tripId);
  return {
    ...state,
    trips,
    tripId,
    settings: active ? tripToSettings(active) : state.settings,
  };
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "setTrips":
      return project(state, a.trips, state.tripId);
    case "setActive":
      return project(state, a.trips ?? state.trips, a.tripId);
    case "setData":
      return a.tripId !== state.tripId
        ? state // a stale load for a trip we've since switched away from
        : { ...state, ...a.data };
    case "upsertMember": {
      const exists = state.members.some((m) => m.id === a.member.id);
      return {
        ...state,
        members: exists
          ? state.members.map((m) => (m.id === a.member.id ? a.member : m))
          : [...state.members, a.member],
      };
    }
    case "removeMember":
      return { ...state, members: state.members.filter((m) => m.id !== a.id) };
    case "upsertTxn": {
      const exists = state.txns.some((t) => t.id === a.txn.id);
      return {
        ...state,
        txns: exists
          ? state.txns.map((t) => (t.id === a.txn.id ? a.txn : t))
          : a.prepend
          ? [a.txn, ...state.txns]
          : [...state.txns, a.txn],
      };
    }
    case "removeTxn":
      return { ...state, txns: state.txns.filter((t) => t.id !== a.id) };
    case "addAudit":
      return { ...state, audit: [a.entry, ...state.audit] };
    case "setSettings":
      return {
        ...state,
        settings: a.settings,
        trips: state.trips.map((t) =>
          t.id === state.tripId ? withSettings(t, a.settings) : t
        ),
      };
    case "reset":
      return EMPTY;
    default:
      return state;
  }
}

/* ---- context ---- */
type CreateTripOpts = { copyMembers?: boolean; copyPlaces?: Place[] };

type Store = {
  ready: boolean;
  syncing: boolean;
  configured: boolean;
  online: boolean;
  /** writes made on this device that haven't reached the cloud yet */
  pending: number;
  /** last cloud error, e.g. a migration that hasn't been run */
  syncError: string;
  state: State;
  /** viewing an archived trip → every mutation is a no-op */
  archived: boolean;
  balances: Balances;
  totalSpent: number;
  pool: number;
  memberById: (id: string) => Member | undefined;
  addMember: (name: string, contribution?: number) => void;
  updateMember: (
    id: string,
    patch: { name?: string; contribution?: number; color?: string }
  ) => void;
  removeMember: (id: string) => void;
  addTxn: (data: TxnDraft) => void;
  updateTxn: (id: string, data: TxnDraft) => void;
  deleteTxn: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /* trips */
  createTrip: (name: string, opts?: CreateTripOpts) => void;
  switchTrip: (tripId: string) => void;
  archiveTrip: (tripId: string) => void;
  restoreTrip: (tripId: string) => void;
  deleteTrip: (tripId: string) => void;
  seedSample: () => void;
  clearAll: () => void;
};

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncError, setSyncError] = useState("");

  // keep a ref to latest state for diffing inside async wrappers
  const stateRef = useRef(state);
  stateRef.current = state;

  // which trip the sync loop should converge on (set by switchTrip)
  const wantTripRef = useRef("");
  const syncRef = useRef<(showSpinner?: boolean) => void>(() => {});

  /* ---- boot + sync loop ---- */
  useEffect(() => {
    let alive = true;

    // paint from cache immediately; the cloud catches up in the background
    const cache = loadTripsCache();
    if (cache && cache.trips.length) {
      const activeId =
        cache.trips.some((t) => t.id === cache.activeTripId) && cache.activeTripId
          ? cache.activeTripId
          : pickActiveTrip(cache.trips);
      wantTripRef.current = activeId;
      dispatch({ type: "setActive", tripId: activeId, trips: cache.trips });
      const data = loadDataCache(activeId);
      if (data) dispatch({ type: "setData", tripId: activeId, data });
    }
    setReady(true);

    const syncOnline = () => setOnline(navigator.onLine !== false);
    syncOnline();
    setPending(outbox.count());
    const unwatch = outbox.subscribe(() => setPending(outbox.count()));

    /** No cloud (or an empty one): stand up the legacy trip locally. */
    const bootstrapLocal = () => {
      const s = stateRef.current;
      if (s.trips.length) return;
      const trip: Trip = {
        ...newTrip(s.settings.tripName || DEFAULT_SETTINGS.tripName),
        id: LEGACY_TRIP_ID,
      };
      wantTripRef.current = trip.id;
      dispatch({ type: "setActive", tripId: trip.id, trips: [trip] });
      if (dbConfigured) db.saveTrip(trip);
    };

    if (!dbConfigured) {
      bootstrapLocal();
      window.addEventListener("online", syncOnline);
      window.addEventListener("offline", syncOnline);
      return () => {
        alive = false;
        unwatch();
        window.removeEventListener("online", syncOnline);
        window.removeEventListener("offline", syncOnline);
      };
    }

    // Push queued writes, then pull the latest. Flush and refetch are
    // deliberately serialised in one pass — running them concurrently
    // lets a snapshot taken *before* a flush land *after* it, which
    // would drop the just-uploaded row from the UI.
    let inFlight = false;
    let queued = false;
    const sync = async (showSpinner = false) => {
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      if (showSpinner) setSyncing(true);

      await flush();

      const tripsRes = await loadTrips();

      if (alive && !tripsRes.ok) {
        setSyncError(tripsRes.error);
        console.warn("[store] trips load failed:", tripsRes.error);
      } else if (alive && tripsRes.ok) {
        setSyncError("");
        let trips = outbox.applyTrips(tripsRes.trips);

        // brand-new (or freshly migrated) cloud → stand up the first trip
        // and show it straight away rather than waiting a round trip
        if (!trips.length) {
          const local = stateRef.current.trips;
          const trip: Trip =
            local[0] ??
            ({ ...newTrip(DEFAULT_SETTINGS.tripName), id: LEGACY_TRIP_ID } as Trip);
          db.saveTrip(trip); // fixed id → re-runs coalesce, never duplicate
          trips = [trip];
          dispatch({ type: "setActive", tripId: trip.id, trips });
        }

        const want = wantTripRef.current;
        const activeId =
          want && trips.some((t) => t.id === want) ? want : pickActiveTrip(trips);
        wantTripRef.current = activeId;

        // Guard only the rows fetch: if the queue changes while it's in
        // flight the snapshot is stale, so drop it and go round again
        // rather than dispatching a state that's missing the new write.
        const v0 = outbox.version();
        const dataRes = await loadTripData(activeId);
        if (alive) {
          if (!dataRes.ok) {
            setSyncError(dataRes.error);
            console.warn("[store] trip load failed:", dataRes.error);
          } else if (outbox.version() !== v0) {
            queued = true;
          } else {
            // replay anything still queued on top of the server snapshot,
            // so offline edits survive the overwrite
            const merged = outbox.applyTrips(tripsRes.trips);
            const data = outbox.applyTripData(dataRes.data, activeId);
            const nextTrips = merged.length ? merged : trips;
            dispatch({ type: "setActive", tripId: activeId, trips: nextTrips });
            dispatch({ type: "setData", tripId: activeId, data });
            writeJSON(TRIPS_KEY, { trips: nextTrips, activeTripId: activeId });
            writeJSON(dataKey(activeId), data);
          }
        }
      }

      if (showSpinner) setSyncing(false);
      inFlight = false;
      if (queued && alive) {
        queued = false;
        sync();
      }
    };
    syncRef.current = sync;

    sync(true);

    // 1) realtime push — instant when Supabase realtime is enabled on the tables
    const unsub = db.onChange(() => sync());

    // 2) local write queued → try to push it out right away (debounced so a
    //    burst of edits results in one flush)
    let nudge = 0;
    const unwatchQueue = outbox.subscribe(() => {
      window.clearTimeout(nudge);
      nudge = window.setTimeout(() => sync(), 400);
    });

    // 3) pull the moment this device becomes active again (tab focus / app
    //    foreground / network back) — covers anything realtime missed
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    const onFocus = () => sync();
    const onNetUp = () => {
      syncOnline();
      sync();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onNetUp);
    window.addEventListener("offline", syncOnline);
    document.addEventListener("visibilitychange", onVisible);

    // 4) low-frequency safety poll while visible — guarantees convergence even
    //    if realtime is off; skipped in the background to save requests
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") sync();
    }, 15000);

    return () => {
      alive = false;
      unsub();
      unwatch();
      unwatchQueue();
      window.clearTimeout(nudge);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onNetUp);
      window.removeEventListener("offline", syncOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(poll);
    };
  }, []);

  // mirror to cache on every change
  useEffect(() => {
    if (!ready || !state.tripId) return;
    writeJSON(TRIPS_KEY, { trips: state.trips, activeTripId: state.tripId });
    writeJSON(dataKey(state.tripId), {
      members: state.members,
      txns: state.txns,
      audit: state.audit,
    });
  }, [state, ready]);

  const activeTrip = useMemo(
    () => state.trips.find((t) => t.id === state.tripId),
    [state.trips, state.tripId]
  );
  const archived = activeTrip?.status === "archived";
  const archivedRef = useRef(archived);
  archivedRef.current = archived;

  const balances = useMemo(
    () => computeBalances(state.members, state.txns),
    [state.members, state.txns]
  );
  // pool spending only — own-pocket expenses are excluded everywhere the
  // group's money is being reported
  const totalSpent = useMemo(
    () => state.txns.reduce((s, t) => (isPoolTxn(t) ? s + t.amount : s), 0),
    [state.txns]
  );
  const memberById = useCallback(
    (id: string) => state.members.find((m) => m.id === id),
    [state.members]
  );

  /* ---- actions: optimistic local + queued cloud write ---- */

  /** Archived trips are frozen; every mutation short-circuits here. */
  const guard = () => !archivedRef.current && Boolean(stateRef.current.tripId);

  const addMember = useCallback((name: string, contribution = 0) => {
    if (!guard()) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const s = stateRef.current;
    const member: Member = {
      id: uid(),
      tripId: s.tripId,
      name: trimmed,
      color: MEMBER_COLORS[s.members.length % MEMBER_COLORS.length],
      contribution: Number.isFinite(contribution) ? contribution : 0,
      createdAt: Date.now(),
    };
    dispatch({ type: "upsertMember", member });
    db.insertMember(member);
    if (!s.settings.selfId) {
      const settings = { ...s.settings, selfId: member.id };
      dispatch({ type: "setSettings", settings });
      const trip = s.trips.find((t) => t.id === s.tripId);
      if (trip) db.saveTrip(withSettings(trip, settings));
    }
  }, []);

  const updateMember = useCallback(
    (
      id: string,
      patch: { name?: string; contribution?: number; color?: string }
    ) => {
      if (!guard()) return;
      const old = stateRef.current.members.find((m) => m.id === id);
      if (!old) return;
      const member: Member = {
        ...old,
        name: patch.name !== undefined ? patch.name.trim() || old.name : old.name,
        contribution:
          patch.contribution !== undefined && Number.isFinite(patch.contribution)
            ? patch.contribution
            : old.contribution,
        color: patch.color ?? old.color,
      };
      dispatch({ type: "upsertMember", member });
      db.updateMember(member);
    },
    []
  );

  const removeMember = useCallback((id: string) => {
    if (!guard()) return;
    const s = stateRef.current;
    dispatch({ type: "removeMember", id });
    db.deleteMember(id, s.tripId);
    if (s.settings.selfId === id) {
      const nextSelf = s.members.find((m) => m.id !== id)?.id ?? "";
      const settings = { ...s.settings, selfId: nextSelf };
      dispatch({ type: "setSettings", settings });
      const trip = s.trips.find((t) => t.id === s.tripId);
      if (trip) db.saveTrip(withSettings(trip, settings));
    }
  }, []);

  const addTxn = useCallback((data: TxnDraft) => {
    if (!guard()) return;
    const now = Date.now();
    const s = stateRef.current;
    const txn: Txn = {
      ...data,
      id: uid(),
      tripId: s.tripId,
      createdAt: now,
      updatedAt: now,
    };
    const entry: AuditEntry = {
      id: uid(),
      tripId: s.tripId,
      txnId: txn.id,
      title: txn.title,
      amount: txn.amount,
      action: "created",
      at: now,
      by: s.members.find((m) => m.id === s.settings.selfId)?.name,
      device: deviceLabel(),
      deviceId: deviceId(),
      tz: timezone(),
    };
    dispatch({ type: "upsertTxn", txn, prepend: true });
    dispatch({ type: "addAudit", entry });
    db.insertTxn(txn);
    db.insertAudit(entry);
  }, []);

  const updateTxn = useCallback((id: string, data: TxnDraft) => {
    if (!guard()) return;
    const s = stateRef.current;
    const old = s.txns.find((t) => t.id === id);
    if (!old) return;
    const now = Date.now();
    const changes = diff(old, data);
    const txn: Txn = { ...old, ...data, updatedAt: now };
    const entry: AuditEntry = {
      id: uid(),
      tripId: s.tripId,
      txnId: txn.id,
      title: txn.title,
      amount: txn.amount,
      action: "updated",
      at: now,
      changes,
      by: s.members.find((m) => m.id === s.settings.selfId)?.name,
      device: deviceLabel(),
      deviceId: deviceId(),
      tz: timezone(),
    };
    dispatch({ type: "upsertTxn", txn });
    dispatch({ type: "addAudit", entry });
    db.updateTxn(txn);
    db.insertAudit(entry);
  }, []);

  const deleteTxn = useCallback((id: string) => {
    if (!guard()) return;
    const s = stateRef.current;
    const old = s.txns.find((t) => t.id === id);
    if (!old) return;
    const now = Date.now();
    const entry: AuditEntry = {
      id: uid(),
      tripId: s.tripId,
      txnId: old.id,
      title: old.title,
      amount: old.amount,
      action: "deleted",
      at: now,
      by: s.members.find((m) => m.id === s.settings.selfId)?.name,
      device: deviceLabel(),
      deviceId: deviceId(),
      tz: timezone(),
    };
    dispatch({ type: "removeTxn", id });
    dispatch({ type: "addAudit", entry });
    db.deleteTxn(id, s.tripId);
    db.insertAudit(entry);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    if (!guard()) return;
    const s = stateRef.current;
    const settings = { ...s.settings, ...patch };
    dispatch({ type: "setSettings", settings });
    const trip = s.trips.find((t) => t.id === s.tripId);
    if (trip) db.saveTrip(withSettings(trip, settings));
  }, []);

  /* ---- trips ---- */

  const createTrip = useCallback((name: string, opts: CreateTripOpts = {}) => {
    const s = stateRef.current;
    const now = Date.now();
    const trip = newTrip(name, now);
    trip.currency = s.settings.currency || DEFAULT_SETTINGS.currency;
    const trips = [trip, ...s.trips];

    // people carry over by name/colour only — deposits start at zero,
    // since a new trip means a new pool
    const members: Member[] = opts.copyMembers
      ? s.members.map((m, i) => ({
          id: uid(),
          tripId: trip.id,
          name: m.name,
          color: m.color,
          contribution: 0,
          createdAt: now + i,
        }))
      : [];

    db.saveTrip(trip);
    members.forEach((m) => db.insertMember(m));
    (opts.copyPlaces ?? []).forEach((p, i) =>
      db.insertPlace({
        ...p,
        id: uid(),
        tripId: trip.id,
        done: false,
        ord: i,
      })
    );

    wantTripRef.current = trip.id;
    dispatch({ type: "setActive", tripId: trip.id, trips });
    dispatch({
      type: "setData",
      tripId: trip.id,
      data: { members, txns: [], audit: [] },
    });
    syncRef.current();
  }, []);

  const switchTrip = useCallback((tripId: string) => {
    const s = stateRef.current;
    if (!tripId || tripId === s.tripId) return;
    if (!s.trips.some((t) => t.id === tripId)) return;
    wantTripRef.current = tripId;
    dispatch({ type: "setActive", tripId });
    // paint the cached rows straight away; sync reconciles right after
    dispatch({
      type: "setData",
      tripId,
      data: loadDataCache(tripId) ?? EMPTY_DATA,
    });
    syncRef.current();
  }, []);

  const setStatus = (tripId: string, status: Trip["status"]) => {
    const s = stateRef.current;
    const trip = s.trips.find((t) => t.id === tripId);
    if (!trip) return;
    const next: Trip = {
      ...trip,
      status,
      archivedAt: status === "archived" ? Date.now() : undefined,
    };
    const trips = s.trips.map((t) => (t.id === tripId ? next : t));
    dispatch({ type: "setTrips", trips });
    db.saveTrip(next);
  };

  const archiveTrip = useCallback(
    (tripId: string) => setStatus(tripId, "archived"),
    []
  );
  const restoreTrip = useCallback(
    (tripId: string) => setStatus(tripId, "active"),
    []
  );

  const deleteTrip = useCallback((tripId: string) => {
    const s = stateRef.current;
    const trips = s.trips.filter((t) => t.id !== tripId);
    try {
      localStorage.removeItem(dataKey(tripId));
    } catch {
      /* ignore */
    }
    if (tripId === s.tripId) {
      const nextId = pickActiveTrip(trips);
      wantTripRef.current = nextId;
      dispatch({ type: "setActive", tripId: nextId, trips });
      dispatch({
        type: "setData",
        tripId: nextId,
        data: loadDataCache(nextId) ?? EMPTY_DATA,
      });
    } else {
      dispatch({ type: "setTrips", trips });
    }
    // bulk delete bypasses the queue, so run it directly then re-sync
    db.deleteTrip(tripId).then(() => syncRef.current());
  }, []);

  const seedSample = useCallback(() => {
    const now = Date.now();
    const trip: Trip = {
      ...newTrip("Sylhet, Bangladesh", now),
      id: LEGACY_TRIP_ID,
      budget: 4500,
    };
    const mk = (name: string, contribution: number, i: number): Member => ({
      id: uid(),
      tripId: trip.id,
      name,
      color: MEMBER_COLORS[i % MEMBER_COLORS.length],
      contribution,
      createdAt: now + i,
    });
    const you = mk("You", 1500, 0);
    const sarah = mk("Sarah", 1500, 1);
    const marcus = mk("Marcus", 1500, 2);
    const members = [you, sarah, marcus];
    trip.selfId = you.id;
    const all = members.map((m) => m.id);
    const base = (title: string, amount: number, category: CategoryId, n: number) => ({
      id: uid(),
      tripId: trip.id,
      title,
      amount,
      category,
      createdAt: now - n * 3600_000,
      updatedAt: now - n * 3600_000,
    });
    const txns: Txn[] = [
      { ...base("Hotel Booking", 900, "stay", 1), kind: "group", member: "", split: all },
      { ...base("Group Dinner", 240, "food", 3), kind: "group", member: "", split: all },
      {
        ...base("Souvenir Shopping", 120, "gear", 5),
        kind: "personal",
        member: sarah.id,
        split: [],
      },
      {
        ...base("Extra Coffee", 60, "food", 6),
        kind: "own",
        member: marcus.id,
        split: [],
      },
    ];
    const audit: AuditEntry[] = txns.map((t) => ({
      id: uid(),
      tripId: trip.id,
      txnId: t.id,
      title: t.title,
      amount: t.amount,
      action: "created",
      at: t.createdAt,
    }));

    wantTripRef.current = trip.id;
    dispatch({ type: "setActive", tripId: trip.id, trips: [trip] });
    dispatch({ type: "setData", tripId: trip.id, data: { members, txns, audit } });
    db.seed(trip, { members, txns, audit }).then(() => syncRef.current());
  }, []);

  const clearAll = useCallback(() => {
    try {
      stateRef.current.trips.forEach((t) =>
        localStorage.removeItem(dataKey(t.id))
      );
      localStorage.removeItem(TRIPS_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
    wantTripRef.current = "";
    dispatch({ type: "reset" });
    db.clearAll().then(() => syncRef.current());
  }, []);

  const value: Store = {
    ready,
    syncing,
    configured: dbConfigured,
    online,
    pending,
    syncError,
    state,
    archived,
    balances,
    totalSpent,
    pool: balances.pool,
    memberById,
    addMember,
    updateMember,
    removeMember,
    addTxn,
    updateTxn,
    deleteTxn,
    updateSettings,
    createTrip,
    switchTrip,
    archiveTrip,
    restoreTrip,
    deleteTrip,
    seedSample,
    clearAll,
  };

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export function useMoney() {
  const { state } = useStore();
  const symbol = state.settings.currency || "৳";
  return useCallback(
    (n: number) =>
      symbol +
      Math.abs(n).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [symbol]
  );
}
