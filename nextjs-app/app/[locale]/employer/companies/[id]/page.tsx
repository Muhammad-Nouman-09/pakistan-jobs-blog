import Link from "next/link";
import { notFound } from "next/navigation";
import CompanyForm from "@/components/employer/CompanyForm";
import CompanyLogo from "@/components/employer/CompanyLogo";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import ConfirmButton from "@/components/ui/ConfirmButton";
import Flash from "@/components/ui/Flash";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { loadCompanyDetail, loadDocuments } from "@/lib/services/employer";
import { DOC_TYPES, MAX_COMPANY_DOCS, uuidOrEmpty } from "@/lib/validation/company";
import { formatDateTime } from "@/lib/utils";
import { deleteDocumentAction, removeLogoAction, resubmitVerificationAction, updateCompanyAction, uploadDocumentsAction, uploadLogoAction } from "../actions";

export default async function CompanyPage(props: PageProps<{ id: string }>) {
  const { locale, t, sp, params } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["employer"]);
  const id = uuidOrEmpty(params.id);
  if (!id) notFound();
  const detail = await loadCompanyDetail(supabase, id, user.id);
  if (!detail) notFound();
  const { company, priv, role } = detail;
  const isOwner = role === "owner";
  const docs = isOwner ? await loadDocuments(supabase, id) : [];
  const L = (path: string) => localePath(locale, `/employer${path}`);
  const status = company.verification_status;
  const note = priv?.verification_note;

  return (
    <>
      <Breadcrumbs t={t} items={[{ label: t("employer.tab.companies"), href: L("/companies") }, { label: company.name }]} />
      <Flash params={sp} t={t} />

      <div className="company-hero">
        <CompanyLogo name={company.name} path={company.logo_path} large />
        <div>
          <h2 style={{ margin: "0 0 6px" }}>{company.name}</h2>
          <StatusBadge kind="companyStatus" value={status} t={t} />{" "}
          <StatusBadge kind="member" value={role} t={t} />
        </div>
      </div>
      <div className="row-actions" style={{ marginBottom: 18 }}>
        <Link className="btn btn-outline btn-small" href={L(`/companies/${id}/team`)}>{t("employer.team.title")}</Link>
        <Link className="btn btn-outline btn-small" href={`${L("/jobs")}?company=${id}`}>{t("employer.tab.jobs")}</Link>
        <Link className="btn btn-outline btn-small" href={`${L("/reports")}?company=${id}`}>{t("employer.tab.reports")}</Link>
        {status === "verified" && <Link className="btn btn-outline btn-small" href={localePath(locale, `/companies/${company.slug}`)}>{t("employer.company.publicPage")}</Link>}
      </div>

      <div className="panel">
        <h2>{t("employer.company.verification")}</h2>
        <p><StatusBadge kind="companyStatus" value={status} t={t} /></p>
        <p>{t(`employer.notice.${status}`)}</p>
        {note && (status === "rejected" || status === "suspended") && (
          <p className={status === "rejected" ? "notice warn" : "notice"}><b>{t("employer.company.adminNote")}:</b> {note}</p>
        )}
        {status === "rejected" && isOwner && (
          <form action={resubmitVerificationAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="company_id" value={id} />
            <button className="btn btn-dark" type="submit">{t("employer.company.resubmit")}</button>
          </form>
        )}
      </div>

      <div className="panel">
        <h2>{t("employer.company.details")}</h2>
        {!isOwner && <p className="muted">{t("employer.company.readOnly")}</p>}
        <CompanyForm locale={locale} t={t} action={updateCompanyAction} company={company} priv={priv} readOnly={!isOwner} submitLabel={t("action.saveChanges")} />
      </div>

      {isOwner && (
        <div className="panel">
          <h2>{t("employer.company.logo")}</h2>
          <div className="company-hero"><CompanyLogo name={company.name} path={company.logo_path} large /></div>
          <form action={uploadLogoAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="company_id" value={id} />
            <label htmlFor="logo">{t("employer.company.logoFile")}</label>
            <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
            <p className="muted">{t("employer.company.logoHelp")}</p>
            <p><button className="btn btn-dark" type="submit">{t("employer.company.logoUpload")}</button></p>
          </form>
          {company.logo_path && (
            <form action={removeLogoAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="company_id" value={id} />
              <ConfirmButton className="btn btn-danger btn-small" message={t("action.confirm")}>{t("employer.company.logoRemove")}</ConfirmButton>
            </form>
          )}
        </div>
      )}

      {isOwner && (
        <div className="panel">
          <h2>{t("employer.docs.title")}</h2>
          <p className="muted">{t("employer.docs.help", { max: MAX_COMPANY_DOCS })}</p>
          {docs.length === 0 ? <p>{t("employer.docs.none")}</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>{t("employer.docs.file")}</th><th>{t("employer.docs.type")}</th><th>{t("common.date")}</th><th>{t("common.actions")}</th></tr></thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td><span className="ltr">{d.file_name}</span></td>
                      <td>{t(`employer.docs.type.${d.doc_type}`)}</td>
                      <td>{formatDateTime(d.created_at, locale)}</td>
                      <td>
                        <div className="row-actions">
                          <a className="btn btn-outline btn-small" href={`${L(`/companies/${id}/documents/${d.id}`)}`} target="_blank" rel="noopener noreferrer">{t("action.download")}</a>
                          <form action={deleteDocumentAction}>
                            <input type="hidden" name="locale" value={locale} />
                            <input type="hidden" name="company_id" value={id} />
                            <input type="hidden" name="doc_id" value={d.id} />
                            <ConfirmButton className="btn btn-danger btn-small" message={t("action.confirm")}>{t("action.delete")}</ConfirmButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {docs.length < MAX_COMPANY_DOCS && (
            <form action={uploadDocumentsAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="company_id" value={id} />
              <div className="grid-2">
                <div>
                  <label htmlFor="doc_type">{t("employer.docs.type")}</label>
                  <select id="doc_type" name="doc_type" defaultValue="registration">
                    {DOC_TYPES.map((d) => <option key={d} value={d}>{t(`employer.docs.type.${d}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="files">{t("employer.docs.files")}</label>
                  <input id="files" name="files" type="file" multiple required accept="application/pdf,image/png,image/jpeg" />
                </div>
              </div>
              <p className="muted">{t("employer.docs.privacy")}</p>
              <p><button className="btn btn-dark" type="submit">{t("employer.docs.upload")}</button></p>
            </form>
          )}
        </div>
      )}
    </>
  );
}
