import { createAnonClient } from "@/lib/supabase/anon";
import type { Locale } from "@/lib/i18n/config";
import { LOCALES } from "@/lib/i18n/config";
import type { Category, EmploymentType, JobListItem, JobSector, WorkplaceType } from "@/lib/types";

// Read-only data access for PUBLIC pages. Uses the cookie-less anon client: it can only see what the `anon`
// role may read (approved jobs of verified companies, verified companies, published posts), so nothing
// private can leak through these functions even if a bug slipped in here.

export interface JobSearchParams {
  q?: string; category?: string; province?: string; city?: string; employment?: EmploymentType; workplace?: WorkplaceType;
  sector?: JobSector; salaryMin?: number; company?: string; featuredOnly?: boolean; sort?: "latest" | "deadline" | "salary" | "relevance";
  page?: number; pageSize?: number;
}

export const JOBS_PER_PAGE = 20;

export async function searchJobs(p: JobSearchParams, locale: Locale): Promise<{ rows: JobListItem[]; total: number; configured: boolean }> {
  const supabase = createAnonClient();
  if (!supabase) return { rows: [], total: 0, configured: false };
  const size = p.pageSize ?? JOBS_PER_PAGE;
  const page = Math.max(1, p.page ?? 1);
  const { data, error } = await supabase.rpc("search_jobs", {
    p_q: p.q || null, p_locale: locale, p_category: p.category || null, p_province: p.province || null, p_city: p.city || null,
    p_employment: p.employment || null, p_workplace: p.workplace || null, p_sector: p.sector || null,
    p_salary_min: p.salaryMin ?? null, p_company: p.company || null, p_featured_only: !!p.featuredOnly,
    p_sort: p.sort || (p.q ? "relevance" : "latest"), p_limit: size, p_offset: (page - 1) * size
  } as Record<string, unknown>);
  if (error) {
    console.error("[search_jobs]", error.message);
    return { rows: [], total: 0, configured: true };
  }
  const rows = (data ?? []) as JobListItem[];
  return { rows, total: rows.length ? Number(rows[0].total_count) : 0, configured: true };
}

export interface Facets {
  cities: { value: string; count: number }[]; provinces: { value: string; count: number }[];
  categories: { slug: string; name: string; count: number }[]; totals: { jobs: number; vacancies: number; government: number };
}
const EMPTY_FACETS: Facets = { cities: [], provinces: [], categories: [], totals: { jobs: 0, vacancies: 0, government: 0 } };

export async function getFacets(locale: Locale): Promise<Facets> {
  const supabase = createAnonClient();
  if (!supabase) return EMPTY_FACETS;
  const { data } = await supabase.rpc("job_facets", { p_locale: locale });
  return (data as Facets) ?? EMPTY_FACETS;
}

export interface JobTranslation {
  locale: Locale; title: string; description: string; responsibilities: string; requirements: string; benefits: string;
  experience: string; education: string; salary_text: string; how_to_apply: string;
}
export interface PublicCompany { id: string; name: string; slug: string; logo_path: string | null; website: string | null; city: string | null; industry: string | null; description: string; size: string | null; country: string; created_at: string }
export interface JobDetail {
  job_id: string; ref_no: number; slug: string; company_id: string; category_id: string | null; default_language: Locale;
  sector: JobSector; employment_type: EmploymentType; workplace_type: WorkplaceType; country: string; province: string | null; city: string | null;
  salary_min: number | null; salary_max: number | null; salary_currency: string; salary_period: string; vacancies: number; deadline: string;
  application_method: "internal" | "external_url" | "external_email"; external_url: string | null; external_email: string | null;
  screening_questions: { id: string; text: string; required: boolean }[]; source: string | null; featured: boolean;
  published_at: string; approved_at: string;
  job_published_translations: JobTranslation[]; companies: PublicCompany | null; job_categories: Pick<Category, "slug" | "name_en" | "name_ur"> | null;
}

const COMPANY_COLUMNS = "id,name,slug,logo_path,website,city,industry,description,size,country,created_at";

export async function getJobByRef(ref: number): Promise<JobDetail | null> {
  const supabase = createAnonClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("job_published")
    .select(`*, job_published_translations(*), companies(${COMPANY_COLUMNS}), job_categories(slug,name_en,name_ur)`)
    .eq("ref_no", ref)
    .maybeSingle();
  return (data as unknown as JobDetail | null) ?? null;
}

export async function listCompanies(q: string | undefined, page: number, size = 24) {
  const supabase = createAnonClient();
  if (!supabase) return { rows: [], total: 0, configured: false };
  const { data } = await supabase.rpc("list_companies", { p_q: q || null, p_limit: size, p_offset: (page - 1) * size });
  const rows = (data ?? []) as (Pick<PublicCompany, "id" | "slug" | "name" | "description" | "logo_path" | "industry" | "city" | "size" | "website"> & { open_jobs: number; total_count: number })[];
  return { rows, total: rows.length ? Number(rows[0].total_count) : 0, configured: true };
}

export async function getCompanyBySlug(slug: string): Promise<PublicCompany | null> {
  const supabase = createAnonClient();
  if (!supabase) return null;
  const { data } = await supabase.from("companies").select(COMPANY_COLUMNS).eq("slug", slug).eq("verification_status", "verified").maybeSingle();
  return (data as PublicCompany | null) ?? null;
}

// ---------------------------------------------------------------------------------------------- blog
export interface BlogTranslation { locale: Locale; slug: string; title: string; excerpt: string; content: string; seo_title: string | null; seo_description: string | null; updated_at: string }
export interface BlogPost {
  id: string; published_at: string; updated_at: string; featured_image_path: string | null;
  blog_categories: { slug: string; name_en: string; name_ur: string | null } | null; blog_post_translations: BlogTranslation[];
}
const POST_SELECT = "id,published_at,updated_at,featured_image_path,blog_categories(slug,name_en,name_ur),blog_post_translations(locale,slug,title,excerpt,content,seo_title,seo_description,updated_at)";

export async function listPosts(locale: Locale, category: string | undefined, page: number, size = 12) {
  const supabase = createAnonClient();
  if (!supabase) return { rows: [] as BlogPost[], total: 0, configured: false };
  // Only posts that have a translation in this locale are listed (no pretending a translation exists).
  let q = supabase.from("blog_posts").select(`${POST_SELECT}`, { count: "exact" })
    .eq("status", "published").lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false });
  if (category) {
    const { data: cat } = await supabase.from("blog_categories").select("id").eq("slug", category).maybeSingle();
    if (!cat) return { rows: [], total: 0, configured: true };
    q = q.eq("category_id", cat.id);
  }
  const { data, count } = await q.range((page - 1) * size, page * size - 1);
  const rows = ((data ?? []) as unknown as BlogPost[]).filter((p) => p.blog_post_translations.some((t) => t.locale === locale));
  return { rows, total: count ?? rows.length, configured: true };
}

/** Finds a published post by slug in ANY language (so a language switch can land on the translation that exists). */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const supabase = createAnonClient();
  if (!supabase) return null;
  const { data: hit } = await supabase.from("blog_post_translations").select("post_id").eq("slug", slug).limit(1).maybeSingle();
  if (!hit) return null;
  const { data } = await supabase.from("blog_posts").select(POST_SELECT).eq("id", hit.post_id).eq("status", "published").lte("published_at", new Date().toISOString()).maybeSingle();
  return (data as unknown as BlogPost | null) ?? null;
}

export async function listBlogCategories() {
  const supabase = createAnonClient();
  if (!supabase) return [];
  const { data } = await supabase.from("blog_categories").select("slug,name_en,name_ur").order("sort_order");
  return (data ?? []) as { slug: string; name_en: string; name_ur: string | null }[];
}

export const translationFor = <T extends { locale: string }>(rows: T[], locale: Locale): T | undefined => rows.find((r) => r.locale === locale);
export const availableLocales = (rows: { locale: string }[]): Locale[] => LOCALES.filter((l) => rows.some((r) => r.locale === l));
