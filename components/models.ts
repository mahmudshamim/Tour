import type { CategoryId } from "./constants";

export type Member = {
  id: string;
  name: string;
  color: string;
  createdAt: number;
};

export type Txn = {
  id: string;
  title: string;
  amount: number;
  category: CategoryId;
  paidBy: string;
  split: string[];
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
};

export type Settings = {
  tripName: string;
  budget: number;
  currency: string;
  selfId: string;
};

export type State = {
  members: Member[];
  txns: Txn[];
  audit: AuditEntry[];
  settings: Settings;
};

export const EMPTY: State = {
  members: [],
  txns: [],
  audit: [],
  settings: { tripName: "", budget: 0, currency: "৳", selfId: "" },
};

export const uid = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export type Balances = {
  net: Record<string, number>;
  paid: Record<string, number>;
};

export function computeBalances(members: Member[], txns: Txn[]): Balances {
  const net: Record<string, number> = {};
  const paid: Record<string, number> = {};
  members.forEach((m) => {
    net[m.id] = 0;
    paid[m.id] = 0;
  });
  txns.forEach((t) => {
    if (net[t.paidBy] !== undefined) {
      net[t.paidBy] += t.amount;
      paid[t.paidBy] += t.amount;
    }
    const parts = t.split.filter((id) => net[id] !== undefined);
    const k = parts.length || 1;
    const share = t.amount / k;
    parts.forEach((id) => (net[id] -= share));
  });
  return { net, paid };
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
  if (a.paidBy !== b.paidBy)
    out.push({ field: "paidBy", from: a.paidBy, to: b.paidBy });
  if (a.split.join(",") !== b.split.join(","))
    out.push({
      field: "split",
      from: `${a.split.length} people`,
      to: `${b.split.length} people`,
    });
  return out;
}
