import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import CopyField from "@/components/employer/CopyField";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import ConfirmButton from "@/components/ui/ConfirmButton";
import Flash from "@/components/ui/Flash";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireRole } from "@/lib/auth/session";
import { siteUrl } from "@/lib/env";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { invitationState, loadCompanyDetail, loadInvitations, loadTeam } from "@/lib/services/employer";
import { INVITE_ROLES, uuidOrEmpty } from "@/lib/validation/company";
import { formatDateTime } from "@/lib/utils";
import {
  dismissInviteLinkAction, inviteMemberAction, leaveCompanyAction, removeMemberAction, revokeInvitationAction, setMemberRoleAction,
  transferOwnershipAction
} from "../../team-actions";
import { INVITE_COOKIE } from "../../../ctx";

function Hidden({ locale, companyId }: { locale: string; companyId: string }) {
  return (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="company_id" value={companyId} />
    </>
  );
}

export default async function TeamPage(props: PageProps<{ id: string }>) {
  const { locale, t, sp, params } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["employer"]);
  const id = uuidOrEmpty(params.id);
  if (!id) notFound();
  const detail = await loadCompanyDetail(supabase, id, user.id);
  if (!detail) notFound();
  const { company, role } = detail;
  const isOwner = role === "owner";
  const [team, invitations] = await Promise.all([loadTeam(supabase, id), isOwner ? loadInvitations(supabase, id) : Promise.resolve([])]);
  const L = (path: string) => localePath(locale, `/employer${path}`);

  // A link created while e-mail is not configured is handed over once via a short-lived httpOnly cookie.
  const token = isOwner ? (await cookies()).get(INVITE_COOKIE)?.value : undefined;
  const inviteLink = token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? `${siteUrl()}/${locale}/invitations/accept?token=${token}` : null;
  const transferable = team.filter((m) => m.user_id !== user.id);

  return (
    <>
      <Breadcrumbs t={t} items={[
        { label: t("employer.tab.companies"), href: L("/companies") },
        { label: company.name, href: L(`/companies/${id}`) },
        { label: t("employer.team.title") }
      ]} />
      <Flash params={sp} t={t} />

      {inviteLink && (
        <div className="panel">
          <h2>{t("employer.invite.linkTitle")}</h2>
          <p className="notice warn">{t("employer.invite.linkWarning")}</p>
          <CopyField id="invite-link" value={inviteLink} label={t("employer.invite.link")} copyLabel={t("action.copy")} copiedLabel={t("employer.invite.copied")} />
          <form action={dismissInviteLinkAction}>
            <Hidden locale={locale} companyId={id} />
            <p><button className="btn btn-outline btn-small" type="submit">{t("employer.invite.hide")}</button></p>
          </form>
        </div>
      )}

      <div className="panel">
        <h2>{t("employer.team.members")} — {company.name}</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>{t("common.name")}</th><th>{t("common.email")}</th><th>{t("employer.team.role")}</th><th>{t("common.actions")}</th></tr></thead>
            <tbody>
              {team.map((m) => {
                const self = m.user_id === user.id;
                return (
                  <tr key={m.user_id}>
                    <td>{m.full_name || "—"}{self && <> <span className="badge badge-gray">{t("employer.team.you")}</span></>}</td>
                    <td><span className="ltr">{m.email}</span></td>
                    <td><StatusBadge kind="member" value={m.role} t={t} /></td>
                    <td>
                      <div className="row-actions">
                        {isOwner && m.role !== "owner" && (
                          <form action={setMemberRoleAction} className="inline-form">
                            <Hidden locale={locale} companyId={id} />
                            <input type="hidden" name="user_id" value={m.user_id} />
                            <select name="role" aria-label={t("employer.team.role")} defaultValue={m.role}>
                              {INVITE_ROLES.map((r) => <option key={r} value={r}>{t(`member.${r}`)}</option>)}
                            </select>
                            <button className="btn btn-outline btn-small" type="submit">{t("action.save")}</button>
                          </form>
                        )}
                        {isOwner && m.role !== "owner" && !self && (
                          <form action={removeMemberAction}>
                            <Hidden locale={locale} companyId={id} />
                            <input type="hidden" name="user_id" value={m.user_id} />
                            <ConfirmButton className="btn btn-danger btn-small" message={t("employer.team.removeConfirm")}>{t("action.remove")}</ConfirmButton>
                          </form>
                        )}
                        {self && (
                          <form action={leaveCompanyAction}>
                            <Hidden locale={locale} companyId={id} />
                            <ConfirmButton className="btn btn-danger btn-small" message={t("employer.team.leaveConfirm")}>{t("employer.team.leave")}</ConfirmButton>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted">{t("employer.team.rolesHelp")}</p>
      </div>

      {isOwner && (
        <>
          <div className="panel">
            <h2>{t("employer.invite.title")}</h2>
            <p className="muted">{t("employer.invite.help")}</p>
            <form action={inviteMemberAction}>
              <Hidden locale={locale} companyId={id} />
              <div className="grid-2">
                <div>
                  <label htmlFor="invite-email">{t("common.email")} *</label>
                  <input id="invite-email" name="email" type="email" required maxLength={200} autoComplete="off" />
                </div>
                <div>
                  <label htmlFor="invite-role">{t("employer.team.role")} *</label>
                  <select id="invite-role" name="role" defaultValue="recruiter">
                    {INVITE_ROLES.map((r) => <option key={r} value={r}>{t(`member.${r}`)}</option>)}
                  </select>
                </div>
              </div>
              <p><button className="btn btn-dark" type="submit">{t("employer.invite.send")}</button></p>
            </form>

            {invitations.length > 0 && (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>{t("common.email")}</th><th>{t("employer.team.role")}</th><th>{t("common.status")}</th><th>{t("employer.invite.expires")}</th><th>{t("common.actions")}</th></tr></thead>
                  <tbody>
                    {invitations.map((i) => {
                      const state = invitationState(i);
                      return (
                        <tr key={i.id}>
                          <td><span className="ltr">{i.email}</span></td>
                          <td>{t(`member.${i.role}`)}</td>
                          <td><span className={`badge ${state === "accepted" ? "" : state === "pending" ? "badge-amber" : "badge-gray"}`}>{t(`employer.invite.state.${state}`)}</span></td>
                          <td>{formatDateTime(i.expires_at, locale)}</td>
                          <td>
                            {state === "pending" && (
                              <form action={revokeInvitationAction}>
                                <Hidden locale={locale} companyId={id} />
                                <input type="hidden" name="invitation_id" value={i.id} />
                                <ConfirmButton className="btn btn-danger btn-small" message={t("action.confirm")}>{t("employer.invite.revoke")}</ConfirmButton>
                              </form>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <h2>{t("employer.team.transfer")}</h2>
            <p className="muted">{t("employer.team.transferHelp")}</p>
            {transferable.length === 0 ? <p>{t("employer.team.transferNone")}</p> : (
              <form action={transferOwnershipAction}>
                <Hidden locale={locale} companyId={id} />
                <label htmlFor="new-owner">{t("employer.team.newOwner")}</label>
                <select id="new-owner" name="user_id" required defaultValue="">
                  <option value="" disabled>{t("employer.team.chooseMember")}</option>
                  {transferable.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email} ({t(`member.${m.role}`)})</option>)}
                </select>
                <p><ConfirmButton className="btn btn-danger" message={t("employer.team.transferConfirm")}>{t("employer.team.transferSubmit")}</ConfirmButton></p>
              </form>
            )}
          </div>
        </>
      )}
    </>
  );
}
