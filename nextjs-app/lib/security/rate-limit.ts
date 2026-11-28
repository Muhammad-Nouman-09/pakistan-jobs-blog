import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/** Best-effort client IP from the proxy headers Vercel sets. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd?.split(",")[0] || h.get("x-real-ip") || "unknown").trim().slice(0, 64);
}

/**
 * Fixed-window rate limit backed by Postgres (public.rate_limit_hit, service-role only).
 * Returns true when the request is ALLOWED. Fails OPEN if the limiter itself is unreachable or the
 * service key is absent (logged) — the Supabase Auth endpoints have their own built-in limits.
 * Keys combine the action with the caller's IP and, optionally, an identifier such as an e-mail/user id.
 */
export async function rateLimit(action: string, opts: { limit: number; windowSec: number; identifier?: string }): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) {
    if (process.env.NODE_ENV === "production") console.error("[rate-limit] SUPABASE_SERVICE_ROLE_KEY missing — limiting disabled");
    return true;
  }
  const ip = await clientIp();
  const key = `${action}:${opts.identifier ? `${opts.identifier.toLowerCase().slice(0, 120)}:` : ""}${ip}`;
  const { data, error } = await admin.rpc("rate_limit_hit", { p_key: key, p_limit: opts.limit, p_window_seconds: opts.windowSec });
  if (error) {
    console.error("[rate-limit]", error.message);
    return true;
  }
  return data === true;
}

export const LIMITS = {
  login: { limit: 8, windowSec: 600 },
  register: { limit: 5, windowSec: 3600 },
  passwordReset: { limit: 4, windowSec: 3600 },
  contact: { limit: 5, windowSec: 3600 },
  apply: { limit: 20, windowSec: 3600 },
  upload: { limit: 20, windowSec: 3600 },
  invite: { limit: 20, windowSec: 3600 },
  externalClick: { limit: 60, windowSec: 600 },
  write: { limit: 120, windowSec: 600 }
} as const;
