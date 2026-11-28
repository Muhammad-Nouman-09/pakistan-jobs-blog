import { notFound } from "next/navigation";
import EmployerTabs from "@/components/employer/EmployerTabs";
import { requireRole } from "@/lib/auth/session";
import { createT } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/config";
import { noindexMetadata } from "@/lib/seo/metadata";
import { unreadNotificationCount } from "@/lib/services/employer";

// Per-user pages: always rendered on demand, never prerendered or cached.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return noindexMetadata(createT(isLocale(locale) ? locale : "en")("employer.title"));
}

export default async function EmployerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = createT(locale);
  const { supabase, profile } = await requireRole(locale, ["employer"]);
  const unread = await unreadNotificationCount(supabase);
  const tabs = [
    { path: "/employer", label: t("employer.tab.overview") },
    { path: "/employer/companies", label: t("employer.tab.companies") },
    { path: "/employer/jobs", label: t("employer.tab.jobs") },
    { path: "/employer/jobs/new", label: t("employer.tab.newJob") },
    { path: "/employer/pending", label: t("employer.tab.pending") },
    { path: "/employer/applications", label: t("employer.tab.applications") },
    { path: "/employer/reports", label: t("employer.tab.reports") },
    { path: "/employer/notifications", label: t("employer.tab.notifications"), badge: unread },
    { path: "/employer/settings", label: t("employer.tab.settings") }
  ];
  return (
    <main className="section">
      <div className="container">
        <h1 style={{ fontSize: 30, margin: "0 0 4px" }}>{t("employer.title")}</h1>
        <p className="muted" style={{ margin: "0 0 14px" }}>{t("employer.welcome", { name: profile.full_name || profile.email })}</p>
        <EmployerTabs locale={locale} tabs={tabs} label={t("employer.title")} />
        {children}
      </div>
    </main>
  );
}
