import Link from "next/link";
import AuditTable from "@/components/admin/AuditTable";
import Flash from "@/components/ui/Flash";
import SetupNotice from "@/components/ui/SetupNotice";
import StatusBadge from "@/components/ui/StatusBadge";
import { isConfigured } from "@/lib/env";
import { getStats, oldestPendingCompanies, oldestPendingJobs, recentAudit } from "@/lib/services/admin";
import { formatDate, formatNumber } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "./_ctx";

export default async function AdminOverviewPage(props: PageProps) {
  const { locale, t, sp, supabase, path } = await adminPage(props);
  const [stats, jobs, companies, audit] = await Promise.all([
    getStats(supabase), oldestPendingJobs(supabase, 5), oldestPendingCompanies(supabase, 5), recentAudit(supabase, 10)
  ]);
  const n = (v: number | undefined) => formatNumber(v ?? 0, locale);
  const cards: [string, number | undefined][] = [
    ["admin.stat.users", stats?.users], ["admin.stat.employers", stats?.employers], ["admin.stat.candidates", stats?.candidates],
    ["admin.stat.companies", stats?.companies], ["admin.stat.pendingCompanies", stats?.pending_companies],
    ["admin.stat.jobs", stats?.jobs], ["admin.stat.pendingJobs", stats?.pending_jobs], ["admin.stat.publishedJobs", stats?.published_jobs],
    ["admin.stat.applications", stats?.applications], ["admin.stat.clicks", stats?.external_clicks]
  ];
  return (
    <>
      {!isConfigured() && <SetupNotice t={t} />}
      <Flash params={sp} t={t} />
      <p className="muted">{t("admin.overview.note")}</p>
      <div className="dash-grid">
        {cards.map(([key, v]) => (
          <div className="stat-card" key={key}><b>{n(v)}</b><span>{t(key)}</span></div>
        ))}
      </div>

      <div className="grid-2">
        <section className="panel" aria-labelledby="pending-jobs">
          <h2 id="pending-jobs">{t("admin.overview.pendingJobs")}</h2>
          {jobs.length === 0 ? <p className="muted">{t("admin.overview.noPendingJobs")}</p> : (
            <ul className="timeline">
              {jobs.map((j) => (
                <li key={j.id}>
                  <Link href={path(`/jobs/${j.id}`)}>{j.title || t("admin.job.untitled")}</Link>
                  <br /><span className="muted">{j.company_name} · {formatDate(j.updated_at, locale)}</span>
                </li>
              ))}
            </ul>
          )}
          <p><Link className="btn btn-outline btn-small" href={path("/jobs")}>{t("admin.overview.allPending")}</Link></p>
        </section>
        <section className="panel" aria-labelledby="pending-companies">
          <h2 id="pending-companies">{t("admin.overview.pendingCompanies")}</h2>
          {companies.length === 0 ? <p className="muted">{t("admin.overview.noPendingCompanies")}</p> : (
            <ul className="timeline">
              {companies.map((c) => (
                <li key={c.id}>
                  <Link href={path(`/companies/${c.id}`)}>{c.name}</Link> <StatusBadge kind="companyStatus" value={c.verification_status} t={t} />
                  <br /><span className="muted">{formatDate(c.created_at, locale)}</span>
                </li>
              ))}
            </ul>
          )}
          <p><Link className="btn btn-outline btn-small" href={path("/companies")}>{t("admin.overview.allPending")}</Link></p>
        </section>
      </div>

      <section className="panel" aria-labelledby="recent-activity">
        <h2 id="recent-activity">{t("admin.overview.activity")}</h2>
        <AuditTable rows={audit} locale={locale} t={t} withMetadata={false} />
        <p><Link className="btn btn-outline btn-small" href={path("/audit")}>{t("admin.overview.allActivity")}</Link></p>
      </section>
    </>
  );
}
