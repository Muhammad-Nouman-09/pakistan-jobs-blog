import Link from "next/link";
import { getReports, REPORT_LIMITS } from "@/lib/services/admin";
import { formatNumber } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../_ctx";

export default async function AdminReportsPage(props: PageProps) {
  const { locale, t, supabase, path } = await adminPage(props);
  const r = await getReports(supabase);
  const n = (v: number) => formatNumber(v, locale);
  const monthLabel = (m: string) => new Intl.DateTimeFormat(locale === "ur" ? "ur-PK" : "en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T00:00:00Z`));
  const backlogRows = (b: typeof r.backlogJobs) => [
    [t("admin.rep.age.d1"), b.d1], [t("admin.rep.age.d3"), b.d3], [t("admin.rep.age.d7"), b.d7], [t("admin.rep.age.older"), b.older]
  ] as [string, number][];

  return (
    <>
      <p className="muted">{t("admin.rep.note")}</p>
      {r.truncated && <p className="notice warn">{t("admin.rep.truncated")}</p>}

      <div className="grid-2">
        <section className="panel" aria-labelledby="r-jobs">
          <h2 id="r-jobs">{t("admin.rep.jobsByStatus")}</h2>
          <div className="table-wrap"><table className="data"><tbody>
            {r.jobsByStatus.map((x) => <tr key={x.status}><td>{t(`jobStatus.${x.status}`)}</td><td>{n(x.count)}</td></tr>)}
          </tbody></table></div>
        </section>
        <section className="panel" aria-labelledby="r-apps">
          <h2 id="r-apps">{t("admin.rep.appsByStatus")}</h2>
          <div className="table-wrap"><table className="data"><tbody>
            {r.applicationsByStatus.map((x) => <tr key={x.status}><td>{t(`appStatus.${x.status}`)}</td><td>{n(x.count)}</td></tr>)}
          </tbody></table></div>
        </section>
      </div>

      <section className="panel" aria-labelledby="r-companies">
        <h2 id="r-companies">{t("admin.rep.topCompanies")}</h2>
        {r.topCompanies.length === 0 ? <p className="muted">{t("admin.rep.noData")}</p> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>{t("admin.jobs.company")}</th><th>{t("admin.rep.applications")}</th><th>{t("admin.rep.clicks")}</th></tr></thead>
            <tbody>
              {r.topCompanies.map((c) => (
                <tr key={c.id}><td><Link href={path(`/companies/${c.id}`)}>{c.name}</Link></td><td>{n(c.applications)}</td><td>{n(c.clicks)}</td></tr>
              ))}
            </tbody>
          </table></div>
        )}
        <p className="muted">{t("admin.rep.companyLimit", { count: REPORT_LIMITS.companies })}</p>
      </section>

      <div className="grid-2">
        <section className="panel" aria-labelledby="r-cats">
          <h2 id="r-cats">{t("admin.rep.jobsPerCategory")}</h2>
          <div className="table-wrap"><table className="data"><tbody>
            {r.jobsPerCategory.map((c) => (
              <tr key={c.id}><td>{c.id === "none" ? t("admin.rep.uncategorized") : locale === "ur" ? c.name_ur || c.name_en : c.name_en}</td><td>{n(c.count)}</td></tr>
            ))}
          </tbody></table></div>
        </section>
        <section className="panel" aria-labelledby="r-users">
          <h2 id="r-users">{t("admin.rep.newUsers")}</h2>
          <div className="table-wrap"><table className="data">
            <thead><tr><th>{t("admin.rep.month")}</th><th>{t("role.employer")}</th><th>{t("role.job_seeker")}</th><th>{t("role.admin")}</th></tr></thead>
            <tbody>
              {r.newUsers.map((u: any) => (
                <tr key={u.month}><td>{monthLabel(u.month)}</td><td>{n(u.employer)}</td><td>{n(u.job_seeker)}</td><td>{n(u.admin)}</td></tr>
              ))}
            </tbody>
          </table></div>
        </section>
      </div>

      <section className="panel" aria-labelledby="r-backlog">
        <h2 id="r-backlog">{t("admin.rep.backlog")}</h2>
        <p className="muted">{t("admin.rep.backlogHelp")}</p>
        <div className="grid-2">
          {([["admin.rep.backlogJobs", r.backlogJobs], ["admin.rep.backlogCompanies", r.backlogCompanies]] as const).map(([key, b]) => (
            <div key={key}>
              <h3>{t(key)}: {n(b.total)}</h3>
              <div className="table-wrap"><table className="data"><tbody>
                {backlogRows(b).map(([label, count]) => <tr key={label}><td>{label}</td><td>{n(count)}</td></tr>)}
              </tbody></table></div>
              <p className="muted">{t("admin.rep.oldest", { days: n(b.oldestDays) })}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
