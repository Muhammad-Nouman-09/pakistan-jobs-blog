import type { Metadata } from "next";
import StaticPage from "@/components/StaticPage";
import { createT } from "@/lib/i18n";
import { pageCtx, type PageProps } from "@/lib/page";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = raw === "ur" ? "ur" : "en";
  const t = createT(locale);
  return pageMetadata({ locale, path: "/terms", title: t("terms.title"), description: t("terms.metaDescription") });
}

export default async function Terms(props: PageProps) {
  const { locale, t } = await pageCtx(props);
  return <StaticPage prefix="terms" locale={locale} t={t} />;
}
