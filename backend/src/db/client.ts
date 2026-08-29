import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

/**
 * Server-side Supabase client. Uses the service-role key, so it bypasses RLS —
 * every pipeline write goes through here. The dashboard uses the anon key
 * separately (md 5).
 */
let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!cached) {
    cached = createClient(config.supabaseUrl(), config.supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
