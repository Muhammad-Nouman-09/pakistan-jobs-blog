"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

const NAV = [["/", "Home"], ["/find-jobs", "Find Jobs"], ["/about", "About Us"], ["/contact", "Contact Us"]];

export default function Header() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const pending = user && user.role === "employer" && user.status === "pending";
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="logo" href="/">
          <span className="logo-mark">PJ</span>
          <span><span className="logo-name">Pakistan Jobs</span><br /><span className="logo-sub">BLOG · PAKISTAN</span></span>
        </Link>
        <nav className="main-nav">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={pathname === href ? "active" : undefined}>{label}</Link>
          ))}
        </nav>
        <div className="header-actions">
          <Link className="btn btn-dark" href="/admin">POST A JOB</Link>
          <Link className="btn btn-green" href="/find-jobs">FIND JOBS</Link>
          <span>
            {loading ? null : !user ? (
              <>
                <Link className="btn btn-link" href="/auth">SIGN IN</Link>
                <Link className="btn btn-outline" href="/auth?mode=register">JOIN FREE</Link>
              </>
            ) : (
              <>
                <Link className="btn btn-link" href="/profile">{user.name}{pending ? " (pending)" : ""}</Link>
                {user.role === "admin" && <Link className="btn btn-dark btn-small" href="/admin">Admin Panel</Link>}
                <button className="btn btn-outline btn-small" onClick={logout}>Sign out</button>
              </>
            )}
          </span>
        </div>
      </div>
    </header>
  );
}
