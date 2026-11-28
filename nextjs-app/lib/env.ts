// Central, typed access to environment variables. NEXT_PUBLIC_* values must be referenced literally so
// Next can inline them; server-only values must never be imported from a client component
// (lib/supabase/admin.ts imports "server-only" to enforce that for the service-role key).

export type SupabaseConfig = { url: string; anonKey: string };

export function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export const isConfigured = () => supabaseConfig() !== null;

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Absolute URL for a path on this site. */
export const absoluteUrl = (path: string) => `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;

export const isProduction = () => process.env.NODE_ENV === "production";
