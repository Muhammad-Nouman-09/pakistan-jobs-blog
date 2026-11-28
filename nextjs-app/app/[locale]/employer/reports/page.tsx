import Link from "next/link";
import Flash from "@/components/ui/Flash";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { canRecruit, loadMemberships, loadRecentApplications, loadReport } from "@/lib/services/employer";
import { APPLICATION_STATUSES, JOB_STATUSES } from "@/lib/types";
import { formatDateTime, formatNumber, one } from "@/lib/utils";

export default async function ReportsPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["employer"]);
  const memberships = await loadMemberships(supabase, user.id);
  const L = (path: string) => localePath(locale, `/employer${path}`);

  if (memberships.length === 0) {
    return (
      <>
        <h2>{t("employer.tab.reports")}</h2>
        <div className="panel"><p>{t("employer.overview.noCompanyText")}</p></div>
      </>
    );
  }

  const wanted = one(sp.company);
  const current = memberships.find((m) => m.company.id === wanted) ?? memberships[0];
  const mayRecruit = canRecruit(current.role);
  const [report, recent] = await Promise.all([
    loadReport(supabase, current.company.id),
    mayRecruit ? loadRecentApplications(supabase, current.company.id) : Promise.resolve([])
  ]);
  const n = (v: number | undefined) => formatNumber(Number(v ?? 0), locale);
  const totalClicks = report?.per_job.reduce((a, j) => a + Number(j.external_clicks), 0) ?? 0;

  return (
    <>
      <Flash params={sp} t={t} />
      <h2>{t("employer.tab.reports")}</h2>
      <form method="get" action={L("/reports")} className="filters">
        <div>
          <label htmlFor="r-company">{t("jobform.company")}</label>
          <select id="r-company" name="company" defaultValue={current.company.id}>
            {memberships.map((m) => <option key={m.company.id} value={m.company.id}>{m.company.name}</option>)}
          </select>
        </div>
        <div><button className="btn btn-dark btn-small" type="submit">{t("employer.reports.show")}</button></div>
      </form>

      {!report ? <p className="notice warn">{t("err.generic")}</p> : (
        <>
          <div className="panel">
            <h2>{t("employer.overview.jobs")}</h2>
            <div className="dash-grid">
              {JOB_STATUSES.map((s) => (
                <div key={s} className="stat-card"><b>{n(report.jobs_by_status[s])}</b><span>{t(`jobStatus.${s}`)}</span></div>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>{t("employer.overview.applications")}</h2>
            <div className="dash-grid">
              {APPLICATION_STATUSES.map((s) => (
                <div key={s} className="stat-card"><b>{n(report.applications_by_status[s])}</b><span>{t(`appStatus.${s}`)}</span></div>
              ))}
              <div className="stat-card"><b>{n(totalClicks)}</b><span>{t("employer.reports.clicksTotal")}</span></div>
            </div>
            <p className="muted">{t("employer.reports.clicksNote")}</p>
          </div>

          <div className="panel">
            <h2>{t("employer.reports.perJob")}</h2>
            {report.per_job.length === 0 ? <p>{t("employer.jobs.none")}</p> : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t("employer.jobs.title")}</th><th>{t("common.status")}</th>
                      <th>{t("employer.reports.applications")}</th><th>{t("employer.reports.clicks")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.per_job.map((j) => (
                      <tr key={j.job_id}>
                        <td><Link href={L(`/jobs/${j.job_id}`)}>{j.title || "—"}</Link></td>
                        <td><StatusBadge kind="jobStatus" value={j.status} t={t} /></td>
                        <td>{n(j.applications)}</td>
                        <td>{n(j.external_clicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <h2>{t("employer.reports.recent")}</h2>
            {!mayRecruit ? <p className="muted">{t("employer.app.viewerNotice")}</p>
              : recent.length === 0 ? <p>{t("employer.app.none")}</p> : (
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr><th>{t("employer.app.applicant")}</th><th>{t("employer.app.job")}</th><th>{t("common.status")}</th><th>{t("employer.app.submitted")}</th></tr></thead>
                    <tbody>
                      {recent.map((a) => (
                        <tr key={a.id}>
                          <td><Link href={L(`/applications/${a.id}`)}>{a.applicant_name || t("employer.app.anonymous")}</Link></td>
                          <td>{a.job_title}</td>
                          <td><StatusBadge kind="appStatus" value={a.status} t={t} /></td>
                          <td>{formatDateTime(a.submitted_at, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </>
      )}
    </>
  );
}
