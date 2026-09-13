import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isConfigured = Boolean(supabaseUrl && supabaseKey);

/**
 * One bar of signal on a hill: the phone says "online" but requests hang
 * for minutes, and a hung request blocks every sync behind it. Give up
 * after 20s instead — the write stays queued and the next sync retries.
 */
const REQUEST_TIMEOUT = 20_000;
const fetchWithTimeout: typeof fetch = (input, init) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
  init?.signal?.addEventListener("abort", () => ctrl.abort());
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() =>
    clearTimeout(timer)
  );
};

let cached: ReturnType<typeof createBrowserClient> | null = null;

export const createClient = () => {
  if (!isConfigured) return null;
  if (!cached)
    cached = createBrowserClient(supabaseUrl!, supabaseKey!, {
      global: { fetch: fetchWithTimeout },
    });
  return cached;
};
