import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import ConfirmButton from "@/components/ui/ConfirmButton";
import Flash from "@/components/ui/Flash";
import StatusBadge from "@/components/ui/StatusBadge";
import { actorLabel, getJobDetail, pickTitle } from "@/lib/services/admin";
import { formatDate, formatDateTime, formatSalary, isWebUrl } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../../_ctx";
import { featureJobAction, reviewJobAction } from "../actions";

const TEXT_FIELDS = ["description", "responsibilities", "requirements", "benefits", "experience", "education", "salary_text", "how_to_apply"] as const;

export default async function AdminJobDetailPage(props: PageProps<{ id: string }>) {
  const { locale, t, sp, supabase, path, params } = await adminPage(props);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const detail = await getJobDetail(supabase, params.id);
  if (!detail) notFound();
  const { job, reviews, published } = detail;
  const translations: any[] = job.job_translations ?? [];
  const liveTranslations: any[] = published?.job_published_translations ?? [];
  const title = pickTitle(translations, job.default_language) || t("admin.job.untitled");
  const isPending = job.status === "pending_review";
  const canUnpublish = !!published || job.status === "approved";
  const questions: any[] = Array.isArray(job.screening_questions) ? job.screening_questions : [];
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency, t(`period.${job.salary_period}`), locale);
  const category = job.job_categories ? (locale === "ur" ? job.job_categories.name_ur || job.job_categories.name_en : job.job_categories.name_en) : "—";
  const rows: [string, React.ReactNode][] = [
    [t("common.status"), <StatusBadge key="s" kind="jobStatus" value={job.status} t={t} />],
    [t("admin.jobs.company"), job.companies ? <Link key="c" href={path(`/companies/${job.companies.id}`)}>{job.companies.name}</Link> : "—"],
    [t("admin.job.category"), category],
    [t("admin.job.sector"), t(`sector.${job.sector}`)],
    [t("admin.job.type"), `${t(`jobType.${job.employment_type}`)} · ${t(`workplace.${job.workplace_type}`)}`],
    [t("admin.job.location"), [job.city, job.province, job.country].filter(Boolean).join(", ") || "—"],
    [t("admin.job.salary"), salary || "—"],
    [t("admin.job.vacancies"), String(job.vacancies)],
    [t("admin.jobs.deadline"), formatDate(job.deadline, locale)],
    [t("admin.job.defaultLanguage"), t(`lang.${job.default_language}`)],
    [t("admin.job.source"), job.source || "—"],
    [t("admin.job.featured"), job.featured ? t("common.yes") : t("common.no")],
    [t("admin.job.publishedAt"), formatDateTime(job.published_at, locale)],
    [t("admin.job.lastApproved"), formatDateTime(job.last_approved_at, locale)],
    [t("common.created"), formatDateTime(job.created_at, locale)],
    [t("common.updated"), formatDateTime(job.updated_at, locale)],
    [t("admin.job.reference"), <span key="r" className="ltr">{job.ref_no} · {job.slug}</span>]
  ];
  const method = job.application_method as string;

  return (
    <>
      <Breadcrumbs t={t} items={[{ label: t("admin.tab.jobs"), href: path("/jobs") }, { label: title }]} />
      <Flash params={sp} t={t} />
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p className="row-actions">
        <Link className="btn btn-outline btn-small" href={path(`/jobs/${job.id}/edit`)}>{t("admin.job.edit")}</Link>
        <Link className="btn btn-outline btn-small" href={path("/jobs")}>{t("action.back")}</Link>
      </p>

      <section className="panel" aria-labelledby="moderate">
        <h2 id="moderate">{t("admin.job.moderation")}</h2>
        <p className="muted">{t("admin.job.moderationHelp")}</p>
        {isPending && (
          <div className="grid-2">
            <form action={reviewJobAction}>
              <input type="hidden" name="locale" value={locale} /><input type="hidden" name="job" value={job.id} /><input type="hidden" name="action" value="approve" />
              <p><ConfirmButton className="btn btn-green" message={t("admin.job.confirmApprove")}>{t("admin.job.approve")}</ConfirmButton></p>
            </form>
            <span />
            <form action={reviewJobAction}>
              <input type="hidden" name="locale" value={locale} /><input type="hidden" name="job" value={job.id} /><input type="hidden" name="action" value="reject" />
              <label htmlFor="reject-reason">{t("admin.job.rejectReason")} *</label>
              <textarea id="reject-reason" name="reason" required minLength={3} maxLength={2000} />
              <p><button className="btn btn-danger" type="submit">{t("admin.job.reject")}</button></p>
            </form>
            <form action={reviewJobAction}>
              <input type="hidden" name="locale" value={locale} /><input type="hidden" name="job" value={job.id} /><input type="hidden" name="action" value="request_changes" />
              <label htmlFor="changes-reason">{t("admin.job.changesReason")} *</label>
              <textarea id="changes-reason" name="reason" required minLength={3} maxLength={2000} />
              <p><button className="btn btn-outline" type="submit">{t("admin.job.requestChanges")}</button></p>
            </form>
          </div>
        )}
        {!isPending && <p className="notice">{t("admin.job.notPending")}</p>}
        {canUnpublish && (
          <form action={reviewJobAction}>
            <input type="hidden" name="locale" value={locale} /><input type="hidden" name="job" value={job.id} /><input type="hidden" name="action" value="unpublish" />
            <label htmlFor="unpublish-reason">{t("admin.job.unpublishReason")} *</label>
            <textarea id="unpublish-reason" name="reason" required minLength={3} maxLength={2000} style={{ minHeight: 70 }} />
            <p><ConfirmButton className="btn btn-danger" message={t("admin.job.confirmUnpublish")}>{t("admin.job.unpublish")}</ConfirmButton></p>
          </form>
        )}
        <form action={featureJobAction} className="inline-form">
          <input type="hidden" name="locale" value={locale} /><input type="hidden" name="job" value={job.id} />
          <input type="hidden" name="featured" value={job.featured ? "false" : "true"} />
          <button className="btn btn-outline btn-small" type="submit">{job.featured ? t("admin.job.unfeature") : t("admin.job.feature")}</button>
          {job.featured && !published && <span className="muted">{t("admin.job.featureNotLive")}</span>}
        </form>
      </section>

      <section className="panel" aria-labelledby="fields">
        <h2 id="fields">{t("admin.job.details")}</h2>
        <div className="table-wrap">
          <table className="data">
            <tbody>{rows.map(([k, v], i) => <tr key={i}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
          </table>
        </div>

        <h3>{t("admin.job.applyMethod")}</h3>
        <p>{t(`applyMethod.${method}`)}</p>
        {method === "external_url" && job.external_url && (
          <p>
            <span className="ltr">{job.external_url}</span>{" "}
            {isWebUrl(job.external_url)
              ? <a href={job.external_url} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-outline btn-small">{t("admin.job.openLink")}</a>
              : <span className="badge badge-red">{t("admin.job.unsafeLink")}</span>}
          </p>
        )}
        {method === "external_email" && job.external_email && <p><span className="ltr">{job.external_email}</span></p>}

        <h3>{t("admin.job.questions")}</h3>
        {questions.length === 0 ? <p className="muted">{t("admin.job.noQuestions")}</p> : (
          <ol>
            {questions.map((q, i) => (
              <li key={q.id ?? i}>{String(q.text ?? "")} {q.required && <span className="badge badge-gray">{t("common.required")}</span>}</li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel" aria-labelledby="translations">
        <h2 id="translations">{t("admin.job.translations")}</h2>
        {translations.length === 0 && <p className="muted">{t("admin.job.noTranslations")}</p>}
        {translations.map((tr) => (
          <article key={tr.locale} lang={tr.locale} dir={tr.locale === "ur" ? "rtl" : "ltr"} style={{ marginBottom: 24 }}>
            <h3>{t(`lang.${tr.locale}`)}: {tr.title}</h3>
            {TEXT_FIELDS.map((f) => tr[f] ? (
              <div key={f}>
                <b>{t(`admin.job.f.${f}`)}</b>
                <p style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>{tr[f]}</p>
              </div>
            ) : null)}
          </article>
        ))}
      </section>

      <section className="panel" aria-labelledby="live">
        <h2 id="live">{t("admin.job.liveCompare")}</h2>
        {published ? (
          <>
            <p className="notice">{t("admin.job.liveYes", { date: formatDateTime(published.approved_at, locale) })}</p>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>{t("common.name")}</th><th>{t("admin.job.liveTitle")}</th><th>{t("admin.job.workingTitle")}</th><th /></tr></thead>
                <tbody>
                  {(["en", "ur"] as const).map((l) => {
                    const live = liveTranslations.find((x) => x.locale === l)?.title ?? "";
                    const work = translations.find((x) => x.locale === l)?.title ?? "";
                    if (!live && !work) return null;
                    return (
                      <tr key={l}>
                        <td>{t(`lang.${l}`)}</td><td lang={l}>{live || "—"}</td><td lang={l}>{work || "—"}</td>
                        <td>{live === work ? <span className="badge badge-gray">{t("admin.job.same")}</span> : <span className="badge badge-amber">{t("admin.job.differs")}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted">{t("admin.job.liveDeadline", { date: formatDate(published.deadline, locale) })}</p>
          </>
        ) : <p className="muted">{t("admin.job.liveNo")}</p>}
      </section>

      <section className="panel" aria-labelledby="history">
        <h2 id="history">{t("admin.job.history")}</h2>
        {reviews.length === 0 ? <p className="muted">{t("admin.job.noHistory")}</p> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{t("common.date")}</th><th>{t("admin.job.action")}</th><th>{t("admin.job.actor")}</th><th>{t("admin.job.reason")}</th></tr></thead>
              <tbody>
                {reviews.map((r: any) => (
                  <tr key={r.id}>
                    <td>{formatDateTime(r.created_at, locale)}</td>
                    <td>{t(`admin.reviewAction.${r.action}`)}{r.from_status && r.to_status && <><br /><span className="muted">{t(`jobStatus.${r.from_status}`)} → {t(`jobStatus.${r.to_status}`)}</span></>}</td>
                    <td>{actorLabel(r.actor ?? undefined)}</td>
                    <td style={{ whiteSpace: "pre-wrap" }}>{r.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
