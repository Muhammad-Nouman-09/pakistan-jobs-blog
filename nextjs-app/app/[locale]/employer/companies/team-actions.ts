"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { parseWith, redirectWith } from "@/lib/forms";
import { errorKey } from "@/lib/errors";
import { createT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { siteUrl } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { LIMITS } from "@/lib/security/rate-limit";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { inviteSchema, memberRoleSchema, memberTargetSchema, revokeInviteSchema, uuidOrEmpty } from "@/lib/validation/company";
import { beginAction, employerPath, INVITE_COOKIE, myRole } from "../ctx";

const teamPath = (l: Locale, o: Record<string, any>) => {
  const id = uuidOrEmpty(o.company_id);
  return id ? employerPath(l, `/companies/${id}/team`) : employerPath(l, "/companies");
};

export async function setMemberRoleAction(fd: FormData) {
  const c = await beginAction(fd, "team-role", (o, l) => teamPath(l, o));
  const p = parseWith(memberRoleSchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  if ((await myRole(c.supabase, p.data.company_id, c.user.id)) !== "owner") redirectWith(c.back, { error: "err.forbidden" });
  const { error } = await c.supabase.rpc("set_member_role", { p_company: p.data.company_id, p_user: p.data.user_id, p_role: p.data.role });
  if (error) redirectWith(c.back, { error: errorKey(error) });
  revalidatePath(c.back);
  redirectWith(c.back, { msg: "employer.roleChanged" });
}

/** Owner removes another member. (Leaving is a separate action so the intent is explicit.) */
export async function removeMemberAction(fd: FormData) {
  const c = await beginAction(fd, "team-remove", (o, l) => teamPath(l, o));
  const p = parseWith(memberTargetSchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  if (p.data.user_id === c.user.id) redirectWith(c.back, { error: "err.invalid" });
  if ((await myRole(c.supabase, p.data.company_id, c.user.id)) !== "owner") redirectWith(c.back, { error: "err.forbidden" });
  const { error } = await c.supabase.rpc("remove_member", { p_company: p.data.company_id, p_user: p.data.user_id });
  if (error) redirectWith(c.back, { error: errorKey(error) });
  revalidatePath(c.back);
  redirectWith(c.back, { msg: "employer.memberRemoved" });
}

/** Any member can leave. The database refuses when they are the last owner (err.last_owner). */
export async function leaveCompanyAction(fd: FormData) {
  const c = await beginAction(fd, "team-leave", (o, l) => teamPath(l, o));
  const id = uuidOrEmpty(c.o.company_id);
  if (!id) redirectWith(c.back, { error: "err.company_not_found" });
  const { error } = await c.supabase.rpc("remove_member", { p_company: id, p_user: c.user.id });
  if (error) redirectWith(c.back, { error: errorKey(error) });
  revalidatePath(employerPath(c.locale, "/companies"));
  redirectWith(employerPath(c.locale, "/companies"), { msg: "employer.left" });
}

export async function transferOwnershipAction(fd: FormData) {
  const c = await beginAction(fd, "team-transfer", (o, l) => teamPath(l, o));
  const p = parseWith(memberTargetSchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  if (p.data.user_id === c.user.id) redirectWith(c.back, { error: "err.invalid" });
  if ((await myRole(c.supabase, p.data.company_id, c.user.id)) !== "owner") redirectWith(c.back, { error: "err.forbidden" });
  const { error } = await c.supabase.rpc("transfer_company_ownership", { p_company: p.data.company_id, p_new_owner: p.data.user_id });
  if (error) redirectWith(c.back, { error: errorKey(error) });
  revalidatePath(c.back);
  redirectWith(c.back, { msg: "employer.ownershipTransferred" });
}

/**
 * Creates an invitation. Only the SHA-256 hash of the token is stored. The link is e-mailed when e-mail is
 * configured; otherwise it is handed to the owner ONCE through a short-lived, path-scoped, httpOnly cookie
 * (never a URL parameter) so it can be shared privately. The link is useless to anyone but the invited address.
 */
export async function inviteMemberAction(fd: FormData) {
  const c = await beginAction(fd, "team-invite", (o, l) => teamPath(l, o), LIMITS.invite);
  const p = parseWith(inviteSchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  const { company_id: companyId, email, role } = p.data;
  if ((await myRole(c.supabase, companyId, c.user.id)) !== "owner") redirectWith(c.back, { error: "err.forbidden" });

  const token = generateToken();
  const { error } = await c.supabase.rpc("create_company_invitation", {
    p_company: companyId, p_email: email, p_role: role, p_token_hash: hashToken(token), p_ttl_hours: 168
  });
  if (error) redirectWith(c.back, { error: errorKey(error) });

  const link = `${siteUrl()}/${c.locale}/invitations/accept?token=${token}`;
  const { data: company } = await c.supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  const t = createT(c.locale);
  const sent = await sendEmail({
    to: email,
    subject: t("employer.invite.emailSubject", { company: (company as { name: string } | null)?.name ?? "" }),
    text: t("employer.invite.emailBody", { company: (company as { name: string } | null)?.name ?? "", role: t(`member.${role}`), link })
  });
  revalidatePath(c.back);
  if (sent) redirectWith(c.back, { msg: "employer.inviteSent" });

  (await cookies()).set(INVITE_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 120, path: c.back
  });
  redirectWith(c.back, { msg: "employer.inviteLinkReady" });
}

export async function dismissInviteLinkAction(fd: FormData) {
  const c = await beginAction(fd, "team-invite-dismiss", (o, l) => teamPath(l, o));
  (await cookies()).delete({ name: INVITE_COOKIE, path: c.back });
  redirectWith(c.back, {});
}

export async function revokeInvitationAction(fd: FormData) {
  const c = await beginAction(fd, "team-revoke", (o, l) => teamPath(l, o));
  const p = parseWith(revokeInviteSchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  if ((await myRole(c.supabase, p.data.company_id, c.user.id)) !== "owner") redirectWith(c.back, { error: "err.forbidden" });
  const { error } = await c.supabase.rpc("revoke_company_invitation", { p_invitation: p.data.invitation_id });
  if (error) redirectWith(c.back, { error: errorKey(error) });
  revalidatePath(c.back);
  redirectWith(c.back, { msg: "employer.inviteRevoked" });
}
