"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { isLocale, localePath, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { isWebUrl, todayPK } from "@/lib/utils";

/**
 * "Apply on the employer's site / by e-mail" button. The destination is read from the database (never from
 * the form), a CLICK is recorded (record_external_click) and the visitor is sent on. This never creates an
 * application and nothing here claims the visitor applied — external applications are only link clicks.
 */
export async function externalApplyAction(fd: FormData) {
  const locale: Locale = isLocale(fd.get("locale")) ? (fd.get("locale") as Locale) : DEFAULT_LOCALE;
  const ref = Number(fd.get("ref"));
  const kind = fd.get("kind") === "email" ? "email" : "url";
  if (!Number.isSafeInteger(ref) || ref < 1) redirect(localePath(locale, "/jobs"));

  const anon = createAnonClient();
  const { data: job } = (await anon?.from("job_published").select("job_id,slug,application_method,external_url,external_email,deadline").eq("ref_no", ref).maybeSingle()) ?? { data: null };
  if (!job) redirect(localePath(locale, "/jobs"));
  const page = localePath(locale, `/jobs/${job.slug}`);
  if (job.deadline < todayPK()) redirect(page);

  if (await rateLimit("external-click", { ...LIMITS.externalClick })) {
    const supabase = await createClient();   // carries the user's session when there is one (click is attributed)
    await supabase?.rpc("record_external_click", { p_job: job.job_id, p_kind: kind });
  }
  if (kind === "url" && job.application_method === "external_url" && isWebUrl(job.external_url)) redirect(job.external_url as string);
  if (kind === "email" && job.application_method === "external_email") redirect(`${page}?apply=email#apply`);
  redirect(page);
}
