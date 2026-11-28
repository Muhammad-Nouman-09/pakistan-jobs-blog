import Link from "next/link";
import { notFound } from "next/navigation";
import ResumeView from "@/components/employer/ResumeView";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import ConfirmButton from "@/components/ui/ConfirmButton";
import Flash from "@/components/ui/Flash";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { loadApplication, loadApplicationExtras } from "@/lib/services/employer";
import { formatDateTime } from "@/lib/utils";
import { REVIEWABLE_STATUSES, uuidOrEmpty } from "@/lib/validation/company";
import { addNoteAction, deleteNoteAction, setApplicationStatusAction } from "../actions";

export default async function ApplicationDetailPage(props: PageProps<{ id: string }>) {
  const { locale, t, sp, params } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["employer"]);
  const id = uuidOrEmpty(params.id);
  if (!id) notFound();
  // RLS: only owners / recruiters of the company can read an application — viewers get a 404 here.
  const app = await loadApplication(supabase, id);
  if (!app) notFound();

  // Opening a freshly submitted application marks it as viewed (idempotent; never regresses a later status).
  let status = app.status;
  if (status === "submitted") {
    const { error } = await supabase.rpc("set_application_status", { p_app: id, p_status: "viewed" });
    if (!error) status = "viewed";
  }
  const extras = await loadApplicationExtras(supabase, id);
  const snap = app.resume_snapshot;
  const withdrawn = status === "withdrawn";
  const applicant = snap?.applicant;
  const L = (path: string) => localePath(locale, `/employer${path}`);

  return (
    <>
      <Breadcrumbs t={t} items={[
        { label: t("employer.tab.applications"), href: L("/applications") },
        { label: applicant?.full_name || t("employer.app.anonymous") }
      ]} />
      <Flash params={sp} t={t} />

      <div className="admin-row" style={{ borderBottom: 0, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>{applicant?.full_name || t("employer.app.anonymous")}</h2>
        <StatusBadge kind="appStatus" value={status} t={t} />
      </div>
      <p className="muted">
        {app.job_title} — {app.company_name} · {t("employer.app.submitted")}: {formatDateTime(app.submitted_at, locale)}
        {withdrawn && app.withdrawn_at ? ` · ${t("appStatus.withdrawn")}: ${formatDateTime(app.withdrawn_at, locale)}` : ""}
      </p>
      <p><Link href={`${L("/applications")}?job=${app.job_id}`}>{t("employer.app.allForJob")}</Link></p>

      {withdrawn ? <p className="notice">{t("employer.app.withdrawnNote")}</p> : (
        <div className="panel">
          <h2>{t("employer.app.applicantInfo")}</h2>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                <tr><th scope="row">{t("common.name")}</th><td>{applicant?.full_name || "—"}</td></tr>
                <tr><th scope="row">{t("common.email")}</th><td>{applicant?.email ? <a href={`mailto:${applicant.email}`}><span className="ltr">{applicant.email}</span></a> : "—"}</td></tr>
                <tr><th scope="row">{t("common.phone")}</th><td>{applicant?.phone ? <span className="ltr">{applicant.phone}</span> : "—"}</td></tr>
                <tr><th scope="row">{t("employer.app.location")}</th><td>{[applicant?.city, applicant?.province].filter(Boolean).join(", ") || "—"}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!withdrawn && (
        <div className="panel">
          <h2>{t("employer.app.cover")}</h2>
          {app.cover_letter ? <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{app.cover_letter}</p> : <p className="muted">{t("employer.app.noCover")}</p>}
        </div>
      )}

      {!withdrawn && extras.answers.length > 0 && (
        <div className="panel">
          <h2>{t("employer.app.answers")}</h2>
          {extras.answers.map((a) => (
            <div key={a.question_id} style={{ marginBottom: 10 }}>
              <b>{a.question}</b>
              <p style={{ whiteSpace: "pre-wrap", margin: "2px 0 0" }}>{a.answer || "—"}</p>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <h2>{t("employer.app.resume")}{snap?.title ? ` — ${snap.title}` : ""}</h2>
        {!withdrawn && snap?.pdf_path && (
          <p>
            <a className="btn btn-outline btn-small" href={L(`/applications/${id}/pdf`)} target="_blank" rel="noopener noreferrer">
              {t("employer.app.openPdf")}{snap.pdf_name ? ` (${snap.pdf_name})` : ""}
            </a>
          </p>
        )}
        <ResumeView snapshot={snap} t={t} />
      </div>

      {!withdrawn && (
        <div className="panel">
          <h2>{t("employer.app.changeStatus")}</h2>
          <form action={setApplicationStatusAction} className="inline-form">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="application_id" value={id} />
            <input type="hidden" name="from" value="detail" />
            <label htmlFor="status" style={{ margin: 0 }}>{t("common.status")}</label>
            <select id="status" name="status" defaultValue={status === "submitted" ? "viewed" : status}>
              {REVIEWABLE_STATUSES.map((s) => <option key={s} value={s}>{t(`appStatus.${s}`)}</option>)}
            </select>
            <button className="btn btn-dark btn-small" type="submit">{t("action.save")}</button>
          </form>
          <p className="muted">{t("employer.app.statusNote")}</p>
        </div>
      )}

      <div className="panel">
        <h2>{t("employer.app.history")}</h2>
        <ul className="timeline">
          {extras.events.map((e) => (
            <li key={e.id}>
              {e.from_status ? <>{t(`appStatus.${e.from_status}`)} → </> : null}<b>{t(`appStatus.${e.to_status}`)}</b>{" "}
              <span className="muted">· {formatDateTime(e.created_at, locale)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h2>{t("employer.app.notes")}</h2>
        <p className="muted">{t("employer.app.notesHelp")}</p>
        {extras.notes.map((n) => (
          <div key={n.id} className="msg">
            <p style={{ whiteSpace: "pre-wrap", margin: "0 0 6px" }}>{n.note}</p>
            <span className="muted">{n.author_id === user.id ? t("employer.review.you") : n.author_name || t("employer.review.teammate")} · {formatDateTime(n.created_at, locale)}</span>
            {n.author_id === user.id && (
              <form action={deleteNoteAction} style={{ marginTop: 6 }}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="application_id" value={id} />
                <input type="hidden" name="note_id" value={n.id} />
                <ConfirmButton className="btn btn-danger btn-small" message={t("action.confirm")}>{t("action.delete")}</ConfirmButton>
              </form>
            )}
          </div>
        ))}
        <form action={addNoteAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="application_id" value={id} />
          <label htmlFor="note">{t("employer.app.addNote")}</label>
          <textarea id="note" name="note" rows={3} maxLength={3000} required />
          <p><button className="btn btn-dark btn-small" type="submit">{t("employer.app.saveNote")}</button></p>
        </form>
      </div>
    </>
  );
}
