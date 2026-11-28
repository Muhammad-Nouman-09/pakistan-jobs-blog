"use server";
import { revalidatePath } from "next/cache";
import { DEFAULT_LOCALE, isLocale, localePath, type Locale } from "@/lib/i18n/config";
import { formToObject, parseWith, redirectWith } from "@/lib/forms";
import { errorKey } from "@/lib/errors";
import { requireRole } from "@/lib/auth/session";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { applySchema } from "@/lib/validation/candidate";

const SLUG = /^[A-Za-z0-9][A-Za-z0-9-]{0,200}$/;

/** Submit an application through the DB function apply_to_job (it re-checks role, resume, deadline, answers). */
export async function applyAction(fd: FormData) {
  const o = formToObject(fd);
  const locale: Locale = isLocale(o.locale) ? o.locale : DEFAULT_LOCALE;
  const slug = typeof o.slug === "string" && SLUG.test(o.slug) ? o.slug : null;
  const back = slug ? localePath(locale, `/jobs/${slug}/apply`) : localePath(locale, "/jobs");

  const { supabase, user } = await requireRole(locale, ["job_seeker"], back);
  if (!(await rateLimit("apply", { ...LIMITS.apply, identifier: user.id }))) redirectWith(back, { error: "err.rate_limited" });

  const p = parseWith(applySchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });

  const { data, error } = await supabase.rpc("apply_to_job", {
    p_job: p.data.job_id, p_resume: p.data.resume_id, p_cover: p.data.cover_letter, p_answers: p.data.answers
  });
  if (error || typeof data !== "string") redirectWith(back, { error: errorKey(error) });

  revalidatePath(localePath(locale, "/candidate"), "layout");
  redirectWith(localePath(locale, `/candidate/applications/${data}`), { msg: "candidate.applied" });
}
