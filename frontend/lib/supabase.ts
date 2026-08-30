import { createClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client — anon key, read + realtime only (md 5).
 * The one write it makes is the demo "tamper" UPDATE on task_attempts.outcome,
 * which a column-scoped grant + RLS policy allow (see the demo_tamper migration).
 *
 * `x-relay-org` scopes reads to one org (md 6·6). With RLS enforcement off it's
 * advisory (the app also filters by org_slug); with it on, it's the boundary.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const RELAY_ORG = process.env.NEXT_PUBLIC_RELAY_ORG || "default";

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 10 } },
  global: { headers: { "x-relay-org": RELAY_ORG } },
});
