import Link from "next/link";
import { notFound } from "next/navigation";
import CompanyFields from "@/components/admin/CompanyFields";
import InviteForm from "@/components/admin/InviteForm";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import ConfirmButton from "@/components/ui/ConfirmButton";
import Flash from "@/components/ui/Flash";
import StatusBadge from "@/components/ui/StatusBadge";
import { getCompanyDetail } from "@/lib/services/admin";
import { formatDate, formatDateTime, one } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../../_ctx";
import {
  addMemberAction, createInvitationAction, removeMemberAction, revokeInvitationAction, saveCompanyAction,
  setMemberRoleAction, setVerificationAction, transferOwnershipAction
} from "../actions";

export default async function AdminCompanyDetailPage(props: PageProps<{ id: string }>) {
  const { locale, t, sp, supabase, path, params } = await adminPage(props);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const d = await getCompanyDetail(supabase, params.id);
  if (!d) notFound();
  const { company, priv } = d;
  const ownerPrefill = /^\S+@\S+\.\S+$/.test(one(sp.owner) ?? "") ? (one(sp.owner) as string) : "";
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="company" value={company.id} />
    </>
  );
  const roleOptions = (["owner", "recruiter", "viewer"] as const).map((r) => ({ value: r, label: t(`member.${r}`) }));

  return (
    <>
      <Breadcrumbs t={t} items={[{ label: t("admin.tab.companies"), href: path("/companies") }, { label: company.name }]} />
      <Flash params={sp} t={t} />
      <h2 style={{ marginTop: 0 }}>
        {company.name} <StatusBadge kind="companyStatus" value={company.verification_status} t={t} />{" "}
        <span className="badge badge-gray">{t(`admin.company.managed.${company.managed_by}`)}</span>
      </h2>
      <p className="muted">
        {t("common.created")}: {formatDateTime(company.created_at, locale)}
        {company.verified_at && <> · {t("admin.company.verifiedAt")}: {formatDateTime(company.verified_at, locale)}</>}
        {company.verification_status === "verified" && <> · <Link href={`/${locale}/companies/${company.slug}`}>{t("admin.company.publicPage")}</Link></>}
      </p>

      <section className="panel" aria-labelledby="verification">
        <h2 id="verification">{t("admin.company.verification")}</h2>
        {priv?.verification_note && <p className="notice"><b>{t("admin.company.lastNote")}:</b> {priv.verification_note}</p>}
        <div className="row-actions">
          {company.verification_status !== "verified" && (
            <form action={setVerificationAction}>{hidden}<input type="hidden" name="status" value="verified" />
              <ConfirmButton className="btn btn-green btn-small" message={t("admin.company.confirmVerify")}>{t("admin.company.verify")}</ConfirmButton></form>
          )}
          {company.verification_status !== "pending" && (
            <form action={setVerificationAction}>{hidden}<input type="hidden" name="status" value="pending" />
              <ConfirmButton className="btn btn-outline btn-small" message={t("action.confirm")}>{t("admin.company.backToPending")}</ConfirmButton></form>
          )}
        </div>
        <form action={setVerificationAction}>
          {hidden}
          <label htmlFor="ver-note">{t("admin.company.note")}</label>
          <textarea id="ver-note" name="note" maxLength={1000} style={{ minHeight: 70 }} />
          <p className="muted">{t("admin.company.noteHelp")}</p>
          <p className="row-actions">
            <button className="btn btn-danger btn-small" type="submit" name="status" value="rejected">{t("admin.company.reject")}</button>
            <button className="btn btn-danger btn-small" type="submit" name="status" value="suspended">{t("admin.company.suspend")}</button>
          </p>
        </form>
      </section>

      <section className="panel" aria-labelledby="documents">
        <h2 id="documents">{t("admin.company.documents")}</h2>
        <p className="muted">{t("admin.company.documentsHelp")}</p>
        {d.documents.length === 0 ? <p className="muted">{t("admin.company.noDocuments")}</p> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{t("admin.company.file")}</th><th>{t("admin.company.docType")}</th><th>{t("common.date")}</th><th /></tr></thead>
              <tbody>
                {d.documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.file_name}</td>
                    <td>{t(`admin.company.doc.${doc.doc_type}`)}</td>
                    <td>{formatDate(doc.created_at, locale)}</td>
                    <td><a className="btn btn-outline btn-small" href={path(`/companies/${company.id}/documents/${doc.id}`)} target="_blank" rel="noopener noreferrer">{t("action.view")}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="edit">
        <h2 id="edit">{t("admin.company.edit")}</h2>
        <form action={saveCompanyAction}>
          {hidden}
          <CompanyFields t={t} v={{
            name: company.name, description: company.description, industry: company.industry, website: company.website,
            country: company.country, city: company.city, size: company.size,
            email: priv?.email, phone: priv?.phone, address: priv?.address
          }} />
          <p><button className="btn btn-dark" type="submit">{t("action.saveChanges")}</button></p>
        </form>
      </section>

      <section className="panel" aria-labelledby="members">
        <h2 id="members">{t("admin.company.members")}</h2>
        {d.members.length === 0 ? <p className="notice warn">{t("admin.company.noMembers")}</p> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{t("common.name")}</th><th>{t("common.email")}</th><th>{t("admin.company.role")}</th><th>{t("common.actions")}</th></tr></thead>
              <tbody>
                {d.members.map((m) => (
                  <tr key={m.user_id}>
                    <td>{m.name || "—"} {m.status === "suspended" && <StatusBadge kind="accountStatus" value="suspended" t={t} />}</td>
                    <td><span className="ltr">{m.email}</span></td>
                    <td>
                      {m.role === "owner" ? <StatusBadge kind="member" value="owner" t={t} /> : (
                        <form action={setMemberRoleAction} className="inline-form">
                          {hidden}<input type="hidden" name="user" value={m.user_id} />
                          <select name="role" defaultValue={m.role} aria-label={t("admin.company.role")}>
                            <option value="recruiter">{t("member.recruiter")}</option>
                            <option value="viewer">{t("member.viewer")}</option>
                          </select>
                          <button className="btn btn-outline btn-small" type="submit">{t("action.save")}</button>
                        </form>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {m.role !== "owner" && (
                          <form action={transferOwnershipAction}>{hidden}<input type="hidden" name="user" value={m.user_id} />
                            <ConfirmButton className="btn btn-outline btn-small" message={t("admin.company.confirmTransfer")}>{t("admin.company.transfer")}</ConfirmButton></form>
                        )}
                        <form action={removeMemberAction}>{hidden}<input type="hidden" name="user" value={m.user_id} />
                          <ConfirmButton className="btn btn-danger btn-small" message={t("admin.company.confirmRemove")}>{t("action.remove")}</ConfirmButton></form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3>{t("admin.company.addMember")}</h3>
        <p className="muted">{t("admin.company.addMemberHelp")}</p>
        <form action={addMemberAction} className="inline-form">
          {hidden}
          <div>
            <label htmlFor="add-email">{t("common.email")}</label>
            <input id="add-email" name="email" type="email" required autoComplete="off" />
          </div>
          <div>
            <label htmlFor="add-role">{t("admin.company.role")}</label>
            <select id="add-role" name="role" defaultValue="recruiter">
              {roleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <button className="btn btn-dark btn-small" type="submit">{t("action.add")}</button>
        </form>
      </section>

      <section className="panel" aria-labelledby="invitations">
        <h2 id="invitations">{t("admin.company.invitations")}</h2>
        {d.invitations.length === 0 ? <p className="muted">{t("admin.company.noInvitations")}</p> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{t("common.email")}</th><th>{t("admin.company.role")}</th><th>{t("admin.company.expires")}</th><th /></tr></thead>
              <tbody>
                {d.invitations.map((i) => {
                  const expired = new Date(i.expires_at).getTime() < Date.now();
                  return (
                    <tr key={i.id}>
                      <td><span className="ltr">{i.email}</span></td>
                      <td>{t(`member.${i.role}`)}</td>
                      <td>{formatDateTime(i.expires_at, locale)} {expired && <span className="badge badge-gray">{t("admin.company.expired")}</span>}</td>
                      <td>
                        <form action={revokeInvitationAction}>{hidden}<input type="hidden" name="invitation" value={i.id} />
                          <ConfirmButton className="btn btn-danger btn-small" message={t("action.confirm")}>{t("admin.company.revoke")}</ConfirmButton></form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <h3>{t("admin.company.invite")}</h3>
        <p className="muted">{t("admin.company.inviteHelp")}</p>
        <InviteForm
          action={createInvitationAction} locale={locale} company={company.id} defaultEmail={ownerPrefill}
          labels={{
            email: t("common.email"), role: t("admin.company.role"), submit: t("admin.company.sendInvite"), roles: roleOptions,
            emailedNote: t("admin.invite.emailed"), linkNote: t("admin.invite.linkOnce"), copy: t("action.copy"), copied: t("admin.invite.copied"),
            linkLabel: t("admin.invite.linkLabel")
          }}
        />
      </section>

      <section className="panel" aria-labelledby="jobs">
        <h2 id="jobs">{t("admin.company.jobs")}</h2>
        {d.jobs.length === 0 ? <p className="muted">{t("admin.company.noJobs")}</p> : (
          <ul className="timeline">
            {d.jobs.map((j) => (
              <li key={j.id}>
                <Link href={path(`/jobs/${j.id}`)}>{j.title || t("admin.job.untitled")}</Link> <StatusBadge kind="jobStatus" value={j.status} t={t} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
