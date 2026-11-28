import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/config";
import { looseContent, type LooseContent } from "@/lib/validation/candidate";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/types";
import { todayPK } from "@/lib/utils";

// Data access for the job-seeker area. Always called with the USER-scoped client (RLS does the real work);
// every query additionally filters by the caller's id so a policy mistake could not leak another user's rows.

export const PAGE_SIZE = 20;
export const range = (page: number) => ({ from: (page - 1) * PAGE_SIZE, to: page * PAGE_SIZE - 1 });

// ---- profile ----------------------------------------------------------------------------------------------
export type CandidateProfileRow = Pick<LooseContent, "skills" | "education" | "experience" | "certifications" | "projects" | "languages"> & {
  headline: string; summary: string; hasRow: boolean;
};

export async function getCandidateProfile(supabase: SupabaseClient, userId: string): Promise<CandidateProfileRow> {
  const { data } = await supabase.from("candidate_profiles")
    .select("headline,summary,skills,education,experience,certifications,projects,languages").eq("user_id", userId).maybeSingle();
  const c = looseContent(data);
  const d = (data ?? {}) as { headline?: string; summary?: string };
  return {
    headline: d.headline ?? "", summary: d.summary ?? "", skills: c.skills, education: c.education, experience: c.experience,
    certifications: c.certifications, projects: c.projects, languages: c.languages, hasRow: !!data
  };
}

export const COMPLETENESS_KEYS = ["headline", "summary", "skills", "education", "experience", "languages", "resume"] as const;
export type CompletenessKey = (typeof COMPLETENESS_KEYS)[number];

/** Profile completeness: one point per section (see COMPLETENESS_KEYS). */
export function profileCompleteness(p: CandidateProfileRow, resumeCount: number): { percent: number; missing: CompletenessKey[] } {
  const done: Record<CompletenessKey, boolean> = {
    headline: p.headline.trim() !== "", summary: p.summary.trim() !== "", skills: p.skills.length > 0, education: p.education.length > 0,
    experience: p.experience.length > 0, languages: p.languages.length > 0, resume: resumeCount > 0
  };
  const missing = COMPLETENESS_KEYS.filter((k) => !done[k]);
  return { percent: Math.round(((COMPLETENESS_KEYS.length - missing.length) / COMPLETENESS_KEYS.length) * 100), missing };
}

// ---- resumes ----------------------------------------------------------------------------------------------
export interface ResumeRow {
  id: string; title: string; is_default: boolean; visibility: "private" | "shareable"; content: unknown;
  pdf_path: string | null; pdf_name: string | null; pdf_size: number | null; created_at: string; updated_at: string;
}
const RESUME_COLUMNS = "id,title,is_default,visibility,content,pdf_path,pdf_name,pdf_size,created_at,updated_at";

export async function listResumes(supabase: SupabaseClient, userId: string): Promise<ResumeRow[]> {
  const { data } = await supabase.from("resumes").select(RESUME_COLUMNS).eq("user_id", userId)
    .order("is_default", { ascending: false }).order("updated_at", { ascending: false }).limit(50);
  return (data ?? []) as ResumeRow[];
}

export async function getResume(supabase: SupabaseClient, userId: string, id: string): Promise<ResumeRow | null> {
  if (!isUuid(id)) return null;
  const { data } = await supabase.from("resumes").select(RESUME_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  return (data as ResumeRow | null) ?? null;
}

export async function countResumes(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase.from("resumes").select("id", { count: "exact", head: true }).eq("user_id", userId);
  return count ?? 0;
}

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ---- applications -----------------------------------------------------------------------------------------
export interface ApplicationListRow {
  id: string; job_id: string; job_title: string; company_name: string; status: ApplicationStatus; submitted_at: string;
}

export async function listApplications(supabase: SupabaseClient, userId: string, opts: { status?: ApplicationStatus; page: number }) {
  const { from, to } = range(opts.page);
  let q = supabase.from("applications").select("id,job_id,job_title,company_name,status,submitted_at", { count: "exact" })
    .eq("candidate_id", userId);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, count } = await q.order("submitted_at", { ascending: false }).range(from, to);
  return { rows: (data ?? []) as ApplicationListRow[], total: count ?? 0 };
}

export async function countApplicationsByStatus(supabase: SupabaseClient, userId: string): Promise<Record<ApplicationStatus, number>> {
  // PostgREST has no GROUP BY without the optional aggregates feature: one cheap head-count per status, in parallel.
  const entries = await Promise.all(APPLICATION_STATUSES.map(async (s) => {
    const { count } = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("candidate_id", userId).eq("status", s);
    return [s, count ?? 0] as const;
  }));
  return Object.fromEntries(entries) as Record<ApplicationStatus, number>;
}

export interface ApplicationDetail {
  id: string; job_id: string; job_title: string; company_name: string; cover_letter: string; status: ApplicationStatus;
  submitted_at: string; withdrawn_at: string | null; resume_snapshot: unknown;
  events: { id: string; from_status: ApplicationStatus | null; to_status: ApplicationStatus; created_at: string }[];
  answers: { id: string; question: string; answer: string }[];
  jobSlug: string | null;       // set only while the job is still in job_published
}

export async function getApplication(supabase: SupabaseClient, userId: string, id: string): Promise<ApplicationDetail | null> {
  if (!isUuid(id)) return null;
  const { data: a } = await supabase.from("applications")
    .select("id,job_id,job_title,company_name,cover_letter,status,submitted_at,withdrawn_at,resume_snapshot")
    .eq("id", id).eq("candidate_id", userId).maybeSingle();
  if (!a) return null;
  const [events, answers, job] = await Promise.all([
    supabase.from("application_events").select("id,from_status,to_status,created_at").eq("application_id", id).order("created_at", { ascending: true }),
    supabase.from("application_answers").select("id,question,answer").eq("application_id", id),
    supabase.from("job_published").select("slug").eq("job_id", a.job_id).maybeSingle()
  ]);
  return {
    ...(a as Omit<ApplicationDetail, "events" | "answers" | "jobSlug">),
    events: (events.data ?? []) as ApplicationDetail["events"],
    answers: (answers.data ?? []) as ApplicationDetail["answers"],
    jobSlug: (job.data as { slug: string } | null)?.slug ?? null
  };
}

/** The live (non-withdrawn) application of this user for a job, if any. */
export async function findLiveApplication(supabase: SupabaseClient, userId: string, jobId: string): Promise<string | null> {
  const { data } = await supabase.from("applications").select("id").eq("candidate_id", userId).eq("job_id", jobId).neq("status", "withdrawn").limit(1).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ---- public jobs (apply flow, saved jobs) ---------------------------------------------------------------------
interface Translation { job_id: string; locale: Locale; title: string }

/** Title in the page locale, else the job's default language, else anything. */
export function pickTitle(list: Translation[], locale: Locale, defaultLanguage: Locale): string {
  return (list.find((x) => x.locale === locale) ?? list.find((x) => x.locale === defaultLanguage) ?? list[0])?.title ?? "";
}

export interface ScreeningQuestion { id: string; text: string; required: boolean }
export function parseQuestions(raw: unknown): ScreeningQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: ScreeningQuestion[] = [];
  for (const q of raw) {
    if (!q || typeof q !== "object") continue;
    const o = q as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.text !== "string") continue;
    out.push({ id: o.id, text: o.text, required: o.required === true });
  }
  return out.slice(0, 30);
}

export interface ApplyJob {
  job_id: string; slug: string; title: string; company_name: string; deadline: string;
  application_method: "internal" | "external_url" | "external_email"; questions: ScreeningQuestion[]; closed: boolean;
}

export async function getJobForApply(supabase: SupabaseClient, ref: number, locale: Locale): Promise<ApplyJob | null> {
  const { data: j } = await supabase.from("job_published")
    .select("job_id,slug,company_id,default_language,deadline,application_method,screening_questions")
    .eq("ref_no", ref).order("published_at", { ascending: false }).limit(1).maybeSingle();
  if (!j) return null;
  const [tr, co] = await Promise.all([
    supabase.from("job_published_translations").select("job_id,locale,title").eq("job_id", j.job_id),
    supabase.from("companies").select("name").eq("id", j.company_id).maybeSingle()
  ]);
  return {
    job_id: j.job_id, slug: j.slug, title: pickTitle((tr.data ?? []) as Translation[], locale, j.default_language),
    company_name: (co.data as { name: string } | null)?.name ?? "", deadline: j.deadline, application_method: j.application_method,
    questions: parseQuestions(j.screening_questions), closed: String(j.deadline).slice(0, 10) < todayPK()
  };
}

export interface SavedJob {
  job_id: string; saved_at: string; available: boolean; closed: boolean; slug: string | null; title: string; company_name: string;
  deadline: string | null; city: string | null; application_method: string | null;
}

export async function listSavedJobs(supabase: SupabaseClient, userId: string, locale: Locale, page: number) {
  const { from, to } = range(page);
  const { data: saved, count } = await supabase.from("saved_jobs").select("job_id,created_at", { count: "exact" })
    .eq("user_id", userId).order("created_at", { ascending: false }).range(from, to);
  const ids = (saved ?? []).map((s: { job_id: string }) => s.job_id);
  if (!ids.length) return { rows: [] as SavedJob[], total: count ?? 0 };
  const { data: jobs } = await supabase.from("job_published")
    .select("job_id,slug,company_id,default_language,deadline,city,application_method").in("job_id", ids);
  const published = (jobs ?? []) as { job_id: string; slug: string; company_id: string; default_language: Locale; deadline: string; city: string | null; application_method: string }[];
  const companyIds = [...new Set(published.map((j) => j.company_id))];
  const [tr, co] = await Promise.all([
    published.length ? supabase.from("job_published_translations").select("job_id,locale,title").in("job_id", published.map((j) => j.job_id)) : Promise.resolve({ data: [] }),
    companyIds.length ? supabase.from("companies").select("id,name").in("id", companyIds) : Promise.resolve({ data: [] })
  ]);
  const translations = (tr.data ?? []) as Translation[];
  const companies = new Map(((co.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const byId = new Map(published.map((j) => [j.job_id, j]));
  const today = todayPK();
  const rows: SavedJob[] = (saved ?? []).map((s: { job_id: string; created_at: string }) => {
    const j = byId.get(s.job_id);
    if (!j) return { job_id: s.job_id, saved_at: s.created_at, available: false, closed: true, slug: null, title: "", company_name: "", deadline: null, city: null, application_method: null };
    return {
      job_id: s.job_id, saved_at: s.created_at, available: true, closed: String(j.deadline).slice(0, 10) < today, slug: j.slug,
      title: pickTitle(translations.filter((x) => x.job_id === j.job_id), locale, j.default_language), company_name: companies.get(j.company_id) ?? "",
      deadline: j.deadline, city: j.city, application_method: j.application_method
    };
  });
  return { rows, total: count ?? 0 };
}

export async function countSavedJobs(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase.from("saved_jobs").select("job_id", { count: "exact", head: true }).eq("user_id", userId);
  return count ?? 0;
}

// ---- notifications ----------------------------------------------------------------------------------------
export interface NotificationRow { id: string; type: string; payload: unknown; read_at: string | null; created_at: string }

export async function listNotifications(supabase: SupabaseClient, userId: string, opts: { page?: number; limit?: number } = {}) {
  const page = opts.page ?? 1;
  const { from, to } = opts.limit ? { from: 0, to: opts.limit - 1 } : range(page);
  const { data, count } = await supabase.from("notifications").select("id,type,payload,read_at,created_at", { count: "exact" })
    .eq("user_id", userId).order("created_at", { ascending: false }).range(from, to);
  return { rows: (data ?? []) as NotificationRow[], total: count ?? 0 };
}

export async function countUnreadNotifications(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  return count ?? 0;
}
