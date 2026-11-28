import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, JobStatus } from "@/lib/types";
import type { Locale } from "@/lib/i18n/config";

export interface JobTranslationRow {
  locale: Locale; title: string; description: string; responsibilities: string; requirements: string; benefits: string;
  experience: string; education: string; salary_text: string; how_to_apply: string;
}
export interface JobEditData {
  id: string; company_id: string; category_id: string | null; slug: string | null; status: JobStatus; default_language: Locale;
  sector: "government" | "private"; employment_type: string; workplace_type: string; province: string | null; city: string | null;
  salary_min: number | null; salary_max: number | null; salary_currency: string; salary_period: string; vacancies: number;
  deadline: string | null; application_method: "internal" | "external_url" | "external_email"; external_url: string | null;
  external_email: string | null; screening_questions: { id: string; text: string; required: boolean }[]; source: string | null;
  featured: boolean; updated_at: string; translations: JobTranslationRow[];
}

const JOB_COLUMNS =
  "id,company_id,category_id,slug,status,default_language,sector,employment_type,workplace_type,province,city,salary_min,salary_max," +
  "salary_currency,salary_period,vacancies,deadline,application_method,external_url,external_email,screening_questions,source,featured,updated_at";

/** Loads one job + translations as the caller (RLS: members of the company and admins only; else null). */
export async function loadJobForEdit(supabase: SupabaseClient, id: string): Promise<JobEditData | null> {
  const { data: job } = await supabase.from("jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle();
  if (!job) return null;
  const { data: translations } = await supabase
    .from("job_translations")
    .select("locale,title,description,responsibilities,requirements,benefits,experience,education,salary_text,how_to_apply")
    .eq("job_id", id);
  return { ...(job as unknown as Omit<JobEditData, "translations">), translations: (translations ?? []) as JobTranslationRow[] };
}

export async function loadCategories(supabase: SupabaseClient): Promise<Category[]> {
  const { data } = await supabase.from("job_categories").select("id,slug,name_en,name_ur").eq("is_active", true).order("sort_order").order("name_en");
  return (data ?? []) as Category[];
}

export const categoryName = (c: Pick<Category, "name_en" | "name_ur">, locale: Locale) => (locale === "ur" ? c.name_ur || c.name_en : c.name_en);

/** Title of a job in the best available language (page locale, then default language, then anything). */
export function pickTranslation<T extends { locale: string }>(rows: T[] | null | undefined, locale: Locale, defaultLanguage?: string): T | undefined {
  if (!rows?.length) return undefined;
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === defaultLanguage) ?? rows[0];
}

/** States in which an employer may edit (matches the database guard). */
export const EMPLOYER_EDITABLE: JobStatus[] = ["draft", "rejected", "changes_requested", "approved", "expired"];
