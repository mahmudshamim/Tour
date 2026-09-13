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
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { MEMBER_COLORS, type CategoryId } from "./constants";
import {
  EMPTY,
  uid,
  diff,
  computeBalances,
  isPoolTxn,
  deviceLabel,
  deviceId,
  timezone,
  newTrip,
  pickActiveTrip,
  withDetails,
  placesCacheKey,
  type State,
  type Trip,
  type TripDraft,
  type Member,
  type Txn,
  type TxnDraft,
  type AuditEntry,
  type Balances,
  type Place,
} from "./models";
import {
  db,
  dbConfigured,
  loadTrips,
  loadTripData,
  loadPlaces,
  flush,
  type TripData,
  type FlushStatus,
  type TripStats,
} from "./db";
import * as outbox from "./outbox";
import * as editLock from "./editLock";
import { setLocalCover, syncCovers } from "./covers";
import { saveLocalReceipt, prefetchReceipts } from "./receipts";

export type { Member, Txn, AuditEntry, Balances, Trip } from "./models";
export { computeBalances, isPoolTxn } from "./models";

/** The trip that pre-multi-trip data is migrated onto. Deliberately a
 *  fixed id so the SQL migration and every device agree on it. */
export const LEGACY_TRIP_ID = "trip-legacy";

/* ---- local cache (instant paint + offline) ---- */

const TRIPS_KEY = "terra.trips.v1";
const LEGACY_KEY = "terraexplore.v1"; // single-trip cache, pre-migration
const SELF_KEY = "terra.self.v1"; // { [tripId]: memberId } — this device only
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
  const s = old.settings ?? {};
  const trip: Trip = {
    ...newTrip(s.tripName || "First tour"),
    id: LEGACY_TRIP_ID,
    budget: Number(s.budget ?? 0),
    currency: s.currency || "৳",
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

/** A tour's numbers from this device's cache — for the Tours hub when the
 *  cloud can't be asked (local-only, or offline before the first pass). */
export function cachedTripStats(tripId: string): TripStats | null {
  const data = loadDataCache(tripId);
  const places = readJSON<Place[]>(placesCacheKey(tripId));
  if (!data && !places) return null;
  return tripStatsOf(data?.members ?? [], data?.txns ?? [], places ?? []);
}

export function tripStatsOf(members: Member[], txns: Txn[], places: Place[]): TripStats {
  const when = txns.map((t) => t.spentAt || t.createdAt).filter(Boolean);
  return {
    spent: txns.reduce((s, t) => (isPoolTxn(t) ? s + t.amount : s), 0),
    own: txns.reduce((s, t) => (isPoolTxn(t) ? s : s + t.amount), 0),
    pool: members.reduce((s, m) => s + (m.contribution || 0), 0),
    people: members.length,
    txns: txns.length,
    places: places.length,
    done: places.filter((p) => p.done).length,
    first: when.length ? Math.min(...when) : 0,
    last: when.length ? Math.max(...when) : 0,
  };
}

/** `?trip=<id>` — every tour has its own shareable link. */
const urlTrip = (): string => {
  try {
    return new URLSearchParams(window.location.search).get("trip") ?? "";
  } catch {
    return "";
  }
};

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
  | { type: "reset" };

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "setTrips":
      return { ...state, trips: a.trips.map(withDetails) };
    case "setActive":
      return {
        ...state,
        trips: (a.trips ?? state.trips).map(withDetails),
        tripId: a.tripId,
      };
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
    case "reset":
      return EMPTY;
    default:
      return state;
  }
}

/* ---- context ---- */
type CreateTripOpts = { copyMembers?: boolean; copyPlaces?: Place[] };
type LockResult = Awaited<ReturnType<typeof editLock.unlock>>;

type Store = {
  ready: boolean;
  syncing: boolean;
  configured: boolean;
  online: boolean;
  /** writes made on this device that haven't reached the cloud yet */
  pending: number;
  /** why pending writes aren't moving (locked, not installed, …) */
  writeStatus: FlushStatus;
  /** last cloud read error, e.g. a migration that hasn't been run */
  syncError: string;
  /** bumps whenever other tours' offline copies are refreshed */
  cacheTick: number;
  state: State;
  /** the tour being viewed */
  trip: Trip | undefined;
  /** viewing an archived trip → its numbers are frozen */
  archived: boolean;
  /** this device may edit the open tour (organiser, or this tour's own
   *  password; always true when local-only) */
  canEdit: boolean;
  /** unlocked with the organiser password: every tour, new tours, admin */
  isOrganiser: boolean;
  /** may this device edit that tour (organiser, or its own password) */
  canEditTrip: (tripId: string) => boolean;
  /** nothing in this tour can change from here: locked or archived */
  readOnly: boolean;
  balances: Balances;
  totalSpent: number;
  pool: number;
  memberById: (id: string) => Member | undefined;
  /** which member this device is — per device, never synced */
  selfId: string;
  setSelf: (memberId: string) => void;
  addMember: (name: string, contribution?: number) => void;
  updateMember: (
    id: string,
    patch: { name?: string; contribution?: number; color?: string }
  ) => void;
  removeMember: (id: string) => void;
  /** `receipt`: a shrunk photo to attach · null removes it (edit) */
  addTxn: (data: TxnDraft, receipt?: string | null) => void;
  updateTxn: (id: string, data: TxnDraft, receipt?: string | null) => void;
  deleteTxn: (id: string) => void;
  /* trips */
  createTrip: (draft: TripDraft, opts?: CreateTripOpts) => string;
  updateTrip: (tripId: string, patch: Partial<TripDraft>) => void;
  /** settle-up bookkeeping on the open tour (works on archived tours) */
  updateSettle: (patch: { holderId?: string; settled?: Record<string, boolean> }) => void;
  switchTrip: (tripId: string) => void;
  archiveTrip: (tripId: string) => void;
  restoreTrip: (tripId: string) => void;
  deleteTrip: (tripId: string) => void;
  createDemoTrip: () => void;
  /** a tour's own photo (already shrunk); null removes it */
  setCover: (tripId: string, photo: string | null) => void;
  clearAll: () => Promise<boolean>;
  /* edit lock */
  /** organiser password, or the open tour's own co-organiser password */
  unlock: (password: string) => Promise<LockResult>;
  lock: (everywhere?: boolean) => Promise<void>;
  changePassword: (oldPw: string, newPw: string) => Promise<LockResult>;
  setTripPassword: typeof editLock.setTripPassword;
  tripLocks: typeof editLock.tripLocks;
};

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncError, setSyncError] = useState("");
  const [writeStatus, setWriteStatus] = useState<FlushStatus>("ok");
  const [selves, setSelves] = useState<Record<string, string>>({});
  const [cacheTick, setCacheTick] = useState(0);

  // re-render whenever this device's keys change; rights are then read
  // for whichever tour is open
  useSyncExternalStore(editLock.subscribe, editLock.snapshot, () => "");
  const canEdit = state.tripId
    ? editLock.canEditTrip(state.tripId)
    : editLock.isOrganiser();
  const isOrganiser = editLock.isOrganiser();

  // keep a ref to latest state for diffing inside async wrappers
  const stateRef = useRef(state);
  stateRef.current = state;
  const selvesRef = useRef(selves);
  selvesRef.current = selves;

  // which trip the sync loop should converge on (set by switchTrip)
  const wantTripRef = useRef("");
  const syncRef = useRef<(showSpinner?: boolean) => void>(() => {});

  /* ---- boot + sync loop ---- */
  useEffect(() => {
    let alive = true;
    setSelves(readJSON<Record<string, string>>(SELF_KEY) ?? {});

    // paint from cache immediately; the cloud catches up in the background
    const linked = urlTrip();
    const cache = loadTripsCache();
    if (cache && cache.trips.length) {
      const pick = [linked, cache.activeTripId].find(
        (id) => id && cache.trips.some((t) => t.id === id)
      );
      const activeId = pick || pickActiveTrip(cache.trips);
      wantTripRef.current = activeId;
      dispatch({ type: "setActive", tripId: activeId, trips: cache.trips });
      const data = loadDataCache(activeId);
      if (data) dispatch({ type: "setData", tripId: activeId, data });
    }
    // a shared link wins — even to a tour this device hasn't cached yet
    // (sync falls back to the newest tour if the link is stale)
    if (linked) wantTripRef.current = linked;
    setReady(true);

    const syncOnline = () => setOnline(navigator.onLine !== false);
    syncOnline();
    setPending(outbox.count());
    const unwatch = outbox.subscribe(() => setPending(outbox.count()));

    if (!dbConfigured) {
      window.addEventListener("online", syncOnline);
      window.addEventListener("offline", syncOnline);
      return () => {
        alive = false;
        unwatch();
        window.removeEventListener("online", syncOnline);
        window.removeEventListener("offline", syncOnline);
      };
    }

    // a remembered edit session may have been revoked since last visit
    editLock.verify();

    // Push queued writes, then pull the latest. Flush and refetch are
    // deliberately serialised in one pass — running them concurrently
    // lets a snapshot taken *before* a flush land *after* it, which
    // would drop the just-uploaded row from the UI.
    /**
     * Keep an offline copy of EVERY tour, not just the open one — on a
     * trip there may be no signal at all, and switching tours (or reading
     * the Tours hub) must still work. Runs after a good sync, at most every
     * few minutes, or at once when the list of tours changes.
     */
    const PREFETCH_EVERY = 5 * 60_000;
    let lastPrefetch = 0;
    let prefetchedFor = "";
    let prefetching = false;
    const prefetch = async (trips: Trip[]) => {
      const key = trips.map((t) => t.id).join(",");
      const due = Date.now() - lastPrefetch > PREFETCH_EVERY || key !== prefetchedFor;
      if (prefetching || !due || navigator.onLine === false) return;
      prefetching = true;
      lastPrefetch = Date.now();
      prefetchedFor = key;
      try {
        for (const t of trips) {
          if (t.id === stateRef.current.tripId) continue; // live state owns it
          const [d, p] = await Promise.all([loadTripData(t.id), loadPlaces(t.id)]);
          if (!alive) return;
          if (t.id === stateRef.current.tripId) continue; // opened meanwhile
          if (d.ok) writeJSON(dataKey(t.id), outbox.applyTripData(d.data, t.id));
          if (p.ok) writeJSON(placesCacheKey(t.id), outbox.applyPlaces(p.places, t.id));
        }
        setCacheTick((n) => n + 1);
        await syncCovers(
          trips.map((t) => t.id),
          outbox.pendingCovers()
        );
        // the open tour's receipts, so they can be looked at with no signal
        await prefetchReceipts(stateRef.current.txns);
      } finally {
        prefetching = false;
      }
    };

    let inFlight = false;
    let queued = false;
    const sync = async (showSpinner = false) => {
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      if (showSpinner) setSyncing(true);

      const status = await flush();
      if (alive) setWriteStatus(status);

      const tripsRes = await loadTrips();

      if (alive && !tripsRes.ok) {
        setSyncError(tripsRes.error);
        console.warn("[store] trips load failed:", tripsRes.error);
      } else if (alive && tripsRes.ok) {
        setSyncError("");
        const trips = outbox.applyTrips(tripsRes.trips);

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
            const nextTrips = outbox.applyTrips(tripsRes.trips);
            const data = outbox.applyTripData(dataRes.data, activeId);
            dispatch({ type: "setActive", tripId: activeId, trips: nextTrips });
            dispatch({ type: "setData", tripId: activeId, data });
            writeJSON(TRIPS_KEY, { trips: nextTrips, activeTripId: activeId });
            if (activeId) writeJSON(dataKey(activeId), data);
            prefetch(nextTrips); // background; never blocks this sync
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

    // 3) just unlocked → anything that was waiting on the lock can go now
    const unwatchLock = editLock.subscribe(() => sync());

    // 4) pull the moment this device becomes active again (tab focus / app
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

    // 5) low-frequency safety poll while visible — guarantees convergence even
    //    if realtime is off; skipped in the background to save requests
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") sync();
    }, 15000);

    return () => {
      alive = false;
      unsub();
      unwatch();
      unwatchQueue();
      unwatchLock();
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
    if (!ready) return;
    writeJSON(TRIPS_KEY, { trips: state.trips, activeTripId: state.tripId });
    if (state.tripId)
      writeJSON(dataKey(state.tripId), {
        members: state.members,
        txns: state.txns,
        audit: state.audit,
      });
  }, [state, ready]);

  // keep `?trip=` in the address bar pointing at the tour on screen, so
  // copying the URL always shares the right one
  useEffect(() => {
    if (!ready || !state.tripId) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("trip") === state.tripId) return;
      url.searchParams.set("trip", state.tripId);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* ignore */
    }
  }, [state.tripId, ready]);

  const trip = useMemo(
    () => state.trips.find((t) => t.id === state.tripId),
    [state.trips, state.tripId]
  );
  const archived = trip?.status === "archived";
  const archivedRef = useRef(archived);
  archivedRef.current = archived;

  const selfId = useMemo(() => {
    const mine = selves[state.tripId] ?? "";
    return state.members.some((m) => m.id === mine) ? mine : "";
  }, [selves, state.tripId, state.members]);
  const selfRef = useRef(selfId);
  selfRef.current = selfId;

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

  const setSelf = useCallback((memberId: string) => {
    const tripId = stateRef.current.tripId;
    if (!tripId) return;
    const next = { ...selvesRef.current, [tripId]: memberId };
    setSelves(next);
    writeJSON(SELF_KEY, next);
  }, []);

  /* ---- actions: optimistic local + queued cloud write ---- */

  /** Locked devices and archived trips can't change anything. The
   *  database enforces the lock too — this just keeps the UI honest. */
  const guard = () =>
    editLock.canEditTrip(stateRef.current.tripId) &&
    !archivedRef.current &&
    Boolean(stateRef.current.tripId);

  /** Trip-level actions (also allowed on archived tours). */
  const editor = (tripId: string) => editLock.canEditTrip(tripId);
  /** Creating, deleting, erasing — the organiser only. */
  const organiser = () => editLock.isOrganiser();

  const actor = () => {
    const s = stateRef.current;
    return {
      by: s.members.find((m) => m.id === selfRef.current)?.name,
      device: deviceLabel(),
      deviceId: deviceId(),
      tz: timezone(),
    };
  };

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
    // whoever sets a tour up usually adds themselves first
    if (!s.members.length && !selfRef.current) setSelf(member.id);
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
    if (selfRef.current === id) setSelf("");
  }, []);

  const addTxn = useCallback((data: TxnDraft, receipt?: string | null) => {
    if (!guard()) return;
    const now = Date.now();
    const s = stateRef.current;
    const txn: Txn = {
      ...data,
      spentAt: data.spentAt || now,
      receiptAt: receipt ? now : 0,
      id: uid(),
      tripId: s.tripId,
      createdAt: now,
      updatedAt: now,
    };
    // photo first, so the row never points at a receipt that isn't up yet
    if (receipt) {
      saveLocalReceipt(txn.id, now, receipt);
      db.saveReceipt({ id: txn.id, tripId: s.tripId, updatedAt: now });
    }
    const entry: AuditEntry = {
      id: uid(),
      tripId: s.tripId,
      txnId: txn.id,
      title: txn.title,
      amount: txn.amount,
      action: "created",
      at: now,
      ...actor(),
    };
    dispatch({ type: "upsertTxn", txn, prepend: true });
    dispatch({ type: "addAudit", entry });
    db.insertTxn(txn);
    db.insertAudit(entry);
  }, []);

  const updateTxn = useCallback((id: string, data: TxnDraft, receipt?: string | null) => {
    if (!guard()) return;
    const s = stateRef.current;
    const old = s.txns.find((t) => t.id === id);
    if (!old) return;
    const now = Date.now();
    let receiptAt = old.receiptAt || 0;
    if (typeof receipt === "string") {
      receiptAt = now;
      saveLocalReceipt(id, now, receipt);
      db.saveReceipt({ id, tripId: s.tripId, updatedAt: now });
    } else if (receipt === null && receiptAt) {
      receiptAt = 0;
      db.deleteReceipt(id, s.tripId);
    }
    const draft: TxnDraft = { ...data, receiptAt };
    const changes = diff(old, draft);
    const txn: Txn = { ...old, ...draft, updatedAt: now };
    const entry: AuditEntry = {
      id: uid(),
      tripId: s.tripId,
      txnId: txn.id,
      title: txn.title,
      amount: txn.amount,
      action: "updated",
      at: now,
      changes,
      ...actor(),
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
      ...actor(),
    };
    dispatch({ type: "removeTxn", id });
    dispatch({ type: "addAudit", entry });
    db.deleteTxn(id, s.tripId);
    db.insertAudit(entry);
  }, []);

  /* ---- trips ---- */

  const openTrip = (trip: Trip, trips: Trip[], data: TripData) => {
    wantTripRef.current = trip.id;
    dispatch({ type: "setActive", tripId: trip.id, trips });
    dispatch({ type: "setData", tripId: trip.id, data });
    syncRef.current();
  };

  const createTrip = useCallback(
    (draft: TripDraft, opts: CreateTripOpts = {}): string => {
      if (!organiser()) return "";
      const s = stateRef.current;
      const now = Date.now();
      const { name, currency, ...details } = draft;
      const trip: Trip = {
        ...newTrip(name, details, now),
        currency: currency.trim() || "৳",
      };

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

      const places: Place[] = (opts.copyPlaces ?? []).map((p, i) => ({
        ...p,
        id: uid(),
        tripId: trip.id,
        done: false,
        ord: i,
      }));

      db.saveTrip(trip);
      members.forEach((m) => db.insertMember(m));
      places.forEach((p) => db.insertPlace(p));
      // the plan screen paints from this cache the moment the tour opens
      if (places.length) writeJSON(placesCacheKey(trip.id), places);

      // carry "that's me" over to the copy of me
      const me = s.members.find((m) => m.id === selfRef.current);
      const myCopy = me && members.find((m) => m.name === me.name);

      openTrip(trip, [trip, ...s.trips], { members, txns: [], audit: [] });
      if (myCopy) setSelf(myCopy.id);
      return trip.id;
    },
    []
  );

  /** Details only — allowed on archived tours too, since it can't touch
   *  their numbers (an old tour can still get its cover and dates). */
  const updateTrip = useCallback((tripId: string, patch: Partial<TripDraft>) => {
    if (!editor(tripId)) return;
    const s = stateRef.current;
    const old = s.trips.find((t) => t.id === tripId);
    if (!old) return;
    const next: Trip = {
      ...old,
      ...patch,
      name: patch.name !== undefined ? patch.name.trim() || old.name : old.name,
      currency:
        patch.currency !== undefined ? patch.currency.trim() || old.currency : old.currency,
    };
    dispatch({ type: "setTrips", trips: s.trips.map((t) => (t.id === tripId ? next : t)) });
    db.saveTrip(next);
  }, []);

  const updateSettle = useCallback(
    (patch: { holderId?: string; settled?: Record<string, boolean> }) => {
      const s = stateRef.current;
      if (!editor(s.tripId)) return;
      const old = s.trips.find((t) => t.id === s.tripId);
      if (!old) return;
      const next: Trip = { ...old, ...patch };
      dispatch({ type: "setTrips", trips: s.trips.map((t) => (t.id === old.id ? next : t)) });
      db.saveTrip(next);
    },
    []
  );

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
    if (!editor(tripId)) return;
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
    if (!organiser()) return;
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
    db.deleteTrip(tripId);
    setLocalCover(tripId, null);
  }, []);

  /** Shown here at once; uploaded with the rest of the queue. */
  const setCover = useCallback((tripId: string, photo: string | null) => {
    if (!editor(tripId)) return;
    const now = Date.now();
    // the queue keeps a reference; the photo itself waits on the device
    setLocalCover(tripId, photo, now).then(() => {
      if (photo) db.saveCover({ id: tripId, tripId, updatedAt: now });
      else db.deleteCover(tripId);
    });
  }, []);

  /** A throwaway tour to show the app off. Adds; never wipes anything. */
  const createDemoTrip = useCallback(() => {
    if (!organiser()) return;
    const s = stateRef.current;
    const now = Date.now();
    const day = (n: number) =>
      new Date(now + n * 86_400_000).toISOString().slice(0, 10);
    const trip: Trip = {
      ...newTrip(
        "Demo tour",
        {
          destination: "Hill country",
          origin: "City",
          startDate: day(-1),
          endDate: day(2),
          cover: "🏕️",
          accent: "lagoon",
          note: "Sample data — delete any time",
          distanceKm: 180,
          travelTime: "4h drive",
        },
        now
      ),
    };
    const mk = (name: string, contribution: number, i: number): Member => ({
      id: uid(),
      tripId: trip.id,
      name,
      color: MEMBER_COLORS[i % MEMBER_COLORS.length],
      contribution,
      createdAt: now + i,
    });
    const members = [mk("You", 1500, 0), mk("Sarah", 1500, 1), mk("Marcus", 1500, 2)];
    const [you, sarah, marcus] = members;
    const all = members.map((m) => m.id);
    const base = (title: string, amount: number, category: CategoryId, n: number) => ({
      id: uid(),
      tripId: trip.id,
      title,
      amount,
      category,
      spentAt: now - n * 3600_000,
      receiptAt: 0,
      createdAt: now - n * 3600_000,
      updatedAt: now - n * 3600_000,
    });
    const txns: Txn[] = [
      { ...base("Hotel Booking", 900, "stay", 1), kind: "group", member: "", split: all },
      { ...base("Group Dinner", 240, "food", 3), kind: "group", member: "", split: all },
      { ...base("Souvenir Shopping", 120, "gear", 5), kind: "personal", member: sarah.id, split: [] },
      { ...base("Extra Coffee", 60, "food", 6), kind: "own", member: marcus.id, split: [] },
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
    const places: Place[] = [
      ["Sunrise viewpoint", "Hilltop", "sunrise"],
      ["Waterfall trail", "Forest", "waves"],
      ["Tea garden", "Valley", "leaf"],
      ["Night camp", "Lakeside", "tent"],
    ].map(([name, area, icon], i) => ({
      id: uid(),
      tripId: trip.id,
      name,
      area,
      icon,
      done: i === 0,
      ord: i,
      day: i < 2 ? 1 : 2,
      time: ["06:00", "10:30", "09:00", "19:00"][i],
      lat: null,
      lng: null,
    }));

    db.saveTrip(trip);
    members.forEach((m) => db.insertMember(m));
    txns.forEach((t) => db.insertTxn(t));
    audit.forEach((a) => db.insertAudit(a));
    places.forEach((p) => db.insertPlace(p));
    writeJSON(placesCacheKey(trip.id), places);
    openTrip(trip, [trip, ...s.trips], { members, txns, audit });
    setSelf(you.id);
  }, []);

  const clearAll = useCallback(async () => {
    if (!organiser()) return false;
    const ok = await db.clearAll();
    if (!ok) return false;
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
    syncRef.current();
    return true;
  }, []);

  const value: Store = {
    ready,
    syncing,
    configured: dbConfigured,
    online,
    pending,
    writeStatus,
    syncError,
    cacheTick,
    state,
    trip,
    archived,
    canEdit,
    isOrganiser,
    canEditTrip: editLock.canEditTrip,
    readOnly: !canEdit || archived,
    balances,
    totalSpent,
    pool: balances.pool,
    memberById,
    selfId,
    setSelf,
    addMember,
    updateMember,
    removeMember,
    addTxn,
    updateTxn,
    deleteTxn,
    createTrip,
    updateTrip,
    updateSettle,
    switchTrip,
    archiveTrip,
    restoreTrip,
    deleteTrip,
    createDemoTrip,
    setCover,
    clearAll,
    unlock: (password: string) => editLock.unlock(password, stateRef.current.tripId),
    lock: editLock.lock,
    changePassword: editLock.changePassword,
    setTripPassword: editLock.setTripPassword,
    tripLocks: editLock.tripLocks,
  };

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export function useMoney() {
  const { trip } = useStore();
  const symbol = trip?.currency || "৳";
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
