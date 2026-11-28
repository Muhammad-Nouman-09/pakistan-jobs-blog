"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { formToObject, parseWith, redirectWith } from "@/lib/forms";
import { errorKey } from "@/lib/errors";
import { isLocale, localePath, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { requireRole } from "@/lib/auth/session";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { jobFormSchema, toSaveJobArgs } from "@/lib/validation/job";
import { PUBLIC_TAG } from "@/lib/supabase/anon";

const AREAS = { employer: "employer", admin: "admin" } as const;

/**
 * Create or update a job. Used by both /employer and /admin job editors (`area` hidden field).
 * Authority comes from the session + Row Level Security (save_job is SECURITY INVOKER): a recruiter can only
 * save jobs of companies they belong to, admins can save any. The job's status can never be set here —
 * editing a live job simply starts a new draft revision that must be re-approved.
 * Intent "submit" additionally calls submit_job_for_review (validated again in the database).
 */
export async function saveJobAction(fd: FormData) {
  const o = formToObject(fd);
  const locale: Locale = isLocale(o.locale) ? o.locale : DEFAULT_LOCALE;
  const area = o.area === "admin" ? AREAS.admin : AREAS.employer;
  const { supabase, user } = await requireRole(locale, [area === "admin" ? "admin" : "employer"]);
  const editPath = localePath(locale, `/${area}/jobs/${o.job_id ? `${o.job_id}/edit` : "new"}`);
  const listPath = localePath(locale, `/${area}/jobs`);
  function back(flash: { msg?: string; error?: string }): never {
    return redirectWith(`${editPath}${o.company_id && !o.job_id ? `?company=${o.company_id}` : ""}`, flash);
  }

  if (!(await rateLimit("job-save", { ...LIMITS.write, identifier: user.id }))) back({ error: "err.rate_limited" });
  const p = parseWith(jobFormSchema, o);
  if (!p.ok) back({ error: p.error });
  const v = p.data;
  const companyId = v.company_id;
  if (!v.job_id && !companyId) back({ error: "err.company_not_found" });

  const { fields, translations } = toSaveJobArgs(v);
  const { data: id, error } = await supabase.rpc("save_job", {
    p_id: v.job_id ?? null, p_company: companyId ?? null, p_fields: fields, p_translations: translations
  });
  if (error || !id) back({ error: errorKey(error) });

  if (v.intent === "submit") {
    const { error: submitError } = await supabase.rpc("submit_job_for_review", { p_job: id });
    if (submitError) redirectWith(localePath(locale, `/${area}/jobs/${id}/edit`), { error: errorKey(submitError) });
  }
  revalidatePath(listPath);
  revalidateTag(PUBLIC_TAG);
  redirectWith(localePath(locale, `/${area}/jobs/${id}`), { msg: v.intent === "submit" ? "jobform.submitted" : "jobform.saved" });
}

/** Employer/admin workflow buttons on a job: withdraw from review, archive, restore. */
export async function jobWorkflowAction(fd: FormData) {
  const o = formToObject(fd);
  const locale: Locale = isLocale(o.locale) ? o.locale : DEFAULT_LOCALE;
  const area = o.area === "admin" ? "admin" : "employer";
  const { supabase, user } = await requireRole(locale, [area === "admin" ? "admin" : "employer"]);
  const jobId = typeof o.job_id === "string" ? o.job_id : "";
  const back = localePath(locale, `/${area}/jobs/${jobId}`);
  const fn = ({ withdraw: "withdraw_job", archive: "archive_job", restore: "restore_job", submit: "submit_job_for_review" } as Record<string, string>)[String(o.op)];
  if (!fn || !/^[0-9a-f-]{36}$/i.test(jobId)) redirectWith(localePath(locale, `/${area}/jobs`), { error: "err.invalid" });
  if (!(await rateLimit("job-workflow", { ...LIMITS.write, identifier: user.id }))) redirectWith(back, { error: "err.rate_limited" });
  const { error } = await supabase.rpc(fn, { p_job: jobId });
  if (error) redirectWith(back, { error: errorKey(error) });
  revalidateTag(PUBLIC_TAG);
  redirectWith(back, { msg: `jobform.op_${o.op}` });
}
