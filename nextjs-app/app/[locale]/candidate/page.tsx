import Link from "next/link";
import Flash from "@/components/ui/Flash";
import { notificationView } from "@/components/candidate/notification";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { APPLICATION_STATUSES } from "@/lib/types";
import { formatDateTime, formatNumber } from "@/lib/utils";
import {
  countApplicationsByStatus, countResumes, countSavedJobs, getCandidateProfile, listNotifications, profileCompleteness
} from "@/lib/services/candidate";

export async function generateMetadata(props: PageProps) {
  const { t } = await pageCtx(props);
  return noindexMetadata(t("candidate.nav.overview"));
}

export default async function CandidateOverview(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["job_seeker"]);
  const [byStatus, saved, resumes, profile, notes] = await Promise.all([
    countApplicationsByStatus(supabase, user.id), countSavedJobs(supabase, user.id), countResumes(supabase, user.id),
    getCandidateProfile(supabase, user.id), listNotifications(supabase, user.id, { limit: 5 })
  ]);
  const total = APPLICATION_STATUSES.reduce((n, st) => n + byStatus[st], 0);
  const { percent, missing } = profileCompleteness(profile, resumes);
  const p = (path: string) => localePath(locale, `/candidate${path}`);
  const n = (v: number) => formatNumber(v, locale);

  return (
    <>
      <Flash params={sp} t={t} />

      <div className="dash-grid">
        <div className="stat-card"><b>{n(total)}</b><span>{t("candidate.overview.applications")}</span></div>
        <div className="stat-card"><b>{n(saved)}</b><span>{t("candidate.overview.saved")}</span></div>
        <div className="stat-card"><b>{n(resumes)}</b><span>{t("candidate.overview.resumes")}</span></div>
      </div>

      <section className="panel" aria-labelledby="ov-status">
        <h2 id="ov-status">{t("candidate.overview.byStatus")}</h2>
        {total === 0 ? (
          <p className="muted">{t("candidate.overview.noApplications")} <Link href={localePath(locale, "/jobs")}>{t("candidate.overview.browseJobs")}</Link></p>
        ) : (
          <div className="chips">
            {APPLICATION_STATUSES.filter((st) => byStatus[st] > 0).map((st) => (
              <Link key={st} href={`${p("/applications")}?status=${st}`} className="pill">
                {t(`appStatus.${st}`)}: {n(byStatus[st])}
              </Link>
            ))}
          </div>
        )}
        <p className="muted" style={{ marginBottom: 0 }}>{t("candidate.applications.externalNote")}</p>
      </section>

      <section className="panel" aria-labelledby="ov-complete">
        <h2 id="ov-complete">{t("candidate.overview.completeness")}</h2>
        <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t("candidate.overview.completeness")}>
          <div style={{ width: `${percent}%` }} />
        </div>
        <p><strong>{n(percent)}%</strong> {percent === 100 ? t("candidate.overview.complete") : t("candidate.overview.completeHint")}</p>
        {missing.length > 0 && (
          <ul>
            {missing.map((k) => (
              <li key={k}>
                <Link href={k === "resume" ? p("/resumes/new") : p("/profile")}>{t(`candidate.complete.${k}`)}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="ov-notes">
        <h2 id="ov-notes">{t("candidate.overview.latestNotifications")}</h2>
        {notes.rows.length === 0 ? (
          <p className="muted">{t("candidate.notifications.empty")}</p>
        ) : (
          <div>
            {notes.rows.map((row) => {
              const v = notificationView(row, t, locale);
              return (
                <div className="admin-row" key={row.id}>
                  <span>
                    {!row.read_at && <span className="badge" style={{ marginInlineEnd: 8 }}>{t("candidate.notifications.new")}</span>}
                    {v.href ? <Link href={v.href}>{v.text}</Link> : v.text}
                  </span>
                  <span className="muted">{formatDateTime(row.created_at, locale)}</span>
                </div>
              );
            })}
          </div>
        )}
        <p style={{ marginBottom: 0 }}><Link href={p("/notifications")}>{t("candidate.overview.allNotifications")}</Link></p>
      </section>

      <section className="panel" aria-labelledby="ov-links">
        <h2 id="ov-links">{t("candidate.overview.quickLinks")}</h2>
        <div className="row-actions">
          <Link className="btn btn-green btn-small" href={localePath(locale, "/jobs")}>{t("nav.findJobs")}</Link>
          <Link className="btn btn-outline btn-small" href={p("/profile")}>{t("candidate.nav.profile")}</Link>
          <Link className="btn btn-outline btn-small" href={p("/resumes/new")}>{t("candidate.resumes.new")}</Link>
          <Link className="btn btn-outline btn-small" href={p("/applications")}>{t("candidate.nav.applications")}</Link>
          <Link className="btn btn-outline btn-small" href={p("/saved")}>{t("candidate.nav.saved")}</Link>
        </div>
      </section>
    </>
  );
}
