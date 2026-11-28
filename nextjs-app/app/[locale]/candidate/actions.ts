"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LOCALE, isLocale, localePath, type Locale } from "@/lib/i18n/config";
import { formToObject, parseWith, redirectWith, safeNext } from "@/lib/forms";
import { errorKey } from "@/lib/errors";
import { getSession, requireRole } from "@/lib/auth/session";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { safeFileName, validateUpload } from "@/lib/security/files";
import { createClient } from "@/lib/supabase/server";
import { countResumes, getResume, isUuid, type ResumeRow } from "@/lib/services/candidate";
import {
  MAX_RESUMES, idSchema, passwordChangeSchema, profileSchema, resumeSchema, settingsSchema, toResumeContent, toggleSaveSchema
} from "@/lib/validation/candidate";

const loc = (v: unknown): Locale => (isLocale(v) ? v : DEFAULT_LOCALE);
const BUCKET = "resumes";

/** Shared prelude: parse the form, require a signed-in job seeker, rate limit writes. Redirects on failure. */
async function begin(fd: FormData, backPath: string, action: string, limit: { limit: number; windowSec: number } = LIMITS.write) {
  const o = formToObject(fd);
  const locale = loc(o.locale);
  const back = localePath(locale, backPath);
  const s = await requireRole(locale, ["job_seeker"], back);
  if (!(await rateLimit(action, { ...limit, identifier: s.user.id }))) redirectWith(back, { error: "err.rate_limited" });
  return { o, locale, back, ...s };
}

/** Refresh the dashboard shell too (unread badge, names). */
const refresh = (locale: Locale) => revalidatePath(localePath(locale, "/candidate"), "layout");

// ---------------------------------------------------------------------------------------------- profile
export async function saveProfileAction(fd: FormData) {
  const { o, locale, back, supabase, user } = await begin(fd, "/candidate/profile", "candidate-profile");
  const p = parseWith(profileSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const d = p.data;

  const { error: e1 } = await supabase.from("profiles")
    .update({ full_name: d.full_name, phone: d.phone ?? null, city: d.city ?? null, province: d.province ?? null }).eq("id", user.id);
  if (e1) redirectWith(back, { error: errorKey(e1) });

  const { error: e2 } = await supabase.from("candidate_profiles").upsert({
    user_id: user.id, headline: d.headline ?? "", summary: d.summary ?? "", skills: d.skills, education: d.education,
    experience: d.experience, certifications: d.certifications, projects: d.projects, languages: d.languages
  }, { onConflict: "user_id" });
  if (e2) redirectWith(back, { error: errorKey(e2) });

  refresh(locale);
  redirectWith(back, { msg: "common.saved" });
}

// ---------------------------------------------------------------------------------------------- resumes
/**
 * Deletes a stored PDF unless a live (non-withdrawn) application still points at it: employers read the
 * submitted copy through that same object (storage policy can_read_resume_object).
 */
async function removePdfIfUnused(supabase: SupabaseClient, userId: string, path: string | null | undefined) {
  if (!path || !path.startsWith(`${userId}/`)) return;
  const { count } = await supabase.from("applications").select("id", { count: "exact", head: true })
    .eq("candidate_id", userId).neq("status", "withdrawn").eq("resume_snapshot->>pdf_path", path);
  if (count && count > 0) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function saveResumeAction(fd: FormData) {
  const raw = formToObject(fd);
  const locale = loc(raw.locale);
  const id = typeof raw.id === "string" && isUuid(raw.id) ? raw.id : null;
  const list = localePath(locale, "/candidate/resumes");
  const { o, back, supabase, user } = await begin(fd, id ? `/candidate/resumes/${id}` : "/candidate/resumes/new", "candidate-resume");
  const p = parseWith(resumeSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });

  let existing: ResumeRow | null = null;
  let isFirst = false;
  if (id) {
    existing = await getResume(supabase, user.id, id);
    if (!existing) redirectWith(list, { error: "err.resume_not_found" });
  } else {
    const n = await countResumes(supabase, user.id);
    if (n >= MAX_RESUMES) redirectWith(list, { error: "candidate.err_resume_limit" });
    isFirst = n === 0;
  }

  // Optional PDF: validated (size, MIME, magic bytes, no active content) before it touches storage.
  const entry = fd.get("pdf");
  const file = entry instanceof File && entry.size > 0 ? entry : null;
  let upload: { path: string; name: string; size: number } | null = null;
  if (file) {
    if (!(await rateLimit("candidate-upload", { ...LIMITS.upload, identifier: user.id }))) redirectWith(back, { error: "err.rate_limited" });
    const check = await validateUpload(file, "pdf");
    if (!check.ok) redirectWith(back, { error: `err.${check.error}` });
    const path = `${user.id}/${randomUUID()}.pdf`;       // never derived from the client filename
    const { error } = await supabase.storage.from(BUCKET).upload(path, check.bytes, { contentType: "application/pdf", upsert: false });
    if (error) redirectWith(back, { error: "err.generic" });
    upload = { path, name: safeFileName(file.name), size: check.size };
  }
  const dropOld = !!existing?.pdf_path && (!!upload || p.data.remove_pdf);

  const row: Record<string, unknown> = {
    title: p.data.title, visibility: p.data.visibility, content: toResumeContent(p.data),
    ...(upload ? { pdf_path: upload.path, pdf_name: upload.name, pdf_size: upload.size } : {}),
    ...(!upload && existing && p.data.remove_pdf ? { pdf_path: null, pdf_name: null, pdf_size: null } : {})
  };

  let rid = id;
  if (id) {
    if (!p.data.is_default) row.is_default = false;
    const { data, error } = await supabase.from("resumes").update(row).eq("id", id).eq("user_id", user.id).select("id");
    if (error || !data?.length) {
      if (upload) await supabase.storage.from(BUCKET).remove([upload.path]);
      redirectWith(back, { error: error ? errorKey(error) : "err.resume_not_found" });
    }
  } else {
    const { data, error } = await supabase.from("resumes").insert({ ...row, user_id: user.id, is_default: false }).select("id").single();
    if (error || !data) {
      if (upload) await supabase.storage.from(BUCKET).remove([upload.path]);
      redirectWith(back, { error: errorKey(error) });
    }
    rid = data.id as string;
  }

  if (rid && (p.data.is_default || isFirst)) await makeDefault(supabase, user.id, rid);
  if (dropOld) await removePdfIfUnused(supabase, user.id, existing?.pdf_path);

  refresh(locale);
  redirectWith(localePath(locale, `/candidate/resumes/${rid}`), { msg: "common.saved" });
}

/** The unique index allows one default per user: clear the previous default first, then set this one. */
async function makeDefault(supabase: SupabaseClient, userId: string, id: string) {
  await supabase.from("resumes").update({ is_default: false }).eq("user_id", userId).eq("is_default", true).neq("id", id);
  await supabase.from("resumes").update({ is_default: true }).eq("id", id).eq("user_id", userId);
}

export async function setDefaultResumeAction(fd: FormData) {
  const { o, locale, back, supabase, user } = await begin(fd, "/candidate/resumes", "candidate-resume");
  const p = parseWith(idSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const r = await getResume(supabase, user.id, p.data.id);
  if (!r) redirectWith(back, { error: "err.resume_not_found" });
  await makeDefault(supabase, user.id, r.id);
  refresh(locale);
  redirectWith(back, { msg: "common.saved" });
}

export async function deleteResumeAction(fd: FormData) {
  const { o, locale, back, supabase, user } = await begin(fd, "/candidate/resumes", "candidate-resume");
  const p = parseWith(idSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const r = await getResume(supabase, user.id, p.data.id);
  if (!r) redirectWith(back, { error: "err.resume_not_found" });
  const { error } = await supabase.from("resumes").delete().eq("id", r.id).eq("user_id", user.id);
  if (error) redirectWith(back, { error: errorKey(error) });
  await removePdfIfUnused(supabase, user.id, r.pdf_path);
  refresh(locale);
  redirectWith(back, { msg: "common.deleted" });
}

// ---------------------------------------------------------------------------------------------- applications
export async function withdrawApplicationAction(fd: FormData) {
  const raw = formToObject(fd);
  const id = typeof raw.id === "string" && isUuid(raw.id) ? raw.id : null;
  const { locale, back, supabase } = await begin(fd, id ? `/candidate/applications/${id}` : "/candidate/applications", "candidate-withdraw");
  if (!id) redirectWith(back, { error: "err.application_not_found" });
  const { error } = await supabase.rpc("withdraw_application", { p_app: id });
  if (error) redirectWith(back, { error: errorKey(error) });
  refresh(locale);
  revalidatePath(back);
  redirectWith(back, { msg: "candidate.withdrawn" });
}

// ---------------------------------------------------------------------------------------------- saved jobs
/** Same-site return path that stays inside the current locale (prevents open redirects). */
function returnPath(locale: Locale, v: unknown, fallback: string): string {
  const next = safeNext(typeof v === "string" ? v : null, "");
  return next.startsWith(`/${locale}/`) ? next : fallback;
}

/** Save / unsave a public job. Used by the job page (lead) and by the saved-jobs list. */
export async function toggleSaveJobAction(fd: FormData) {
  const o = formToObject(fd);
  const locale = loc(o.locale);
  const returnTo = returnPath(locale, o.return_to, localePath(locale, "/candidate/saved"));
  const s = await getSession();
  if (!s.supabase || !s.user || !s.profile) redirect(localePath(locale, `/auth/login?next=${encodeURIComponent(returnTo)}`));
  if (s.profile.role !== "job_seeker") redirectWith(returnTo, { error: "candidate.err_seeker_only" });
  const { supabase, user } = await requireRole(locale, ["job_seeker"], returnTo);
  if (!(await rateLimit("candidate-save", { ...LIMITS.write, identifier: user.id }))) redirectWith(returnTo, { error: "err.rate_limited" });
  const p = parseWith(toggleSaveSchema, o);
  if (!p.ok) redirectWith(returnTo, { error: p.error });

  const { data: existing } = await supabase.from("saved_jobs").select("job_id").eq("user_id", user.id).eq("job_id", p.data.job_id).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("saved_jobs").delete().eq("user_id", user.id).eq("job_id", p.data.job_id);
    if (error) redirectWith(returnTo, { error: errorKey(error) });
    refresh(locale);
    redirectWith(returnTo, { msg: "candidate.savedRemoved" });
  }
  const { error } = await supabase.from("saved_jobs").insert({ user_id: user.id, job_id: p.data.job_id });
  if (error && error.code !== "23505") redirectWith(returnTo, { error: errorKey(error) });   // 23505: saved concurrently
  refresh(locale);
  redirectWith(returnTo, { msg: "candidate.savedAdded" });
}

/** Remove only (never adds): used by the saved-jobs list so a double click cannot re-save. */
export async function removeSavedJobAction(fd: FormData) {
  const { o, locale, back, supabase, user } = await begin(fd, "/candidate/saved", "candidate-save");
  const p = parseWith(toggleSaveSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const { error } = await supabase.from("saved_jobs").delete().eq("user_id", user.id).eq("job_id", p.data.job_id);
  if (error) redirectWith(back, { error: errorKey(error) });
  refresh(locale);
  redirectWith(back, { msg: "candidate.savedRemoved" });
}

// ---------------------------------------------------------------------------------------------- notifications
function notificationsBack(o: Record<string, any>) {
  const page = parseInt(String(o.page ?? "1"), 10);
  return `/candidate/notifications${Number.isFinite(page) && page > 1 && page < 1000 ? `?page=${page}` : ""}`;
}

export async function markNotificationReadAction(fd: FormData) {
  const { o, locale, back, supabase, user } = await begin(fd, notificationsBack(formToObject(fd)), "candidate-notif");
  const p = parseWith(idSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("id", p.data.id).eq("user_id", user.id).is("read_at", null);
  if (error) redirectWith(back, { error: errorKey(error) });
  refresh(locale);
  redirectWith(back, {});
}

export async function markAllNotificationsReadAction(fd: FormData) {
  const { locale, back, supabase, user } = await begin(fd, notificationsBack(formToObject(fd)), "candidate-notif");
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if (error) redirectWith(back, { error: errorKey(error) });
  refresh(locale);
  redirectWith(back, { msg: "candidate.allRead" });
}

// ---------------------------------------------------------------------------------------------- settings
export async function updateSettingsAction(fd: FormData) {
  const { o, locale, back, supabase, user } = await begin(fd, "/candidate/settings", "candidate-settings");
  const p = parseWith(settingsSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const { error } = await supabase.from("profiles").update({
    full_name: p.data.full_name, phone: p.data.phone ?? null, city: p.data.city ?? null, province: p.data.province ?? null,
    preferred_locale: p.data.preferred_locale
  }).eq("id", user.id);
  if (error) redirectWith(back, { error: errorKey(error) });
  refresh(locale);
  // Switching the language preference takes effect immediately.
  redirectWith(localePath(p.data.preferred_locale, "/candidate/settings"), { msg: "common.saved" });
}

export async function changePasswordAction(fd: FormData) {
  const { o, back, user, profile } = await begin(fd, "/candidate/settings", "candidate-password", LIMITS.passwordReset);
  const p = parseWith(passwordChangeSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const supabase = await createClient();
  if (!supabase) redirectWith(back, { error: "err.not_configured" });
  // Re-check the current password so a hijacked, unattended session cannot silently change it.
  const check = await supabase.auth.signInWithPassword({ email: profile.email || user.email || "", password: p.data.current_password });
  if (check.error) redirectWith(back, { error: "err.invalid_credentials" });
  const { error } = await supabase.auth.updateUser({ password: p.data.password });
  if (error) redirectWith(back, { error: "err.generic" });
  redirectWith(back, { msg: "candidate.passwordChanged" });
}
