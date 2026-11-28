import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplicationStatus, CompanyVerification, JobStatus, MemberRole } from "@/lib/types";
import type { Locale } from "@/lib/i18n/config";
import { pickTranslation } from "@/lib/services/jobs";

// Data access for the employer dashboard. Everything runs as the signed-in user (Row Level Security does the
// real authorization); these helpers only shape the results. No service-role client is used here.

export const PAGE_SIZE = 20;

/** PostgREST returns a to-one embed as an object, but be tolerant of an array. */
export function first<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export const canRecruit = (role: MemberRole | undefined | null) => role === "owner" || role === "recruiter";

/** Removes characters that have meaning in PostgREST filter syntax and LIKE wildcards. */
export const safeSearch = (q: string | undefined) => (q ?? "").replace(/[%_,()*\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

// ------------------------------------------------------------------------------------------------ companies
export interface CompanyRow {
  id: string; name: string; slug: string; description: string; logo_path: string | null; industry: string | null;
  website: string | null; country: string; city: string | null; size: string | null;
  verification_status: CompanyVerification; created_at: string;
}
export interface Membership { role: MemberRole; company: CompanyRow }

const COMPANY_COLUMNS = "id,name,slug,description,logo_path,industry,website,country,city,size,verification_status,created_at";

/** The user's own memberships (RLS also lets members read teammates' rows, hence the user_id filter). */
export async function loadMemberships(supabase: SupabaseClient, userId: string): Promise<Membership[]> {
  const { data } = await supabase.from("company_members").select(`role, companies(${COMPANY_COLUMNS})`).eq("user_id", userId);
  const out: Membership[] = [];
  for (const r of (data ?? []) as any[]) {
    const company = first<CompanyRow>(r.companies);
    if (company) out.push({ role: r.role as MemberRole, company });
  }
  return out.sort((a, b) => a.company.name.localeCompare(b.company.name));
}

export interface CompanyPrivate { email: string | null; phone: string | null; address: string | null; verification_note: string | null }

export interface CompanyDetail { company: CompanyRow; priv: CompanyPrivate | null; role: MemberRole }

/** One company the user belongs to. Null when it does not exist or the user is not a member. */
export async function loadCompanyDetail(supabase: SupabaseClient, companyId: string, userId: string): Promise<CompanyDetail | null> {
  const { data: m } = await supabase.from("company_members").select("role").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
  if (!m) return null;
  const [{ data: company }, { data: priv }] = await Promise.all([
    supabase.from("companies").select(COMPANY_COLUMNS).eq("id", companyId).maybeSingle(),
    supabase.from("company_private").select("email,phone,address,verification_note").eq("company_id", companyId).maybeSingle()
  ]);
  if (!company) return null;
  return { company: company as CompanyRow, priv: (priv as CompanyPrivate | null) ?? null, role: (m as { role: MemberRole }).role };
}

/** Moderation notes for several companies at once (members can read them via RLS). */
export async function loadVerificationNotes(supabase: SupabaseClient, companyIds: string[]): Promise<Record<string, string>> {
  if (!companyIds.length) return {};
  const { data } = await supabase.from("company_private").select("company_id,verification_note").in("company_id", companyIds);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { company_id: string; verification_note: string | null }[]) if (r.verification_note) out[r.company_id] = r.verification_note;
  return out;
}

export interface TeamMember { user_id: string; role: MemberRole; created_at: string; full_name: string; email: string }

export async function loadTeam(supabase: SupabaseClient, companyId: string): Promise<TeamMember[]> {
  const { data } = await supabase.from("company_members").select("user_id,role,created_at,profiles(full_name,email)").eq("company_id", companyId).order("created_at");
  return ((data ?? []) as any[]).map((r) => {
    const p = first<{ full_name: string; email: string }>(r.profiles);
    return { user_id: r.user_id, role: r.role, created_at: r.created_at, full_name: p?.full_name ?? "", email: p?.email ?? "" };
  });
}

export interface InvitationRow {
  id: string; email: string; role: MemberRole; expires_at: string; accepted_at: string | null; revoked_at: string | null; created_at: string;
}
export type InvitationState = "pending" | "accepted" | "revoked" | "expired";

export const invitationState = (i: InvitationRow, now = Date.now()): InvitationState =>
  i.accepted_at ? "accepted" : i.revoked_at ? "revoked" : Date.parse(i.expires_at) <= now ? "expired" : "pending";

export async function loadInvitations(supabase: SupabaseClient, companyId: string): Promise<InvitationRow[]> {
  const { data } = await supabase.from("company_invitations").select("id,email,role,expires_at,accepted_at,revoked_at,created_at")
    .eq("company_id", companyId).order("created_at", { ascending: false }).limit(50);
  return (data ?? []) as InvitationRow[];
}

export interface DocumentRow { id: string; file_name: string; doc_type: string; created_at: string }

export async function loadDocuments(supabase: SupabaseClient, companyId: string): Promise<DocumentRow[]> {
  const { data } = await supabase.from("company_verification_documents").select("id,file_name,doc_type,created_at")
    .eq("company_id", companyId).order("created_at", { ascending: false });
  return (data ?? []) as DocumentRow[];
}

// ------------------------------------------------------------------------------------------------ reports / overview
export interface CompanyReport {
  jobs_by_status: Record<string, number>;
  applications_by_status: Record<string, number>;
  per_job: { job_id: string; slug: string | null; status: JobStatus; title: string | null; applications: number; external_clicks: number }[];
}

export async function loadReport(supabase: SupabaseClient, companyId: string): Promise<CompanyReport | null> {
  const { data, error } = await supabase.rpc("company_report", { p_company: companyId });
  if (error || !data) return null;
  const d = data as Partial<CompanyReport>;
  return { jobs_by_status: d.jobs_by_status ?? {}, applications_by_status: d.applications_by_status ?? {}, per_job: d.per_job ?? [] };
}

/** Sums the per-company reports (jobs and applications by status across all of the user's companies). */
export async function loadTotals(supabase: SupabaseClient, companyIds: string[]) {
  const reports = await Promise.all(companyIds.map((id) => loadReport(supabase, id)));
  const jobs: Record<string, number> = {};
  const apps: Record<string, number> = {};
  for (const r of reports) {
    if (!r) continue;
    for (const [k, v] of Object.entries(r.jobs_by_status)) jobs[k] = (jobs[k] ?? 0) + Number(v);
    for (const [k, v] of Object.entries(r.applications_by_status)) apps[k] = (apps[k] ?? 0) + Number(v);
  }
  return { jobs, apps };
}

// ------------------------------------------------------------------------------------------------ jobs
export interface JobListRow {
  id: string; company_id: string; company_name: string; status: JobStatus; city: string | null; deadline: string | null;
  updated_at: string; slug: string | null; title: string; applications: number;
}

export interface JobFilters { status?: string; company?: string; q?: string; page: number }

export async function loadJobs(supabase: SupabaseClient, f: JobFilters, locale: Locale): Promise<{ rows: JobListRow[]; total: number }> {
  const q = safeSearch(f.q);
  const embed = q ? "job_translations!inner(locale,title)" : "job_translations(locale,title)";
  let qb = supabase.from("jobs")
    .select(`id,company_id,status,city,deadline,updated_at,slug,default_language,companies(name),${embed},applications(count)`, { count: "exact" })
    .neq("applications.status", "withdrawn");
  if (f.status) qb = qb.eq("status", f.status);
  if (f.company) qb = qb.eq("company_id", f.company);
  if (q) qb = qb.ilike("job_translations.title", `%${q}%`);
  const from = (f.page - 1) * PAGE_SIZE;
  const { data, count } = await qb.order("updated_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  const rows = ((data ?? []) as any[]).map((r): JobListRow => ({
    id: r.id, company_id: r.company_id, company_name: first<{ name: string }>(r.companies)?.name ?? "", status: r.status, city: r.city,
    deadline: r.deadline, updated_at: r.updated_at, slug: r.slug,
    title: pickTranslation(r.job_translations as { locale: string; title: string }[], locale, r.default_language)?.title ?? "—",
    applications: Number(first<{ count: number }>(r.applications)?.count ?? 0)
  }));
  return { rows, total: count ?? rows.length };
}

/** Job counts per status across the jobs the user can see (optionally one company). */
export async function loadJobStatusCounts(supabase: SupabaseClient, company?: string): Promise<Record<string, number>> {
  let qb = supabase.from("jobs").select("status").limit(5000);
  if (company) qb = qb.eq("company_id", company);
  const { data } = await qb;
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { status: string }[]) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}

export interface ReviewEntry { id: string; action: string; reason: string | null; created_at: string; actor_id: string | null }

export async function loadReviews(supabase: SupabaseClient, jobId: string): Promise<ReviewEntry[]> {
  const { data } = await supabase.from("job_reviews").select("id,action,reason,created_at,actor_id").eq("job_id", jobId).order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as ReviewEntry[];
}

/** Whether an approved public copy of the job exists (it keeps serving while a revision is pending/draft). */
export async function isJobLive(supabase: SupabaseClient, jobId: string): Promise<{ live: boolean; approvedAt: string | null }> {
  const { data } = await supabase.from("job_published").select("approved_at").eq("job_id", jobId).maybeSingle();
  return { live: !!data, approvedAt: (data as { approved_at: string } | null)?.approved_at ?? null };
}

export async function loadJobCounts(supabase: SupabaseClient, jobId: string, withApps: boolean): Promise<{ applications: number; clicks: number }> {
  if (!withApps) return { applications: 0, clicks: 0 };
  const [a, c] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("job_id", jobId).neq("status", "withdrawn"),
    supabase.from("job_external_clicks").select("id", { count: "exact", head: true }).eq("job_id", jobId)
  ]);
  return { applications: a.count ?? 0, clicks: c.count ?? 0 };
}

export interface PendingRow { id: string; title: string; company_name: string; company_id: string; submitted_at: string | null; deadline: string | null }

export async function loadPendingJobs(supabase: SupabaseClient, locale: Locale): Promise<PendingRow[]> {
  const { data } = await supabase.from("jobs").select("id,company_id,deadline,default_language,updated_at,companies(name),job_translations(locale,title)")
    .eq("status", "pending_review").order("updated_at", { ascending: false }).limit(200);
  const jobs = (data ?? []) as any[];
  const submitted: Record<string, string> = {};
  if (jobs.length) {
    const { data: reviews } = await supabase.from("job_reviews").select("job_id,created_at").eq("action", "submitted")
      .in("job_id", jobs.map((j) => j.id)).order("created_at", { ascending: false });
    for (const r of (reviews ?? []) as { job_id: string; created_at: string }[]) submitted[r.job_id] ??= r.created_at;
  }
  return jobs.map((j) => ({
    id: j.id, company_id: j.company_id, deadline: j.deadline, company_name: first<{ name: string }>(j.companies)?.name ?? "",
    title: pickTranslation(j.job_translations as { locale: string; title: string }[], locale, j.default_language)?.title ?? "—",
    submitted_at: submitted[j.id] ?? null
  }));
}

// ------------------------------------------------------------------------------------------------ applications
export interface ApplicationListRow {
  id: string; job_id: string; company_id: string; job_title: string; company_name: string; status: ApplicationStatus;
  submitted_at: string; applicant_name: string | null;
}
export interface ApplicationFilters { job?: string; status?: string; company?: string; page: number }

export async function loadApplications(supabase: SupabaseClient, f: ApplicationFilters): Promise<{ rows: ApplicationListRow[]; total: number }> {
  let qb = supabase.from("applications")
    .select("id,job_id,company_id,job_title,company_name,status,submitted_at,applicant_name:resume_snapshot->applicant->>full_name", { count: "exact" });
  if (f.job) qb = qb.eq("job_id", f.job);
  if (f.status) qb = qb.eq("status", f.status);
  if (f.company) qb = qb.eq("company_id", f.company);
  const from = (f.page - 1) * PAGE_SIZE;
  const { data, count } = await qb.order("submitted_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as unknown as ApplicationListRow[];
  return { rows, total: count ?? rows.length };
}

/** Internal-application jobs for the "job" filter. */
export async function loadApplicationJobs(supabase: SupabaseClient, locale: Locale, company?: string): Promise<{ id: string; title: string; company_id: string }[]> {
  let qb = supabase.from("jobs").select("id,company_id,default_language,job_translations(locale,title)").eq("application_method", "internal");
  if (company) qb = qb.eq("company_id", company);
  const { data } = await qb.order("updated_at", { ascending: false }).limit(200);
  return ((data ?? []) as any[]).map((j) => ({
    id: j.id, company_id: j.company_id,
    title: pickTranslation(j.job_translations as { locale: string; title: string }[], locale, j.default_language)?.title ?? "—"
  }));
}

export interface ResumeSnapshot {
  redacted?: boolean; resume_id?: string; title?: string; content?: Record<string, any>; pdf_path?: string | null; pdf_name?: string | null;
  applicant?: { full_name?: string; email?: string; phone?: string | null; city?: string | null; province?: string | null };
}
export interface ApplicationDetail {
  id: string; job_id: string; company_id: string; job_title: string; company_name: string; cover_letter: string;
  status: ApplicationStatus; submitted_at: string; updated_at: string; withdrawn_at: string | null; resume_snapshot: ResumeSnapshot | null;
}

/** Loads one application as the caller (RLS: owners/recruiters of the company only). */
export async function loadApplication(supabase: SupabaseClient, id: string): Promise<ApplicationDetail | null> {
  const { data } = await supabase.from("applications")
    .select("id,job_id,company_id,job_title,company_name,cover_letter,status,submitted_at,updated_at,withdrawn_at,resume_snapshot").eq("id", id).maybeSingle();
  return (data as ApplicationDetail | null) ?? null;
}

export interface ApplicationExtras {
  answers: { question_id: string; question: string; answer: string }[];
  events: { id: string; from_status: ApplicationStatus | null; to_status: ApplicationStatus; created_at: string }[];
  notes: { id: string; note: string; author_id: string; created_at: string; author_name: string }[];
}

export async function loadApplicationExtras(supabase: SupabaseClient, id: string): Promise<ApplicationExtras> {
  const [answers, events, notes] = await Promise.all([
    supabase.from("application_answers").select("question_id,question,answer").eq("application_id", id),
    supabase.from("application_events").select("id,from_status,to_status,created_at").eq("application_id", id).order("created_at"),
    supabase.from("application_notes").select("id,note,author_id,created_at,profiles(full_name)").eq("application_id", id).order("created_at", { ascending: false })
  ]);
  return {
    answers: (answers.data ?? []) as ApplicationExtras["answers"],
    events: (events.data ?? []) as ApplicationExtras["events"],
    notes: ((notes.data ?? []) as any[]).map((n) => ({
      id: n.id, note: n.note, author_id: n.author_id, created_at: n.created_at, author_name: first<{ full_name: string }>(n.profiles)?.full_name ?? ""
    }))
  };
}

export async function loadRecentApplications(supabase: SupabaseClient, companyId: string, limit = 10): Promise<ApplicationListRow[]> {
  const { data } = await supabase.from("applications")
    .select("id,job_id,company_id,job_title,company_name,status,submitted_at,applicant_name:resume_snapshot->applicant->>full_name")
    .eq("company_id", companyId).order("submitted_at", { ascending: false }).limit(limit);
  return (data ?? []) as unknown as ApplicationListRow[];
}

// ------------------------------------------------------------------------------------------------ notifications
export interface NotificationRow { id: string; type: string; payload: Record<string, any>; read_at: string | null; created_at: string }

export async function loadNotifications(supabase: SupabaseClient, page: number): Promise<{ rows: NotificationRow[]; total: number }> {
  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = await supabase.from("notifications").select("id,type,payload,read_at,created_at", { count: "exact" })
    .order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as NotificationRow[];
  return { rows, total: count ?? rows.length };
}

export async function unreadNotificationCount(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}
