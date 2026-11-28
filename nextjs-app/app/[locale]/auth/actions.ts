"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { isLocale, localePath, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { formToObject, parseWith, redirectWith, safeNext } from "@/lib/forms";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { forgotSchema, loginSchema, registerSchema, resetSchema } from "@/lib/validation/auth";
import { dashboardPath } from "@/lib/auth/session";

const loc = (v: unknown): Locale => (isLocale(v) ? v : DEFAULT_LOCALE);

export async function signOutAction(fd: FormData) {
  const locale = loc(fd.get("locale"));
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect(localePath(locale));
}

export async function loginAction(fd: FormData) {
  const o = formToObject(fd);
  const locale = loc(o.locale);
  const back = localePath(locale, "/auth/login") + (o.next ? `?next=${encodeURIComponent(String(o.next))}` : "");
  const p = parseWith(loginSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  if (!(await rateLimit("login", { ...LIMITS.login, identifier: p.data.email }))) redirectWith(back, { error: "err.rate_limited" });

  const supabase = await createClient();
  if (!supabase) redirectWith(back, { error: "err.not_configured" });
  const { data, error } = await supabase.auth.signInWithPassword({ email: p.data.email, password: p.data.password });
  if (error || !data.user) {
    // Same message for unknown e-mail and wrong password (no account enumeration).
    redirectWith(back, { error: /not confirmed/i.test(error?.message ?? "") ? "err.email_not_confirmed" : "err.invalid_credentials" });
  }
  const { data: profile } = await supabase.from("profiles").select("role,status").eq("id", data.user.id).maybeSingle();
  if (!profile) redirectWith(back, { error: "err.generic" });
  if (profile.status === "suspended") {
    await supabase.auth.signOut();
    redirect(localePath(locale, "/auth/suspended"));
  }
  const fallback = localePath(locale, dashboardPath(profile.role));
  const next = safeNext(typeof o.next === "string" ? o.next : null, fallback);
  redirect(next.startsWith(`/${locale}/`) || next === `/${locale}` ? next : fallback);
}

export async function registerAction(fd: FormData) {
  const o = formToObject(fd);
  const locale = loc(o.locale);
  const back = localePath(locale, `/auth/register${o.role === "employer" ? "?role=employer" : ""}`);
  const p = parseWith(registerSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  if (!(await rateLimit("register", { ...LIMITS.register }))) redirectWith(back, { error: "err.rate_limited" });

  const supabase = await createClient();
  if (!supabase) redirectWith(back, { error: "err.not_configured" });
  const { error } = await supabase.auth.signUp({
    email: p.data.email,
    password: p.data.password,
    options: {
      // `role` is only a REQUEST. The database trigger whitelists it (employer | job_seeker); admin is impossible.
      data: { full_name: p.data.full_name, role: p.data.role },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(localePath(locale, "/auth/login"))}`
    }
  });
  if (error && !/already|registered/i.test(error.message)) redirectWith(back, { error: "err.signup_failed" });
  // Identical outcome whether or not the address already exists (no account enumeration).
  redirect(localePath(locale, "/auth/check-email"));
}

export async function forgotAction(fd: FormData) {
  const o = formToObject(fd);
  const locale = loc(o.locale);
  const back = localePath(locale, "/auth/forgot");
  const p = parseWith(forgotSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  if (!(await rateLimit("password-reset", { ...LIMITS.passwordReset, identifier: p.data.email }))) redirectWith(back, { error: "err.rate_limited" });
  const supabase = await createClient();
  if (supabase) {
    await supabase.auth.resetPasswordForEmail(p.data.email, {
      redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(localePath(locale, "/auth/reset"))}`
    });
  }
  redirectWith(back, { msg: "auth.resetSent" });
}

export async function resetPasswordAction(fd: FormData) {
  const o = formToObject(fd);
  const locale = loc(o.locale);
  const back = localePath(locale, "/auth/reset");
  const p = parseWith(resetSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const supabase = await createClient();
  if (!supabase) redirectWith(back, { error: "err.not_configured" });
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirectWith(localePath(locale, "/auth/forgot"), { error: "err.link_expired" });
  const { error } = await supabase.auth.updateUser({ password: p.data.password });
  if (error) redirectWith(back, { error: "err.generic" });
  await supabase.auth.signOut();
  redirectWith(localePath(locale, "/auth/login"), { msg: "auth.passwordChanged" });
}

export async function resendConfirmationAction(fd: FormData) {
  const o = formToObject(fd);
  const locale = loc(o.locale);
  const back = localePath(locale, "/auth/check-email");
  const p = parseWith(forgotSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  if (!(await rateLimit("resend", { limit: 3, windowSec: 3600, identifier: p.data.email }))) redirectWith(back, { error: "err.rate_limited" });
  const supabase = await createClient();
  await supabase?.auth.resend({ type: "signup", email: p.data.email, options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(localePath(locale, "/auth/login"))}` } });
  redirectWith(back, { msg: "auth.confirmationResent" });
}
