import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/ui/Flash";
import ConfirmButton from "@/components/ui/ConfirmButton";
import StatusBadge from "@/components/ui/StatusBadge";
import ResumeDocument from "@/components/candidate/ResumeDocument";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { getApplication } from "@/lib/services/candidate";
import { formatDateTime } from "@/lib/utils";
import { withdrawApplicationAction } from "../../actions";

export async function generateMetadata(props: PageProps<{ id: string }>) {
  const { t } = await pageCtx(props);
  return noindexMetadata(t("candidate.application.title"));
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

export default async function ApplicationDetailPage(props: PageProps<{ id: string }>) {
  const { locale, t, sp, params } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["job_seeker"]);
  const a = await getApplication(supabase, user.id, params.id);
  if (!a) notFound();

  const snap = obj(a.resume_snapshot);
  const redacted = snap.redacted === true;
  const hasSnapshot = !redacted && Object.keys(snap).length > 0;
  const applicant = obj(snap.applicant);
  const list = localePath(locale, "/candidate/applications");

  return (
    <>
      <Flash params={sp} t={t} />
      <p><Link href={list}>← {t("candidate.applications.heading")}</Link></p>

      <section className="panel">
        <h2 style={{ marginBottom: 4 }}>{a.job_title || t("candidate.application.title")}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{a.company_name}</p>
        <p>
          <StatusBadge kind="appStatus" value={a.status} t={t} />{" "}
          <span className="muted">{t("candidate.applications.submitted")}: {formatDateTime(a.submitted_at, locale)}</span>
        </p>
        <p className="row-actions">
          {a.jobSlug ? (
            <Link className="btn btn-outline btn-small" href={localePath(locale, `/jobs/${a.jobSlug}`)}>{t("candidate.application.viewJob")}</Link>
          ) : (
            <span className="muted">{t("candidate.application.jobGone")}</span>
          )}
        </p>
        {a.status === "withdrawn" && a.jobSlug && <p className="notice">{t("candidate.application.reapply")}</p>}
        <p className="muted">{t("candidate.applications.externalNote")}</p>
      </section>

      <section className="panel" aria-labelledby="app-timeline">
        <h2 id="app-timeline">{t("candidate.application.timeline")}</h2>
        {a.events.length === 0 ? <p className="muted">{t("common.none")}</p> : (
          <ol className="timeline">
            {a.events.map((e) => (
              <li key={e.id}>
                <strong>{t(`appStatus.${e.to_status}`)}</strong>
                <br /><span className="muted">{formatDateTime(e.created_at, locale)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel" aria-labelledby="app-cover">
        <h2 id="app-cover">{t("candidate.apply.cover")}</h2>
        {a.cover_letter ? <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{a.cover_letter}</p> : <p className="muted">{t("candidate.application.noCover")}</p>}
      </section>

      {a.answers.length > 0 && (
        <section className="panel" aria-labelledby="app-answers">
          <h2 id="app-answers">{t("candidate.application.answers")}</h2>
          {a.answers.map((q) => (
            <div key={q.id} style={{ margin: "0 0 12px" }}>
              <strong>{q.question}</strong>
              <p style={{ whiteSpace: "pre-wrap", margin: "2px 0 0" }}>{q.answer || t("common.none")}</p>
            </div>
          ))}
        </section>
      )}

      <section className="panel" aria-labelledby="app-resume">
        <h2 id="app-resume">{t("candidate.application.resume")}</h2>
        {redacted ? (
          <p className="muted">{t("candidate.application.redacted")}</p>
        ) : hasSnapshot ? (
          <>
            <p>
              <strong>{str(snap.title)}</strong>
              {str(snap.pdf_name) ? <> · {t("candidate.application.withPdf")}: <span className="ltr">{str(snap.pdf_name)}</span></> : null}
            </p>
            <p className="muted">{t("candidate.application.snapshotNote")}</p>
            <details>
              <summary>{t("candidate.application.showResume")}</summary>
              <div style={{ marginTop: 12 }}>
                <ResumeDocument
                  content={{ ...obj(snap.content), personal: { ...obj(obj(snap.content).personal), name: str(applicant.full_name) || str(obj(obj(snap.content).personal).name) } }}
                  t={t} locale={locale}
                />
              </div>
            </details>
          </>
        ) : <p className="muted">{t("common.none")}</p>}
      </section>

      {a.status !== "withdrawn" && (
        <section className="panel" aria-labelledby="app-withdraw">
          <h2 id="app-withdraw">{t("candidate.application.withdrawHeading")}</h2>
          <p className="muted">{t("candidate.application.withdrawHelp")}</p>
          <form action={withdrawApplicationAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="id" value={a.id} />
            <ConfirmButton className="btn btn-danger" message={t("candidate.application.withdrawConfirm")}>{t("candidate.application.withdraw")}</ConfirmButton>
          </form>
        </section>
      )}
    </>
  );
}
