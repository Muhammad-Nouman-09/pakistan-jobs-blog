import Link from "next/link";
import Flash from "@/components/ui/Flash";
import ConfirmButton from "@/components/ui/ConfirmButton";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { listResumes } from "@/lib/services/candidate";
import { MAX_RESUMES } from "@/lib/validation/candidate";
import { formatDate } from "@/lib/utils";
import { deleteResumeAction, setDefaultResumeAction } from "../actions";

export async function generateMetadata(props: PageProps) {
  const { t } = await pageCtx(props);
  return noindexMetadata(t("candidate.nav.resumes"));
}

export default async function ResumesPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["job_seeker"]);
  const resumes = await listResumes(supabase, user.id);
  const base = (path: string) => localePath(locale, `/candidate/resumes${path}`);
  const full = resumes.length >= MAX_RESUMES;

  return (
    <>
      <Flash params={sp} t={t} />
      <section className="panel">
        <h2>{t("candidate.resumes.heading")}</h2>
        <p className="muted">{t("candidate.resumes.intro", { max: MAX_RESUMES })}</p>
        <p className="notice">{t("candidate.resume.visibilityHelp")}</p>
        <p className="row-actions">
          {full ? (
            <span className="muted">{t("candidate.resumes.limitReached", { max: MAX_RESUMES })}</span>
          ) : (
            <Link className="btn btn-dark btn-small" href={base("/new")}>{t("candidate.resumes.new")}</Link>
          )}
          {!full && <Link className="btn btn-outline btn-small" href={`${base("/new")}?from=profile`}>{t("candidate.resumes.fromProfile")}</Link>}
          <span className="muted">{t("candidate.resumes.count", { count: resumes.length, max: MAX_RESUMES })}</span>
        </p>

        {resumes.length === 0 ? (
          <p className="muted">{t("candidate.resumes.empty")}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("candidate.resume.titleLabel")}</th>
                  <th>{t("candidate.resume.visibility")}</th>
                  <th>{t("candidate.resumes.pdf")}</th>
                  <th>{t("common.updated")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {resumes.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={base(`/${r.id}`)}><strong>{r.title}</strong></Link>{" "}
                      {r.is_default && <span className="badge">{t("candidate.resumes.default")}</span>}
                    </td>
                    <td><span className={`badge ${r.visibility === "shareable" ? "" : "badge-gray"}`}>{t(`candidate.resume.visibility.${r.visibility}`)}</span></td>
                    <td>{r.pdf_path ? <span className="ltr">{r.pdf_name ?? "PDF"}</span> : t("common.none")}</td>
                    <td>{formatDate(r.updated_at, locale)}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn btn-outline btn-small" href={base(`/${r.id}`)}>{t("action.edit")}</Link>
                        <Link className="btn btn-outline btn-small" href={base(`/${r.id}/preview`)}>{t("action.preview")}</Link>
                        {r.pdf_path && <a className="btn btn-outline btn-small" href={base(`/${r.id}/pdf`)}>{t("action.download")}</a>}
                        {!r.is_default && (
                          <form action={setDefaultResumeAction}>
                            <input type="hidden" name="locale" value={locale} />
                            <input type="hidden" name="id" value={r.id} />
                            <button className="btn btn-outline btn-small" type="submit">{t("candidate.resumes.makeDefault")}</button>
                          </form>
                        )}
                        <form action={deleteResumeAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="id" value={r.id} />
                          <ConfirmButton className="btn btn-danger btn-small" message={t("candidate.resumes.deleteConfirm")}>{t("action.delete")}</ConfirmButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
