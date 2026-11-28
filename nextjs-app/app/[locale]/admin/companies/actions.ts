"use server";
import { revalidateTag } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { errorKey } from "@/lib/errors";
import { formToObject, parseWith, redirectWith } from "@/lib/forms";
import { createT } from "@/lib/i18n";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { findEmployerByEmail } from "@/lib/services/admin";
import type { InviteState } from "@/components/admin/InviteForm";
import {
  addMemberSchema, companyFieldsSchema, createCompanySchema, inviteSchema, memberRefSchema, memberRoleSchema,
  revokeInviteSchema, verificationSchema
} from "@/lib/validation/admin";
import { uuid } from "@/lib/validation/common";
import { adminAction, uuidOrNull } from "../_ctx";

const listPath = (l: string) => `/${l}/admin/companies`;

/** Where to return after acting on a company (falls back to the list if the id is malformed). */
function companyBack(path: (p?: string) => string, id: unknown) {
  const u = uuidOrNull(id);
  return u ? path(`/companies/${u}`) : path("/companies");
}

export async function setVerificationAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, listPath);
  const back = companyBack(path, o.company);
  const p = parseWith(verificationSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const { error } = await supabase.rpc("admin_set_company_verification", {
    p_company: p.data.company, p_status: p.data.status, p_note: p.data.note || null
  });
  if (error) redirectWith(back, { error: errorKey(error) });
  revalidateTag("public-data");
  redirectWith(back, { msg: `admin.msg.company_${p.data.status}` });
}

const editSchema = companyFieldsSchema.extend({ company: uuid });

export async function saveCompanyAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, listPath);
  const back = companyBack(path, o.company);
  const p = parseWith(editSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const d = p.data;
  const { data: updated, error } = await supabase.from("companies").update({
    name: d.name, description: d.description ?? "", industry: d.industry ?? null, website: d.website ?? null,
    country: d.country ?? "Pakistan", city: d.city ?? null, size: d.size ?? null
  }).eq("id", d.company).select("id");
  if (error) redirectWith(back, { error: errorKey(error) });
  if (!updated?.length) redirectWith(back, { error: "err.company_not_found" });
  const priv = await supabase.from("company_private").upsert(
    { company_id: d.company, email: d.email ?? null, phone: d.phone ?? null, address: d.address ?? null },
    { onConflict: "company_id" }
  );
  if (priv.error) redirectWith(back, { error: errorKey(priv.error) });
  revalidateTag("public-data");
  redirectWith(back, { msg: "common.saved" });
}

export async function createCompanyAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, (l) => `/${l}/admin/companies/new`);
  const back = path("/companies/new");
  const p = parseWith(createCompanySchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const d = p.data;
  const { data: id, error } = await supabase.rpc("admin_create_company", {
    p_name: d.name, p_description: d.description ?? "", p_industry: d.industry ?? null, p_website: d.website ?? null,
    p_email: d.email ?? null, p_phone: d.phone ?? null, p_country: d.country ?? "Pakistan", p_city: d.city ?? null,
    p_address: d.address ?? null, p_size: d.size ?? null, p_verified: d.verified
  });
  if (error || typeof id !== "string") redirectWith(back, { error: errorKey(error) });
  revalidateTag("public-data");
  const target = path(`/companies/${id}`);
  if (!d.ownerEmail) redirectWith(target, { msg: "admin.msg.companyCreated" });
  const owner = await findEmployerByEmail(supabase, d.ownerEmail);
  if (!owner) redirectWith(`${target}?owner=${encodeURIComponent(d.ownerEmail)}`, { msg: "admin.msg.companyCreatedNoOwner" });
  const add = await supabase.rpc("admin_add_member", { p_company: id, p_user: owner.id, p_role: "owner" });
  if (add.error) redirectWith(target, { error: errorKey(add.error) });
  redirectWith(target, { msg: "admin.msg.companyCreatedOwner" });
}

// ------------------------------------------------------------------ members
export async function setMemberRoleAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, listPath);
  const back = companyBack(path, o.company);
  const p = parseWith(memberRoleSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const { error } = await supabase.rpc("set_member_role", { p_company: p.data.company, p_user: p.data.user, p_role: p.data.role });
  if (error) redirectWith(back, { error: errorKey(error) });
  redirectWith(back, { msg: "admin.msg.memberRole" });
}

export async function removeMemberAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, listPath);
  const back = companyBack(path, o.company);
  const p = parseWith(memberRefSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const { error } = await supabase.rpc("remove_member", { p_company: p.data.company, p_user: p.data.user });
  if (error) redirectWith(back, { error: errorKey(error) });
  redirectWith(back, { msg: "admin.msg.memberRemoved" });
}

export async function transferOwnershipAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, listPath);
  const back = companyBack(path, o.company);
  const p = parseWith(memberRefSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const { error } = await supabase.rpc("transfer_company_ownership", { p_company: p.data.company, p_new_owner: p.data.user });
  if (error) redirectWith(back, { error: errorKey(error) });
  redirectWith(back, { msg: "admin.msg.ownershipTransferred" });
}

export async function addMemberAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, listPath);
  const back = companyBack(path, o.company);
  const p = parseWith(addMemberSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const employer = await findEmployerByEmail(supabase, p.data.email);
  if (!employer) redirectWith(back, { error: "err.member_not_found" });
  const { error } = await supabase.rpc("admin_add_member", { p_company: p.data.company, p_user: employer.id, p_role: p.data.role });
  if (error) redirectWith(back, { error: errorKey(error) });
  redirectWith(back, { msg: "admin.msg.memberAdded" });
}

// ------------------------------------------------------------------ invitations
/**
 * Creates an invitation. Only the token HASH is stored. The raw accept link is returned in the action
 * result (shown once to the admin) when e-mail is not configured or fails; it never appears in a URL.
 */
export async function createInvitationAction(_prev: InviteState, fd: FormData): Promise<InviteState> {
  const o = formToObject(fd);
  const locale = isLocale(o.locale) ? o.locale : DEFAULT_LOCALE;
  const t = createT(locale);
  const { supabase, user } = await requireRole(locale, ["admin"]);
  if (!(await rateLimit("admin-invite", { ...LIMITS.invite, identifier: user.id }))) return { error: t("err.rate_limited") };
  const p = parseWith(inviteSchema, o);
  if (!p.ok) return { error: t(p.error) };

  const token = generateToken();
  const { error } = await supabase.rpc("create_company_invitation", {
    p_company: p.data.company, p_email: p.data.email, p_role: p.data.role, p_token_hash: hashToken(token), p_ttl_hours: 168
  });
  if (error) return { error: t(errorKey(error)) };

  const link = `${siteUrl()}/${locale}/invitations/accept?token=${token}`;
  const { data: company } = await supabase.from("companies").select("name").eq("id", p.data.company).maybeSingle();
  const emailed = await sendEmail({
    to: p.data.email,
    subject: t("admin.invite.emailSubject", { company: company?.name ?? "" }),
    text: t("admin.invite.emailBody", { company: company?.name ?? "", role: t(`member.${p.data.role}`), link })
  });
  return { email: p.data.email, emailed, link: emailed ? undefined : link };
}

export async function revokeInvitationAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, listPath);
  const back = companyBack(path, o.company);
  const p = parseWith(revokeInviteSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const { error } = await supabase.rpc("revoke_company_invitation", { p_invitation: p.data.invitation });
  if (error) redirectWith(back, { error: errorKey(error) });
  redirectWith(back, { msg: "admin.msg.invitationRevoked" });
}
