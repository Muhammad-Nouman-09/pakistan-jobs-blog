import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { formToObject, redirectWith } from "@/lib/forms";
import { DEFAULT_LOCALE, isLocale, localePath, type Locale } from "@/lib/i18n/config";
import { getSession, requireRole } from "@/lib/auth/session";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import type { MemberRole } from "@/lib/types";

type Limit = { limit: number; windowSec: number };

/**
 * Common start of every employer server action: parse the form, re-check the session AND the employer role
 * (never trusts anything from the form for authority), then apply the per-user rate limit. Redirects (and so
 * never returns) when any check fails. `back` maps the form to the page the user returns to.
 */
export async function beginAction(
  fd: FormData, key: string, back: (o: Record<string, any>, locale: Locale) => string, limit: Limit = LIMITS.write
) {
  const o = formToObject(fd);
  const locale: Locale = isLocale(o.locale) ? o.locale : DEFAULT_LOCALE;
  const session = await requireRole(locale, ["employer"]);
  const backPath = back(o, locale);
  if (!(await rateLimit(key, { ...limit, identifier: session.user.id }))) redirectWith(backPath, { error: "err.rate_limited" });
  return { o, locale, back: backPath, ...session };
}

/** The signed-in user's role in a company, or null. (RLS only lets a user read rows of their own companies.) */
export async function myRole(
  supabase: SupabaseClient, companyId: string, userId: string
): Promise<MemberRole | null> {
  const { data } = await supabase.from("company_members").select("role").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
  return ((data as { role: MemberRole } | null)?.role) ?? null;
}

export const employerPath = (locale: Locale, path: string) => localePath(locale, `/employer${path}`);

/** Name of the short-lived cookie that hands a freshly created invitation link to the owner once. */
export const INVITE_COOKIE = "pjb_invite_link";

/**
 * Session gate for route handlers (file downloads). Signed out -> redirect to login (returning here);
 * not an active, verified employer -> 403. Authorization of the file itself is left to RLS / storage policies.
 */
export async function routeEmployer(
  req: Request, locale: string
): Promise<{ supabase: SupabaseClient; user: User; locale: Locale } | NextResponse> {
  const loc: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const s = await getSession();
  if (!s.supabase || !s.user || !s.profile) {
    const u = new URL(req.url);
    return NextResponse.redirect(new URL(localePath(loc, `/auth/login?next=${encodeURIComponent(u.pathname)}`), req.url));
  }
  if (!s.user.email_confirmed_at || s.profile.status !== "active" || s.profile.role !== "employer") {
    return new NextResponse(null, { status: 403 });
  }
  return { supabase: s.supabase, user: s.user, locale: loc };
}
