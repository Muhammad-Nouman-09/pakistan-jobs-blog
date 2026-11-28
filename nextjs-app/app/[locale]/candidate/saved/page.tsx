import Link from "next/link";
import Flash from "@/components/ui/Flash";
import Pagination from "@/components/ui/Pagination";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { PAGE_SIZE, listSavedJobs } from "@/lib/services/candidate";
import { formatDate, pageParam } from "@/lib/utils";
import { removeSavedJobAction } from "../actions";

export async function generateMetadata(props: PageProps) {
  const { t } = await pageCtx(props);
  return noindexMetadata(t("candidate.nav.saved"));
}

export default async function SavedJobsPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["job_seeker"]);
  const page = pageParam(sp.page);
  const { rows, total } = await listSavedJobs(supabase, user.id, locale, page);
  const base = localePath(locale, "/candidate/saved");

  return (
    <>
      <Flash params={sp} t={t} />
      <section className="panel">
        <h2>{t("candidate.saved.heading")}</h2>
        {rows.length === 0 ? (
          <p className="muted">{t("candidate.saved.empty")} <Link href={localePath(locale, "/jobs")}>{t("candidate.overview.browseJobs")}</Link></p>
        ) : (
          <div className="job-grid">
            {rows.map((j) => (
              <div className="job-card" key={j.job_id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>
                    {j.available && j.slug ? <Link href={localePath(locale, `/jobs/${j.slug}`)}>{j.title || j.slug}</Link> : t("candidate.saved.unavailable")}
                  </h3>
                  {j.company_name && <p className="org">{j.company_name}</p>}
                  <div className="job-meta">
                    {j.city && <span>{j.city}</span>}
                    {j.deadline && <span>{t("candidate.saved.deadline")}: {formatDate(j.deadline, locale)}</span>}
                    <span>{t("candidate.saved.savedOn")}: {formatDate(j.saved_at, locale)}</span>
                  </div>
                  {j.closed && <span className="deadline-pill closed">{t("candidate.saved.closed")}</span>}
                </div>
                <div className="job-actions">
                  {j.available && j.slug && !j.closed && (
                    <Link className="btn btn-green btn-small" href={localePath(locale, `/jobs/${j.slug}`)}>{t("action.view")}</Link>
                  )}
                  <form action={removeSavedJobAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="job_id" value={j.job_id} />
                    <button className="btn btn-outline btn-small" type="submit">{t("candidate.saved.remove")}</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath={base} t={t} />
      </section>
    </>
  );
}
