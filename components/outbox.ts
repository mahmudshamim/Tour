/* ============================================================
   Outbox — durable write queue for offline use.

   Every cloud write is appended here first, then flushed to Supabase
   when the network is back. Two guarantees matter:

     1. A write made offline survives a reload (localStorage backed).
     2. A write still queued is replayed on top of every server
        snapshot (`apply`), so a background refetch can never wipe a
        change that hasn't reached the cloud yet.

   The queue doubles as the tombstone store: while a `*.del` is still
   pending, `apply` keeps removing that row from incoming snapshots.
   ============================================================ */

import {
  uid,
  type Trip,
  type Member,
  type Txn,
  type AuditEntry,
  type Place,
  type PhotoRef,
} from "./models";
import type { TripData } from "./db";

/** Deletes carry their `tripId` so replay can tell which trip they belong
 *  to — the row itself is already gone by then. */
export type Op =
  | { t: "trip.put"; v: Trip }
  | { t: "trip.del"; id: string }
  | { t: "member.put"; v: Member }
  | { t: "member.del"; id: string; tripId: string }
  | { t: "txn.put"; v: Txn }
  | { t: "txn.del"; id: string; tripId: string }
  | { t: "audit.put"; v: AuditEntry }
  | { t: "place.put"; v: Place }
  | { t: "place.del"; id: string; tripId: string }
  | { t: "cover.put"; v: PhotoRef }
  | { t: "cover.del"; id: string; tripId: string }
  | { t: "receipt.put"; v: PhotoRef }
  | { t: "receipt.del"; id: string; tripId: string };

export type Entry = { id: string; op: Op; at: number; tries: number };

const KEY = "terra.outbox.v1";
const DEAD_KEY = "terra.outbox.dead.v1";

/** Give up on an entry after this many failed flush attempts, so one
 *  permanently-rejected write can't wedge the whole queue forever. */
export const MAX_TRIES = 6;

/* ---- storage ---- */

let mem: Entry[] | null = null;
let ver = 0;
const listeners = new Set<() => void>();

function read(): Entry[] {
  if (mem) return mem;
  if (typeof localStorage === "undefined") return (mem = []);
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    mem = Array.isArray(parsed) ? (parsed as Entry[]) : [];
  } catch {
    mem = [];
  }
  return mem!;
}

/** `silent` writes (retry-count bookkeeping) don't change the logical
 *  contents, so they must not bump `ver` — readers use `ver` to detect
 *  that a snapshot they're merging into went stale. */
function write(next: Entry[], silent = false) {
  mem = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — in-memory queue still works this session */
  }
  if (!silent) {
    ver++;
    listeners.forEach((l) => l());
  }
}

/* ---- op identity (for coalescing) ---- */

const entity = (op: Op) => op.t.slice(0, op.t.indexOf("."));
const isDel = (op: Op) => op.t.endsWith(".del");
const targetId = (op: Op): string => ("v" in op ? op.v.id : op.id);
/** Which trip an op affects (`trip.*` ops act on the trip list itself). */
const opTrip = (op: Op): string =>
  op.t === "trip.put" || op.t === "trip.del"
    ? ""
    : "v" in op
    ? op.v.tripId
    : op.tripId;

/** The tour whose edit rights an op needs — which token uploads it. */
export const opScope = (op: Op): string =>
  op.t === "trip.put" ? op.v.id : op.t === "trip.del" ? op.id : opTrip(op);

/* ---- public API ---- */

export const list = (): Entry[] => read();
export const count = (): number => read().length;
export const version = (): number => ver;

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function push(op: Op) {
  const cur = read();
  const ent = entity(op);
  const tid = targetId(op);

  if (isDel(op)) {
    // Any queued create/update for this row is moot once it's deleted.
    // The delete itself is always kept: if the row never reached the
    // server, deleting a missing row is a harmless no-op.
    const kept = cur.filter(
      (e) => !(entity(e.op) === ent && targetId(e.op) === tid)
    );
    write([...kept, { id: uid(), op, at: Date.now(), tries: 0 }]);
    return;
  }

  // Collapse repeated edits of the same row into the newest one, but
  // only when nothing else for that row was queued after it.
  let lastIdx = -1;
  for (let i = cur.length - 1; i >= 0; i--) {
    if (entity(cur[i].op) === ent && targetId(cur[i].op) === tid) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx >= 0 && !isDel(cur[lastIdx].op)) {
    const next = [...cur];
    next[lastIdx] = { ...next[lastIdx], op, tries: 0 };
    write(next);
    return;
  }

  write([...cur, { id: uid(), op, at: Date.now(), tries: 0 }]);
}

export function remove(entryId: string) {
  removeMany([entryId]);
}

/** Drop a batch that just landed — one write, one notification. */
export function removeMany(entryIds: string[]) {
  if (!entryIds.length) return;
  const gone = new Set(entryIds);
  write(read().filter((e) => !gone.has(e.id)));
}

export function bumpTries(entryId: string, tries: number) {
  write(
    read().map((e) => (e.id === entryId ? { ...e, tries } : e)),
    true
  );
}

/** Park a permanently-failing entry so the queue can keep draining. */
export function kill(entryId: string, reason: string) {
  const e = read().find((x) => x.id === entryId);
  if (e) {
    console.error("[outbox] dropping write after repeated failures:", reason, e.op);
    try {
      const raw = localStorage.getItem(DEAD_KEY);
      const dead = raw ? JSON.parse(raw) : [];
      localStorage.setItem(
        DEAD_KEY,
        JSON.stringify([...(Array.isArray(dead) ? dead : []), { ...e, reason }].slice(-50))
      );
    } catch {
      /* ignore */
    }
  }
  remove(entryId);
}

export function clear() {
  write([]);
}

/** Discard queued writes for one trip only — used when that trip is
 *  deleted outright. Other trips' pending edits must survive. */
export function dropTrip(tripId: string) {
  write(
    read().filter((e) => {
      const op = e.op;
      if (op.t === "trip.put") return op.v.id !== tripId;
      if (op.t === "trip.del") return op.id !== tripId;
      return opTrip(op) !== tripId;
    })
  );
}

/* ---- replay onto a server snapshot ---- */

function upsert<T extends { id: string }>(arr: T[], v: T): T[] {
  const i = arr.findIndex((x) => x.id === v.id);
  if (i < 0) return [...arr, v];
  const next = [...arr];
  next[i] = v;
  return next;
}

/**
 * Server snapshot + everything still queued for `tripId` = what the user
 * should see. Ops belonging to another trip are skipped, so switching
 * trips while offline never leaks rows across them.
 */
export function applyTripData(
  data: TripData,
  tripId: string,
  entries: Entry[] = read()
): TripData {
  const mine = entries.filter((e) => opTrip(e.op) === tripId);
  if (!mine.length) return data;
  let { members, txns, audit } = data;
  for (const { op } of mine) {
    switch (op.t) {
      case "member.put":
        members = upsert(members, op.v);
        break;
      case "member.del":
        members = members.filter((m) => m.id !== op.id);
        break;
      case "txn.put":
        txns = upsert(txns, op.v);
        break;
      case "txn.del":
        txns = txns.filter((t) => t.id !== op.id);
        break;
      case "audit.put":
        if (!audit.some((a) => a.id === op.v.id)) audit = [op.v, ...audit];
        break;
      default:
        break; // place ops are merged by applyPlaces
    }
  }
  return {
    members: [...members].sort((a, b) => a.createdAt - b.createdAt),
    txns: [...txns].sort((a, b) => b.createdAt - a.createdAt),
    audit: [...audit].sort((a, b) => b.at - a.at),
  };
}

export function applyTrips(trips: Trip[], entries: Entry[] = read()): Trip[] {
  if (!entries.length) return trips;
  let out = trips;
  for (const { op } of entries) {
    if (op.t === "trip.put") out = upsert(out, op.v);
    else if (op.t === "trip.del") out = out.filter((t) => t.id !== op.id);
  }
  return [...out].sort((a, b) => b.createdAt - a.createdAt);
}

/** Tours whose cover was changed here and not uploaded yet — these win
 *  over whatever the server has. */
export function pendingCovers(entries: Entry[] = read()): Set<string> {
  const out = new Set<string>();
  for (const { op } of entries) {
    if (op.t === "cover.put") out.add(op.v.id);
    else if (op.t === "cover.del") out.add(op.id);
  }
  return out;
}

export function applyPlaces(
  places: Place[],
  tripId: string,
  entries: Entry[] = read()
): Place[] {
  const mine = entries.filter((e) => opTrip(e.op) === tripId);
  if (!mine.length) return places;
  let out = places;
  for (const { op } of mine) {
    if (op.t === "place.put") out = upsert(out, op.v);
    else if (op.t === "place.del") out = out.filter((p) => p.id !== op.id);
  }
  return [...out].sort((a, b) => a.ord - b.ord);
}
