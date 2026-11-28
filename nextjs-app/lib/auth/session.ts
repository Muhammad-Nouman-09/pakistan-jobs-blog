import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/i18n/config";
import { localePath } from "@/lib/i18n/config";
import type { Profile, Role } from "@/lib/types";

export interface Session {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: Profile | null;
}

const PROFILE_COLUMNS = "id,email,role,status,full_name,phone,city,province,preferred_locale";

/**
 * The current session. `auth.getUser()` validates the JWT with the Supabase auth server on every call
 * (never trust `getSession()` cookies on the server). Cached per request.
 */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null, profile: null };
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle();
  return { supabase, user, profile: (profile as Profile | null) ?? null };
});

export const dashboardPath = (role: Role): string =>
  role === "admin" ? "/admin" : role === "employer" ? "/employer" : "/candidate";

export interface AuthedSession {
  supabase: SupabaseClient;
  user: User;
  profile: Profile;
}

/**
 * Gate for dashboards and server actions. Redirects visitors who are signed out, unverified, suspended or
 * of the wrong account type. RLS in the database is the real enforcement; this keeps the UI honest.
 */
export async function requireRole(locale: Locale, roles: Role[], next?: string): Promise<AuthedSession> {
  const s = await getSession();
  if (!s.supabase || !s.user || !s.profile) {
    redirect(localePath(locale, `/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`));
  }
  if (!s.user.email_confirmed_at) redirect(localePath(locale, "/auth/check-email"));
  if (s.profile.status === "suspended") redirect(localePath(locale, "/auth/suspended"));
  if (!roles.includes(s.profile.role)) redirect(localePath(locale, dashboardPath(s.profile.role)));
  return { supabase: s.supabase, user: s.user, profile: s.profile };
}

/** For server actions: same checks as requireRole but throws instead of redirecting. */
export async function assertRole(roles: Role[]): Promise<AuthedSession> {
  const s = await getSession();
  if (!s.supabase || !s.user || !s.profile || !s.user.email_confirmed_at || s.profile.status !== "active" || !roles.includes(s.profile.role)) {
    throw new Error("forbidden");
  }
  return { supabase: s.supabase, user: s.user, profile: s.profile };
}
