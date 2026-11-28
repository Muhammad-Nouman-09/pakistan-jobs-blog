import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { refreshSession } from "@/lib/supabase/middleware";

// Every page lives under /en or /ur. Visitors without a locale prefix are redirected (cookie preference,
// else English). The Supabase session cookies are refreshed here, and private areas are marked noindex.
const PRIVATE = /^\/(en|ur)\/(admin|employer|candidate|auth|invitations|dashboard)(\/|$)/;

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (!isLocale(first)) {
    const pref = request.cookies.get("NEXT_LOCALE")?.value;
    const locale = isLocale(pref) ? pref : DEFAULT_LOCALE;
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
    url.search = search;
    return NextResponse.redirect(url);
  }

  // Pass the pathname to server components (used by not-found to pick the language).
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  const response = NextResponse.next({ request: { headers } });
  if (PRIVATE.test(pathname)) response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return refreshSession(request, response);
}

export const config = {
  // Skip API routes, Next internals, the e-mail/OAuth callback and any file with an extension
  // (robots.txt, sitemap.xml, ads.txt, favicon, images).
  matcher: ["/((?!api|_next|auth/callback|.*\\..*).*)"]
};
