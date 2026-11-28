import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import StatusBadge from "@/components/ui/StatusBadge";
import { actorLabel, getApplicationDetail } from "@/lib/services/admin";
import { formatDateTime } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../../_ctx";

/** Renders arbitrary resume JSON sections as escaped text (React escapes everything). */
function Value({ v, depth = 0 }: { v: unknown; depth?: number }): React.ReactNode {
  if (v == null || v === "") return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return <span style={{ whiteSpace: "pre-wrap" }}>{String(v)}</span>;
  if (depth > 3) return null;
  if (Array.isArray(v)) {
    return <ul>{v.map((x, i) => <li key={i}><Value v={x} depth={depth + 1} /></li>)}</ul>;
  }
  if (typeof v === "object") {
    return (
      <>
        {Object.entries(v as Record<string, unknown>).map(([k, x]) => {
          const inner = <Value v={x} depth={depth + 1} />;
          return x == null || x === "" ? null : <div key={k}><span className="muted">{k.replace(/_/g, " ")}: </span>{inner}</div>;
        })}
      </>
    );
  }
  return null;
}

export default async function AdminApplicationDetailPage(props: PageProps<{ id: string }>) {
  const { locale, t, supabase, path, params } = await adminPage(props);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const d = await getApplicationDetail(supabase, params.id);
  if (!d) notFound();
  const { app, answers, events } = d;
  const snap = (app.resume_snapshot ?? {}) as Record<string, any>;
  const redacted = snap.redacted === true;
  const applicant = (snap.applicant ?? {}) as Record<string, string | null>;
  const content = (snap.content ?? {}) as Record<string, unknown>;

  return (
    <>
      <Breadcrumbs t={t} items={[{ label: t("admin.tab.applications"), href: path("/applications") }, { label: app.job_title || t("admin.job.untitled") }]} />
      <p className="notice">{t("admin.apps.note")}</p>
      <h2 style={{ marginTop: 0 }}>{app.job_title || t("admin.job.untitled")} <StatusBadge kind="appStatus" value={app.status} t={t} /></h2>

      <section className="panel" aria-labelledby="meta">
        <h2 id="meta">{t("admin.apps.details")}</h2>
        <div className="table-wrap">
          <table className="data">
            <tbody>
              <tr><th scope="row">{t("admin.jobs.title")}</th><td><Link href={path(`/jobs/${app.job_id}`)}>{app.job_title}</Link></td></tr>
              <tr><th scope="row">{t("admin.jobs.company")}</th><td><Link href={path(`/companies/${app.company_id}`)}>{app.company_name}</Link></td></tr>
              <tr><th scope="row">{t("admin.apps.submitted")}</th><td>{formatDateTime(app.submitted_at, locale)}</td></tr>
              <tr><th scope="row">{t("common.updated")}</th><td>{formatDateTime(app.updated_at, locale)}</td></tr>
              {app.withdrawn_at && <tr><th scope="row">{t("admin.apps.withdrawnAt")}</th><td>{formatDateTime(app.withdrawn_at, locale)}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-labelledby="history">
        <h2 id="history">{t("admin.apps.history")}</h2>
        <ul className="timeline">
          {events.map((e: any) => (
            <li key={e.id}>
              {e.from_status ? <>{t(`appStatus.${e.from_status}`)} → </> : null}<b>{t(`appStatus.${e.to_status}`)}</b>
              <br /><span className="muted">{formatDateTime(e.created_at, locale)} · {actorLabel(e.actor ?? undefined)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="applicant">
        <h2 id="applicant">{t("admin.apps.applicant")}</h2>
        {redacted ? <p className="muted">{t("admin.apps.redacted")}</p> : (
          <>
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  <tr><th scope="row">{t("common.name")}</th><td>{applicant.full_name || "—"}</td></tr>
                  <tr><th scope="row">{t("common.email")}</th><td><span className="ltr">{applicant.email || "—"}</span></td></tr>
                  <tr><th scope="row">{t("common.phone")}</th><td><span className="ltr">{applicant.phone || "—"}</span></td></tr>
                  <tr><th scope="row">{t("common.city")}</th><td>{[applicant.city, applicant.province].filter(Boolean).join(", ") || "—"}</td></tr>
                </tbody>
              </table>
            </div>
            {snap.pdf_path && (
              <p>
                <a className="btn btn-outline btn-small" target="_blank" rel="noopener noreferrer" href={path(`/applications/${app.id}/resume`)}>
                  {t("admin.apps.pdf")}
                </a>{" "}
                <span className="muted">{snap.pdf_name ? <span className="ltr">{String(snap.pdf_name)}</span> : null} · {t("admin.apps.pdfModeration")}</span>
              </p>
            )}
            <h3>{t("admin.apps.resume")}{snap.title ? `: ${snap.title}` : ""}</h3>
            {Object.keys(content).length === 0 ? <p className="muted">{t("admin.apps.noResume")}</p> : (
              Object.entries(content).map(([section, val]) => (
                <div key={section}><b>{section.replace(/_/g, " ")}</b><Value v={val} /></div>
              ))
            )}
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="cover">
        <h2 id="cover">{t("admin.apps.cover")}</h2>
        {app.cover_letter ? <p style={{ whiteSpace: "pre-wrap" }}>{app.cover_letter}</p> : <p className="muted">{t("admin.apps.noCover")}</p>}
      </section>

      <section className="panel" aria-labelledby="answers">
        <h2 id="answers">{t("admin.apps.answers")}</h2>
        {answers.length === 0 ? <p className="muted">{t("admin.apps.noAnswers")}</p> : (
          <dl>
            {answers.map((a) => <div key={a.id}><dt><b>{a.question}</b></dt><dd style={{ margin: "0 0 12px", whiteSpace: "pre-wrap" }}>{a.answer || "—"}</dd></div>)}
          </dl>
        )}
      </section>
    </>
  );
}
