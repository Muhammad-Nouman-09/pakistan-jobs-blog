import Link from "next/link";
import Filters, { SelectField, TextField } from "@/components/admin/Filters";
import Flash from "@/components/ui/Flash";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import { listApplications, PAGE_SIZE } from "@/lib/services/admin";
import { APPLICATION_STATUSES } from "@/lib/types";
import { formatDateTime, one, pageParam } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../_ctx";

export default async function AdminApplicationsPage(props: PageProps) {
  const { locale, t, sp, supabase, path } = await adminPage(props);
  const status = (APPLICATION_STATUSES as string[]).includes(one(sp.status) ?? "") ? (one(sp.status) as string) : "";
  const q = (one(sp.q) ?? "").slice(0, 80);
  const company = (one(sp.company) ?? "").slice(0, 80);
  const page = pageParam(sp.page);
  const { rows, total } = await listApplications(supabase, { status, q, company, page });

  return (
    <>
      <Flash params={sp} t={t} />
      <p className="notice">{t("admin.apps.note")}</p>
      <Filters action={path("/applications")} t={t}>
        <SelectField id="a-status" name="status" label={t("common.status")} value={status}
          options={[{ value: "", label: t("common.all") }, ...APPLICATION_STATUSES.map((s) => ({ value: s, label: t(`appStatus.${s}`) }))]} />
        <TextField id="a-company" name="company" label={t("admin.jobs.company")} value={company} />
        <TextField id="a-q" name="q" label={t("admin.apps.searchJob")} value={q} />
      </Filters>
      <p className="muted">{total === 1 ? t("common.result1") : t("common.results", { count: total })}</p>
      {rows.length === 0 ? <p className="notice">{t("common.noResults")}</p> : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>{t("admin.jobs.title")}</th><th>{t("admin.jobs.company")}</th><th>{t("common.status")}</th><th>{t("admin.apps.submitted")}</th><th /></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td><Link href={path(`/jobs/${a.job_id}`)}>{a.job_title || t("admin.job.untitled")}</Link></td>
                  <td><Link href={path(`/companies/${a.company_id}`)}>{a.company_name}</Link></td>
                  <td><StatusBadge kind="appStatus" value={a.status} t={t} /></td>
                  <td>{formatDateTime(a.submitted_at, locale)}</td>
                  <td><Link className="btn btn-outline btn-small" href={path(`/applications/${a.id}`)}>{t("action.view")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath={path("/applications")} params={{ status, q, company }} t={t} />
    </>
  );
}
