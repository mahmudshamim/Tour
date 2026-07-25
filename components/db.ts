import { createClient, isConfigured } from "@/utils/supabase/client";
import type { CategoryId } from "./constants";
import {
  type Trip,
  type TripStatus,
  type Member,
  type Txn,
  type AuditEntry,
  type Place,
} from "./models";
import * as outbox from "./outbox";

export const dbConfigured = isConfigured;

/** Rows of the active trip only — everything is scoped by `trip_id`. */
export type TripData = {
  members: Member[];
  txns: Txn[];
  audit: AuditEntry[];
};

/* ---- row <-> model mapping (snake_case columns) ---- */

const tripToRow = (t: Trip) => ({
  id: t.id,
  name: t.name,
  status: t.status,
  budget: t.budget,
  currency: t.currency,
  self_id: t.selfId,
  created_at: t.createdAt,
  archived_at: t.archivedAt ?? null,
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
   Nothing here talks to Supabase directly; `flush()` owns that.
   ============================================================ */

/** Run one queued op against Supabase. Resolves with `{ error }`. */
function exec(sb: any, op: outbox.Op): Promise<{ error: any }> {
  switch (op.t) {
    // upsert (not insert) everywhere, so a retry after a partially
    // applied write can't fail on a duplicate primary key
    case "member.put":
      return sb.from("members").upsert(memberToRow(op.v));
    case "member.del":
      return sb.from("members").delete().eq("id", op.id);
    case "txn.put":
      return sb.from("transactions").upsert(txnToRow(op.v));
    case "txn.del":
      return sb.from("transactions").delete().eq("id", op.id);
    case "audit.put":
      return sb.from("audit").upsert(auditToRow(op.v));
    case "trip.put":
      return sb.from("trips").upsert(tripToRow(op.v));
    case "trip.del":
      return sb.from("trips").delete().eq("id", op.id);
    case "place.put":
      return sb.from("places").upsert(placeToRow(op.v));
    case "place.del":
      return sb.from("places").delete().eq("id", op.id);
  }
}

let flushing = false;

/**
 * Drain the outbox in order. Stops at the first entry that fails so
 * later writes can't overtake earlier ones; the caller retries later.
 * Never throws.
 */
export async function flush(): Promise<void> {
  if (flushing) return;
  const sb = createClient();
  if (!sb) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  flushing = true;
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const pending = outbox.list();
      if (!pending.length) return;
      const entry = pending[0];

      let error: any = null;
      try {
        ({ error } = await exec(sb, entry.op));
      } catch (e: any) {
        error = e;
      }

      if (!error) {
        outbox.remove(entry.id);
        continue;
      }

      const tries = entry.tries + 1;
      if (tries >= outbox.MAX_TRIES) {
        outbox.kill(entry.id, String(error?.message ?? error));
        continue; // dead-lettered — keep draining the rest
      }
      outbox.bumpTries(entry.id, tries);
      return; // likely offline / transient — preserve order, retry later
    }
  } finally {
    flushing = false;
  }
}

export const db = {
  configured: dbConfigured,

  saveTrip: (t: Trip) => outbox.push({ t: "trip.put", v: t }),

  insertMember: (m: Member) => outbox.push({ t: "member.put", v: m }),
  updateMember: (m: Member) => outbox.push({ t: "member.put", v: m }),
  deleteMember: (id: string, tripId: string) =>
    outbox.push({ t: "member.del", id, tripId }),

  insertTxn: (t: Txn) => outbox.push({ t: "txn.put", v: t }),
  updateTxn: (t: Txn) => outbox.push({ t: "txn.put", v: t }),
  deleteTxn: (id: string, tripId: string) =>
    outbox.push({ t: "txn.del", id, tripId }),

  insertAudit: (a: AuditEntry) => outbox.push({ t: "audit.put", v: a }),

  /** Used when a new trip copies places from an old one. */
  insertPlace: (p: Place) => outbox.push({ t: "place.put", v: p }),

  /* Bulk, destructive and online-only, so they bypass the queue and
     purge it: replaying stale ops onto freshly wiped rows would
     resurrect exactly what was just deleted. */

  /** Erase one trip and everything under it. Only that trip's queued
   *  writes are dropped — other trips' pending edits still flush. */
  async deleteTrip(tripId: string) {
    outbox.dropTrip(tripId);
    const sb = createClient();
    if (!sb) return;
    await Promise.all([
      sb.from("audit").delete().eq("trip_id", tripId),
      sb.from("transactions").delete().eq("trip_id", tripId),
      sb.from("members").delete().eq("trip_id", tripId),
      sb.from("places").delete().eq("trip_id", tripId),
    ]);
    await sb.from("trips").delete().eq("id", tripId);
  },

  /** Erase every trip. */
  async clearAll() {
    outbox.clear();
    const sb = createClient();
    if (!sb) return;
    await Promise.all([
      sb.from("audit").delete().neq("id", ""),
      sb.from("transactions").delete().neq("id", ""),
      sb.from("members").delete().neq("id", ""),
      sb.from("places").delete().neq("id", ""),
    ]);
    await sb.from("trips").delete().neq("id", "");
  },

  async seed(trip: Trip, data: TripData) {
    const sb = createClient();
    if (!sb) return;
    await this.clearAll();
    await sb.from("trips").upsert(tripToRow(trip));
    if (data.members.length)
      await sb.from("members").insert(data.members.map(memberToRow));
    if (data.txns.length)
      await sb.from("transactions").insert(data.txns.map(txnToRow));
    if (data.audit.length)
      await sb.from("audit").insert(data.audit.map(auditToRow));
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
  insert: (p: Place) => outbox.push({ t: "place.put", v: p }),
  update: (p: Place) => outbox.push({ t: "place.put", v: p }),
  del: (id: string, tripId: string) =>
    outbox.push({ t: "place.del", id, tripId }),

  async seed(list: Place[]) {
    const sb = createClient();
    if (!sb || !list.length) return;
    await sb.from("places").insert(list.map(placeToRow));
  },
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
