import type { Metadata } from "next";
import StaticPage, { CtaLinks } from "@/components/StaticPage";
import { createT } from "@/lib/i18n";
import { pageCtx, type PageProps } from "@/lib/page";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = raw === "ur" ? "ur" : "en";
  const t = createT(locale);
  return pageMetadata({ locale, path: "/about", title: t("about.title"), description: t("about.metaDescription") });
}

export default async function About(props: PageProps) {
  const { locale, t } = await pageCtx(props);
  return <StaticPage prefix="about" locale={locale} t={t}><CtaLinks locale={locale} t={t} /></StaticPage>;
}
