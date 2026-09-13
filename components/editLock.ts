/* ============================================================
   Edit lock — who may change things.

   Viewing is open to anyone with the link. Writing needs a session
   token from `terra_login(password)`, and the database checks that
   token on every batch (see supabase-edit-lock.sql) — hiding buttons
   is only the UI half of the lock; the real one is server-side.

   Two kinds of token:
     • organiser — from the main password, edits every tour
     • tour      — from a tour's own co-organiser password, edits only it
   This device can hold one of each (and several tour ones). Tokens,
   never passwords, are kept in localStorage, so a device stays
   unlocked across reloads and offline until someone locks it.
   ============================================================ */

import { createClient, isConfigured } from "@/utils/supabase/client";
import { deviceLabel } from "./models";

const KEY = "terra.edit.tokens.v2";
const OLD_KEY = "terra.edit.token.v1"; // single organiser token, before tours had passwords

type Tokens = { all: string; trips: Record<string, string> };

let tokens: Tokens | null = null;
let stamp = 0;
const listeners = new Set<() => void>();

function load(): Tokens {
  if (tokens) return tokens;
  tokens = { all: "", trips: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const t = JSON.parse(raw);
      tokens = { all: String(t.all ?? ""), trips: { ...(t.trips ?? {}) } };
    } else {
      tokens.all = localStorage.getItem(OLD_KEY) ?? "";
    }
  } catch {
    /* private mode */
  }
  return tokens;
}

function save(next: Tokens) {
  tokens = next;
  stamp++;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    localStorage.removeItem(OLD_KEY);
  } catch {
    /* private mode — stays unlocked for this session only */
  }
  listeners.forEach((l) => l());
}

const current = (): Tokens =>
  typeof window === "undefined" ? { all: "", trips: {} } : load();

/** Changes whenever the set of tokens does (for useSyncExternalStore). */
export const snapshot = (): string => {
  const t = current();
  return `${stamp}:${t.all ? "*" : ""}:${Object.keys(t.trips).sort().join(",")}`;
};

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Local-only installs have no server to enforce anything: always editable. */
export const isOrganiser = (): boolean => !isConfigured || Boolean(current().all);

export const canEditTrip = (tripId: string): boolean =>
  !isConfigured || Boolean(current().all || (tripId && current().trips[tripId]));

/** Any way at all to edit something (used for "is this device unlocked"). */
export const canEditAnything = (): boolean =>
  !isConfigured || Boolean(current().all || Object.keys(current().trips).length);

/** The token that may write this tour's rows ("" if none). */
export const tokenFor = (tripId: string): string => {
  const t = current();
  return t.all || (tripId ? t.trips[tripId] ?? "" : "");
};

export const organiserToken = (): string => current().all;

export type LockError =
  | "wrong"
  | "too-many"
  | "no-password"
  | "not-installed"
  | "offline"
  | "short"
  | "locked"
  | "unknown";

type Result = { ok: true; scope: string } | { ok: false; error: LockError };

/** PostgREST's "no such function" — the SQL migration hasn't been run. */
export const isMissingFn = (error: any): boolean =>
  error?.code === "PGRST202" ||
  /could not find the function/i.test(error?.message ?? "");

function classify(error: any, status: number): LockError {
  if (status === 0) return "offline";
  if (isMissingFn(error)) return "not-installed";
  return "unknown";
}

/**
 * The organiser password unlocks everything; with `tripId`, that tour's
 * own password unlocks just that tour. `scope` says which it was.
 */
export async function unlock(password: string, tripId = ""): Promise<Result> {
  const sb = createClient();
  if (!sb) return { ok: true, scope: "*" };
  let { data, error, status } = await sb.rpc("terra_login", {
    p_password: password,
    p_device: deviceLabel(),
    p_trip: tripId || null,
  });
  if (error && isMissingFn(error)) {
    // database still on the SQL from before tour passwords
    ({ data, error, status } = await sb.rpc("terra_login", {
      p_password: password,
      p_device: deviceLabel(),
    }));
  }
  if (error) return { ok: false, error: classify(error, status) };
  if (!data?.ok) return { ok: false, error: (data?.error as LockError) ?? "unknown" };
  const scope = String(data.scope ?? "*");
  const t = current();
  if (scope === "*") save({ ...t, all: String(data.token) });
  else save({ ...t, trips: { ...t.trips, [scope]: String(data.token) } });
  return { ok: true, scope };
}

/** Forget every token here; `everywhere` (organiser) signs out all devices. */
export async function lock(everywhere = false) {
  const t = current();
  save({ all: "", trips: {} });
  const sb = createClient();
  if (!sb) return;
  const all = [t.all, ...Object.values(t.trips)].filter(Boolean);
  await Promise.all(
    all.map((tok) =>
      sb.rpc("terra_logout", { p_token: tok, p_all: everywhere && tok === t.all }).then(
        () => {},
        () => {}
      )
    )
  );
}

/** The server said this token is no good (password changed, signed out
 *  elsewhere, expired). Forget it; queued writes wait for a new unlock. */
export function reject(token: string) {
  const t = current();
  if (!token) return;
  if (t.all === token) return save({ ...t, all: "" });
  const trips = Object.fromEntries(Object.entries(t.trips).filter(([, v]) => v !== token));
  if (Object.keys(trips).length !== Object.keys(t.trips).length) save({ ...t, trips });
}

/** Re-check every remembered token; drops the ones the server refuses. */
export async function verify(): Promise<void> {
  const sb = createClient();
  const t = current();
  const all = [t.all, ...Object.values(t.trips)].filter(Boolean);
  if (!sb || !all.length) return;
  for (const tok of all) {
    const { data, error } = await sb.rpc("terra_whoami", { p_token: tok });
    if (error) {
      if (isMissingFn(error)) {
        // SQL from before tour passwords — the old check still works
        const old = await sb.rpc("terra_session", { p_token: tok });
        if (old.data === false) reject(tok);
      }
      continue; // offline / hiccup: keep it
    }
    if (!data?.ok) reject(tok);
  }
}

export async function changePassword(oldPw: string, newPw: string): Promise<Result> {
  const sb = createClient();
  const t = current();
  if (!sb || !t.all) return { ok: false, error: "locked" };
  const { data, error, status } = await sb.rpc("terra_change_password", {
    p_token: t.all,
    p_old: oldPw,
    p_new: newPw,
    p_device: deviceLabel(),
  });
  if (error) return { ok: false, error: classify(error, status) };
  if (!data?.ok) {
    if (data?.error === "locked") reject(t.all);
    return { ok: false, error: (data?.error as LockError) ?? "unknown" };
  }
  save({ all: String(data.token), trips: {} });
  return { ok: true, scope: "*" };
}

/** Organiser only: set, change or ("") remove a tour's own password. */
export async function setTripPassword(
  tripId: string,
  password: string
): Promise<{ ok: true; locked: boolean } | { ok: false; error: LockError }> {
  const sb = createClient();
  const t = current();
  if (!sb || !t.all) return { ok: false, error: "locked" };
  const { data, error, status } = await sb.rpc("terra_set_trip_password", {
    p_token: t.all,
    p_trip: tripId,
    p_new: password,
  });
  if (error) return { ok: false, error: classify(error, status) };
  if (!data?.ok) return { ok: false, error: (data?.error as LockError) ?? "unknown" };
  return { ok: true, locked: Boolean(data.locked) };
}

/** Organiser only: which tours have their own password. */
export async function tripLocks(): Promise<string[] | null> {
  const sb = createClient();
  const t = current();
  if (!sb || !t.all) return null;
  const { data, error } = await sb.rpc("terra_trip_locks", { p_token: t.all });
  if (error || !data?.ok) return null;
  return Array.isArray(data.trips) ? data.trips.map(String) : [];
}

export function lockMessage(e: LockError): string {
  switch (e) {
    case "wrong":
      return "Wrong password";
    case "too-many":
      return "Too many wrong tries — wait 15 minutes";
    case "no-password":
      return "No edit password set yet — set it in the Supabase SQL editor";
    case "not-installed":
      return "Edit lock not installed — run supabase-edit-lock.sql";
    case "offline":
      return "You're offline — this needs internet";
    case "short":
      return "Use at least 6 characters";
    case "locked":
      return "Only the organiser can do that";
    default:
      return "Couldn't reach the server — try again";
  }
}
