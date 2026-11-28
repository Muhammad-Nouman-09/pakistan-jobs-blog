import { requireRole } from "@/lib/auth/session";
import { formToObject } from "@/lib/forms";
import { DEFAULT_LOCALE, isLocale, localePath, type Locale } from "@/lib/i18n/config";
import { pageCtx, type SP } from "@/lib/page";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createT, type TFunction } from "@/lib/i18n";
import { redirectWith } from "@/lib/forms";

/** Admin-area path with locale: adminPath("en", "/jobs/123") -> "/en/admin/jobs/123". */
export const adminPath = (locale: Locale, path = "") => localePath(locale, `/admin${path}`);

/**
 * Page context for every admin page. Layouts and pages render in parallel in the App Router, so each page
 * performs its own role check (cached per request) instead of relying on the layout.
 */
export async function adminPage<P extends Record<string, string> = Record<string, never>>(
  props: { params: Promise<{ locale: string } & P>; searchParams?: Promise<SP> }
) {
  const ctx = await pageCtx<P>(props);
  const session = await requireRole(ctx.locale, ["admin"]);
  return { ...ctx, ...session, path: (p = "") => adminPath(ctx.locale, p) };
}

/**
 * Context for admin server actions: parses the form, resolves the locale, requires an active admin session
 * (redirects otherwise) and applies the write rate limit. `back` is where errors redirect to.
 */
export async function adminAction(fd: FormData, back: (locale: Locale) => string) {
  const o = formToObject(fd);
  const locale: Locale = isLocale(o.locale) ? o.locale : DEFAULT_LOCALE;
  const session = await requireRole(locale, ["admin"]);
  const target = back(locale);
  if (!(await rateLimit("admin-write", { ...LIMITS.write, identifier: session.user.id }))) {
    redirectWith(target, { error: "err.rate_limited" });
  }
  return { o, locale, t: createT(locale) as TFunction, ...session, path: (p = "") => adminPath(locale, p) };
}

/** Pulls the UUID out of a raw form value (or null) so redirect targets never contain arbitrary text. */
export const uuidOrNull = (v: unknown): string | null =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
