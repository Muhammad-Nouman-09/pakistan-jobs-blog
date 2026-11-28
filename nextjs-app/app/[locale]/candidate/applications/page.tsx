import Link from "next/link";
import Flash from "@/components/ui/Flash";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { APPLICATION_STATUSES } from "@/lib/types";
import { formatDate, one, pageParam } from "@/lib/utils";
import { PAGE_SIZE, listApplications } from "@/lib/services/candidate";
import { applicationFilterSchema } from "@/lib/validation/candidate";

export async function generateMetadata(props: PageProps) {
  const { t } = await pageCtx(props);
  return noindexMetadata(t("candidate.nav.applications"));
}

export default async function ApplicationsPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["job_seeker"]);
  const parsed = applicationFilterSchema.safeParse(one(sp.status));
  const status = parsed.success ? parsed.data : undefined;
  const page = pageParam(sp.page);
  const { rows, total } = await listApplications(supabase, user.id, { status, page });
  const base = localePath(locale, "/candidate/applications");

  return (
    <>
      <Flash params={sp} t={t} />
      <section className="panel">
        <h2>{t("candidate.applications.heading")}</h2>
        <p className="notice">{t("candidate.applications.externalNote")}</p>

        <form method="get" className="filters" action={base}>
          <div>
            <label htmlFor="f-status">{t("common.status")}</label>
            <select id="f-status" name="status" defaultValue={status ?? ""}>
              <option value="">{t("common.all")}</option>
              {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{t(`appStatus.${s}`)}</option>)}
            </select>
          </div>
          <div className="row-actions">
            <button className="btn btn-dark btn-small" type="submit">{t("action.filter")}</button>
            {status && <Link className="btn btn-outline btn-small" href={base}>{t("action.clear")}</Link>}
          </div>
        </form>

        {rows.length === 0 ? (
          <p className="muted">
            {status ? t("common.noResults") : t("candidate.applications.empty")}{" "}
            {!status && <Link href={localePath(locale, "/jobs")}>{t("candidate.overview.browseJobs")}</Link>}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("candidate.applications.job")}</th>
                  <th>{t("candidate.applications.company")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("candidate.applications.submitted")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`${base}/${a.id}`}><strong>{a.job_title || t("common.none")}</strong></Link></td>
                    <td>{a.company_name}</td>
                    <td><StatusBadge kind="appStatus" value={a.status} t={t} /></td>
                    <td>{formatDate(a.submitted_at, locale)}</td>
                    <td><Link className="btn btn-outline btn-small" href={`${base}/${a.id}`}>{t("action.view")}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath={base} params={{ status }} t={t} />
      </section>
    </>
  );
}
