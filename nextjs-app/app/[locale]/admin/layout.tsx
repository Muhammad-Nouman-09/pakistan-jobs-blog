import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminTabs from "@/components/admin/AdminTabs";
import { requireRole } from "@/lib/auth/session";
import { createT } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/config";
import { getBadgeCounts } from "@/lib/services/admin";
import { noindexMetadata } from "@/lib/seo/metadata";
import { adminPath } from "./_ctx";

// Per-user pages: always rendered on demand, never prerendered or cached.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return noindexMetadata(createT(isLocale(locale) ? locale : "en")("admin.title"));
}

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const t = createT(locale);
  const { supabase, user } = await requireRole(locale, ["admin"], adminPath(locale));
  const counts = await getBadgeCounts(supabase, user.id);
  const p = (s = "") => adminPath(locale, s);
  const items = [
    { href: p(), label: t("admin.tab.overview"), exact: true },
    { href: p("/jobs"), label: t("admin.tab.jobs"), badge: counts.pendingJobs },
    { href: p("/companies"), label: t("admin.tab.companies"), badge: counts.pendingCompanies },
    { href: p("/users"), label: t("admin.tab.users") },
    { href: p("/applications"), label: t("admin.tab.applications") },
    { href: p("/categories"), label: t("admin.tab.categories") },
    { href: p("/blog"), label: t("admin.tab.blog") },
    { href: p("/messages"), label: t("admin.tab.messages") },
    { href: p("/notifications"), label: t("admin.tab.notifications"), badge: counts.unread },
    { href: p("/reports"), label: t("admin.tab.reports") },
    { href: p("/settings"), label: t("admin.tab.settings") },
    { href: p("/audit"), label: t("admin.tab.audit") }
  ];
  return (
    <main className="section">
      <div className="container">
        <h1 style={{ fontSize: 30, margin: "0 0 14px" }}>{t("admin.title")}</h1>
        <AdminTabs items={items} label={t("admin.tabsLabel")} />
        {children}
      </div>
    </main>
  );
}
