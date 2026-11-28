import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/forms";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

/**
 * Landing point for e-mail links (confirm sign-up, reset password). Supports both the PKCE `code` flow and
 * the `token_hash` + `type` flow. `next` must be a same-site path (open-redirect safe).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"), `/${DEFAULT_LOCALE}`);
  const seg = next.split("/")[1];
  const locale = isLocale(seg) ? seg : DEFAULT_LOCALE;
  const fail = NextResponse.redirect(`${origin}/${locale}/auth/login?error=err.link_expired`);

  const supabase = await createClient();
  if (!supabase) return fail;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  if (!ok) return fail;

  // After confirming an address, send people to sign in (or onward to the password-reset form).
  const target = next.includes("/auth/reset") ? next : `${next}${next.includes("?") ? "&" : "?"}msg=auth.emailConfirmed`;
  return NextResponse.redirect(`${origin}${target}`);
}
