/**
 * One-off, SAFE migration of the v1 data (Upstash Redis or .data/db.json) into Supabase.
 *
 *   npm run migrate:legacy              -> DRY RUN: reads v1, prints + writes the report, changes nothing
 *   npm run migrate:legacy -- --apply   -> performs the writes
 *   add --confirm-emails                -> mark migrated users' e-mails as confirmed (default: they must verify)
 *
 * Source: LEGACY_REDIS_URL + LEGACY_REDIS_TOKEN (the old UPSTASH_REDIS_REST_*), or LEGACY_DB_FILE=.data/db.json.
 * The v1 store is only READ. Nothing is deleted anywhere; re-running skips records that already exist.
 * Writes use the service-role key (SUPABASE_SERVICE_ROLE_KEY), which stays on your machine.
 * Output: migration-report-<timestamp>.json (contains e-mails — git-ignored) with migrated / rejected /
 * manual-review lists.
 */
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { planMigration, type LegacyData, type Plan } from "../lib/legacy/transform";
import { slugify } from "../lib/utils";

const APPLY = process.argv.includes("--apply");
const CONFIRM = process.argv.includes("--confirm-emails");

async function readLegacy(): Promise<LegacyData> {
  const file = process.env.LEGACY_DB_FILE;
  if (file) {
    const db = JSON.parse(fs.readFileSync(file, "utf8"));
    return { users: db.users ?? [], jobs: db.jobs ?? [], messages: db.messages ?? [], adsense: db.adsense ?? null };
  }
  const url = process.env.LEGACY_REDIS_URL, token = process.env.LEGACY_REDIS_TOKEN;
  if (!url || !token) throw new Error("Set LEGACY_REDIS_URL + LEGACY_REDIS_TOKEN or LEGACY_DB_FILE.");
  const get = async (key: string) => {
    const r = await fetch(`${url.replace(/\/$/, "")}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Redis read of "${key}" failed: HTTP ${r.status}`);
    const { result } = (await r.json()) as { result: string | null };
    return result ? JSON.parse(result) : null;      // @upstash/redis stored values as JSON strings
  };
  return { users: (await get("users")) ?? [], jobs: (await get("jobs")) ?? [], messages: (await get("messages")) ?? [], adsense: await get("adsense") };
}

type Counter = Record<string, number>;
const created: Counter = {}, skipped: Counter = {};
const bump = (c: Counter, k: string) => { c[k] = (c[k] ?? 0) + 1; };

async function apply(sb: SupabaseClient, plan: Plan) {
  const failures: { kind: string; legacyId: number | string; reason: string }[] = [];
  const fail = (kind: string, legacyId: number | string, reason: string) => { failures.push({ kind, legacyId, reason }); plan.report.rejected.push({ kind, legacyId, reason: `write failed: ${reason}` }); };

  // users (bcrypt hashes are imported as-is so people keep their passwords)
  const userId = new Map<number, string>();
  for (const u of plan.users) {
    const { data: ex } = await sb.from("profiles").select("id").ilike("email", u.email).maybeSingle();
    if (ex) { userId.set(u.legacyId, ex.id); bump(skipped, "users"); continue; }
    const { data, error } = await sb.auth.admin.createUser({
      email: u.email, password_hash: u.passwordHash, email_confirm: CONFIRM,
      user_metadata: { full_name: u.fullName, role: u.role }
    });
    if (error || !data.user) { fail("user", u.legacyId, error?.message ?? "unknown"); continue; }
    userId.set(u.legacyId, data.user.id);
    await sb.from("profiles").update({ phone: u.phone, city: u.city, province: u.province, ...(u.suspended ? { status: "suspended" } : {}) }).eq("id", data.user.id);
    if (u.candidate) {
      await sb.from("candidate_profiles").upsert({ user_id: data.user.id, headline: u.candidate.headline, summary: u.candidate.summary, skills: u.candidate.skills });
      if (u.candidate.cvText) {
        await sb.from("resumes").insert({
          user_id: data.user.id, title: "Imported from the previous site", is_default: true, visibility: "private",
          content: { summary: [u.candidate.headline, u.candidate.summary, u.candidate.cvText].filter(Boolean).join("\n\n"), skills: u.candidate.skills }
        });
      }
    }
    bump(created, "users");
  }

  // companies (+ owner membership for employer-owned ones)
  const companyId = new Map<string, string>();
  for (const c of plan.companies) {
    const ownerId = c.ownerLegacyUserId != null ? userId.get(c.ownerLegacyUserId) : undefined;
    if (c.ownerLegacyUserId != null && !ownerId) { fail("company", c.key, "owner user was not migrated"); continue; }
    let q = sb.from("companies").select("id").eq("name", c.name).eq("managed_by", c.managedBy);
    q = ownerId ? q.eq("created_by", ownerId) : q;
    const { data: ex } = await q.limit(1).maybeSingle();
    if (ex) { companyId.set(c.key, ex.id); bump(skipped, "companies"); continue; }
    const { data, error } = await sb.from("companies").insert({
      name: c.name, slug: `${slugify(c.name, 40) || "company"}-${Math.random().toString(36).slice(2, 8)}`, description: c.description, website: c.website,
      city: c.city, managed_by: c.managedBy, verification_status: c.verified ? "verified" : "pending",
      verified_at: c.verified ? new Date().toISOString() : null, created_by: ownerId ?? null
    }).select("id").single();
    if (error || !data) { fail("company", c.key, error?.message ?? "unknown"); continue; }
    companyId.set(c.key, data.id);
    await sb.from("company_private").insert({ company_id: data.id, phone: c.phone });
    if (ownerId) await sb.from("company_members").insert({ company_id: data.id, user_id: ownerId, role: "owner" });
    bump(created, "companies");
  }

  // categories
  const categoryId = new Map<string, string>();
  const { data: cats } = await sb.from("job_categories").select("id,name_en,slug");
  for (const c of cats ?? []) categoryId.set(c.name_en.toLowerCase(), c.id);
  async function category(name: string) {
    const hit = categoryId.get(name.toLowerCase());
    if (hit) return hit;
    const { data } = await sb.from("job_categories").insert({ slug: slugify(name, 50) || `category-${Date.now()}`, name_en: name.slice(0, 120), sort_order: 500 }).select("id").single();
    if (data) { categoryId.set(name.toLowerCase(), data.id); bump(created, "categories"); }
    return data?.id ?? null;
  }

  // jobs
  for (const j of plan.jobs) {
    const cid = companyId.get(j.companyKey);
    if (!cid) { fail("job", j.legacyId, "company was not migrated"); continue; }
    const { data: dup } = await sb.from("job_translations").select("job_id, jobs!inner(company_id)").eq("title", j.title).eq("jobs.company_id", cid).limit(1).maybeSingle();
    if (dup) { bump(skipped, "jobs"); continue; }
    const { data: job, error } = await sb.from("jobs").insert({
      company_id: cid, category_id: await category(j.categoryName), slug_base: [slugify(j.title, 60), slugify(j.city ?? "", 24)].filter(Boolean).join("-") || "job",
      default_language: "en", sector: j.sector, employment_type: "full_time", workplace_type: "onsite", province: j.province, city: j.city,
      vacancies: j.vacancies, deadline: j.deadline, application_method: j.applyUrl ? "external_url" : "internal", external_url: j.applyUrl,
      source: j.source, featured: j.featured
    }).select("id").single();
    if (error || !job) { fail("job", j.legacyId, error?.message ?? "unknown"); continue; }
    const tr = await sb.from("job_translations").insert({
      job_id: job.id, locale: "en", title: j.title, description: j.description, requirements: j.requirements, how_to_apply: j.howToApply,
      education: j.education, experience: j.experience, salary_text: j.salaryText
    });
    if (tr.error) { await sb.from("jobs").delete().eq("id", job.id); fail("job", j.legacyId, tr.error.message); continue; }
    if (j.status !== "draft") {
      // Service role bypasses the client-only guard triggers, which lets us restore the historical approval.
      await sb.from("jobs").update({ status: j.status, published_at: j.publishedAt ?? new Date().toISOString(), last_approved_at: new Date().toISOString() }).eq("id", job.id);
      await sb.from("job_reviews").insert({ job_id: job.id, action: "approved", reason: "Imported from the previous site (it was published there).", from_status: "draft", to_status: j.status });
      if (j.status === "approved") await sb.rpc("publish_job_copy", { p_job: job.id });
    }
    bump(created, "jobs");
  }

  // messages + adsense
  for (const m of plan.messages) {
    const { data: ex } = await sb.from("contact_messages").select("id").eq("email", m.email).eq("subject", m.subject).eq("message", m.message).limit(1).maybeSingle();
    if (ex) { bump(skipped, "messages"); continue; }
    const { error } = await sb.from("contact_messages").insert({ name: m.name, email: m.email, subject: m.subject, message: m.message, created_at: m.createdAt ?? undefined, read_at: m.read ? new Date().toISOString() : null });
    if (error) fail("message", m.legacyId, error.message); else bump(created, "messages");
  }
  if (plan.adsense) {
    const { data: cur } = await sb.from("site_settings").select("value").eq("key", "adsense").maybeSingle();
    await sb.from("site_settings").upsert({ key: "adsense", value: { ...(cur?.value ?? {}), ...plan.adsense } });
    bump(created, "adsense settings");
  }
  return failures;
}

async function main() {
  const legacy = await readLegacy();
  const plan = planMigration(legacy, new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()));
  console.log(`Legacy: ${legacy.users.length} users, ${legacy.jobs.length} jobs, ${legacy.messages.length} messages.`);
  console.log(`Plan:   ${plan.report.counts.users} users, ${plan.report.counts.companies} companies, ${plan.report.counts.jobs} jobs, ${plan.report.counts.messages} messages;`
    + ` ${plan.report.rejected.length} rejected, ${plan.report.manualReview.length} need manual review.`);

  let writeFailures: unknown[] = [];
  if (APPLY) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("--apply needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    writeFailures = await apply(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), plan);
    console.log("Created:", created, "Skipped (already present):", skipped);
  } else console.log("DRY RUN — nothing was written. Re-run with --apply to migrate.");

  const out = `migration-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(out, JSON.stringify({ mode: APPLY ? "apply" : "dry-run", created, skipped, writeFailures, ...plan.report }, null, 2));
  console.log(`Report written to ${out} (contains personal data — do not commit).`);
  if (writeFailures.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
