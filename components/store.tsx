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
  uid,
  diff,
  computeBalances,
  deviceLabel,
  deviceId,
  timezone,
  type State,
  type Member,
  type Txn,
  type AuditEntry,
  type Settings,
  type Balances,
} from "./models";
import { db, dbConfigured, loadState } from "./db";

export type { Member, Txn, AuditEntry, Settings, Balances } from "./models";
export { computeBalances } from "./models";

/* ---- local cache (instant paint + offline) ---- */
const KEY = "terraexplore.v1";
function loadCache(): State | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<State>;
    const settings = { ...EMPTY.settings, ...(p.settings ?? {}) };
    if (!settings.tripName) settings.tripName = "Sylhet";
    return {
      members: p.members ?? [],
      txns: p.txns ?? [],
      audit: p.audit ?? [],
      settings,
    };
  } catch {
    return null;
  }
}
function saveCache(state: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/* ---- reducer (pure local application of already-built payloads) ---- */
type Action =
  | { type: "setAll"; state: State }
  | { type: "upsertMember"; member: Member }
  | { type: "removeMember"; id: string }
  | { type: "upsertTxn"; txn: Txn; prepend?: boolean }
  | { type: "removeTxn"; id: string }
  | { type: "addAudit"; entry: AuditEntry }
  | { type: "setSettings"; settings: Settings };

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "setAll":
      return a.state;
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
      return {
        ...state,
        members: state.members.filter((m) => m.id !== a.id),
      };
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
      return { ...state, settings: a.settings };
    default:
      return state;
  }
}

/* ---- context ---- */
type Store = {
  ready: boolean;
  syncing: boolean;
  configured: boolean;
  state: State;
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
  addTxn: (data: Omit<Txn, "id" | "createdAt" | "updatedAt">) => void;
  updateTxn: (
    id: string,
    data: Omit<Txn, "id" | "createdAt" | "updatedAt">
  ) => void;
  deleteTxn: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  seedSample: () => void;
  clearAll: () => void;
};

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // keep a ref to latest state for diffing inside async wrappers
  const stateRef = useRef(state);
  stateRef.current = state;

  // load: cache first (instant), then Supabase (source of truth) + realtime
  useEffect(() => {
    let alive = true;
    const cached = loadCache();
    if (cached) dispatch({ type: "setAll", state: cached });
    // paint immediately from cache (or empty); sync with Supabase in background
    setReady(true);

    (async () => {
      if (dbConfigured) {
        setSyncing(true);
        const loaded = await loadState();
        if (alive && loaded.ok) {
          dispatch({ type: "setAll", state: loaded.state });
          saveCache(loaded.state);
        } else if (alive && !loaded.ok) {
          console.warn("[store] Supabase load failed:", loaded.error);
        }
        if (alive) setSyncing(false);
      }
    })();

    // realtime: refetch on any remote change
    const unsub = dbConfigured
      ? db.onChange(async () => {
          const loaded = await loadState();
          if (alive && loaded.ok) {
            dispatch({ type: "setAll", state: loaded.state });
            saveCache(loaded.state);
          }
        })
      : () => {};

    return () => {
      alive = false;
      unsub();
    };
  }, []);

  // mirror to cache on every change
  useEffect(() => {
    if (ready) saveCache(state);
  }, [state, ready]);

  const balances = useMemo(
    () => computeBalances(state.members, state.txns),
    [state.members, state.txns]
  );
  const totalSpent = useMemo(
    () => state.txns.reduce((s, t) => s + t.amount, 0),
    [state.txns]
  );
  const memberById = useCallback(
    (id: string) => state.members.find((m) => m.id === id),
    [state.members]
  );

  /* ---- actions: optimistic local + Supabase write ---- */

  const addMember = useCallback((name: string, contribution = 0) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const s = stateRef.current;
    const member: Member = {
      id: uid(),
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
      db.saveSettings(settings);
    }
  }, []);

  const updateMember = useCallback(
    (
      id: string,
      patch: { name?: string; contribution?: number; color?: string }
    ) => {
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
    const s = stateRef.current;
    dispatch({ type: "removeMember", id });
    db.deleteMember(id);
    if (s.settings.selfId === id) {
      const nextSelf = s.members.find((m) => m.id !== id)?.id ?? "";
      const settings = { ...s.settings, selfId: nextSelf };
      dispatch({ type: "setSettings", settings });
      db.saveSettings(settings);
    }
  }, []);

  const addTxn = useCallback(
    (data: Omit<Txn, "id" | "createdAt" | "updatedAt">) => {
      const now = Date.now();
      const s = stateRef.current;
      const txn: Txn = { ...data, id: uid(), createdAt: now, updatedAt: now };
      const entry: AuditEntry = {
        id: uid(),
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
    },
    []
  );

  const updateTxn = useCallback(
    (id: string, data: Omit<Txn, "id" | "createdAt" | "updatedAt">) => {
      const s = stateRef.current;
      const old = s.txns.find((t) => t.id === id);
      if (!old) return;
      const now = Date.now();
      const changes = diff(old, data);
      const txn: Txn = { ...old, ...data, updatedAt: now };
      const entry: AuditEntry = {
        id: uid(),
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
    },
    []
  );

  const deleteTxn = useCallback((id: string) => {
    const s = stateRef.current;
    const old = s.txns.find((t) => t.id === id);
    if (!old) return;
    const now = Date.now();
    const entry: AuditEntry = {
      id: uid(),
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
    db.deleteTxn(id);
    db.insertAudit(entry);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const settings = { ...stateRef.current.settings, ...patch };
    dispatch({ type: "setSettings", settings });
    db.saveSettings(settings);
  }, []);

  const seedSample = useCallback(() => {
    const now = Date.now();
    const mk = (name: string, contribution: number, i: number): Member => ({
      id: uid(),
      name,
      color: MEMBER_COLORS[i % MEMBER_COLORS.length],
      contribution,
      createdAt: now + i,
    });
    const you = mk("You", 1500, 0);
    const sarah = mk("Sarah", 1500, 1);
    const marcus = mk("Marcus", 1500, 2);
    const members = [you, sarah, marcus];
    const all = members.map((m) => m.id);
    const mkGroup = (
      title: string,
      amount: number,
      category: CategoryId,
      n: number
    ): Txn => ({
      id: uid(),
      title,
      amount,
      category,
      kind: "group",
      member: "",
      split: all,
      createdAt: now - n * 3600_000,
      updatedAt: now - n * 3600_000,
    });
    const mkPersonal = (
      title: string,
      amount: number,
      category: CategoryId,
      member: string,
      n: number
    ): Txn => ({
      id: uid(),
      title,
      amount,
      category,
      kind: "personal",
      member,
      split: [],
      createdAt: now - n * 3600_000,
      updatedAt: now - n * 3600_000,
    });
    const txns = [
      mkGroup("Hotel Booking", 900, "stay", 1),
      mkGroup("Group Dinner", 240, "food", 3),
      mkPersonal("Souvenir Shopping", 120, "gear", sarah.id, 5),
    ];
    const audit: AuditEntry[] = txns.map((t) => ({
      id: uid(),
      txnId: t.id,
      title: t.title,
      amount: t.amount,
      action: "created",
      at: t.createdAt,
    }));
    const next: State = {
      members,
      txns,
      audit,
      settings: {
        tripName: "Sylhet, Bangladesh",
        budget: 4500,
        currency: "৳",
        selfId: you.id,
      },
    };
    dispatch({ type: "setAll", state: next });
    db.seed(next);
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: "setAll", state: EMPTY });
    db.clearAll();
  }, []);

  const value: Store = {
    ready,
    syncing,
    configured: dbConfigured,
    state,
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
