import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { planMigration, type LegacyData } from "@/lib/legacy/transform";

const HASH = "$2a$10$" + "a".repeat(53);
const seed = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", "..", "data", "legacy-seed-jobs.json"), "utf8"));
const data = (o: Partial<LegacyData> = {}): LegacyData => ({ users: [], jobs: [], messages: [], adsense: null, ...o });

describe("legacy seed jobs (the real data/legacy-seed-jobs.json)", () => {
  const plan = planMigration(data({ jobs: seed }), "2026-11-23");
  it("migrates every seed job into platform-managed verified companies, nothing silently dropped", () => {
    expect(plan.jobs.length + plan.report.rejected.filter((r) => r.kind === "job").length).toBe(seed.length);
    expect(plan.companies.every((c) => c.managedBy === "platform" && c.verified)).toBe(true);
    expect(plan.jobs.every((j) => plan.companies.some((c) => c.key === j.companyKey))).toBe(true);
  });
  it("jobs past their deadline are imported as expired, open ones as approved, never lost", () => {
    for (const j of plan.jobs) {
      if (j.deadline && j.deadline < "2026-11-23") expect(j.status).toBe("expired");
      else if (j.deadline && j.applyUrl) expect(j.status).toBe("approved");
    }
    expect(plan.jobs.some((j) => j.status === "expired")).toBe(true);
  });
  it("keeps official apply links, source and pay scale text", () => {
    const first = plan.jobs[0];
    expect(first.applyUrl).toMatch(/^https?:\/\//);
    expect(first.source).toBeTruthy();
    expect(first.salaryText).toBeTruthy();
  });
});

describe("legacy users", () => {
  const users = [
    { id: 1, name: "Site Admin", email: "admin@x.pk", passwordHash: HASH, role: "admin", status: "active" },
    { id: 2, name: "Ali", email: "ALI@x.pk", passwordHash: HASH, role: "seeker", status: "active", headline: "Clerk", skills: "Typing, MS Office; Driving", education: "Matric", city: "Quetta", province: "Balochistan" },
    { id: 3, name: "Sara HR", email: "sara@corp.pk", passwordHash: HASH, role: "employer", status: "active", companyName: "Corp Ltd", website: "javascript:alert(1)", phone: "0300" },
    { id: 4, name: "Pending Co", email: "pending@corp.pk", passwordHash: HASH, role: "employer", status: "pending" },
    { id: 5, name: "Dupe", email: "ali@x.pk", passwordHash: HASH, role: "seeker", status: "active" },
    { id: 6, name: "Bad", email: "not-an-email", passwordHash: HASH, role: "seeker" },
    { id: 7, name: "NoHash", email: "nohash@x.pk", role: "seeker" },
    { id: 8, name: "Banned", email: "banned@x.pk", passwordHash: HASH, role: "seeker", status: "suspended" },
    { id: 9, name: "Hacker", email: "h@x.pk", passwordHash: HASH, role: "superuser", status: "active" }
  ];
  const plan = planMigration(data({ users }), "2026-11-23");
  it("never auto-creates an administrator from legacy data", () => {
    expect(plan.users.some((u) => u.email === "admin@x.pk")).toBe(false);
    expect(plan.report.manualReview.some((r) => r.legacyId === 1 && /admin:provision/.test(r.reason))).toBe(true);
    expect(plan.users.every((u) => u.role === "job_seeker" || u.role === "employer")).toBe(true);
  });
  it("maps seekers and employers, normalises e-mail, preserves the bcrypt hash", () => {
    const ali = plan.users.find((u) => u.legacyId === 2)!;
    expect(ali.email).toBe("ali@x.pk");
    expect(ali.role).toBe("job_seeker");
    expect(ali.passwordHash).toBe(HASH);
    expect(ali.candidate?.skills).toEqual(["Typing", "MS Office", "Driving"]);
    expect(ali.province).toBe("Balochistan");
    const sara = plan.companies.find((c) => c.ownerLegacyUserId === 3)!;
    expect(sara.name).toBe("Corp Ltd");
    expect(sara.website).toBeNull();
    expect(sara.verified).toBe(true);
    expect(plan.companies.find((c) => c.ownerLegacyUserId === 4)!.verified).toBe(false);
  });
  it("rejects duplicates, invalid e-mails, missing hashes and unknown roles with a reason; keeps suspended state", () => {
    const rejected = Object.fromEntries(plan.report.rejected.map((r) => [r.legacyId, r.reason]));
    expect(rejected[5]).toMatch(/duplicate/);
    expect(rejected[6]).toMatch(/e-mail/);
    expect(rejected[7]).toMatch(/hash/);
    expect(rejected[9]).toMatch(/role/);
    expect(plan.users.find((u) => u.legacyId === 8)!.suspended).toBe(true);
  });
  it("accounts for every record exactly once (migrated + rejected + manual-only admin)", () => {
    const manualOnly = plan.report.manualReview.filter((r) => r.kind === "user" && !plan.users.some((u) => u.legacyId === r.legacyId) && !plan.report.rejected.some((x) => x.legacyId === r.legacyId));
    expect(plan.users.length + plan.report.rejected.filter((r) => r.kind === "user").length + manualOnly.length).toBe(users.length);
  });
});

describe("legacy jobs, messages, adsense edge cases", () => {
  it("published job without an apply link or deadline becomes a draft flagged for review; employer-owned jobs follow their employer", () => {
    const u = [{ id: 3, name: "S", email: "s@c.pk", passwordHash: HASH, role: "employer", status: "active", companyName: "Corp" }];
    const jobs = [
      { id: 1, title: "Valid Job Title", status: "published", deadline: "2027-01-01", applyUrl: "https://x.pk/apply", employerId: 3, organization: "Corp", sector: "Private", vacancies: 2 },
      { id: 2, title: "No Link Job", status: "published", deadline: "2027-01-01", applyUrl: "", organization: "Org A" },
      { id: 3, title: "No Deadline", status: "published", applyUrl: "https://x.pk", organization: "Org A" },
      { id: 4, title: "xx", status: "published", organization: "Org A" },
      { id: 5, title: "Orphan", status: "draft", organization: "" },
      { id: 6, title: "Evil Link", status: "published", deadline: "2027-01-01", applyUrl: "javascript:alert(1)", organization: "Org B", vacancies: "many" as unknown as number }
    ];
    const plan = planMigration(data({ users: u, jobs }), "2026-11-23");
    const by = Object.fromEntries(plan.jobs.map((j) => [j.legacyId, j]));
    expect(by[1].status).toBe("approved");
    expect(by[1].companyKey).toBe("employer:3");
    expect(by[1].sector).toBe("private");
    expect(by[2].status).toBe("draft");
    expect(by[3].status).toBe("draft");
    expect(by[6].status).toBe("draft");
    expect(by[6].applyUrl).toBeNull();
    expect(by[6].vacancies).toBe(1);
    expect(plan.report.rejected.map((r) => r.legacyId).sort()).toEqual([4, 5]);
    expect(plan.companies.filter((c) => c.name === "Org A")).toHaveLength(1);   // same organisation shares one platform company
  });

  it("migrates messages and only valid AdSense settings", () => {
    const plan = planMigration(data({
      messages: [{ id: 1, name: "A", email: "a@b.co", subject: "Hi", message: "Wrong deadline", createdAt: "2026-11-10", read: true }, { id: 2, email: "bad", message: "x" }],
      adsense: { publisherId: "ca-pub-1234567890123456", enabled: true, slots: { topBanner: "1234567890", inFeed: "<script>" } }
    }), "2026-11-23");
    expect(plan.messages).toHaveLength(1);
    expect(plan.messages[0].read).toBe(true);
    expect(plan.report.rejected).toHaveLength(1);
    expect(plan.adsense).toEqual({ enabled: true, publisherId: "ca-pub-1234567890123456", slots: { topBanner: "1234567890", inFeed: "", inArticle: "", sidebar: "" } });
    const bad = planMigration(data({ adsense: { publisherId: "garbage", enabled: true } }), "2026-11-23");
    expect(bad.adsense?.enabled).toBe(false);
    expect(bad.report.manualReview.some((r) => r.kind === "adsense")).toBe(true);
  });
});
