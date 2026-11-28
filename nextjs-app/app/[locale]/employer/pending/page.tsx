import Link from "next/link";
import Flash from "@/components/ui/Flash";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { canRecruit, loadMemberships, loadPendingJobs } from "@/lib/services/employer";
import { formatDate, formatDateTime } from "@/lib/utils";
import JobActions from "@/components/employer/JobActions";

export default async function PendingReviewsPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["employer"]);
  const [rows, memberships] = await Promise.all([loadPendingJobs(supabase, locale), loadMemberships(supabase, user.id)]);
  const roleOf = new Map(memberships.map((m) => [m.company.id, m.role]));

  return (
    <>
      <Flash params={sp} t={t} />
      <h2>{t("employer.tab.pending")}</h2>
      <p className="muted">{t("employer.pending.help")}</p>
      {rows.length === 0 ? (
        <div className="panel"><p>{t("employer.pending.none")}</p></div>
      ) : (
        <div className="panel table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("employer.jobs.title")}</th><th>{t("jobform.company")}</th><th>{t("employer.pending.submitted")}</th>
                <th>{t("jobform.deadline")}</th><th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id}>
                  <td><Link href={localePath(locale, `/employer/jobs/${j.id}`)}><b>{j.title}</b></Link></td>
                  <td>{j.company_name}</td>
                  <td>{formatDateTime(j.submitted_at, locale)}</td>
                  <td>{formatDate(j.deadline, locale)}</td>
                  <td><JobActions locale={locale} t={t} jobId={j.id} status="pending_review" canEdit={canRecruit(roleOf.get(j.company_id))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
