import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";

/**
 * SERVICE-ROLE client. Bypasses Row Level Security — use ONLY for the few operations that have no user
 * context: rate limiting, cron expiry. Never pass user-supplied ids into it without first authorizing
 * them with a user-scoped client. `server-only` makes importing this from a client component a build error.
 */
export function createAdminClient(): SupabaseClient | null {
  const cfg = supabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cfg || !key) return null;
  return createClient(cfg.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
