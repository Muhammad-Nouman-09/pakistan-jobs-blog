import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";

/**
 * Cookie-less, anonymous client for PUBLIC pages (job listings, company pages, blog). It never carries a
 * user session, so pages that use it can be cached/ISR'd, and it can only see what the `anon` role may
 * read (approved jobs of verified companies, published posts, ...). GET/POST responses are cached by
 * Next for 60 s and tagged so approvals can revalidate them immediately.
 */
export function createAnonClient(): SupabaseClient | null {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  return createSupabase(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 60, tags: ["public-data"] } } as RequestInit)
    }
  });
}

export const PUBLIC_TAG = "public-data";
