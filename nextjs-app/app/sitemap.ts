import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/env";
import { LOCALES, localePath, type Locale } from "@/lib/i18n/config";
import { createAnonClient } from "@/lib/supabase/anon";
import { todayPK } from "@/lib/utils";

export const revalidate = 3600;

const STATIC = ["", "/jobs", "/companies", "/blog", "/about", "/contact", "/privacy", "/terms"];

type Entry = MetadataRoute.Sitemap[number];

/** One entry per language version, each listing the alternates that REALLY exist (hreflang). */
function entry(path: (l: Locale) => string, locales: Locale[], lastModified?: string, priority = 0.6): Entry[] {
  const languages = Object.fromEntries(locales.map((l) => [l, absoluteUrl(path(l))]));
  return locales.map((l) => ({
    url: absoluteUrl(path(l)), lastModified: lastModified ? new Date(lastModified) : undefined, priority,
    alternates: locales.length > 1 ? { languages } : undefined
  }));
}

/** Pages through a table in batches (PostgREST caps responses at 1000 rows). */
async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null }>, max = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data } = await fetchPage(from, from + 999);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const items: MetadataRoute.Sitemap = STATIC.flatMap((p) => entry((l) => localePath(l, p || "/"), [...LOCALES], undefined, p === "" ? 1 : 0.7));
  const supabase = createAnonClient();
  if (!supabase) return items;

  // Open jobs only (expired and removed jobs are NOT listed). Alternates only for languages with a translation.
  const jobs = await pageAll<{ slug: string; approved_at: string; job_published_translations: { locale: Locale }[] }>((a, b) =>
    supabase.from("job_published").select("slug,approved_at,job_published_translations(locale)").gte("deadline", todayPK()).order("ref_no").range(a, b));
  for (const j of jobs) {
    const locales = LOCALES.filter((l) => j.job_published_translations.some((t) => t.locale === l));
    if (locales.length) items.push(...entry((l) => localePath(l, `/jobs/${j.slug}`), locales, j.approved_at, 0.8));
  }

  const companies = await pageAll<{ slug: string; updated_at: string }>((a, b) =>
    supabase.from("companies").select("slug,updated_at").eq("verification_status", "verified").order("created_at").range(a, b));
  for (const c of companies) items.push(...entry((l) => localePath(l, `/companies/${c.slug}`), [...LOCALES], c.updated_at, 0.5));

  const posts = await pageAll<{ updated_at: string; blog_post_translations: { locale: Locale; slug: string }[] }>((a, b) =>
    supabase.from("blog_posts").select("updated_at,blog_post_translations(locale,slug)").eq("status", "published").lte("published_at", new Date().toISOString()).order("published_at").range(a, b));
  for (const p of posts) {
    const by = Object.fromEntries(p.blog_post_translations.map((t) => [t.locale, t.slug])) as Partial<Record<Locale, string>>;
    const locales = LOCALES.filter((l) => by[l]);
    if (locales.length) items.push(...entry((l) => localePath(l, `/blog/${by[l]}`), locales, p.updated_at, 0.7));
  }
  return items;
}
