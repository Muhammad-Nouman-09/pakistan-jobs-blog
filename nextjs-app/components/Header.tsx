"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { localePath, stripLocale, type Locale } from "@/lib/i18n/config";
import { signOutAction } from "@/app/[locale]/auth/actions";

export interface HeaderLabels {
  siteName: string; siteSub: string; home: string; jobs: string; companies: string; blog: string; about: string; contact: string;
  postJob: string; findJobs: string; signIn: string; joinFree: string; signOut: string; dashboard: string; language: string; menu: string;
}
type SessionUser = { name: string; role: "admin" | "employer" | "job_seeker" } | null;

const dash = { admin: "/admin", employer: "/employer", job_seeker: "/candidate" } as const;

/**
 * Same markup/classes as the original header. The signed-in state is fetched client-side from /api/session
 * so public pages stay cacheable (no cookies are read on the server for the page shell).
 */
export default function Header({ locale, labels }: { locale: Locale; labels: HeaderLabels }) {
  const pathname = stripLocale(usePathname() || "/");
  const [user, setUser] = useState<SessionUser | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch("/api/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => live && setUser(d.user))
      .catch(() => live && setUser(null));
    return () => { live = false; };
  }, [pathname]);

  const NAV: [string, string][] = [
    ["/", labels.home], ["/jobs", labels.jobs], ["/companies", labels.companies],
    ["/blog", labels.blog], ["/about", labels.about], ["/contact", labels.contact]
  ];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  const postJobHref =
    user?.role === "employer" ? localePath(locale, "/employer/jobs/new")
      : user ? localePath(locale, dash[user.role])
        : localePath(locale, "/auth/register?role=employer");

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="logo" href={localePath(locale)}>
          <span className="logo-mark">PJ</span>
          <span><span className="logo-name">{labels.siteName}</span><br /><span className="logo-sub">{labels.siteSub}</span></span>
        </Link>
        <nav className="main-nav" aria-label={labels.menu}>
          {NAV.map(([href, label]) => (
            <Link key={href} href={localePath(locale, href)} className={isActive(href) ? "active" : undefined} aria-current={isActive(href) ? "page" : undefined}>{label}</Link>
          ))}
        </nav>
        <div className="header-actions">
          <Link className="btn btn-dark" href={postJobHref}>{labels.postJob}</Link>
          <Link className="btn btn-green" href={localePath(locale, "/jobs")}>{labels.findJobs}</Link>
          <Suspense fallback={null}><LanguageSwitcher locale={locale} label={labels.language} /></Suspense>
          <span>
            {user === undefined ? null : !user ? (
              <>
                <Link className="btn btn-link" href={localePath(locale, "/auth/login")}>{labels.signIn}</Link>
                <Link className="btn btn-outline" href={localePath(locale, "/auth/register")}>{labels.joinFree}</Link>
              </>
            ) : (
              <>
                <Link className="btn btn-link" href={localePath(locale, dash[user.role])}>{user.name || labels.dashboard}</Link>
                <Link className="btn btn-dark btn-small" href={localePath(locale, dash[user.role])}>{labels.dashboard}</Link>
                <form action={signOutAction} style={{ display: "inline" }}>
                  <input type="hidden" name="locale" value={locale} />
                  <button className="btn btn-outline btn-small" type="submit">{labels.signOut}</button>
                </form>
              </>
            )}
          </span>
        </div>
      </div>
    </header>
  );
}
