import { createClient, isConfigured } from "@/utils/supabase/client";
import type { CategoryId } from "./constants";
import {
  EMPTY,
  type State,
  type Member,
  type Txn,
  type AuditEntry,
  type Settings,
  type Place,
} from "./models";

export const dbConfigured = isConfigured;

/* ---- row <-> model mapping (snake_case columns) ---- */

const memberToRow = (m: Member) => ({
  id: m.id,
  name: m.name,
  color: m.color,
  contribution: m.contribution ?? 0,
  created_at: m.createdAt,
});
const rowToMember = (r: any): Member => ({
  id: r.id,
  name: r.name,
  color: r.color,
  contribution: Number(r.contribution ?? 0),
  createdAt: Number(r.created_at),
});

const txnToRow = (t: Txn) => ({
  id: t.id,
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

const settingsToRow = (s: Settings) => ({
  id: 1,
  trip_name: s.tripName,
  budget: s.budget,
  currency: s.currency,
  self_id: s.selfId,
});
const rowToSettings = (r: any): Settings => ({
  tripName: r.trip_name ?? "",
  budget: Number(r.budget ?? 0),
  currency: r.currency ?? "৳",
  selfId: r.self_id ?? "",
});

/* ---- load ---- */

export async function loadState(): Promise<
  { ok: true; state: State } | { ok: false; error: string }
> {
  const sb = createClient();
  if (!sb) return { ok: false, error: "not-configured" };
  try {
    const [members, txns, audit, settings] = await Promise.all([
      sb.from("members").select("*").order("created_at", { ascending: true }),
      sb.from("transactions").select("*").order("created_at", { ascending: false }),
      sb.from("audit").select("*").order("at", { ascending: false }),
      sb.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    const err =
      members.error || txns.error || audit.error || settings.error;
    if (err) return { ok: false, error: err.message };

    // ensure a settings row exists
    let s = settings.data
      ? rowToSettings(settings.data)
      : EMPTY.settings;
    if (!s.tripName) s = { ...s, tripName: "Sylhet" };
    if (!settings.data) {
      await sb.from("app_settings").upsert(settingsToRow(EMPTY.settings));
    }

    return {
      ok: true,
      state: {
        members: (members.data ?? []).map(rowToMember),
        txns: (txns.data ?? []).map(rowToTxn),
        audit: (audit.data ?? []).map(rowToAudit),
        settings: s,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "load failed" };
  }
}

/* ---- writes (fire-and-forget; errors logged) ---- */

async function run(label: string, p: Promise<{ error: any }>) {
  const sb = createClient();
  if (!sb) return;
  try {
    const { error } = await p;
    if (error) console.error(`[db] ${label}:`, error.message);
  } catch (e) {
    console.error(`[db] ${label}:`, e);
  }
}

export const db = {
  configured: dbConfigured,

  insertMember: (m: Member) => {
    const sb = createClient();
    if (sb) run("insertMember", sb.from("members").insert(memberToRow(m)));
  },
  updateMember: (m: Member) => {
    const sb = createClient();
    if (sb)
      run(
        "updateMember",
        sb.from("members").update(memberToRow(m)).eq("id", m.id)
      );
  },
  deleteMember: (id: string) => {
    const sb = createClient();
    if (sb) run("deleteMember", sb.from("members").delete().eq("id", id));
  },

  insertTxn: (t: Txn) => {
    const sb = createClient();
    if (sb) run("insertTxn", sb.from("transactions").insert(txnToRow(t)));
  },
  updateTxn: (t: Txn) => {
    const sb = createClient();
    if (sb)
      run(
        "updateTxn",
        sb.from("transactions").update(txnToRow(t)).eq("id", t.id)
      );
  },
  deleteTxn: (id: string) => {
    const sb = createClient();
    if (sb) run("deleteTxn", sb.from("transactions").delete().eq("id", id));
  },

  insertAudit: (a: AuditEntry) => {
    const sb = createClient();
    if (sb) run("insertAudit", sb.from("audit").insert(auditToRow(a)));
  },

  saveSettings: (s: Settings) => {
    const sb = createClient();
    if (sb) run("saveSettings", sb.from("app_settings").upsert(settingsToRow(s)));
  },

  async clearAll() {
    const sb = createClient();
    if (!sb) return;
    await Promise.all([
      sb.from("audit").delete().neq("id", ""),
      sb.from("transactions").delete().neq("id", ""),
      sb.from("members").delete().neq("id", ""),
    ]);
    await sb.from("app_settings").upsert(settingsToRow(EMPTY.settings));
  },

  async seed(state: State) {
    const sb = createClient();
    if (!sb) return;
    await this.clearAll();
    if (state.members.length)
      await sb.from("members").insert(state.members.map(memberToRow));
    if (state.txns.length)
      await sb.from("transactions").insert(state.txns.map(txnToRow));
    if (state.audit.length)
      await sb.from("audit").insert(state.audit.map(auditToRow));
    await sb.from("app_settings").upsert(settingsToRow(state.settings));
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
  name: p.name,
  area: p.area,
  icon: p.icon,
  done: p.done,
  ord: p.ord,
});
const rowToPlace = (r: any): Place => ({
  id: r.id,
  name: r.name,
  area: r.area ?? "",
  icon: r.icon ?? "pin",
  done: !!r.done,
  ord: Number(r.ord ?? 0),
});

export async function loadPlaces(): Promise<
  { ok: true; places: Place[] } | { ok: false; error: string }
> {
  const sb = createClient();
  if (!sb) return { ok: false, error: "not-configured" };
  const { data, error } = await sb
    .from("places")
    .select("*")
    .order("ord", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, places: (data ?? []).map(rowToPlace) };
}

export const placesDb = {
  insert: (p: Place) => {
    const sb = createClient();
    if (sb) run("insertPlace", sb.from("places").insert(placeToRow(p)));
  },
  update: (p: Place) => {
    const sb = createClient();
    if (sb)
      run("updatePlace", sb.from("places").update(placeToRow(p)).eq("id", p.id));
  },
  del: (id: string) => {
    const sb = createClient();
    if (sb) run("deletePlace", sb.from("places").delete().eq("id", id));
  },
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
