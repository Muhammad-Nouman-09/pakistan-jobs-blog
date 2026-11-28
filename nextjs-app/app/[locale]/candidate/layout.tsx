import type { Metadata } from "next";
import type { ReactNode } from "react";
import CandidateTabs from "@/components/candidate/CandidateTabs";
import { requireRole } from "@/lib/auth/session";
import { createT } from "@/lib/i18n";
import { isLocale, localePath } from "@/lib/i18n/config";
import { notFound } from "next/navigation";
import { noindexMetadata } from "@/lib/seo/metadata";
import { countUnreadNotifications } from "@/lib/services/candidate";

// Per-user pages: always rendered on demand, never prerendered or cached.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return noindexMetadata(createT(isLocale(locale) ? locale : "en")("candidate.title"));
}

export default async function CandidateLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = createT(locale);
  const { supabase, user, profile } = await requireRole(locale, ["job_seeker"]);
  const unread = await countUnreadNotifications(supabase, user.id);
  const p = (path: string) => localePath(locale, `/candidate${path}`);

  return (
    <main className="section">
      <div className="container">
        <div className="no-print">
          <h1 style={{ fontSize: 30, margin: "0 0 4px" }}>{t("candidate.title")}</h1>
          <p className="muted" style={{ margin: "0 0 16px" }}>{t("candidate.welcome", { name: profile.full_name || profile.email })}</p>
          <CandidateTabs
            label={t("candidate.title")}
            items={[
              { href: p(""), label: t("candidate.nav.overview") },
              { href: p("/profile"), label: t("candidate.nav.profile") },
              { href: p("/resumes"), label: t("candidate.nav.resumes") },
              { href: p("/applications"), label: t("candidate.nav.applications") },
              { href: p("/saved"), label: t("candidate.nav.saved") },
              { href: p("/notifications"), label: t("candidate.nav.notifications"), badge: unread },
              { href: p("/settings"), label: t("candidate.nav.settings") }
            ]}
          />
        </div>
        {children}
      </div>
    </main>
  );
}
