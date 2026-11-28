import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createT } from "@/lib/i18n";
import { dirOf, isLocale, LOCALES, type Locale } from "@/lib/i18n/config";
import { siteUrl } from "@/lib/env";

export const dynamicParams = false;
export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = createT(locale);
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t("meta.defaultTitle"), template: `%s | ${t("site.name")}` },
    description: t("meta.defaultDescription"),
    applicationName: t("site.name"),
    openGraph: { siteName: t("site.name"), locale: locale === "ur" ? "ur_PK" : "en_PK", type: "website" }
  };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = createT(locale);
  const labels = {
    siteName: t("site.name"), siteSub: t("site.sub"), home: t("nav.home"), jobs: t("nav.jobs"), companies: t("nav.companies"), blog: t("nav.blog"),
    about: t("nav.about"), contact: t("nav.contact"), postJob: t("nav.postJob"), findJobs: t("nav.findJobs"), signIn: t("nav.signIn"),
    joinFree: t("nav.joinFree"), signOut: t("nav.signOut"), dashboard: t("nav.dashboard"), language: t("nav.language"), menu: t("nav.menu")
  };
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body>
        <a className="skip-link" href="#main">{t("nav.skip")}</a>
        <Header locale={locale} labels={labels} />
        <div id="main">{children}</div>
        <Footer locale={locale} t={t} />
      </body>
    </html>
  );
}
