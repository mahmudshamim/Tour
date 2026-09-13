/* ============================================================
   Edit lock — who may change things.

   Viewing is open to anyone with the link. Writing needs a session
   token from `terra_login(password)`, and the database checks that
   token on every batch (see supabase-edit-lock.sql) — hiding buttons
   is only the UI half of the lock; the real one is server-side.

   The token (never the password) is kept in localStorage, so a device
   stays unlocked across reloads and offline until someone locks it.
   ============================================================ */

import { createClient, isConfigured } from "@/utils/supabase/client";
import { deviceLabel } from "./models";

const KEY = "terra.edit.token.v1";

let token: string | null = null;
const listeners = new Set<() => void>();

function load(): string {
  if (token !== null) return token;
  try {
    token = localStorage.getItem(KEY) ?? "";
  } catch {
    token = "";
  }
  return token;
}

function save(next: string) {
  token = next;
  try {
    if (next) localStorage.setItem(KEY, next);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode — stays unlocked for this session only */
  }
  listeners.forEach((l) => l());
}

export const getToken = (): string =>
  typeof window === "undefined" ? "" : load();

/** Local-only installs have no server to enforce anything: always editable. */
export const canEdit = (): boolean => !isConfigured || Boolean(getToken());

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export type LockError =
  | "wrong"
  | "too-many"
  | "no-password"
  | "not-installed"
  | "offline"
  | "short"
  | "locked"
  | "unknown";

type Result = { ok: true } | { ok: false; error: LockError };

/** PostgREST's "no such function" — the SQL migration hasn't been run. */
export const isMissingFn = (error: any): boolean =>
  error?.code === "PGRST202" ||
  /could not find the function/i.test(error?.message ?? "");

function classify(error: any, status: number): LockError {
  if (status === 0) return "offline";
  if (isMissingFn(error)) return "not-installed";
  return "unknown";
}

export async function unlock(password: string): Promise<Result> {
  const sb = createClient();
  if (!sb) return { ok: true };
  const { data, error, status } = await sb.rpc("terra_login", {
    p_password: password,
    p_device: deviceLabel(),
  });
  if (error) return { ok: false, error: classify(error, status) };
  if (!data?.ok) return { ok: false, error: (data?.error as LockError) ?? "unknown" };
  save(String(data.token));
  return { ok: true };
}

/** Forget the token here; `everywhere` also signs out every other device. */
export async function lock(everywhere = false) {
  const t = getToken();
  save("");
  const sb = createClient();
  if (sb && t) {
    await sb.rpc("terra_logout", { p_token: t, p_all: everywhere }).then(
      () => {},
      () => {}
    );
  }
}

/** The server said this token is no good (password changed, signed out
 *  elsewhere, expired). Forget it; queued writes wait for a new unlock. */
export function reject() {
  if (getToken()) save("");
}

/** true / false = the server answered; null = couldn't reach it. */
export async function verify(): Promise<boolean | null> {
  const t = getToken();
  const sb = createClient();
  if (!sb || !t) return null;
  const { data, error } = await sb.rpc("terra_session", { p_token: t });
  if (error) {
    if (!isMissingFn(error)) return null;
    reject();
    return false;
  }
  if (data !== true) reject();
  return data === true;
}

export async function changePassword(oldPw: string, newPw: string): Promise<Result> {
  const sb = createClient();
  const t = getToken();
  if (!sb || !t) return { ok: false, error: "locked" };
  const { data, error, status } = await sb.rpc("terra_change_password", {
    p_token: t,
    p_old: oldPw,
    p_new: newPw,
    p_device: deviceLabel(),
  });
  if (error) return { ok: false, error: classify(error, status) };
  if (!data?.ok) {
    if (data?.error === "locked") reject();
    return { ok: false, error: (data?.error as LockError) ?? "unknown" };
  }
  save(String(data.token));
  return { ok: true };
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
      return "You're offline — unlocking needs internet";
    case "short":
      return "Use at least 6 characters";
    case "locked":
      return "This device was signed out — unlock again";
    default:
      return "Couldn't reach the server — try again";
  }
}
