import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_ADSENSE, DEFAULT_GENERAL, DEFAULT_SEO,
  type AdsenseSettings, type GeneralSettings, type SeoSettings
} from "@/lib/services/settings";
import { JOB_STATUSES, APPLICATION_STATUSES } from "@/lib/types";

// Read-side queries for the Super Admin dashboard. Everything runs with the signed-in admin's client, so
// RLS (admin policies) is the authorization. No service-role access.

type SB = SupabaseClient;
export const PAGE_SIZE = 20;
export const AUDIT_PAGE_SIZE = 50;

const log = (scope: string, error: { message: string } | null | undefined) => {
  if (error) console.error(`[admin:${scope}]`, error.message);
};

/** Makes free text safe to embed in a PostgREST `ilike` / `or()` filter (no separators or wildcards of our own). */
export function cleanQuery(q: string | undefined | null): string {
  return (q ?? "").replace(/[\\"%,()*'`;]/g, " ").replace(/_/g, "%").replace(/\s+/g, " ").trim().slice(0, 80);
}
export const likePattern = (q: string) => `%${q}%`;

const range = (page: number, size = PAGE_SIZE) => [(page - 1) * size, page * size - 1] as const;

export interface Actor { id: string; full_name: string; email: string }

export async function profilesByIds(sb: SB, ids: (string | null | undefined)[]): Promise<Map<string, Actor>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const map = new Map<string, Actor>();
  if (!unique.length) return map;
  const { data, error } = await sb.from("profiles").select("id,full_name,email").in("id", unique);
  log("profiles", error);
  for (const p of data ?? []) map.set(p.id, p as Actor);
  return map;
}

export const actorLabel = (a: Actor | undefined) => (a ? a.full_name || a.email : "—");

/** Title in the job's own language, else any available translation. */
export function pickTitle(translations: { locale: string; title: string }[] | null | undefined, preferred: string): string {
  const list = translations ?? [];
  return (list.find((x) => x.locale === preferred) ?? list[0])?.title ?? "";
}

// ------------------------------------------------------------------ layout badges + overview
export async function getBadgeCounts(sb: SB, userId: string) {
  const head = { count: "exact", head: true } as const;
  const [jobs, companies, unread] = await Promise.all([
    sb.from("jobs").select("id", head).eq("status", "pending_review"),
    sb.from("companies").select("id", head).eq("verification_status", "pending"),
    sb.from("notifications").select("id", head).eq("user_id", userId).is("read_at", null)
  ]);
  return { pendingJobs: jobs.count ?? 0, pendingCompanies: companies.count ?? 0, unread: unread.count ?? 0 };
}

export interface AdminStats {
  users: number; employers: number; candidates: number; companies: number; pending_companies: number;
  jobs: number; pending_jobs: number; published_jobs: number; applications: number; external_clicks: number;
}

export async function getStats(sb: SB): Promise<AdminStats | null> {
  const { data, error } = await sb.rpc("admin_stats");
  log("stats", error);
  return (data as AdminStats | null) ?? null;
}

export interface JobRow {
  id: string; ref_no: number; status: string; default_language: string; city: string | null; deadline: string | null;
  updated_at: string; featured: boolean; company_id: string; company_name: string; title: string;
}

const JOB_ROW_SELECT = "id,ref_no,status,default_language,city,deadline,updated_at,featured,company_id,companies(name),job_translations(locale,title)";
const toJobRow = (r: any): JobRow => ({
  id: r.id, ref_no: r.ref_no, status: r.status, default_language: r.default_language, city: r.city, deadline: r.deadline,
  updated_at: r.updated_at, featured: r.featured, company_id: r.company_id,
  company_name: r.companies?.name ?? "", title: pickTitle(r.job_translations, r.default_language)
});

export async function oldestPendingJobs(sb: SB, limit = 5): Promise<JobRow[]> {
  const { data, error } = await sb.from("jobs").select(JOB_ROW_SELECT).eq("status", "pending_review").order("updated_at", { ascending: true }).limit(limit);
  log("pending-jobs", error);
  return (data ?? []).map(toJobRow);
}

export interface CompanyRow {
  id: string; name: string; slug: string; verification_status: string; managed_by: string; city: string | null; created_at: string; members: number;
}
const toCompanyRow = (r: any): CompanyRow => ({
  id: r.id, name: r.name, slug: r.slug, verification_status: r.verification_status, managed_by: r.managed_by, city: r.city,
  created_at: r.created_at, members: r.company_members?.[0]?.count ?? 0
});

export async function oldestPendingCompanies(sb: SB, limit = 5): Promise<CompanyRow[]> {
  const { data, error } = await sb.from("companies")
    .select("id,name,slug,verification_status,managed_by,city,created_at,company_members(count)")
    .eq("verification_status", "pending").order("created_at", { ascending: true }).limit(limit);
  log("pending-companies", error);
  return (data ?? []).map(toCompanyRow);
}

export interface AuditRow {
  id: string; action: string; entity_type: string; entity_id: string | null; metadata: unknown; created_at: string; actor: Actor | null;
}

async function attachActors(sb: SB, rows: any[]): Promise<AuditRow[]> {
  const actors = await profilesByIds(sb, rows.map((r) => r.actor_id));
  return rows.map((r) => ({
    id: r.id, action: r.action, entity_type: r.entity_type, entity_id: r.entity_id, metadata: r.metadata, created_at: r.created_at,
    actor: r.actor_id ? actors.get(r.actor_id) ?? null : null
  }));
}

export async function recentAudit(sb: SB, limit = 10): Promise<AuditRow[]> {
  const { data, error } = await sb.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
  log("recent-audit", error);
  return attachActors(sb, data ?? []);
}

// ------------------------------------------------------------------ jobs
export const JOB_FILTERS = ["pending_review", "approved", "rejected", "changes_requested", "expired", "archived", "all"] as const;
export const SEARCH_ID_CAP = { jobs: 150, companies: 40 } as const;   // ids passed in the PostgREST filter (URL length bound)

export async function listJobs(sb: SB, o: { status: string; q: string; page: number }): Promise<{ rows: JobRow[]; total: number }> {
  const q = cleanQuery(o.q);
  let orFilter: string | null = null;
  if (q) {
    const [tr, co] = await Promise.all([
      sb.from("job_translations").select("job_id").ilike("title", likePattern(q)).limit(SEARCH_ID_CAP.jobs),
      sb.from("companies").select("id").ilike("name", likePattern(q)).limit(SEARCH_ID_CAP.companies)
    ]);
    log("jobs-search", tr.error ?? co.error);
    const jobIds = [...new Set((tr.data ?? []).map((r: any) => r.job_id as string))];
    const companyIds = (co.data ?? []).map((r: any) => r.id as string);
    const parts: string[] = [];
    if (jobIds.length) parts.push(`id.in.(${jobIds.join(",")})`);
    if (companyIds.length) parts.push(`company_id.in.(${companyIds.join(",")})`);
    if (!parts.length) return { rows: [], total: 0 };
    orFilter = parts.join(",");
  }
  let query = sb.from("jobs").select(JOB_ROW_SELECT, { count: "exact" });
  if ((JOB_STATUSES as string[]).includes(o.status)) query = query.eq("status", o.status);
  if (orFilter) query = query.or(orFilter);
  const [from, to] = range(o.page);
  const { data, count, error } = await query.order("updated_at", { ascending: o.status === "pending_review" }).range(from, to);
  log("jobs", error);
  return { rows: (data ?? []).map(toJobRow), total: count ?? 0 };
}

export async function getJobDetail(sb: SB, id: string) {
  const { data: job, error } = await sb
    .from("jobs")
    .select("*,companies(id,name,verification_status),job_categories(name_en,name_ur),job_translations(*)")
    .eq("id", id)
    .maybeSingle();
  log("job", error);
  if (!job) return null;
  const [reviews, published] = await Promise.all([
    sb.from("job_reviews").select("id,actor_id,action,reason,from_status,to_status,created_at").eq("job_id", id).order("created_at", { ascending: false }).limit(100),
    sb.from("job_published").select("job_id,deadline,featured,approved_at,published_at,job_published_translations(locale,title)").eq("job_id", id).maybeSingle()
  ]);
  log("job-reviews", reviews.error);
  const actors = await profilesByIds(sb, (reviews.data ?? []).map((r: any) => r.actor_id));
  return {
    job,
    reviews: (reviews.data ?? []).map((r: any) => ({ ...r, actor: r.actor_id ? actors.get(r.actor_id) ?? null : null })),
    published: published.data as any | null
  };
}

// ------------------------------------------------------------------ companies
export const COMPANY_FILTERS = ["pending", "verified", "rejected", "suspended", "all"] as const;

export async function listCompanies(sb: SB, o: { status: string; q: string; page: number }): Promise<{ rows: CompanyRow[]; total: number }> {
  const q = cleanQuery(o.q);
  let query = sb.from("companies")
    .select("id,name,slug,verification_status,managed_by,city,created_at,company_members(count)", { count: "exact" });
  if (o.status !== "all") query = query.eq("verification_status", o.status);
  if (q) query = query.ilike("name", likePattern(q));
  const [from, to] = range(o.page);
  const { data, count, error } = await query.order("created_at", { ascending: o.status === "pending" }).range(from, to);
  log("companies", error);
  return { rows: (data ?? []).map(toCompanyRow), total: count ?? 0 };
}

export async function getCompanyDetail(sb: SB, id: string) {
  const { data: company, error } = await sb.from("companies").select("*").eq("id", id).maybeSingle();
  log("company", error);
  if (!company) return null;
  const [priv, docs, members, invites, jobs] = await Promise.all([
    sb.from("company_private").select("*").eq("company_id", id).maybeSingle(),
    sb.from("company_verification_documents").select("id,file_name,doc_type,created_at").eq("company_id", id).order("created_at", { ascending: false }),
    sb.from("company_members").select("user_id,role,created_at,profiles(full_name,email,status)").eq("company_id", id).order("created_at", { ascending: true }),
    sb.from("company_invitations").select("id,email,role,expires_at,created_at").eq("company_id", id).is("accepted_at", null).is("revoked_at", null).order("created_at", { ascending: false }),
    sb.from("jobs").select(JOB_ROW_SELECT).eq("company_id", id).order("updated_at", { ascending: false }).limit(10)
  ]);
  log("company-parts", priv.error ?? docs.error ?? members.error ?? invites.error ?? jobs.error);
  return {
    company,
    priv: priv.data as any | null,
    documents: (docs.data ?? []) as { id: string; file_name: string; doc_type: string; created_at: string }[],
    members: (members.data ?? []).map((m: any) => ({
      user_id: m.user_id as string, role: m.role as string, created_at: m.created_at as string,
      name: m.profiles?.full_name ?? "", email: m.profiles?.email ?? "", status: m.profiles?.status ?? "active"
    })),
    invitations: (invites.data ?? []) as { id: string; email: string; role: string; expires_at: string; created_at: string }[],
    jobs: (jobs.data ?? []).map(toJobRow)
  };
}

/** Existing employer account by e-mail (for "add member" / "assign owner"). */
export async function findEmployerByEmail(sb: SB, email: string): Promise<{ id: string; email: string } | null> {
  const { data } = await sb.from("profiles").select("id,email").eq("role", "employer").eq("email", email.toLowerCase()).limit(1);
  return (data?.[0] as { id: string; email: string } | undefined) ?? null;
}

// ------------------------------------------------------------------ users
export interface UserRow { id: string; email: string; full_name: string; role: string; status: string; created_at: string }

export async function listUsers(sb: SB, o: { q: string; role: string; status: string; page: number }): Promise<{ rows: UserRow[]; total: number }> {
  const q = cleanQuery(o.q);
  let query = sb.from("profiles").select("id,email,full_name,role,status,created_at", { count: "exact" });
  if (["admin", "employer", "job_seeker"].includes(o.role)) query = query.eq("role", o.role);
  if (["active", "suspended"].includes(o.status)) query = query.eq("status", o.status);
  if (q) query = query.or(`full_name.ilike.${likePattern(q)},email.ilike.${likePattern(q)}`);
  const [from, to] = range(o.page);
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
  log("users", error);
  return { rows: (data ?? []) as UserRow[], total: count ?? 0 };
}

// ------------------------------------------------------------------ applications (read-only)
export interface ApplicationRow {
  id: string; job_id: string; job_title: string; company_id: string; company_name: string; status: string; submitted_at: string;
}

export async function listApplications(sb: SB, o: { status: string; company: string; q: string; page: number }): Promise<{ rows: ApplicationRow[]; total: number }> {
  const q = cleanQuery(o.q);
  const company = cleanQuery(o.company);
  let query = sb.from("applications").select("id,job_id,job_title,company_id,company_name,status,submitted_at", { count: "exact" });
  if ((APPLICATION_STATUSES as string[]).includes(o.status)) query = query.eq("status", o.status);
  if (q) query = query.ilike("job_title", likePattern(q));
  if (company) query = query.ilike("company_name", likePattern(company));
  const [from, to] = range(o.page);
  const { data, count, error } = await query.order("submitted_at", { ascending: false }).range(from, to);
  log("applications", error);
  return { rows: (data ?? []) as ApplicationRow[], total: count ?? 0 };
}

export async function getApplicationDetail(sb: SB, id: string) {
  const { data: app, error } = await sb.from("applications").select("*").eq("id", id).maybeSingle();
  log("application", error);
  if (!app) return null;
  const [answers, events] = await Promise.all([
    sb.from("application_answers").select("id,question,answer").eq("application_id", id),
    sb.from("application_events").select("id,actor_id,from_status,to_status,created_at").eq("application_id", id).order("created_at", { ascending: true })
  ]);
  const actors = await profilesByIds(sb, (events.data ?? []).map((e: any) => e.actor_id));
  return {
    app,
    answers: (answers.data ?? []) as { id: string; question: string; answer: string }[],
    events: (events.data ?? []).map((e: any) => ({ ...e, actor: e.actor_id ? actors.get(e.actor_id) ?? null : null }))
  };
}

// ------------------------------------------------------------------ categories
export interface CategoryRow { id: string; slug: string; name_en: string; name_ur: string | null; sort_order: number; is_active: boolean; jobs: number }

export async function listCategories(sb: SB): Promise<CategoryRow[]> {
  const { data, error } = await sb.from("job_categories").select("id,slug,name_en,name_ur,sort_order,is_active,jobs(count)").order("sort_order").order("name_en");
  log("categories", error);
  return (data ?? []).map((c: any) => ({ id: c.id, slug: c.slug, name_en: c.name_en, name_ur: c.name_ur, sort_order: c.sort_order, is_active: c.is_active, jobs: c.jobs?.[0]?.count ?? 0 }));
}

export async function categoryJobCount(sb: SB, id: string): Promise<number> {
  const { count } = await sb.from("jobs").select("id", { count: "exact", head: true }).eq("category_id", id);
  return count ?? 0;
}

// ------------------------------------------------------------------ blog
export interface PostRow {
  id: string; status: string; published_at: string | null; updated_at: string; category: string;
  translations: { locale: string; title: string; slug: string }[];
}

export async function listPosts(sb: SB, o: { status: string; q: string; page: number }): Promise<{ rows: PostRow[]; total: number }> {
  const q = cleanQuery(o.q);
  let ids: string[] | null = null;
  if (q) {
    const { data, error } = await sb.from("blog_post_translations").select("post_id").ilike("title", likePattern(q)).limit(SEARCH_ID_CAP.jobs);
    log("posts-search", error);
    ids = [...new Set((data ?? []).map((r: any) => r.post_id as string))];
    if (!ids.length) return { rows: [], total: 0 };
  }
  let query = sb.from("blog_posts")
    .select("id,status,published_at,updated_at,blog_categories(name_en),blog_post_translations(locale,title,slug)", { count: "exact" });
  if (["draft", "published", "archived"].includes(o.status)) query = query.eq("status", o.status);
  if (ids) query = query.in("id", ids);
  const [from, to] = range(o.page);
  const { data, count, error } = await query.order("updated_at", { ascending: false }).range(from, to);
  log("posts", error);
  return {
    total: count ?? 0,
    rows: (data ?? []).map((p: any) => ({
      id: p.id, status: p.status, published_at: p.published_at, updated_at: p.updated_at,
      category: p.blog_categories?.name_en ?? "", translations: p.blog_post_translations ?? []
    }))
  };
}

export async function getPost(sb: SB, id: string) {
  const { data, error } = await sb.from("blog_posts").select("*,blog_post_translations(*)").eq("id", id).maybeSingle();
  log("post", error);
  return data as any | null;
}

export async function listBlogCategories(sb: SB): Promise<{ id: string; name_en: string; name_ur: string | null }[]> {
  const { data, error } = await sb.from("blog_categories").select("id,name_en,name_ur").order("sort_order").order("name_en");
  log("blog-categories", error);
  return (data ?? []) as any[];
}

// ------------------------------------------------------------------ notifications
export async function listNotifications(sb: SB, userId: string, limit = 100) {
  const { data, error } = await sb.from("notifications").select("id,type,payload,read_at,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  log("notifications", error);
  return (data ?? []) as { id: string; type: string; payload: Record<string, any> | null; read_at: string | null; created_at: string }[];
}

// ------------------------------------------------------------------ audit logs
export interface AuditFilters { prefix: string; entity: string; from: string; to: string; page: number }
export const AUDIT_PREFIXES = ["job.", "company.", "user.", "admin."] as const;
export const AUDIT_ENTITIES = ["job", "company", "user"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function listAudit(sb: SB, f: AuditFilters): Promise<{ rows: AuditRow[]; total: number }> {
  let query = sb.from("audit_logs").select("*", { count: "exact" });
  const prefix = f.prefix.replace(/[^a-z.]/g, "").slice(0, 40);
  if (prefix) query = query.like("action", `${prefix}%`);
  if (/^[a-z_]{1,40}$/.test(f.entity)) query = query.eq("entity_type", f.entity);
  if (DATE_RE.test(f.from)) query = query.gte("created_at", new Date(`${f.from}T00:00:00+05:00`).toISOString());
  if (DATE_RE.test(f.to)) query = query.lt("created_at", new Date(new Date(`${f.to}T00:00:00+05:00`).getTime() + 86400000).toISOString());
  const [from, to] = range(f.page, AUDIT_PAGE_SIZE);
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
  log("audit", error);
  return { rows: await attachActors(sb, data ?? []), total: count ?? 0 };
}

// ------------------------------------------------------------------ settings
export async function getSettingsForAdmin(sb: SB): Promise<{ general: GeneralSettings; seo: SeoSettings; adsense: AdsenseSettings; updatedAt: Record<string, string> }> {
  const { data, error } = await sb.from("site_settings").select("key,value,updated_at");
  log("settings", error);
  const out = { general: DEFAULT_GENERAL, seo: DEFAULT_SEO, adsense: DEFAULT_ADSENSE, updatedAt: {} as Record<string, string> };
  for (const row of data ?? []) {
    out.updatedAt[row.key] = row.updated_at;
    if (row.key === "general") out.general = { ...DEFAULT_GENERAL, ...row.value };
    if (row.key === "seo") out.seo = { ...DEFAULT_SEO, ...row.value };
    if (row.key === "adsense") out.adsense = { ...DEFAULT_ADSENSE, ...row.value, slots: { ...DEFAULT_ADSENSE.slots, ...row.value?.slots } };
  }
  return out;
}

// ------------------------------------------------------------------ reports
// PostgREST has no GROUP BY, so aggregates use head counts per enum value or embedded counts. Where rows must be
// bucketed in TypeScript the selects are bounded (limits below) and the report says so.
export const REPORT_LIMITS = { companies: 1000, users: 20000, pending: 1000 } as const;

const monthKey = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit" }).formatToParts(new Date(iso));
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
};

export async function getReports(sb: SB) {
  const head = { count: "exact", head: true } as const;
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

  const [jobCounts, appCounts, companies, categories, uncategorized, users, pendingJobs, pendingCompanies] = await Promise.all([
    Promise.all(JOB_STATUSES.map((s) => sb.from("jobs").select("id", head).eq("status", s))),
    Promise.all(APPLICATION_STATUSES.map((s) => sb.from("applications").select("id", head).eq("status", s))),
    sb.from("companies").select("id,name,applications(count),job_external_clicks(count)").limit(REPORT_LIMITS.companies),
    sb.from("job_categories").select("id,name_en,name_ur,jobs(count)").order("sort_order"),
    sb.from("jobs").select("id", head).is("category_id", null),
    sb.from("profiles").select("role,created_at").gte("created_at", sixMonthsAgo).limit(REPORT_LIMITS.users),
    sb.from("jobs").select("id,updated_at").eq("status", "pending_review").order("updated_at", { ascending: true }).limit(REPORT_LIMITS.pending),
    sb.from("companies").select("id,created_at").eq("verification_status", "pending").order("created_at", { ascending: true }).limit(REPORT_LIMITS.pending)
  ]);
  log("reports", companies.error ?? categories.error ?? users.error ?? pendingJobs.error ?? pendingCompanies.error);

  const topCompanies = (companies.data ?? [])
    .map((c: any) => ({ id: c.id as string, name: c.name as string, applications: c.applications?.[0]?.count ?? 0, clicks: c.job_external_clicks?.[0]?.count ?? 0 }))
    .filter((c) => c.applications > 0 || c.clicks > 0)
    .sort((a, b) => b.applications + b.clicks - (a.applications + a.clicks))
    .slice(0, 10);

  // Month buckets, oldest first, always 6 entries.
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 15).toISOString()));
  const byMonth = new Map(months.map((m) => [m, { employer: 0, job_seeker: 0, admin: 0 } as Record<string, number>]));
  for (const u of users.data ?? []) {
    const bucket = byMonth.get(monthKey(u.created_at));
    if (bucket && u.role in bucket) bucket[u.role]++;
  }

  const backlog = (rows: { updated_at?: string; created_at?: string }[]) => {
    const buckets = { d1: 0, d3: 0, d7: 0, older: 0 };
    let oldestDays = 0;
    for (const r of rows) {
      const days = (now.getTime() - new Date((r.updated_at ?? r.created_at) as string).getTime()) / 86400000;
      oldestDays = Math.max(oldestDays, days);
      if (days < 1) buckets.d1++; else if (days < 3) buckets.d3++; else if (days < 7) buckets.d7++; else buckets.older++;
    }
    return { ...buckets, total: rows.length, oldestDays: Math.floor(oldestDays) };
  };

  return {
    jobsByStatus: JOB_STATUSES.map((s, i) => ({ status: s, count: jobCounts[i].count ?? 0 })),
    applicationsByStatus: APPLICATION_STATUSES.map((s, i) => ({ status: s, count: appCounts[i].count ?? 0 })),
    topCompanies,
    jobsPerCategory: [
      ...(categories.data ?? []).map((c: any) => ({ id: c.id as string, name_en: c.name_en as string, name_ur: c.name_ur as string | null, count: c.jobs?.[0]?.count ?? 0 })),
      ...((uncategorized.count ?? 0) > 0 ? [{ id: "none", name_en: "", name_ur: null, count: uncategorized.count ?? 0 }] : [])
    ],
    newUsers: months.map((m) => ({ month: m, ...(byMonth.get(m) as Record<string, number>) })),
    backlogJobs: backlog(pendingJobs.data ?? []),
    backlogCompanies: backlog(pendingCompanies.data ?? []),
    truncated: (companies.data?.length ?? 0) >= REPORT_LIMITS.companies || (users.data?.length ?? 0) >= REPORT_LIMITS.users
  };
}
