import Link from "next/link";
import { notFound } from "next/navigation";
import JobActions from "@/components/employer/JobActions";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Flash from "@/components/ui/Flash";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { canRecruit, isJobLive, loadJobCounts, loadMemberships, loadReviews, type ReviewEntry } from "@/lib/services/employer";
import { categoryName, loadCategories, loadJobForEdit, pickTranslation } from "@/lib/services/jobs";
import { uuidOrEmpty } from "@/lib/validation/company";
import { formatDate, formatDateTime, formatSalary } from "@/lib/utils";

const ADMIN_ACTIONS = new Set(["approved", "rejected", "changes_requested", "unpublished"]);
const TRANSLATION_FIELDS = ["description", "responsibilities", "requirements", "benefits", "experience", "education", "salary_text", "how_to_apply"] as const;

/** Reviewer identity is never exposed: admin decisions are attributed to the platform, not to a person. */
function actorLabel(r: ReviewEntry, userId: string, t: (k: string) => string) {
  if (r.actor_id === userId) return t("employer.review.you");
  return ADMIN_ACTIONS.has(r.action) ? t("employer.review.admin") : t("employer.review.teammate");
}

export default async function JobDetailPage(props: PageProps<{ id: string }>) {
  const { locale, t, sp, params } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["employer"]);
  const id = uuidOrEmpty(params.id);
  if (!id) notFound();
  const job = await loadJobForEdit(supabase, id);
  if (!job) notFound();
  const memberships = await loadMemberships(supabase, user.id);
  const membership = memberships.find((m) => m.company.id === job.company_id);
  const mayRecruit = canRecruit(membership?.role);
  const [reviews, live, counts, categories] = await Promise.all([
    loadReviews(supabase, id), isJobLive(supabase, id), loadJobCounts(supabase, id, mayRecruit), loadCategories(supabase)
  ]);
  const category = categories.find((c) => c.id === job.category_id);
  const title = pickTranslation(job.translations, locale, job.default_language)?.title ?? "—";
  const L = (path: string) => localePath(locale, `/employer${path}`);
  // The reviewer's reason for the CURRENT rejected / changes-requested state is the newest review of that kind.
  const decision = reviews.find((r) => r.action === job.status);
  const showReason = (job.status === "rejected" || job.status === "changes_requested") && !!decision?.reason;
  const revisionOnline = live.live && job.status !== "approved";
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency, t(`period.${job.salary_period}`), locale);
  const external = job.application_method !== "internal";

  const rows: [string, React.ReactNode][] = [
    [t("jobform.company"), membership?.company.name ?? "—"],
    [t("jobform.category"), category ? categoryName(category, locale) : "—"],
    [t("jobform.employmentType"), t(`jobType.${job.employment_type}`)],
    [t("jobform.workplaceType"), t(`workplace.${job.workplace_type}`)],
    [t("jobform.sector"), t(`sector.${job.sector}`)],
    [t("common.city"), [job.city, job.province].filter(Boolean).join(", ") || "—"],
    [t("employer.job.salary"), salary || "—"],
    [t("jobform.vacancies"), job.vacancies],
    [t("jobform.deadline"), formatDate(job.deadline, locale)],
    [t("jobform.method"), t(`applyMethod.${job.application_method}`)],
    ...(job.external_url ? [[t("jobform.externalUrl"), <span key="u" className="ltr">{job.external_url}</span>] as [string, React.ReactNode]] : []),
    ...(job.external_email ? [[t("jobform.externalEmail"), <span key="e" className="ltr">{job.external_email}</span>] as [string, React.ReactNode]] : []),
    ...(job.source ? [[t("jobform.source"), job.source] as [string, React.ReactNode]] : []),
    [t("common.updated"), formatDateTime(job.updated_at, locale)]
  ];

  return (
    <>
      <Breadcrumbs t={t} items={[{ label: t("employer.tab.jobs"), href: L("/jobs") }, { label: title }]} />
      <Flash params={sp} t={t} />

      <div className="admin-row" style={{ borderBottom: 0, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <StatusBadge kind="jobStatus" value={job.status} t={t} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <JobActions locale={locale} t={t} jobId={id} status={job.status} canEdit={mayRecruit} showView={false} />
      </div>

      {!mayRecruit && <p className="notice">{t("employer.jobs.viewerNotice")}</p>}

      {showReason && (
        <div className="notice warn" role="status">
          <b>{job.status === "rejected" ? t("employer.review.rejectedReason") : t("employer.review.changesReason")}</b>
          <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{decision?.reason}</p>
        </div>
      )}

      <div className="panel">
        <h2>{t("employer.job.status")}</h2>
        <p><StatusBadge kind="jobStatus" value={job.status} t={t} /> {t(`employer.job.statusHelp.${job.status}`)}</p>
        <p>
          <b>{t("employer.job.live")}:</b>{" "}
          {live.live
            ? <>{t("employer.job.liveYes")}{live.approvedAt ? ` (${formatDateTime(live.approvedAt, locale)})` : ""}</>
            : t("employer.job.liveNo")}
        </p>
        {revisionOnline && <p className="notice">{t("employer.job.revisionOnline")}</p>}
        {live.live && job.slug && <p><Link href={localePath(locale, `/jobs/${job.slug}`)}>{t("employer.job.publicPage")}</Link></p>}
        {mayRecruit && (
          <p>
            {external
              ? <><b>{t("employer.job.clicks")}:</b> {counts.clicks} <span className="muted">({t("employer.job.clicksNote")})</span></>
              : <><b>{t("employer.job.applications")}:</b> {counts.applications}{" "}
                  <Link href={`${L("/applications")}?job=${id}`}>{t("employer.job.viewApplications")}</Link></>}
          </p>
        )}
      </div>

      <div className="panel">
        <h2>{t("employer.job.summary")}</h2>
        <div className="table-wrap">
          <table className="data">
            <tbody>{rows.map(([k, v], i) => <tr key={i}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      {(["en", "ur"] as const).map((lang) => {
        const tr = job.translations.find((x) => x.locale === lang);
        if (!tr) return null;
        return (
          <div key={lang} className="panel" lang={lang} dir={lang === "ur" ? "rtl" : "ltr"}>
            <h2>{t(`lang.${lang}`)}: {tr.title}</h2>
            {TRANSLATION_FIELDS.map((f) => tr[f] ? (
              <div key={f}>
                <h3 style={{ fontSize: 16, margin: "12px 0 4px" }}>{t(`jobform.f.${f}`)}</h3>
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{tr[f]}</p>
              </div>
            ) : null)}
          </div>
        );
      })}

      {job.screening_questions.length > 0 && (
        <div className="panel">
          <h2>{t("jobform.questions")}</h2>
          <ol style={{ margin: 0, paddingInlineStart: 22 }}>
            {job.screening_questions.map((q) => <li key={q.id}>{q.text}{q.required ? ` (${t("common.required")})` : ""}</li>)}
          </ol>
        </div>
      )}

      <div className="panel">
        <h2>{t("employer.review.history")}</h2>
        {reviews.length === 0 ? <p className="muted">{t("employer.review.none")}</p> : (
          <ul className="timeline">
            {reviews.map((r) => (
              <li key={r.id}>
                <b>{t(`employer.review.action.${r.action}`)}</b>{" "}
                <span className="muted">· {actorLabel(r, user.id, t)} · {formatDateTime(r.created_at, locale)}</span>
                {r.reason && <div style={{ whiteSpace: "pre-wrap" }}>{r.reason}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
