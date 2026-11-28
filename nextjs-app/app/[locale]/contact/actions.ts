"use server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { formToObject, parseWith, redirectWith } from "@/lib/forms";
import { isLocale, localePath, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { emailField, text } from "@/lib/validation/common";

const schema = z.object({
  name: text(100, { required: true }), email: emailField, subject: text(200, { required: true }), message: text(5000, { required: true, min: 10 })
});

/**
 * Contact form. Anonymous, so it is protected by a honeypot field, a per-IP rate limit and strict
 * validation; the row is written with the service role (there is no insert policy for browsers).
 */
export async function contactAction(fd: FormData) {
  const o = formToObject(fd);
  const locale: Locale = isLocale(o.locale) ? o.locale : DEFAULT_LOCALE;
  const back = localePath(locale, "/contact");
  if (typeof o.website === "string" && o.website.trim() !== "") redirectWith(back, { msg: "contact.sent" });   // honeypot: bots fill it
  const p = parseWith(schema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  if (!(await rateLimit("contact", { ...LIMITS.contact }))) redirectWith(back, { error: "err.rate_limited" });
  const admin = createAdminClient();
  if (!admin) redirectWith(back, { error: "err.not_configured" });
  const { error } = await admin.from("contact_messages").insert({ ...p.data, locale });
  if (error) redirectWith(back, { error: "err.generic" });
  redirectWith(back, { msg: "contact.sent" });
}
