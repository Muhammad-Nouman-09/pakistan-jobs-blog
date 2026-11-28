import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Flash from "@/components/ui/Flash";
import SetupNotice from "@/components/ui/SetupNotice";
import { getSession } from "@/lib/auth/session";
import { isConfigured } from "@/lib/env";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { findLiveApplication, getJobForApply, listResumes } from "@/lib/services/candidate";
import { formatDate, refFromSlug } from "@/lib/utils";
import { applyAction } from "./actions";

export const dynamic = "force-dynamic";   // per-user: never prerendered

export async function generateMetadata(props: PageProps<{ slug: string }>) {
  const { t } = await pageCtx(props);
  return noindexMetadata(t("candidate.apply.title"));
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="section"><div className="container"><div className="form-card" style={{ maxWidth: 720 }}>{children}</div></div></main>;
}

// Apply page: private, so no ads and no indexing.
export default async function ApplyPage(props: PageProps<{ slug: string }>) {
  const { locale, t, sp, params } = await pageCtx(props);
  const ref = refFromSlug(params.slug);
  if (ref === null) notFound();
  const here = localePath(locale, `/jobs/${params.slug}/apply`);

  if (!isConfigured()) return <Shell><SetupNotice t={t} /></Shell>;

  const s = await getSession();
  if (!s.supabase || !s.user || !s.profile) redirect(localePath(locale, `/auth/login?next=${encodeURIComponent(here)}`));
  if (!s.user.email_confirmed_at) redirect(localePath(locale, "/auth/check-email"));
  if (s.profile.status === "suspended") redirect(localePath(locale, "/auth/suspended"));
  if (s.profile.role !== "job_seeker") {
    return (
      <Shell>
        <h1 style={{ fontSize: 26 }}>{t("candidate.apply.title")}</h1>
        <p className="notice">{t("candidate.apply.seekersOnly")}</p>
        <Link className="btn btn-outline" href={localePath(locale, `/jobs/${params.slug}`)}>{t("action.back")}</Link>
      </Shell>
    );
  }

  const job = await getJobForApply(s.supabase, ref, locale);
  if (!job) notFound();
  const jobUrl = localePath(locale, `/jobs/${job.slug}`);
  if (job.application_method !== "internal") redirect(jobUrl);

  const head = (
    <>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>{t("candidate.apply.title")}</h1>
      <p style={{ margin: "0 0 4px" }}><strong>{job.title}</strong></p>
      <p className="muted" style={{ marginTop: 0 }}>{job.company_name} · {t("candidate.saved.deadline")}: {formatDate(job.deadline, locale)}</p>
    </>
  );

  if (job.closed) {
    return (
      <Shell>
        {head}
        <p className="notice warn">{t("candidate.apply.closed")}</p>
        <Link className="btn btn-outline" href={jobUrl}>{t("action.back")}</Link>
      </Shell>
    );
  }

  const existing = await findLiveApplication(s.supabase, s.user.id, job.job_id);
  if (existing) {
    return (
      <Shell>
        {head}
        <p className="notice">{t("candidate.apply.already")}</p>
        <Link className="btn btn-dark" href={localePath(locale, `/candidate/applications/${existing}`)}>{t("candidate.apply.viewApplication")}</Link>
      </Shell>
    );
  }

  const resumes = await listResumes(s.supabase, s.user.id);
  const shareable = resumes.filter((r) => r.visibility === "shareable");
  const privateOnes = resumes.filter((r) => r.visibility !== "shareable");
  const newResume = localePath(locale, "/candidate/resumes/new?from=profile");

  return (
    <Shell>
      {head}
      <Flash params={sp} t={t} />
      <p className="muted">{t("candidate.apply.intro")}</p>

      {shareable.length === 0 ? (
        <div>
          <p className="notice warn">{t("candidate.apply.noShareable")}</p>
          <p className="muted">{t("candidate.resume.visibilityHelp")}</p>
          <p className="row-actions">
            <Link className="btn btn-dark" href={newResume}>{t("candidate.resumes.new")}</Link>
            {privateOnes.length > 0 && <Link className="btn btn-outline" href={localePath(locale, "/candidate/resumes")}>{t("candidate.apply.manageResumes")}</Link>}
          </p>
        </div>
      ) : (
        <form action={applyAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="slug" value={job.slug} />
          <input type="hidden" name="job_id" value={job.job_id} />

          <label htmlFor="resume_id">{t("candidate.apply.resume")} *</label>
          <select id="resume_id" name="resume_id" required defaultValue={shareable.find((r) => r.is_default)?.id ?? shareable[0].id} aria-describedby="resume-help">
            {shareable.map((r) => <option key={r.id} value={r.id}>{r.title}{r.is_default ? ` (${t("candidate.resumes.default")})` : ""}</option>)}
          </select>
          <p id="resume-help" className="muted">
            {t("candidate.apply.resumeHelp")}{" "}
            {privateOnes.length > 0 && <>{t("candidate.apply.privateHidden", { count: privateOnes.length })} </>}
            <Link href={localePath(locale, "/candidate/resumes")}>{t("candidate.apply.manageResumes")}</Link> · <Link href={newResume}>{t("candidate.resumes.new")}</Link>
          </p>

          <label htmlFor="cover_letter">{t("candidate.apply.cover")} <span className="muted">({t("common.optional")})</span></label>
          <textarea id="cover_letter" name="cover_letter" rows={7} maxLength={5000} />

          {job.questions.length > 0 && <h2 style={{ fontSize: 20, marginTop: 24 }}>{t("candidate.apply.questions")}</h2>}
          {job.questions.map((q, i) => (
            <div key={q.id}>
              <input type="hidden" name={`answers[${i}].id`} value={q.id} />
              <label htmlFor={`answer-${i}`}>{q.text}{q.required ? " *" : ` (${t("common.optional")})`}</label>
              <textarea id={`answer-${i}`} name={`answers[${i}].answer`} rows={3} maxLength={3000} required={q.required} />
            </div>
          ))}

          <p className="muted" style={{ marginTop: 20 }}>{t("candidate.apply.consent")}</p>
          <p className="row-actions">
            <button className="btn btn-green" type="submit">{t("candidate.apply.submit")}</button>
            <Link className="btn btn-outline" href={jobUrl}>{t("action.cancel")}</Link>
          </p>
        </form>
      )}
    </Shell>
  );
}
