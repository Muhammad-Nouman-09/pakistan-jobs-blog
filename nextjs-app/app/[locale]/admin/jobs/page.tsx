import Link from "next/link";
import Filters, { TextField } from "@/components/admin/Filters";
import Flash from "@/components/ui/Flash";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import { JOB_FILTERS, listJobs, PAGE_SIZE } from "@/lib/services/admin";
import { formatDate } from "@/lib/utils";
import { one, pageParam } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../_ctx";

export default async function AdminJobsPage(props: PageProps) {
  const { locale, t, sp, supabase, path } = await adminPage(props);
  const rawStatus = one(sp.status) ?? "pending_review";
  const status = (JOB_FILTERS as readonly string[]).includes(rawStatus) ? rawStatus : "pending_review";
  const q = (one(sp.q) ?? "").slice(0, 80);
  const page = pageParam(sp.page);
  const { rows, total } = await listJobs(supabase, { status, q, page });
  const tabHref = (s: string) => `${path("/jobs")}?${new URLSearchParams({ status: s, ...(q ? { q } : {}) }).toString()}`;

  return (
    <>
      <Flash params={sp} t={t} />
      <nav className="tabs" aria-label={t("admin.jobs.statusTabs")} style={{ marginBottom: 14 }}>
        {JOB_FILTERS.map((s) => (
          <Link key={s} href={tabHref(s)} className={s === status ? "active" : undefined} aria-current={s === status ? "page" : undefined}>
            {s === "all" ? t("common.all") : t(`jobStatus.${s}`)}
          </Link>
        ))}
      </nav>
      <Filters action={path("/jobs")} t={t}>
        <input type="hidden" name="status" value={status} />
        <TextField id="job-q" name="q" label={t("admin.jobs.search")} value={q} />
      </Filters>
      <p className="muted">{total === 1 ? t("common.result1") : t("common.results", { count: total })}</p>

      {rows.length === 0 ? <p className="notice">{t("common.noResults")}</p> : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("admin.jobs.title")}</th><th>{t("admin.jobs.company")}</th><th>{t("common.city")}</th>
                <th>{t("common.status")}</th><th>{t("admin.jobs.deadline")}</th><th>{t("common.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id}>
                  <td>
                    <Link href={path(`/jobs/${j.id}`)}>{j.title || t("admin.job.untitled")}</Link>
                    {j.featured && <> <span className="badge badge-blue">{t("admin.job.featured")}</span></>}
                  </td>
                  <td><Link href={path(`/companies/${j.company_id}`)}>{j.company_name}</Link></td>
                  <td>{j.city ?? "—"}</td>
                  <td><StatusBadge kind="jobStatus" value={j.status} t={t} /></td>
                  <td>{formatDate(j.deadline, locale)}</td>
                  <td>{formatDate(j.updated_at, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath={path("/jobs")} params={{ status, q }} t={t} />
    </>
  );
}
