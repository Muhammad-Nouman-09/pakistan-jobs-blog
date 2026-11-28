import Link from "next/link";
import Flash from "@/components/ui/Flash";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { canRecruit, loadApplicationJobs, loadApplications, loadMemberships, PAGE_SIZE } from "@/lib/services/employer";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/types";
import { formatDateTime, one, pageParam } from "@/lib/utils";
import { uuidOrEmpty } from "@/lib/validation/company";
import { setApplicationStatusAction } from "./actions";

export default async function ApplicationsPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["employer"]);
  const memberships = (await loadMemberships(supabase, user.id)).filter((m) => canRecruit(m.role));
  const base = localePath(locale, "/employer/applications");

  if (memberships.length === 0) {
    return (
      <>
        <h2>{t("employer.tab.applications")}</h2>
        <p className="notice">{t("employer.app.viewerNotice")}</p>
      </>
    );
  }

  const allowed = new Set(memberships.map((m) => m.company.id));
  const companyRaw = one(sp.company);
  const company = companyRaw && allowed.has(companyRaw) ? companyRaw : undefined;
  const statusRaw = one(sp.status);
  const status = APPLICATION_STATUSES.includes(statusRaw as ApplicationStatus) ? (statusRaw as ApplicationStatus) : undefined;
  const job = uuidOrEmpty(one(sp.job)) || undefined;
  const page = pageParam(sp.page);

  const [{ rows, total }, jobs] = await Promise.all([
    loadApplications(supabase, { job, status, company, page }),
    loadApplicationJobs(supabase, locale, company)
  ]);
  const ret = new URLSearchParams();
  if (job) ret.set("job", job);
  if (status) ret.set("status", status);
  if (company) ret.set("company", company);
  if (page > 1) ret.set("page", String(page));

  return (
    <>
      <Flash params={sp} t={t} />
      <h2>{t("employer.tab.applications")}</h2>
      <p className="muted">{t("employer.app.onlyInternal")}</p>

      <form method="get" action={base} className="filters">
        <div>
          <label htmlFor="a-company">{t("jobform.company")}</label>
          <select id="a-company" name="company" defaultValue={company ?? ""}>
            <option value="">{t("common.all")}</option>
            {memberships.map((m) => <option key={m.company.id} value={m.company.id}>{m.company.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="a-job">{t("employer.app.job")}</label>
          <select id="a-job" name="job" defaultValue={job ?? ""}>
            <option value="">{t("common.all")}</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="a-status">{t("common.status")}</label>
          <select id="a-status" name="status" defaultValue={status ?? ""}>
            <option value="">{t("common.all")}</option>
            {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{t(`appStatus.${s}`)}</option>)}
          </select>
        </div>
        <div className="row-actions">
          <button className="btn btn-dark btn-small" type="submit">{t("action.filter")}</button>
          {(company || job || status) && <Link className="btn btn-outline btn-small" href={base}>{t("action.clear")}</Link>}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="panel"><p>{t("employer.app.none")}</p></div>
      ) : (
        <div className="panel table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("employer.app.applicant")}</th><th>{t("employer.app.job")}</th><th>{t("jobform.company")}</th>
                <th>{t("common.status")}</th><th>{t("employer.app.submitted")}</th><th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const open = a.status !== "withdrawn";
                return (
                  <tr key={a.id}>
                    <td><Link href={localePath(locale, `/employer/applications/${a.id}`)}><b>{a.applicant_name || t("employer.app.anonymous")}</b></Link></td>
                    <td>{a.job_title}</td>
                    <td>{a.company_name}</td>
                    <td><StatusBadge kind="appStatus" value={a.status} t={t} /></td>
                    <td>{formatDateTime(a.submitted_at, locale)}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn btn-outline btn-small" href={localePath(locale, `/employer/applications/${a.id}`)}>{t("action.view")}</Link>
                        {open && (["shortlisted", "rejected"] as const).filter((s) => s !== a.status).map((s) => (
                          <form key={s} action={setApplicationStatusAction}>
                            <input type="hidden" name="locale" value={locale} />
                            <input type="hidden" name="application_id" value={a.id} />
                            <input type="hidden" name="status" value={s} />
                            <input type="hidden" name="from" value="list" />
                            <input type="hidden" name="ret" value={ret.toString()} />
                            <button className={`btn btn-small ${s === "rejected" ? "btn-danger" : "btn-dark"}`} type="submit">
                              {s === "shortlisted" ? t("employer.app.shortlist") : t("employer.app.reject")}
                            </button>
                          </form>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath={base} t={t} params={{ job, status, company }} />
    </>
  );
}
