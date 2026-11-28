import Link from "next/link";
import JobActions from "@/components/employer/JobActions";
import DashTabs from "@/components/ui/DashTabs";
import Flash from "@/components/ui/Flash";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { canRecruit, loadJobs, loadJobStatusCounts, loadMemberships, PAGE_SIZE } from "@/lib/services/employer";
import { JOB_STATUSES, type JobStatus } from "@/lib/types";
import { formatDate, one, pageParam } from "@/lib/utils";

export default async function JobsPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["employer"]);
  const memberships = await loadMemberships(supabase, user.id);
  const roleOf = new Map(memberships.map((m) => [m.company.id, m.role]));

  const statusRaw = one(sp.status);
  const status = JOB_STATUSES.includes(statusRaw as JobStatus) ? (statusRaw as JobStatus) : undefined;
  const companyRaw = one(sp.company);
  const company = companyRaw && roleOf.has(companyRaw) ? companyRaw : undefined;
  const q = (one(sp.q) ?? "").slice(0, 80);
  const page = pageParam(sp.page);

  const [{ rows, total }, counts] = await Promise.all([
    loadJobs(supabase, { status, company, q, page }, locale),
    loadJobStatusCounts(supabase, company)
  ]);
  const base = localePath(locale, "/employer/jobs");
  const qs = (s?: string) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (company) p.set("company", company);
    if (q) p.set("q", q);
    const str = p.toString();
    return str ? `${base}?${str}` : base;
  };
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <Flash params={sp} t={t} />
      <div className="admin-row" style={{ borderBottom: 0, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>{t("employer.tab.jobs")}</h2>
        <Link className="btn btn-dark" href={localePath(locale, "/employer/jobs/new")}>{t("employer.tab.newJob")}</Link>
      </div>

      <DashTabs label={t("employer.jobs.statusFilter")} items={[
        { href: qs(), label: t("common.all"), badge: totalAll, active: !status },
        ...JOB_STATUSES.map((s) => ({ href: qs(s), label: t(`jobStatus.${s}`), badge: counts[s], active: status === s }))
      ]} />

      <form method="get" action={base} className="filters">
        {status && <input type="hidden" name="status" value={status} />}
        <div>
          <label htmlFor="f-company">{t("jobform.company")}</label>
          <select id="f-company" name="company" defaultValue={company ?? ""}>
            <option value="">{t("common.all")}</option>
            {memberships.map((m) => <option key={m.company.id} value={m.company.id}>{m.company.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-q">{t("employer.jobs.search")}</label>
          <input id="f-q" name="q" type="search" defaultValue={q} maxLength={80} />
        </div>
        <div className="row-actions">
          <button className="btn btn-dark btn-small" type="submit">{t("action.filter")}</button>
          {(company || q || status) && <Link className="btn btn-outline btn-small" href={base}>{t("action.clear")}</Link>}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="panel"><p>{t("employer.jobs.none")}</p></div>
      ) : (
        <div className="panel table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("employer.jobs.title")}</th><th>{t("jobform.company")}</th><th>{t("common.city")}</th><th>{t("common.status")}</th>
                <th>{t("jobform.deadline")}</th><th>{t("employer.jobs.applications")}</th><th>{t("common.updated")}</th><th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => {
                const role = roleOf.get(j.company_id);
                const mayRecruit = canRecruit(role);
                return (
                  <tr key={j.id}>
                    <td><Link href={localePath(locale, `/employer/jobs/${j.id}`)}><b>{j.title}</b></Link></td>
                    <td>{j.company_name}</td>
                    <td>{j.city || "—"}</td>
                    <td><StatusBadge kind="jobStatus" value={j.status} t={t} /></td>
                    <td>{formatDate(j.deadline, locale)}</td>
                    <td>{mayRecruit ? j.applications : "—"}</td>
                    <td>{formatDate(j.updated_at, locale)}</td>
                    <td><JobActions locale={locale} t={t} jobId={j.id} status={j.status} canEdit={mayRecruit} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath={base} t={t}
        params={{ status, company, q: q || undefined }} />
    </>
  );
}
