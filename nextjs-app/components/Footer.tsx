import Link from "next/link";
import type { TFunction } from "@/lib/i18n";
import { localePath, type Locale } from "@/lib/i18n/config";

export default function Footer({ locale, t }: { locale: Locale; t: TFunction }) {
  const l = (p: string) => localePath(locale, p);
  return (
    <footer>
      <div className="container footer-grid">
        <div>
          <b>{t("site.name")}</b>
          <p>{t("footer.about")}</p>
        </div>
        <nav aria-label={t("footer.jobs")}>
          <b>{t("footer.jobs")}</b>
          <Link href={l("/")}>{t("nav.home")}</Link>
          <Link href={l("/jobs")}>{t("nav.jobs")}</Link>
          <Link href={l("/companies")}>{t("nav.companies")}</Link>
          <Link href={l("/auth/register?role=employer")}>{t("footer.employers")}</Link>
        </nav>
        <nav aria-label={t("footer.resources")}>
          <b>{t("footer.resources")}</b>
          <Link href={l("/blog")}>{t("nav.blog")}</Link>
          <Link href={l("/blog?category=career-guides")}>{t("blog.cat.career-guides")}</Link>
          <Link href={l("/blog?category=interview-preparation")}>{t("blog.cat.interview-preparation")}</Link>
          <Link href={l("/blog?category=resume-writing")}>{t("blog.cat.resume-writing")}</Link>
        </nav>
        <nav aria-label={t("footer.site")}>
          <b>{t("footer.site")}</b>
          <Link href={l("/about")}>{t("nav.about")}</Link>
          <Link href={l("/contact")}>{t("nav.contact")}</Link>
          <Link href={l("/privacy")}>{t("footer.privacy")}</Link>
          <Link href={l("/terms")}>{t("footer.terms")}</Link>
          <Link href={l("/auth/login")}>{t("footer.signin")}</Link>
        </nav>
      </div>
      <div className="container">
        <p className="muted" style={{ marginTop: 16 }}>{t("footer.copyright", { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
