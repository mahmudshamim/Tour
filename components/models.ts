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
  /** Legacy, no longer used: "which member is me" lived on the shared
   *  trip row, so one phone changed it for everyone. It's per device now
   *  (see `selfId` in store.tsx). */
  selfId: string;
  createdAt: number;
  archivedAt?: number;
  /** settle-up: the member holding the pool's cash ("" = not said) */
  holderId: string;
  /** settle-up: members already squared up { memberId: true } */
  settled: Record<string, boolean>;
} & TripDetails;

/** Everything that makes one tour look and feel like itself. */
export type TripDetails = {
  destination: string; // "Cox's Bazar"
  origin: string; // where the route starts, e.g. "Dhaka"
  startDate: string; // YYYY-MM-DD, "" = not set
  endDate: string;
  cover: string; // emoji
  accent: AccentId;
  note: string; // one-line tagline
  distanceKm: number; // 0 = hide the map badge
  travelTime: string; // "5h drive"
};

export type AccentId =
  | "forest"
  | "lagoon"
  | "ocean"
  | "night"
  | "berry"
  | "sunset"
  | "desert";

/** Cover gradients — dark enough for white text on top. */
export const ACCENTS: { id: AccentId; label: string; from: string; to: string }[] = [
  { id: "forest", label: "Forest", from: "#14532d", to: "#22c55e" },
  { id: "lagoon", label: "Lagoon", from: "#134e4a", to: "#14b8a6" },
  { id: "ocean", label: "Ocean", from: "#0c4a6e", to: "#0ea5e9" },
  { id: "night", label: "Night", from: "#1e1b4b", to: "#6366f1" },
  { id: "berry", label: "Berry", from: "#701a75", to: "#db2777" },
  { id: "sunset", label: "Sunset", from: "#7c2d12", to: "#f97316" },
  { id: "desert", label: "Desert", from: "#78350f", to: "#f59e0b" },
];

export const accentOf = (id: string | undefined) =>
  ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];

/** What the tour form edits. */
export type TripDraft = TripDetails & { name: string; currency: string };

/** Fill in details a trip doesn't have yet (older rows, older caches).
 *  No cover chosen → one that fits the place ("Sylhet" → tea leaves). */
export const withDetails = (t: Trip): Trip => {
  const guess = !t.cover || !t.accent ? guessTheme(t.name, t.destination) : null;
  return {
    ...DEFAULT_DETAILS,
    ...t,
    cover: t.cover || guess?.cover || DEFAULT_DETAILS.cover,
    accent: t.accent || guess?.accent || DEFAULT_DETAILS.accent,
    holderId: t.holderId ?? "",
    settled: t.settled ?? {},
  };
};

export const COVERS = [
  "🍃", "🍵", "🌊", "🏖️", "🏝️", "🌅", "🏔️", "🌄",
  "🏕️", "🛶", "🚢", "🚞", "🐅", "🌳", "🕌", "🏛️",
  "🌸", "❄️", "🏜️", "🏙️", "🌋", "✈️", "🎒", "🧭",
];

type Theme = { cover: string; accent: AccentId };

/** Latin words match at a word start; Bangla ones anywhere a word starts. */
const theme = (en: string, bn: string, cover: string, accent: AccentId) => ({
  re: new RegExp(`\\b(?:${en})|(?:^|[^\\u0980-\\u09FF])(?:${bn})`, "i"),
  cover,
  accent,
});

/** Places people actually go, most specific first. */
const THEMES = [
  theme("srimangal|sreemangal|moulvibazar|lawachara", "শ্রীমঙ্গল|মৌলভীবাজার|লাউয়াছড়া", "🍵", "forest"),
  theme("sylhet|jaflong|ratargul|bholaganj|lalakhal|bisnakandi|tamabil|sada pathor|tea\\b", "সিলেট|জাফলং|রাতারগুল|ভোলাগঞ্জ|লালাখাল|বিছনাকান্দি|তামাবিল|সাদা পাথর|চা বাগান", "🍃", "forest"),
  theme("saint ?martin|st\\.? ?martin|nijhum|island|chera ?dwip", "সেন্ট ?মার্টিন|নিঝুম|দ্বীপ|ছেঁড়া", "🏝️", "lagoon"),
  theme("kuakata", "কুয়াকাটা", "🌅", "sunset"),
  theme("cox|inani|himchari|patenga|beach|sea\\b", "কক্সবাজার|ইনানী|হিমছড়ি|পতেঙ্গা|সৈকত|সমুদ্র", "🌊", "ocean"),
  theme("sajek", "সাজেক", "🌄", "sunset"),
  theme("rangamati|kaptai|tanguar|haor|lakes?\\b", "রাঙামাটি|কাপ্তাই|টাঙ্গুয়ার|হাওর|হ্রদ", "🛶", "lagoon"),
  theme("sundarban", "সুন্দরবন", "🐅", "forest"),
  theme("bandarban|nilgiri|nilachal|keokradong|thanchi|nafakhum|debotakhum|khagrachari|trek|hills?\\b|mountain", "বান্দরবান|নীলগিরি|নীলাচল|কেওক্রাডং|থানচি|নাফাখুম|দেবতাখুম|খাগড়াছড়ি|পাহাড়", "🏔️", "desert"),
  theme("nepal|himalaya|kashmir|manali|sikkim|snow", "নেপাল|হিমালয়|কাশ্মীর|মানালি|সিকিম|বরফ", "❄️", "night"),
  theme("darjeeling|shimla|ooty", "দার্জিলিং|শিমলা", "🚞", "berry"),
  theme("dhaka|chittagong|chattogram|kolkata|dubai|singapore|bangkok|city\\b", "ঢাকা|চট্টগ্রাম|কলকাতা|দুবাই|শহর", "🏙️", "night"),
];

/** A cover + colour that fits where the tour goes, or null if unsure. */
export function guessTheme(...texts: string[]): Theme | null {
  const hay = texts.filter(Boolean).join(" ");
  if (!hay.trim()) return null;
  const hit = THEMES.find((t) => t.re.test(hay));
  return hit ? { cover: hit.cover, accent: hit.accent } : null;
}

export const DEFAULT_DETAILS: TripDetails = {
  destination: "",
  origin: "",
  startDate: "",
  endDate: "",
  cover: "🎒",
  accent: "forest",
  note: "",
  distanceKm: 0,
  travelTime: "",
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
  /** when the money was actually spent — editable, so an expense logged
   *  later (e.g. after a day with no signal) still lands on the right day */
  spentAt: number;
  /** version of its receipt photo (0 = none); the photo lives apart */
  receiptAt: number;
  createdAt: number; // when it was logged
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

export type State = {
  trips: Trip[];
  tripId: string; // which trip the rows below belong to
  members: Member[];
  txns: Txn[];
  audit: AuditEntry[];
};

/** A photo waiting to upload. The outbox keeps only this reference;
 *  the bytes stay in photoStore until the upload reads them. */
export type PhotoRef = {
  id: string; // cover: the trip's id · receipt: the expense's id
  tripId: string;
  updatedAt: number;
  photo?: string; // only in queue entries written before photos moved out
};

/** Receipt photos are stored per version, so a replaced one is a new key. */
export const receiptKey = (txnId: string, at: number) => `${txnId}@${at}`;

/** Local cache of one tour's places (shared by the store and places.tsx). */
export const placesCacheKey = (tripId: string) => `terra.places.${tripId}.v1`;

export type Place = {
  id: string;
  tripId: string;
  name: string;
  area: string;
  icon: string;
  done: boolean;
  ord: number; // sort order (for reordering)
  day: number; // 1 = the tour's first day; 0 = not on a day yet
  time: string; // "HH:MM" or ""
  lat: number | null;
  lng: number | null;
};

/** Day-by-day: day 1, 2, … then unscheduled; within a day by time
 *  (untimed last), then the hand-set order. */
export function planOrder(a: Place, b: Place): number {
  const da = a.day || 1e6;
  const db = b.day || 1e6;
  if (da !== db) return da - db;
  const ta = a.time || "99:99";
  const tb = b.time || "99:99";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.ord - b.ord;
}

/** "08:30" → "8:30 AM" */
export function fmtClock(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return "";
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** How many days the plan offers: the tour's length, or enough to cover
 *  what's already planned, plus one spare. */
export function planDays(t: Pick<TripDetails, "startDate" | "endDate"> | undefined, places: Place[]): number {
  const used = places.reduce((m, p) => Math.max(m, p.day || 0), 0);
  const s = t ? dayStart(t.startDate) : NaN;
  const e = t ? dayStart(t.endDate) : NaN;
  const span = Number.isNaN(s) ? 0 : Number.isNaN(e) || e < s ? 1 : Math.round((e - s) / DAY) + 1;
  return Math.max(span, used + 1, 1);
}

/** Calendar date of plan day `n` (1-based), if the tour has dates. */
export function planDayDate(t: Pick<TripDetails, "startDate"> | undefined, n: number): number | null {
  const s = t ? dayStart(t.startDate) : NaN;
  return Number.isNaN(s) || n < 1 ? null : s + (n - 1) * DAY;
}

export const EMPTY: State = {
  trips: [],
  tripId: "",
  members: [],
  txns: [],
  audit: [],
};

export function newTrip(
  name: string,
  details: Partial<TripDetails> = {},
  at = Date.now()
): Trip {
  return {
    ...DEFAULT_DETAILS,
    ...details,
    id: uid(),
    name: name.trim() || "New tour",
    status: "active",
    budget: 0,
    currency: "৳",
    selfId: "",
    holderId: "",
    settled: {},
    createdAt: at,
  };
}

/* ---- dates ---- */

const DAY = 86_400_000;
/** "YYYY-MM-DD" → local midnight, or NaN. */
const dayStart = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
};

export type TripPhase =
  | { kind: "undated" }
  | { kind: "upcoming"; inDays: number }
  | { kind: "ongoing"; day: number; of: number }
  | { kind: "done" };

/** Where a tour sits in time, from its dates (archiving is separate). */
export function tripPhase(t: Pick<TripDetails, "startDate" | "endDate">, now = Date.now()): TripPhase {
  const s = dayStart(t.startDate);
  if (Number.isNaN(s)) return { kind: "undated" };
  const eRaw = dayStart(t.endDate);
  const e = Number.isNaN(eRaw) || eRaw < s ? s : eRaw;
  const today = new Date(now);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (t0 < s) return { kind: "upcoming", inDays: Math.round((s - t0) / DAY) };
  if (t0 > e) return { kind: "done" };
  return {
    kind: "ongoing",
    day: Math.round((t0 - s) / DAY) + 1,
    of: Math.round((e - s) / DAY) + 1,
  };
}

export function phaseLabel(p: TripPhase): string {
  switch (p.kind) {
    case "upcoming":
      return p.inDays === 1 ? "Tomorrow" : `In ${p.inDays} days`;
    case "ongoing":
      return p.of > 1 ? `Day ${p.day} of ${p.of}` : "Today";
    case "done":
      return "Completed";
    default:
      return "";
  }
}

/** "12–15 Dec 2026", "28 Dec – 2 Jan 2027", "12 Dec 2026", or "". */
export function fmtDateRange(start: string, end: string): string {
  const s = dayStart(start);
  if (Number.isNaN(s)) return "";
  const e = dayStart(end);
  const a = new Date(s);
  const d = (x: Date, o: Intl.DateTimeFormatOptions) => x.toLocaleDateString("en-GB", o);
  if (Number.isNaN(e) || e <= s) return d(a, { day: "numeric", month: "short", year: "numeric" });
  const b = new Date(e);
  if (a.getFullYear() !== b.getFullYear())
    return `${d(a, { day: "numeric", month: "short", year: "numeric" })} – ${d(b, { day: "numeric", month: "short", year: "numeric" })}`;
  if (a.getMonth() !== b.getMonth())
    return `${d(a, { day: "numeric", month: "short" })} – ${d(b, { day: "numeric", month: "short", year: "numeric" })}`;
  return `${a.getDate()}–${d(b, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** Local "YYYY-MM-DD" for a timestamp. */
export const ymdOf = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** The tour's dates — as set, or else read off its first and last
 *  expense (`derived`), so an undated past tour still shows when it was. */
export function tourDates(
  t: Pick<TripDetails, "startDate" | "endDate">,
  first = 0,
  last = 0
): { text: string; derived: boolean } {
  const set = fmtDateRange(t.startDate, t.endDate);
  if (set) return { text: set, derived: false };
  if (!first) return { text: "", derived: false };
  return { text: fmtDateRange(ymdOf(first), ymdOf(last || first)), derived: true };
}

/** Year a tour belongs to, for grouping past tours. */
export const tripYear = (t: Trip, first = 0): number => {
  const s = dayStart(t.startDate);
  return new Date(Number.isNaN(s) ? first || t.createdAt : s).getFullYear();
};

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

/* ---- settle-up ---- */

export type SettleLine = { from: string; to: string; amount: number }; // member ids; "" = the pool
export type Settlement = {
  left: number; // cash still in the pool
  back: { id: string; amount: number }[]; // gets money back
  owes: { id: string; amount: number }[]; // must pay in
  lines: SettleLine[]; // who hands whom what
};

/**
 * End-of-tour squaring up. Everyone's balance is deposit minus their
 * share of pool spending; the pool's leftover cash is the sum of them.
 * With a cash holder, everyone settles with that person; without one,
 * with "the pool".
 */
export function settleUp(members: Member[], b: Balances, holderId = ""): Settlement {
  const round = (n: number) => Math.round(n * 100) / 100;
  const holder = members.some((m) => m.id === holderId) ? holderId : "";
  const back: Settlement["back"] = [];
  const owes: Settlement["owes"] = [];
  let left = 0;
  members.forEach((m) => {
    const bal = round(b.balance[m.id] ?? 0);
    left += bal;
    if (bal > 0.004) back.push({ id: m.id, amount: bal });
    else if (bal < -0.004) owes.push({ id: m.id, amount: -bal });
  });
  back.sort((x, y) => y.amount - x.amount);
  owes.sort((x, y) => y.amount - x.amount);
  const lines: SettleLine[] = [
    ...owes.filter((o) => o.id !== holder).map((o) => ({ from: o.id, to: holder, amount: o.amount })),
    ...back.filter((r) => r.id !== holder).map((r) => ({ from: holder, to: r.id, amount: r.amount })),
  ];
  return { left: round(left), back, owes, lines };
}

/** Newest spend first — by when it happened, not when it was typed in. */
export const byWhen = (a: Txn, b: Txn): number =>
  (b.spentAt || b.createdAt) - (a.spentAt || a.createdAt);

/** Group money only — `own` spend is somebody's own pocket, not the trip's. */
export const isPoolTxn = (t: Txn): boolean => t.kind !== "own";

/** Fields the expense sheet edits — everything else is bookkeeping. */
export type TxnDraft = Omit<Txn, "id" | "tripId" | "createdAt" | "updatedAt">;

const fmtStamp = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

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
  if (Boolean(a.receiptAt) !== Boolean(b.receiptAt))
    out.push({ field: "receipt", from: a.receiptAt ? "photo" : "none", to: b.receiptAt ? "photo" : "removed" });
  const was = a.spentAt || a.createdAt;
  if (was !== b.spentAt)
    out.push({ field: "when", from: fmtStamp(was), to: fmtStamp(b.spentAt) });
  if (a.split.join(",") !== b.split.join(","))
    out.push({
      field: "split",
      from: `${a.split.length} people`,
      to: `${b.split.length} people`,
    });
  return out;
}
