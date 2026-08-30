import { createClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client — anon key, read + realtime only (md 5).
 * The one write it makes is the demo "tamper" UPDATE on task_attempts.outcome,
 * which a column-scoped grant + RLS policy allow (see the demo_tamper migration).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 10 } },
});
