import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isConfigured = Boolean(supabaseUrl && supabaseKey);

let cached: ReturnType<typeof createBrowserClient> | null = null;

export const createClient = () => {
  if (!isConfigured) return null;
  if (!cached) cached = createBrowserClient(supabaseUrl!, supabaseKey!);
  return cached;
};
