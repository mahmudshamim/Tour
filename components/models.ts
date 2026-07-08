import type { CategoryId } from "./constants";

export type Member = {
  id: string;
  name: string;
  color: string;
  contribution: number; // tk this person deposited into the pool
  createdAt: number;
};

export type TxnKind = "group" | "personal";

export type Txn = {
  id: string;
  title: string;
  amount: number;
  category: CategoryId;
  kind: TxnKind; // group = split from pool, personal = one member's own spend
  split: string[]; // group: members who share (default all)
  member: string; // personal: the member charged
  createdAt: number;
  updatedAt: number;
};

export type Change = { field: string; from: string; to: string };

export type AuditEntry = {
  id: string;
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

export type Settings = {
  tripName: string;
  budget: number; // kept for compatibility; pool is derived from contributions
  currency: string;
  selfId: string;
};

export type State = {
  members: Member[];
  txns: Txn[];
  audit: AuditEntry[];
  settings: Settings;
};

export type Place = {
  id: string;
  name: string;
  area: string;
  icon: string;
  done: boolean;
  ord: number; // sort order (for reordering)
};

export const EMPTY: State = {
  members: [],
  txns: [],
  audit: [],
  settings: { tripName: "Sylhet", budget: 0, currency: "৳", selfId: "" },
};

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
  spent: Record<string, number>; // total charged to each member
  pool: number; // sum of all contributions (= budget)
};

/**
 * Pool model:
 *  - each member deposits `contribution` → pool
 *  - group expense: split equally among `split` members (deducts from each)
 *  - personal expense: charged fully to `member`
 *  - balance[m] = contribution[m] − (group shares) − (personal charges)
 */
export function computeBalances(members: Member[], txns: Txn[]): Balances {
  const balance: Record<string, number> = {};
  const spent: Record<string, number> = {};
  let pool = 0;
  members.forEach((m) => {
    balance[m.id] = m.contribution || 0;
    spent[m.id] = 0;
    pool += m.contribution || 0;
  });
  txns.forEach((t) => {
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
  return { balance, spent, pool };
}

export function diff(
  a: Txn,
  b: Omit<Txn, "id" | "createdAt" | "updatedAt">
): Change[] {
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
