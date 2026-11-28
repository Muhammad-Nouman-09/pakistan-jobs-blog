// Pure transformation of the v1 data (Upstash Redis / .data/db.json) into the v2 relational model.
// No I/O here so it can be unit-tested; scripts/migrate-legacy.ts performs the writes.
//
// v1 shapes (see legacy/v1/lib/db.js): users[], jobs[], messages[], adsense{}. Every record ends up in
// exactly one of three buckets in the report: migrated, rejected (cannot be migrated, with the reason) or
// manual review (migrated safely/partially or skipped on purpose, needs a human decision).

export interface LegacyUser {
  id: number; name?: string; email?: string; passwordHash?: string; role?: string; status?: string;
  companyName?: string; companyAbout?: string; website?: string; phone?: string; headline?: string; summary?: string;
  education?: string; experience?: string; skills?: string; languages?: string; city?: string; province?: string;
}
export interface LegacyJob {
  id: number; title?: string; organization?: string; sector?: string; category?: string; city?: string; province?: string;
  vacancies?: number; salary?: string; education?: string; experience?: string; postedDate?: string; deadline?: string;
  description?: string; requirements?: string; howToApply?: string; applyUrl?: string; source?: string; featured?: boolean;
  status?: string; employerId?: number | null;
}
export interface LegacyMessage { id: number; name?: string; email?: string; subject?: string; message?: string; createdAt?: string; read?: boolean }
export interface LegacyAdsense { publisherId?: string; enabled?: boolean; slots?: Record<string, string> }
export interface LegacyData { users: LegacyUser[]; jobs: LegacyJob[]; messages: LegacyMessage[]; adsense: LegacyAdsense | null }

export interface UserPlan {
  legacyId: number; email: string; passwordHash: string; fullName: string; role: "job_seeker" | "employer"; suspended: boolean;
  phone: string | null; city: string | null; province: string | null; companyKey: string | null;
  candidate: { headline: string; summary: string; skills: string[]; cvText: string } | null;
}
export interface CompanyPlan {
  key: string; name: string; description: string; website: string | null; phone: string | null; city: string | null;
  managedBy: "self" | "platform"; verified: boolean; ownerLegacyUserId: number | null;
}
export interface JobPlan {
  legacyId: number; companyKey: string; status: "approved" | "expired" | "draft"; title: string; description: string; requirements: string;
  howToApply: string; education: string; experience: string; salaryText: string; categoryName: string; sector: "government" | "private";
  city: string | null; province: string | null; vacancies: number; deadline: string | null; publishedAt: string | null;
  applyUrl: string | null; source: string | null; featured: boolean;
}
export interface MessagePlan { legacyId: number; name: string; email: string; subject: string; message: string; createdAt: string | null; read: boolean }
export interface Report {
  counts: { users: number; companies: number; jobs: number; messages: number };
  rejected: { kind: string; legacyId: number | string; reason: string }[];
  manualReview: { kind: string; legacyId: number | string; reason: string }[];
}
export interface Plan {
  users: UserPlan[]; companies: CompanyPlan[]; jobs: JobPlan[]; messages: MessagePlan[];
  adsense: { enabled: boolean; publisherId: string; slots: Record<string, string> } | null; report: Report;
}

const EMAIL = /^\S+@\S+\.\S+$/;
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isUrl = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/[^\s]+$/i.test(u.trim());
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const orNull = (v: unknown, max: number) => clean(v, max) || null;
const PROVINCES = new Set(["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Gilgit-Baltistan", "Azad Jammu & Kashmir", "Islamabad Capital Territory"]);

export function planMigration(data: LegacyData, today: string): Plan {
  const report: Report = { counts: { users: 0, companies: 0, jobs: 0, messages: 0 }, rejected: [], manualReview: [] };
  const reject = (kind: string, legacyId: number | string, reason: string) => report.rejected.push({ kind, legacyId, reason });
  const review = (kind: string, legacyId: number | string, reason: string) => report.manualReview.push({ kind, legacyId, reason });

  // ---- users + their companies
  const users: UserPlan[] = [];
  const companies: CompanyPlan[] = [];
  const seen = new Set<string>();
  const companyOfUser = new Map<number, string>();
  for (const u of data.users ?? []) {
    const email = clean(u.email, 200).toLowerCase();
    if (!EMAIL.test(email)) { reject("user", u.id, "invalid or missing e-mail"); continue; }
    if (seen.has(email)) { reject("user", u.id, `duplicate e-mail (${email}); first occurrence kept`); continue; }
    if (u.role === "admin") {
      review("user", u.id, "legacy admin account NOT migrated automatically. Provision administrators deliberately with `npm run admin:provision`.");
      continue;
    }
    if (u.role !== "employer" && u.role !== "seeker") { reject("user", u.id, `unknown role "${u.role}"`); continue; }
    if (!BCRYPT.test(u.passwordHash ?? "")) { reject("user", u.id, "missing or non-bcrypt password hash (the user can use \"forgot password\" after being created manually)"); continue; }
    seen.add(email);
    const employer = u.role === "employer";
    const fullName = clean(u.name, 120) || email.split("@")[0];
    let companyKey: string | null = null;
    if (employer) {
      companyKey = `employer:${u.id}`;
      const website = clean(u.website, 300);
      if (website && !isUrl(website)) review("user", u.id, `company website "${website}" is not an http(s) URL and was dropped`);
      companies.push({
        key: companyKey, name: clean(u.companyName, 150) || `${fullName} (company)`, description: clean(u.companyAbout, 5000),
        website: isUrl(website) ? website : null, phone: orNull(u.phone, 40), city: orNull(u.city, 80), managedBy: "self",
        verified: u.status === "active", ownerLegacyUserId: u.id
      });
      if (!clean(u.companyName, 150)) review("user", u.id, "employer had no company name; a placeholder company name was generated");
      if (u.status === "active") review("user", u.id, "active employer mapped to a VERIFIED company (they were verified by an admin on the old site)");
      companyOfUser.set(u.id, companyKey);
    }
    const skills = clean(u.skills, 4000).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 50).map((s) => s.slice(0, 60));
    const cvParts = [["Education", u.education], ["Experience", u.experience], ["Languages", u.languages]]
      .map(([h, v]) => (clean(v, 4000) ? `${h}\n${clean(v, 4000)}` : "")).filter(Boolean);
    const hasCv = !employer && (clean(u.headline, 160) || clean(u.summary, 3000) || skills.length || cvParts.length);
    users.push({
      legacyId: u.id, email, passwordHash: u.passwordHash as string, fullName, role: employer ? "employer" : "job_seeker",
      suspended: u.status === "suspended", phone: orNull(u.phone, 40), city: orNull(u.city, 80),
      province: PROVINCES.has(clean(u.province, 80)) ? clean(u.province, 80) : null, companyKey,
      candidate: hasCv ? { headline: clean(u.headline, 160), summary: clean(u.summary, 3000), skills, cvText: cvParts.join("\n\n") } : null
    });
  }

  // ---- jobs (assign to the employer's company, or to a platform-managed company named after the organisation)
  const jobs: JobPlan[] = [];
  const orgCompany = new Map<string, string>();
  for (const j of data.jobs ?? []) {
    const title = clean(j.title, 200);
    if (title.length < 3) { reject("job", j.id, "title missing or shorter than 3 characters"); continue; }
    let companyKey = j.employerId != null ? companyOfUser.get(j.employerId) : undefined;
    if (!companyKey) {
      const org = clean(j.organization, 150);
      if (!org) { reject("job", j.id, "no employer account and no organisation name"); continue; }
      const norm = org.toLowerCase().replace(/\s+/g, " ");
      companyKey = orgCompany.get(norm);
      if (!companyKey) {
        companyKey = `org:${norm}`;
        orgCompany.set(norm, companyKey);
        companies.push({ key: companyKey, name: org, description: "", website: null, phone: null, city: null, managedBy: "platform", verified: true, ownerLegacyUserId: null });
      }
      if (j.employerId != null) review("job", j.id, `employer #${j.employerId} was not migrated; job moved to the platform-managed company "${org}"`);
    }
    const deadline = DATE.test(clean(j.deadline, 10)) ? clean(j.deadline, 10) : null;
    const applyUrl = isUrl(j.applyUrl) ? clean(j.applyUrl, 500) : null;
    let status: JobPlan["status"] = j.status === "published" ? "approved" : "draft";
    if (status === "approved") {
      if (!deadline) { status = "draft"; review("job", j.id, "published job has no valid deadline; imported as DRAFT"); }
      else if (!applyUrl) { status = "draft"; review("job", j.id, "published job has no valid official apply link; imported as DRAFT (add an apply link or choose on-site applications, then submit for review)"); }
      else if (deadline < today) status = "expired";
    }
    const province = clean(j.province, 80);
    const vacancies = Number.isFinite(Number(j.vacancies)) && Number(j.vacancies) >= 1 ? Math.min(Math.floor(Number(j.vacancies)), 10000) : 1;
    if (vacancies !== Number(j.vacancies)) review("job", j.id, `vacancies "${j.vacancies}" was not a valid number; set to ${vacancies}`);
    jobs.push({
      legacyId: j.id, companyKey, status, title, description: clean(j.description, 20000), requirements: clean(j.requirements, 10000),
      howToApply: clean(j.howToApply, 5000), education: clean(j.education, 500), experience: clean(j.experience, 500), salaryText: clean(j.salary, 300),
      categoryName: clean(j.category, 120) || "Other", sector: j.sector === "Private" ? "private" : "government",
      city: orNull(j.city, 80), province: PROVINCES.has(province) ? province : null, vacancies, deadline,
      publishedAt: DATE.test(clean(j.postedDate, 10)) ? `${clean(j.postedDate, 10)}T00:00:00+05:00` : null,
      applyUrl, source: orNull(j.source, 300), featured: !!j.featured
    });
  }

  // ---- messages, adsense
  const messages: MessagePlan[] = [];
  for (const m of data.messages ?? []) {
    const email = clean(m.email, 200);
    const message = clean(m.message, 5000);
    if (!EMAIL.test(email) || !message) { reject("message", m.id, "missing e-mail or message text"); continue; }
    messages.push({ legacyId: m.id, name: clean(m.name, 100) || "—", email, subject: clean(m.subject, 200) || "—", message,
      createdAt: DATE.test(clean(m.createdAt, 10)) ? `${clean(m.createdAt, 10)}T00:00:00Z` : null, read: !!m.read });
  }
  let adsense: Plan["adsense"] = null;
  if (data.adsense && (data.adsense.publisherId || data.adsense.enabled)) {
    const publisherId = clean(data.adsense.publisherId, 100);
    const valid = /^ca-pub-\d{10,20}$/.test(publisherId);
    const slots: Record<string, string> = {};
    for (const k of ["topBanner", "inFeed", "inArticle", "sidebar"]) { const v = clean(data.adsense.slots?.[k], 30); slots[k] = /^\d{6,20}$/.test(v) ? v : ""; }
    adsense = { enabled: !!data.adsense.enabled && valid, publisherId: valid ? publisherId : "", slots };
    if (!valid && publisherId) review("adsense", "settings", `publisher id "${publisherId}" is not valid; AdSense left disabled`);
  }

  report.counts = { users: users.length, companies: companies.length, jobs: jobs.length, messages: messages.length };
  return { users, companies, jobs, messages, adsense, report };
}
