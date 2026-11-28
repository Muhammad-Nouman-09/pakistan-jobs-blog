import Link from "next/link";
import Flash from "@/components/ui/Flash";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { canRecruit, loadMemberships, loadTotals, loadVerificationNotes } from "@/lib/services/employer";
import { APPLICATION_STATUSES, JOB_STATUSES } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { resubmitVerificationAction } from "./companies/actions";

export default async function EmployerOverviewPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["employer"]);
  const memberships = await loadMemberships(supabase, user.id);
  const flagged = memberships.filter((m) => ["rejected", "suspended"].includes(m.company.verification_status));
  const [totals, notes] = await Promise.all([
    loadTotals(supabase, memberships.map((m) => m.company.id)),
    loadVerificationNotes(supabase, flagged.map((m) => m.company.id))
  ]);
  const hasRecruiter = memberships.some((m) => canRecruit(m.role));
  const L = (path: string) => localePath(locale, `/employer${path}`);
  const n = (v: number | undefined) => formatNumber(v ?? 0, locale);

  return (
    <>
      <Flash params={sp} t={t} />

      {memberships.length === 0 && (
        <div className="panel">
          <h2>{t("employer.overview.noCompanyTitle")}</h2>
          <p>{t("employer.overview.noCompanyText")}</p>
          <Link className="btn btn-dark" href={L("/companies/new")}>{t("employer.company.create")}</Link>
        </div>
      )}

      {memberships.map(({ company, role }) => {
        const s = company.verification_status;
        if (s === "verified") return null;
        const note = notes[company.id];
        return (
          <div key={company.id} className="notice warn" role="status">
            <b>{company.name}</b> — <StatusBadge kind="companyStatus" value={s} t={t} />
            <p style={{ margin: "6px 0" }}>{t(`employer.notice.${s}`)}</p>
            {note && (s === "rejected" || s === "suspended") && <p style={{ margin: "6px 0" }}><b>{t("employer.company.adminNote")}:</b> {note}</p>}
            <div className="row-actions">
              <Link className="btn btn-outline btn-small" href={L(`/companies/${company.id}`)}>{t("employer.company.manage")}</Link>
              {s === "rejected" && role === "owner" && (
                <form action={resubmitVerificationAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="company_id" value={company.id} />
                  <button className="btn btn-dark btn-small" type="submit">{t("employer.company.resubmit")}</button>
                </form>
              )}
            </div>
          </div>
        );
      })}

      {memberships.length > 0 && (
        <>
          <div className="panel">
            <h2>{t("employer.overview.jobs")}</h2>
            <div className="dash-grid">
              {JOB_STATUSES.map((s) => (
                <Link key={s} href={`${L("/jobs")}?status=${s}`} className="stat-card" style={{ textDecoration: "none", color: "inherit" }}>
                  <b>{n(totals.jobs[s])}</b><span>{t(`jobStatus.${s}`)}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="panel">
            <h2>{t("employer.overview.applications")}</h2>
            {hasRecruiter ? (
              <div className="dash-grid">
                {APPLICATION_STATUSES.map((s) => (
                  <Link key={s} href={`${L("/applications")}?status=${s}`} className="stat-card" style={{ textDecoration: "none", color: "inherit" }}>
                    <b>{n(totals.apps[s])}</b><span>{t(`appStatus.${s}`)}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="muted">{t("employer.app.viewerNotice")}</p>}
          </div>
        </>
      )}

      {memberships.length > 0 && (
        <div className="panel">
          <h2>{t("employer.overview.companies")}</h2>
          {memberships.map(({ company, role }) => (
            <div key={company.id} className="admin-row">
              <div>
                <Link href={L(`/companies/${company.id}`)}><b>{company.name}</b></Link>{" "}
                <StatusBadge kind="companyStatus" value={company.verification_status} t={t} />{" "}
                <StatusBadge kind="member" value={role} t={t} />
              </div>
              <div className="row-actions">
                <Link className="btn btn-outline btn-small" href={`${L("/jobs")}?company=${company.id}`}>{t("employer.tab.jobs")}</Link>
                <Link className="btn btn-outline btn-small" href={L(`/companies/${company.id}/team`)}>{t("employer.team.title")}</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <h2>{t("employer.overview.quick")}</h2>
        <div className="row-actions">
          <Link className="btn btn-dark" href={L("/jobs/new")}>{t("employer.tab.newJob")}</Link>
          <Link className="btn btn-outline" href={L("/companies/new")}>{t("employer.company.create")}</Link>
          <Link className="btn btn-outline" href={L("/applications")}>{t("employer.tab.applications")}</Link>
          <Link className="btn btn-outline" href={L("/reports")}>{t("employer.tab.reports")}</Link>
        </div>
      </div>
    </>
  );
}
