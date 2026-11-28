import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdSlot from "@/components/ads/AdSlot";
import JobCard from "@/components/JobCard";
import JsonLd from "@/components/JsonLd";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { createT } from "@/lib/i18n";
import { isLocale, localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { breadcrumbJsonLd, organizationJsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { getCompanyBySlug, searchJobs } from "@/lib/services/public";
import { initials, isWebUrl, publicStorageUrl } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<{ slug: string }>): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const c = await getCompanyBySlug(slug);
  if (!c) return { title: createT(locale)("notFound.title"), robots: { index: false } };
  const t = createT(locale);
  return pageMetadata({
    locale, path: `/companies/${c.slug}`, title: `${c.name} — ${t("companies.profileTitle")}`,
    description: c.description || t("companies.defaultDescription", { name: c.name }), image: publicStorageUrl("company-logos", c.logo_path)
  });
}

export default async function CompanyPage(props: PageProps<{ slug: string }>) {
  const { locale, t, params } = await pageCtx(props);
  const l = (p: string) => localePath(locale, p);
  const c = await getCompanyBySlug(params.slug);
  if (!c) notFound();
  const jobs = await searchJobs({ company: c.id, sort: "latest", pageSize: 50 }, locale);
  const logo = publicStorageUrl("company-logos", c.logo_path);
  return (
    <main className="section">
      <JsonLd data={organizationJsonLd(c, locale)} />
      <JsonLd data={breadcrumbJsonLd([{ name: t("nav.home"), path: "/" }, { name: t("nav.companies"), path: "/companies" }, { name: c.name }], locale)} />
      <div className="container">
        <Breadcrumbs t={t} items={[{ label: t("nav.home"), href: l("/") }, { label: t("nav.companies"), href: l("/companies") }, { label: c.name }]} />
        <div className="company-hero">
          {logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="logo-img" src={logo} alt={c.name} /> : <div className="job-avatar" style={{ width: 72, height: 72 }}>{initials(c.name)}</div>}
          <div>
            <h1 style={{ margin: 0 }}>{c.name}</h1>
            <p className="muted" style={{ margin: 0 }}>{[c.industry, c.city, c.country].filter(Boolean).join(" · ")} {c.size ? `· ${t("companies.employees", { size: c.size })}` : ""}</p>
            <span className="badge">{t("companyStatus.verified")}</span>
          </div>
        </div>
        {c.description && <div className="panel"><h2>{t("companies.about")}</h2><p style={{ whiteSpace: "pre-line" }}>{c.description}</p></div>}
        {c.website && isWebUrl(c.website) && <p><a href={c.website} rel="nofollow noopener noreferrer ugc" target="_blank"><span className="ltr">{c.website}</span></a></p>}
        <h2>{t("companies.openPositions")}</h2>
        <div className="job-grid">
          {jobs.rows.length ? jobs.rows.map((j) => <JobCard key={j.job_id} job={j} locale={locale} t={t} />) : <p>{t("companies.noOpenJobs")}</p>}
        </div>
        <AdSlot slot="inFeed" locale={locale} />
        <p><Link href={l("/companies")}>← {t("companies.all")}</Link></p>
      </div>
    </main>
  );
}
