import { notFound } from "next/navigation";
import AdminTabs from "@/components/admin/AdminTabs";
import { createT } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/config";
import { adminPath } from "../_ctx";

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = createT(locale);
  return (
    <>
      <AdminTabs
        label={t("admin.settings.tabs")}
        items={[
          { href: adminPath(locale, "/settings/general"), label: t("admin.settings.general") },
          { href: adminPath(locale, "/settings/seo"), label: t("admin.settings.seo") },
          { href: adminPath(locale, "/settings/adsense"), label: t("admin.settings.adsense") }
        ]}
      />
      {children}
    </>
  );
}
