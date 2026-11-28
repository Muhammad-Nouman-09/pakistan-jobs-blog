import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";

/**
 * Supabase client acting AS THE SIGNED-IN USER (their JWT from the session cookies). Every query runs
 * under Row Level Security, so this is the client to use for anything user-scoped.
 * Returns null when Supabase is not configured (pages then show a configuration notice).
 */
export async function createClient(): Promise<SupabaseClient | null> {
  // Always read cookies first: any page that uses the user-scoped client is per-user and must never be
  // prerendered/cached, even when Supabase is not configured at build time.
  const store = await cookies();
  const cfg = supabaseConfig();
  if (!cfg) return null;
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component (cookies are read-only there). The middleware refreshes sessions.
        }
      }
    }
  });
}
