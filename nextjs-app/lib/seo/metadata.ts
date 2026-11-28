import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/env";
import { LOCALES, localePath, type Locale } from "@/lib/i18n/config";

export interface PageMetaInput {
  locale: Locale;
  /** Path WITHOUT locale, e.g. "/jobs/sales-executive-lahore-12". */
  path: string;
  title: string;
  description: string;
  /** Locales in which this exact page exists. Defaults to all; pass fewer when a translation is missing. */
  availableLocales?: Locale[];
  image?: string | null;
  type?: "website" | "article";
  noindex?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
}

/**
 * Unique title/description, canonical, hreflang alternates (+ x-default), Open Graph and Twitter cards.
 * hreflang lists only locales where the page really exists, so a missing Urdu translation is never
 * advertised to search engines.
 */
export function pageMetadata(i: PageMetaInput): Metadata {
  const locales = i.availableLocales?.length ? i.availableLocales : [...LOCALES];
  const url = (l: Locale) => absoluteUrl(localePath(l, i.path));
  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = url(l);
  languages["x-default"] = url(locales.includes("en") ? "en" : locales[0]);
  const canonical = locales.includes(i.locale) ? url(i.locale) : url(locales[0]);
  const desc = i.description.replace(/\s+/g, " ").trim().slice(0, 160);
  return {
    title: i.title,
    description: desc,
    alternates: { canonical, languages },
    robots: i.noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: i.title, description: desc, url: canonical, type: i.type ?? "website",
      locale: i.locale === "ur" ? "ur_PK" : "en_PK", images: i.image ? [{ url: i.image }] : undefined,
      publishedTime: i.publishedTime, modifiedTime: i.modifiedTime
    },
    twitter: { card: i.image ? "summary_large_image" : "summary", title: i.title, description: desc, images: i.image ? [i.image] : undefined }
  };
}

export const noindexMetadata = (title: string): Metadata => ({ title, robots: { index: false, follow: false } });
