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
  const [open, setOpen] = useState(false);
  // Close the mobile menu on navigation and on Escape.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
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
  // "Post a Job" is only for signed-in employers (hidden while the session is loading, and for everyone else).
  const showPostJob = user?.role === "employer";

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="logo" href={localePath(locale)}>
          <span className="logo-mark">PJ</span>
          <span><span className="logo-name">{labels.siteName}</span><br /><span className="logo-sub">{labels.siteSub}</span></span>
        </Link>
        <button type="button" className="nav-toggle" aria-expanded={open} aria-controls="site-menu" aria-label={labels.menu} onClick={() => setOpen((o) => !o)}>
          <span className="nav-toggle-bar" aria-hidden="true" />
        </button>
        {/* One set of links/actions for every screen size; CSS turns this into a dropdown panel on small screens. */}
        <div id="site-menu" className={`header-menu${open ? " open" : ""}`} onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>
        <nav className="main-nav" aria-label={labels.menu}>
          {NAV.map(([href, label]) => (
            <Link key={href} href={localePath(locale, href)} className={isActive(href) ? "active" : undefined} aria-current={isActive(href) ? "page" : undefined}>{label}</Link>
          ))}
        </nav>
        <div className="header-actions">
          {showPostJob && <Link className="btn btn-dark" href={localePath(locale, "/employer/jobs/new")}>{labels.postJob}</Link>}
          <Suspense fallback={null}><LanguageSwitcher locale={locale} label={labels.language} /></Suspense>
          <span className="header-auth">
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
      </div>
    </header>
  );
}
