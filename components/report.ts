/* ============================================================
   Tour report — the numbers, a chat-ready summary, and a CSV that
   Excel / Google Sheets open (UTF-8 with BOM, so Bangla survives).
   ============================================================ */

import { catLabel, dayKey, fmtDay, fmtTime, type CategoryId } from "./constants";
import {
  byWhen,
  isPoolTxn,
  settleUp,
  tourDates,
  type Balances,
  type Member,
  type Place,
  type Settlement,
  type Trip,
  type Txn,
} from "./models";

export type ReportData = {
  trip: Trip;
  members: Member[];
  txns: Txn[];
  places: Place[];
  balances: Balances;
};

export type Report = {
  dates: string;
  pool: number;
  spent: number;
  own: number;
  left: number;
  count: number;
  perHead: number; // pool spend per person
  byCategory: { id: CategoryId; label: string; amount: number }[];
  byDay: { key: string; label: string; amount: number }[];
  people: {
    id: string;
    name: string;
    deposit: number;
    spent: number;
    own: number;
    balance: number;
  }[];
  settle: Settlement;
  explored: number;
};

export function buildReport({ trip, members, txns, places, balances }: ReportData): Report {
  const pool = members.reduce((s, m) => s + (m.contribution || 0), 0);
  const poolTxns = txns.filter(isPoolTxn);
  const spent = poolTxns.reduce((s, t) => s + t.amount, 0);
  const own = txns.reduce((s, t) => (isPoolTxn(t) ? s : s + t.amount), 0);
  const when = txns.map((t) => t.spentAt || t.createdAt);
  const cats = new Map<CategoryId, number>();
  poolTxns.forEach((t) => cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount));
  const days = new Map<string, { at: number; amount: number }>();
  [...poolTxns].sort(byWhen).reverse().forEach((t) => {
    const at = t.spentAt || t.createdAt;
    const k = dayKey(at);
    const d = days.get(k) ?? { at, amount: 0 };
    d.amount += t.amount;
    days.set(k, d);
  });
  return {
    dates: tourDates(trip, when.length ? Math.min(...when) : 0, when.length ? Math.max(...when) : 0).text,
    pool,
    spent,
    own,
    left: pool - spent,
    count: txns.length,
    perHead: members.length ? spent / members.length : 0,
    byCategory: [...cats.entries()]
      .map(([id, amount]) => ({ id, label: catLabel(id), amount }))
      .sort((a, b) => b.amount - a.amount),
    byDay: [...days.entries()].map(([key, d]) => ({ key, label: fmtDay(d.at), amount: d.amount })),
    people: members.map((m) => ({
      id: m.id,
      name: m.name,
      deposit: m.contribution || 0,
      spent: balances.spent[m.id] ?? 0,
      own: balances.own[m.id] ?? 0,
      balance: balances.balance[m.id] ?? 0,
    })),
    settle: settleUp(members, balances, trip.holderId),
    explored: places.filter((p) => p.done).length,
  };
}

const nameOf = (members: Member[], id: string) =>
  id ? members.find((m) => m.id === id)?.name ?? "—" : "the pool";

/** One settle-up line in words: "Sohag → Mahmud ৳952". */
export function settleLineText(
  members: Member[],
  line: { from: string; to: string; amount: number },
  money: (n: number) => string
): string {
  if (!line.to) return `${nameOf(members, line.from)} pays ${money(line.amount)} into the pool`;
  if (!line.from) return `${nameOf(members, line.to)} gets ${money(line.amount)} back from the pool`;
  return `${nameOf(members, line.from)} → ${nameOf(members, line.to)} ${money(line.amount)}`;
}

/** For WhatsApp / Messenger: short, readable, no attachments needed. */
export function summaryText(d: ReportData, money: (n: number) => string): string {
  const r = buildReport(d);
  const holder = d.members.find((m) => m.id === d.trip.holderId);
  const out = [
    `${d.trip.cover} ${d.trip.name}${r.dates ? ` — ${r.dates}` : ""}`,
    `💰 Pool ${money(r.pool)} · Spent ${money(r.spent)} · Left ${money(r.left)}`,
  ];
  if (r.own > 0) out.push(`👛 Own pocket (outside the pool) ${money(r.own)}`);
  if (r.byCategory.length)
    out.push(`🧾 ${r.count} expenses · ${r.byCategory.slice(0, 3).map((c) => `${c.label} ${money(c.amount)}`).join(", ")}`);
  out.push("");
  if (!r.settle.lines.length) {
    out.push("✅ Everyone's square");
  } else {
    out.push(holder ? `Settle up (cash is with ${holder.name}):` : "Settle up:");
    r.settle.lines.forEach((l) => {
      const who = l.from === d.trip.holderId ? l.to : l.from;
      out.push(`${d.trip.settled?.[who] ? "✓" : "•"} ${settleLineText(d.members, l, money)}`);
    });
  }
  out.push("", "— TerraExplore");
  return out.join("\n");
}

const cell = (v: string | number) => {
  const s = typeof v === "number" ? (Math.round(v * 100) / 100).toFixed(2) : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (...vs: (string | number)[]) => vs.map(cell).join(",");

/** Expenses, then people and settle-up, in one sheet. */
export function reportCsv(d: ReportData, money: (n: number) => string): string {
  const r = buildReport(d);
  const nm = (id: string) => nameOf(d.members, id);
  const lines = [
    row("Tour", d.trip.name),
    row("Destination", d.trip.destination || ""),
    row("Dates", r.dates),
    row("Currency", d.trip.currency),
    "",
    row("Date", "Time", "Expense", "Category", "Type", "Amount", "Charged to / split between", "Per person"),
    ...[...d.txns].sort(byWhen).reverse().map((t) => {
      const at = t.spentAt || t.createdAt;
      const date = new Date(at).toLocaleDateString("en-GB");
      const who =
        t.kind === "group"
          ? t.split.map(nm).join(" + ")
          : `${nm(t.member)}${t.kind === "own" ? " (own pocket)" : ""}`;
      const per = t.kind === "group" && t.split.length ? t.amount / t.split.length : t.amount;
      return row(date, fmtTime(at), t.title, catLabel(t.category), t.kind, t.amount, who, per);
    }),
    "",
    row("Total from pool", r.spent),
    row("Own pocket", r.own),
    "",
    row("Person", "Deposit", "Spent from pool", "Own pocket", "Balance", "Settled"),
    ...r.people.map((p) =>
      row(p.name, p.deposit, p.spent, p.own, p.balance, d.trip.settled?.[p.id] ? "yes" : "")
    ),
    "",
    row("Settle up"),
    ...(r.settle.lines.length
      ? r.settle.lines.map((l) => row(settleLineText(d.members, l, money)))
      : [row("Everyone's square")]),
  ];
  return "﻿" + lines.join("\r\n");
}

export const fileSlug = (s: string) =>
  s.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "tour";

/** Share the file where the phone can (WhatsApp, Drive…), else download. */
export async function shareFile(name: string, body: string, type: string): Promise<"shared" | "downloaded"> {
  const file = new File([body], name, { type });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return "shared";
    }
  } catch {
    /* dismissed — fall through to a download */
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return "downloaded";
}

/** Text to the share sheet (chat apps), else the clipboard. */
export async function shareText(text: string): Promise<"shared" | "copied" | "failed"> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch {
      return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
