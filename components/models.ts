import type { CategoryId } from "./constants";

/**
 * A trip owns everything: its people, expenses, history and places all
 * carry its `tripId`. Archiving freezes a trip read-only so last year's
 * numbers stay intact while the next tour starts clean.
 */
export type TripStatus = "active" | "archived";

export type Trip = {
  id: string;
  name: string;
  status: TripStatus;
  budget: number; // kept for compatibility; pool is derived from contributions
  currency: string;
  selfId: string; // which member this device is
  createdAt: number;
  archivedAt?: number;
};

export type Member = {
  id: string;
  tripId: string;
  name: string;
  color: string;
  contribution: number; // tk this person deposited into the pool
  createdAt: number;
};

/**
 *  group    — split from the shared pool across `split`
 *  personal — charged from the pool to one member
 *  own      — that member's own pocket; never touches the pool or any
 *             group total (holidays where everyone buys their own stuff)
 */
export type TxnKind = "group" | "personal" | "own";

export type Txn = {
  id: string;
  tripId: string;
  title: string;
  amount: number;
  category: CategoryId;
  kind: TxnKind;
  split: string[]; // group: members who share (default all)
  member: string; // personal / own: the member charged
  createdAt: number;
  updatedAt: number;
};

export type Change = { field: string; from: string; to: string };

export type AuditEntry = {
  id: string;
  tripId: string;
  txnId: string;
  title: string;
  amount: number;
  action: "created" | "updated" | "deleted";
  at: number;
  changes?: Change[];
  by?: string; // who the acting device is set as ("You" member name)
  device?: string; // best-effort browser · OS from user agent
  deviceId?: string; // stable per-device id (groups actions from one device)
  tz?: string; // IANA timezone of the acting device, e.g. "Asia/Dhaka"
};

/** Best-effort "Browser · OS" label from the user agent (spoofable). */
export function deviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
    ? "Opera"
    : /SamsungBrowser/.test(ua)
    ? "Samsung Internet"
    : /Firefox\//.test(ua)
    ? "Firefox"
    : /Chrome\//.test(ua)
    ? "Chrome"
    : /Safari\//.test(ua)
    ? "Safari"
    : "Browser";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
    ? "iPad"
    : /Android/.test(ua)
    ? "Android"
    : /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
    ? "Mac"
    : /Linux/.test(ua)
    ? "Linux"
    : "device";
  return `${browser} · ${os}`;
}

/** The active trip's editable fields, in the shape the UI already uses. */
export type Settings = {
  tripName: string;
  budget: number; // kept for compatibility; pool is derived from contributions
  currency: string;
  selfId: string;
};

export const tripToSettings = (t: Trip): Settings => ({
  tripName: t.name,
  budget: t.budget,
  currency: t.currency,
  selfId: t.selfId,
});

export const withSettings = (t: Trip, s: Settings): Trip => ({
  ...t,
  name: s.tripName,
  budget: s.budget,
  currency: s.currency,
  selfId: s.selfId,
});

export type State = {
  trips: Trip[];
  tripId: string; // which trip the rows below belong to
  members: Member[];
  txns: Txn[];
  audit: AuditEntry[];
  settings: Settings; // projection of the active trip
};

export type Place = {
  id: string;
  tripId: string;
  name: string;
  area: string;
  icon: string;
  done: boolean;
  ord: number; // sort order (for reordering)
};

export const DEFAULT_SETTINGS: Settings = {
  tripName: "Sylhet",
  budget: 0,
  currency: "৳",
  selfId: "",
};

export const EMPTY: State = {
  trips: [],
  tripId: "",
  members: [],
  txns: [],
  audit: [],
  settings: DEFAULT_SETTINGS,
};

export function newTrip(name: string, at = Date.now()): Trip {
  return {
    id: uid(),
    name: name.trim() || "New trip",
    status: "active",
    budget: 0,
    currency: "৳",
    selfId: "",
    createdAt: at,
  };
}

/** Newest un-archived trip, else newest trip, else nothing. */
export function pickActiveTrip(trips: Trip[]): string {
  const byNew = [...trips].sort((a, b) => b.createdAt - a.createdAt);
  return (byNew.find((t) => t.status !== "archived") ?? byNew[0])?.id ?? "";
}

export const uid = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Stable per-device id, persisted in localStorage. Groups a device's actions. */
const DEVICE_KEY = "terra.device.id";
export function deviceId(): string {
  if (typeof localStorage === "undefined") return "";
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/** IANA timezone of this device, e.g. "Asia/Dhaka". */
export function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

export type Balances = {
  balance: Record<string, number>; // remaining tk of each member (contribution - spent)
  spent: Record<string, number>; // total charged to each member's pool money
  own: Record<string, number>; // own-pocket spend, outside the pool entirely
  pool: number; // sum of all contributions (= budget)
  ownTotal: number;
};

/**
 * Pool model:
 *  - each member deposits `contribution` → pool
 *  - group expense: split equally among `split` members (deducts from each)
 *  - personal expense: charged fully to `member`, still pool money
 *  - own expense: tracked per member but kept out of pool/balance/spent
 *  - balance[m] = contribution[m] − (group shares) − (personal charges)
 */
export function computeBalances(members: Member[], txns: Txn[]): Balances {
  const balance: Record<string, number> = {};
  const spent: Record<string, number> = {};
  const own: Record<string, number> = {};
  let pool = 0;
  let ownTotal = 0;
  members.forEach((m) => {
    balance[m.id] = m.contribution || 0;
    spent[m.id] = 0;
    own[m.id] = 0;
    pool += m.contribution || 0;
  });
  txns.forEach((t) => {
    if (t.kind === "own") {
      // deliberately does not touch balance/spent/pool
      if (own[t.member] !== undefined) own[t.member] += t.amount;
      ownTotal += t.amount;
      return;
    }
    if (t.kind === "personal") {
      if (balance[t.member] !== undefined) {
        balance[t.member] -= t.amount;
        spent[t.member] += t.amount;
      }
      return;
    }
    const parts = t.split.filter((id) => balance[id] !== undefined);
    const k = parts.length || 1;
    const share = t.amount / k;
    parts.forEach((id) => {
      balance[id] -= share;
      spent[id] += share;
    });
  });
  return { balance, spent, own, pool, ownTotal };
}

/** Group money only — `own` spend is somebody's own pocket, not the trip's. */
export const isPoolTxn = (t: Txn): boolean => t.kind !== "own";

/** Fields the expense sheet edits — everything else is bookkeeping. */
export type TxnDraft = Omit<Txn, "id" | "tripId" | "createdAt" | "updatedAt">;

export function diff(a: Txn, b: TxnDraft): Change[] {
  const out: Change[] = [];
  if (a.title !== b.title)
    out.push({ field: "title", from: a.title, to: b.title });
  if (a.amount !== b.amount)
    out.push({
      field: "amount",
      from: a.amount.toFixed(2),
      to: b.amount.toFixed(2),
    });
  if (a.category !== b.category)
    out.push({ field: "category", from: a.category, to: b.category });
  if (a.kind !== b.kind)
    out.push({ field: "kind", from: a.kind, to: b.kind });
  if (a.member !== b.member)
    out.push({ field: "member", from: a.member || "—", to: b.member || "—" });
  if (a.split.join(",") !== b.split.join(","))
    out.push({
      field: "split",
      from: `${a.split.length} people`,
      to: `${b.split.length} people`,
    });
  return out;
}
