import { createClient, isConfigured } from "@/utils/supabase/client";
import type { CategoryId } from "./constants";
import {
  type Trip,
  type TripStatus,
  type Member,
  type Txn,
  type AuditEntry,
  type Place,
  type AccentId,
  type Cover,
} from "./models";
import * as outbox from "./outbox";
import * as editLock from "./editLock";

export const dbConfigured = isConfigured;

/** Rows of the active trip only — everything is scoped by `trip_id`. */
export type TripData = {
  members: Member[];
  txns: Txn[];
  audit: AuditEntry[];
};

/* ---- row <-> model mapping (snake_case columns) ---- */

// self_id is deliberately not written: "who am I" is per device now, and
// the server only updates columns that are sent, so the legacy value stays
const tripToRow = (t: Trip) => ({
  id: t.id,
  name: t.name,
  status: t.status,
  budget: t.budget,
  currency: t.currency,
  created_at: t.createdAt,
  archived_at: t.archivedAt ?? null,
  destination: t.destination,
  origin: t.origin,
  start_date: t.startDate || null,
  end_date: t.endDate || null,
  cover: t.cover,
  accent: t.accent,
  note: t.note,
  distance_km: t.distanceKm || 0,
  travel_time: t.travelTime,
});
const rowToTrip = (r: any): Trip => ({
  id: r.id,
  name: r.name ?? "",
  status: (r.status as TripStatus) === "archived" ? "archived" : "active",
  budget: Number(r.budget ?? 0),
  currency: r.currency ?? "৳",
  selfId: r.self_id ?? "",
  createdAt: Number(r.created_at ?? 0),
  archivedAt: r.archived_at ? Number(r.archived_at) : undefined,
  destination: r.destination ?? "",
  origin: r.origin ?? "",
  startDate: r.start_date ?? "",
  endDate: r.end_date ?? "",
  // left empty on purpose: withDetails() then picks a cover that fits the
  // place ("Sylhet" → 🍃) instead of a generic default
  cover: r.cover ?? "",
  accent: (r.accent ?? "") as AccentId,
  note: r.note ?? "",
  distanceKm: Number(r.distance_km ?? 0),
  travelTime: r.travel_time ?? "",
});

const memberToRow = (m: Member) => ({
  id: m.id,
  trip_id: m.tripId,
  name: m.name,
  color: m.color,
  contribution: m.contribution ?? 0,
  created_at: m.createdAt,
});
const rowToMember = (r: any): Member => ({
  id: r.id,
  tripId: r.trip_id ?? "",
  name: r.name,
  color: r.color,
  contribution: Number(r.contribution ?? 0),
  createdAt: Number(r.created_at),
});

const txnToRow = (t: Txn) => ({
  id: t.id,
  trip_id: t.tripId,
  title: t.title,
  amount: t.amount,
  category: t.category,
  kind: t.kind,
  member: t.member || null,
  split: t.split,
  spent_at: t.spentAt,
  created_at: t.createdAt,
  updated_at: t.updatedAt,
});
const rowToTxn = (r: any): Txn => ({
  id: r.id,
  tripId: r.trip_id ?? "",
  title: r.title,
  amount: Number(r.amount),
  category: r.category as CategoryId,
  kind: (r.kind as Txn["kind"]) ?? "group",
  member: r.member ?? "",
  split: Array.isArray(r.split) ? r.split : [],
  // rows from before the column existed: spent when they were logged
  spentAt: Number(r.spent_at ?? r.created_at),
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
});

const auditToRow = (a: AuditEntry) => ({
  id: a.id,
  trip_id: a.tripId,
  txn_id: a.txnId,
  title: a.title,
  amount: a.amount,
  action: a.action,
  at: a.at,
  changes: a.changes ?? null,
  actor: a.by ?? null,
  device: a.device ?? null,
  device_id: a.deviceId ?? null,
  tz: a.tz ?? null,
});
const rowToAudit = (r: any): AuditEntry => ({
  id: r.id,
  tripId: r.trip_id ?? "",
  txnId: r.txn_id,
  title: r.title,
  amount: Number(r.amount),
  action: r.action,
  at: Number(r.at),
  changes: r.changes ?? undefined,
  by: r.actor ?? undefined,
  device: r.device ?? undefined,
  deviceId: r.device_id ?? undefined,
  tz: r.tz ?? undefined,
});

/* ---- load ---- */

export async function loadTrips(): Promise<
  { ok: true; trips: Trip[] } | { ok: false; error: string }
> {
  const sb = createClient();
  if (!sb) return { ok: false, error: "not-configured" };
  const { data, error } = await sb
    .from("trips")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, trips: (data ?? []).map(rowToTrip) };
}

export async function loadTripData(
  tripId: string
): Promise<{ ok: true; data: TripData } | { ok: false; error: string }> {
  const sb = createClient();
  if (!sb) return { ok: false, error: "not-configured" };
  if (!tripId) return { ok: true, data: { members: [], txns: [], audit: [] } };
  try {
    const [members, txns, audit] = await Promise.all([
      sb
        .from("members")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: true }),
      sb
        .from("transactions")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false }),
      sb
        .from("audit")
        .select("*")
        .eq("trip_id", tripId)
        .order("at", { ascending: false }),
    ]);
    const err = members.error || txns.error || audit.error;
    if (err) return { ok: false, error: err.message };
    return {
      ok: true,
      data: {
        members: (members.data ?? []).map(rowToMember),
        txns: (txns.data ?? []).map(rowToTxn),
        audit: (audit.data ?? []).map(rowToAudit),
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "load failed" };
  }
}

/* ============================================================
   Writes — queued in the outbox, flushed when the network allows.
   Nothing here writes to a table directly: the tables are read-only
   for the public key, and every batch goes through `terra_apply`,
   which checks the edit-lock session token first.
   ============================================================ */

/** Ops in the shape `terra_apply` expects (snake_case rows). */
function wire(op: outbox.Op) {
  switch (op.t) {
    case "trip.put":
      return { t: op.t, v: tripToRow(op.v) };
    case "member.put":
      return { t: op.t, v: memberToRow(op.v) };
    case "txn.put":
      return { t: op.t, v: txnToRow(op.v) };
    case "audit.put":
      return { t: op.t, v: auditToRow(op.v) };
    case "place.put":
      return { t: op.t, v: placeToRow(op.v) };
    case "cover.put":
      return { t: op.t, v: { id: op.v.id, photo: op.v.photo, updated_at: op.v.updatedAt } };
    default:
      return { t: op.t, id: op.id };
  }
}

/**
 * Why queued writes aren't moving:
 *  locked        — no/expired edit token; they wait for an unlock
 *  not-installed — supabase-edit-lock.sql hasn't been run yet
 *  retrying      — network / server hiccup; tried again on the next sync
 */
export type FlushStatus = "ok" | "locked" | "not-installed" | "retrying";

const BATCH = 25;
let flushing = false;

/**
 * Drain the outbox in order, a batch at a time. Stops at the first op
 * the database rejects so later writes can't overtake earlier ones.
 * Only a real rejection counts towards dropping an op — a flaky signal
 * on a hill must never be able to throw an expense away. Never throws.
 */
export async function flush(): Promise<FlushStatus> {
  if (flushing) return "ok";
  const sb = createClient();
  if (!sb) return "ok";
  if (!outbox.count()) return "ok";
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return "retrying";
  const token = editLock.getToken();
  if (!token) return "locked";

  flushing = true;
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = outbox.list().slice(0, BATCH);
      if (!batch.length) return "ok";

      let res: any = null;
      try {
        const { data, error } = await sb.rpc("terra_apply", {
          p_token: token,
          p_ops: batch.map((e) => wire(e.op)),
        });
        if (error) return editLock.isMissingFn(error) ? "not-installed" : "retrying";
        res = data;
      } catch {
        return "retrying";
      }

      const applied = Math.max(0, Number(res?.applied ?? 0));
      outbox.removeMany(batch.slice(0, applied).map((e) => e.id));
      if (res?.ok) continue;

      if (res?.auth === false) {
        editLock.reject();
        return "locked";
      }

      // the database itself refused this op — count it, and park it for
      // good after MAX_TRIES so one bad row can't wedge the queue
      const bad = batch[applied];
      if (!bad) return "retrying";
      const tries = bad.tries + 1;
      if (tries >= outbox.MAX_TRIES) {
        outbox.kill(bad.id, String(res?.error ?? "rejected"));
        continue;
      }
      outbox.bumpTries(bad.id, tries);
      return "retrying";
    }
  } finally {
    flushing = false;
  }
}

/** Local-only installs keep everything in the cache; there's nowhere to
 *  send writes, so don't let the queue grow forever. */
const queue = (op: outbox.Op) => {
  if (dbConfigured) outbox.push(op);
};

export const db = {
  configured: dbConfigured,

  saveTrip: (t: Trip) => queue({ t: "trip.put", v: t }),

  insertMember: (m: Member) => queue({ t: "member.put", v: m }),
  updateMember: (m: Member) => queue({ t: "member.put", v: m }),
  deleteMember: (id: string, tripId: string) =>
    queue({ t: "member.del", id, tripId }),

  insertTxn: (t: Txn) => queue({ t: "txn.put", v: t }),
  updateTxn: (t: Txn) => queue({ t: "txn.put", v: t }),
  deleteTxn: (id: string, tripId: string) =>
    queue({ t: "txn.del", id, tripId }),

  insertAudit: (a: AuditEntry) => queue({ t: "audit.put", v: a }),

  /** Used when a new trip copies places from an old one. */
  insertPlace: (p: Place) => queue({ t: "place.put", v: p }),

  saveCover: (c: Cover) => queue({ t: "cover.put", v: c }),
  deleteCover: (tripId: string) => queue({ t: "cover.del", id: tripId, tripId }),

  /** Erase one trip and everything under it (the server purges the
   *  children). Queued like any write, so it survives going offline;
   *  that trip's other pending writes are moot and dropped first. */
  deleteTrip(tripId: string) {
    if (!dbConfigured) return;
    outbox.dropTrip(tripId);
    outbox.push({ t: "trip.del", id: tripId });
  },

  /** Erase every trip. Online-only and immediate: replaying stale queued
   *  ops onto freshly wiped tables would resurrect what was just deleted. */
  async clearAll(): Promise<boolean> {
    const sb = createClient();
    if (!sb) return true;
    const { data, error } = await sb.rpc("terra_apply", {
      p_token: editLock.getToken(),
      p_ops: [{ t: "all.clear" }],
    });
    if (error || !data?.ok) {
      if (data?.auth === false) editLock.reject();
      return false;
    }
    outbox.clear();
    return true;
  },

  onChange(cb: () => void): () => void {
    const sb = createClient();
    if (!sb) return () => {};
    const ch = sb
      .channel("terra-sync")
      .on("postgres_changes", { event: "*", schema: "public" }, cb)
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  },
};

/* ============================================================
   Cover photos — a light index first, then only the photos that
   changed, so a big image is downloaded once per device
   ============================================================ */

export async function loadCoverIndex(): Promise<
  { ok: true; index: Record<string, number> } | { ok: false }
> {
  const sb = createClient();
  if (!sb) return { ok: false };
  const { data, error } = await sb.from("trip_covers").select("id, updated_at");
  if (error) return { ok: false }; // table not there yet → just no photos
  const index: Record<string, number> = {};
  (data ?? []).forEach((r: any) => (index[r.id] = Number(r.updated_at ?? 0)));
  return { ok: true, index };
}

export async function loadCover(tripId: string): Promise<string | null> {
  const sb = createClient();
  if (!sb) return null;
  const { data, error } = await sb.from("trip_covers").select("photo").eq("id", tripId);
  if (error || !data?.length) return null;
  return String((data[0] as any).photo ?? "") || null;
}

/* ============================================================
   Tour stats — what the Tours hub shows for each tour
   ============================================================ */

export type TripStats = {
  spent: number; // pool money spent
  own: number; // own-pocket spend
  pool: number; // sum of deposits
  people: number;
  txns: number;
  places: number;
  done: number;
  first: number; // earliest expense (ms), 0 = none
  last: number; // latest expense (ms)
};

export const EMPTY_STATS: TripStats = {
  spent: 0,
  own: 0,
  pool: 0,
  people: 0,
  txns: 0,
  places: 0,
  done: 0,
  first: 0,
  last: 0,
};

/* ============================================================
   Places (Trip Plan) — cloud table, shared across devices
   ============================================================ */

const placeToRow = (p: Place) => ({
  id: p.id,
  trip_id: p.tripId,
  name: p.name,
  area: p.area,
  icon: p.icon,
  done: p.done,
  ord: p.ord,
});
const rowToPlace = (r: any): Place => ({
  id: r.id,
  tripId: r.trip_id ?? "",
  name: r.name,
  area: r.area ?? "",
  icon: r.icon ?? "pin",
  done: !!r.done,
  ord: Number(r.ord ?? 0),
});

export async function loadPlaces(
  tripId: string
): Promise<{ ok: true; places: Place[] } | { ok: false; error: string }> {
  const sb = createClient();
  if (!sb) return { ok: false, error: "not-configured" };
  if (!tripId) return { ok: true, places: [] };
  const { data, error } = await sb
    .from("places")
    .select("*")
    .eq("trip_id", tripId)
    .order("ord", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, places: (data ?? []).map(rowToPlace) };
}

export const placesDb = {
  insert: (p: Place) => queue({ t: "place.put", v: p }),
  update: (p: Place) => queue({ t: "place.put", v: p }),
  del: (id: string, tripId: string) => queue({ t: "place.del", id, tripId }),

  onChange(cb: () => void): () => void {
    const sb = createClient();
    if (!sb) return () => {};
    const ch = sb
      .channel("terra-places")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "places" },
        cb
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  },
};
