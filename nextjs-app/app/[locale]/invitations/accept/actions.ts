"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { formToObject, parseWith, redirectWith } from "@/lib/forms";
import { errorKey } from "@/lib/errors";
import { DEFAULT_LOCALE, isLocale, localePath, type Locale } from "@/lib/i18n/config";
import { requireRole } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { hashToken } from "@/lib/security/tokens";
import { acceptInviteSchema, uuidOrEmpty } from "@/lib/validation/company";

/**
 * Accepts a company invitation. The database function checks that the token hash matches a live invitation
 * for the caller's VERIFIED e-mail; every failure is reported with the same message (nothing about why a
 * token is invalid is revealed). The raw token never leaves this request — only its hash is compared.
 */
export async function acceptInvitationAction(fd: FormData) {
  const o = formToObject(fd);
  const locale: Locale = isLocale(o.locale) ? o.locale : DEFAULT_LOCALE;
  const parsed = parseWith(acceptInviteSchema, { token: o.token });
  const base = localePath(locale, "/invitations/accept");
  const back = parsed.ok ? `${base}?token=${encodeURIComponent(parsed.data.token)}` : base;
  const { supabase, user } = await requireRole(locale, ["employer", "job_seeker", "admin"], back);
  // Tight limit: this endpoint must not be usable to probe tokens.
  if (!(await rateLimit("invite-accept", { limit: 10, windowSec: 600, identifier: user.id }))) redirectWith(back, { error: "err.rate_limited" });
  if (!parsed.ok) redirectWith(back, { error: "err.invalid_invitation" });

  const { data: companyId, error } = await supabase.rpc("accept_company_invitation", { p_token_hash: hashToken(parsed.data.token) });
  if (error || !companyId) redirectWith(back, { error: errorKey(error) });
  const id = uuidOrEmpty(companyId);
  revalidatePath(localePath(locale, "/employer/companies"));
  if (!id) redirect(localePath(locale, "/employer/companies"));
  redirectWith(localePath(locale, `/employer/companies/${id}`), { msg: "employer.joined" });
}
