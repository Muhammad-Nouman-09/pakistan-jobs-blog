import { absoluteUrl } from "@/lib/env";
import { localePath, type Locale } from "@/lib/i18n/config";
import { daysLeft, publicStorageUrl } from "@/lib/utils";
import type { JobDetail, PublicCompany } from "@/lib/services/public";

const EMPLOYMENT: Record<string, string> = {
  full_time: "FULL_TIME", part_time: "PART_TIME", contract: "CONTRACTOR", internship: "INTERN", temporary: "TEMPORARY", freelance: "CONTRACTOR"
};
const UNIT: Record<string, string> = { hour: "HOUR", day: "DAY", month: "MONTH", year: "YEAR", project: "" };

/** Serialise for a <script type="application/ld+json"> tag; "<" is escaped so content can't close the tag. */
export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/**
 * Google JobPosting structured data — ONLY for jobs that are eligible: approved & public, deadline not yet
 * passed. Returns null otherwise (expired or removed jobs must not carry JobPosting markup).
 * `validThrough` is the end of the deadline day in Pakistan time.
 */
export function jobPostingJsonLd(job: JobDetail, locale: Locale, text: { title: string; description: string }, now = new Date()) {
  const company = job.companies;
  const left = daysLeft(job.deadline, now);
  if (!company || left === null || left < 0) return null;
  const remote = job.workplace_type === "remote";
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: text.title,
    description: text.description,
    identifier: { "@type": "PropertyValue", name: company.name, value: String(job.ref_no) },
    datePosted: job.published_at.slice(0, 10),
    validThrough: `${job.deadline}T23:59:59+05:00`,
    employmentType: EMPLOYMENT[job.employment_type] ?? "OTHER",
    inLanguage: locale,
    directApply: job.application_method === "internal",
    url: absoluteUrl(localePath(locale, `/jobs/${job.slug}`)),
    totalJobOpenings: job.vacancies,
    hiringOrganization: {
      "@type": "Organization", name: company.name,
      ...(company.website ? { sameAs: company.website } : {}),
      ...(company.logo_path ? { logo: publicStorageUrl("company-logos", company.logo_path) } : {})
    }
  };
  if (remote) {
    ld.jobLocationType = "TELECOMMUTE";
    ld.applicantLocationRequirements = { "@type": "Country", name: "PK" };
  } else {
    ld.jobLocation = {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: job.city ?? undefined, addressRegion: job.province ?? undefined, addressCountry: "PK" }
    };
  }
  if (job.salary_min != null || job.salary_max != null) {
    const value: Record<string, unknown> = { "@type": "QuantitativeValue" };
    if (job.salary_min != null) value.minValue = Number(job.salary_min);
    if (job.salary_max != null) value.maxValue = Number(job.salary_max);
    if (UNIT[job.salary_period]) value.unitText = UNIT[job.salary_period];
    ld.baseSalary = { "@type": "MonetaryAmount", currency: job.salary_currency, value };
  }
  return ld;
}

export function organizationJsonLd(c: Pick<PublicCompany, "name" | "slug" | "website" | "logo_path" | "description" | "city">, locale: Locale) {
  return {
    "@context": "https://schema.org", "@type": "Organization", name: c.name,
    url: absoluteUrl(localePath(locale, `/companies/${c.slug}`)),
    ...(c.website ? { sameAs: [c.website] } : {}),
    ...(c.logo_path ? { logo: publicStorageUrl("company-logos", c.logo_path) } : {}),
    ...(c.description ? { description: c.description.slice(0, 300) } : {}),
    ...(c.city ? { address: { "@type": "PostalAddress", addressLocality: c.city, addressCountry: "PK" } } : {})
  };
}

export function websiteJsonLd(name: string, locale: Locale) {
  return {
    "@context": "https://schema.org", "@type": "WebSite", name, url: absoluteUrl(localePath(locale)), inLanguage: locale,
    potentialAction: { "@type": "SearchAction", target: `${absoluteUrl(localePath(locale, "/jobs"))}?q={search_term_string}`, "query-input": "required name=search_term_string" }
  };
}

export function siteOrganizationJsonLd(name: string, locale: Locale) {
  return { "@context": "https://schema.org", "@type": "Organization", name, url: absoluteUrl(localePath(locale)) };
}

export function breadcrumbJsonLd(items: { name: string; path?: string }[], locale: Locale) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem", position: i + 1, name: it.name,
      ...(it.path ? { item: absoluteUrl(localePath(locale, it.path)) } : {})
    }))
  };
}

export function articleJsonLd(a: { title: string; description: string; path: string; locale: Locale; published: string; modified: string; image?: string | null; publisher: string }) {
  return {
    "@context": "https://schema.org", "@type": "Article", headline: a.title.slice(0, 110), description: a.description, inLanguage: a.locale,
    datePublished: a.published, dateModified: a.modified, mainEntityOfPage: absoluteUrl(localePath(a.locale, a.path)),
    ...(a.image ? { image: [a.image] } : {}),
    author: { "@type": "Organization", name: a.publisher }, publisher: { "@type": "Organization", name: a.publisher }
  };
}
