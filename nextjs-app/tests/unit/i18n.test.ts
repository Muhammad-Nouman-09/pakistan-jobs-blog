import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createT, getMessages, missingTranslations } from "@/lib/i18n";
import { dirOf, localePath, stripLocale } from "@/lib/i18n/config";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", "legacy", "tests", "messages"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("i18n", () => {
  it("English is the default and Urdu is right-to-left", () => {
    expect(dirOf("ur")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
    expect(localePath("ur", "/jobs")).toBe("/ur/jobs");
    expect(localePath("en")).toBe("/en");
    expect(stripLocale("/ur/jobs/x")).toBe("/jobs/x");
    expect(stripLocale("/en")).toBe("/");
  });

  it("falls back to English (not to a made-up translation) for a missing Urdu key, and interpolates", () => {
    const en = getMessages("en");
    const ur = getMessages("ur");
    const key = "__test.only.en__";
    en[key] = "Hello {name}";
    try {
      expect(ur[key]).toBeUndefined();
      expect(createT("ur")(key, { name: "Ali" })).toBe("Hello Ali");
    } finally {
      delete en[key];
    }
    expect(createT("en")("no.such.key")).toBe("no.such.key");
    expect(createT("ur")("nav.jobs")).toBe(ur["nav.jobs"]);
  });

  it("every Urdu key set matches English: no English key lacks an Urdu translation", () => {
    expect(missingTranslations("ur")).toEqual([]);
  });

  it("no Urdu value is empty or identical-English placeholder", () => {
    const ur = getMessages("ur");
    for (const [k, v] of Object.entries(ur)) expect(v.trim(), k).not.toBe("");
  });

  it("every t(\"…\") key used in source exists in the English dictionary", () => {
    const en = getMessages("en");
    const used = new Map<string, string>();
    const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components")), ...walk(path.join(ROOT, "lib"))];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/\bt\(\s*["'`]([A-Za-z][\w.-]*\.[\w.-]+)["'`]/g)) used.set(m[1], path.relative(ROOT, f));
    }
    // Keys built dynamically (t(`jobStatus.${x}`)) are covered by the enum tests below.
    const missing = [...used].filter(([k]) => !(k in en)).map(([k, f]) => `${k}  (${f})`);
    expect(missing).toEqual([]);
  });

  it("dynamic enum label keys exist in both languages", () => {
    const en = getMessages("en"), ur = getMessages("ur");
    const sets: [string, string[]][] = [
      ["jobStatus", ["draft", "pending_review", "approved", "rejected", "changes_requested", "expired", "archived"]],
      ["companyStatus", ["pending", "verified", "rejected", "suspended"]],
      ["appStatus", ["submitted", "viewed", "shortlisted", "interview", "selected", "rejected", "withdrawn"]],
      ["jobType", ["full_time", "part_time", "contract", "internship", "temporary", "freelance"]],
      ["workplace", ["onsite", "remote", "hybrid"]], ["sector", ["government", "private"]], ["member", ["owner", "recruiter", "viewer"]],
      ["role", ["admin", "employer", "job_seeker"]], ["period", ["hour", "day", "month", "year", "project"]],
      ["applyMethod", ["internal", "external_url", "external_email"]], ["accountStatus", ["active", "suspended"]],
      ["blog.cat", ["career-guides", "interview-preparation", "resume-writing", "salary-guides", "education-guides", "job-search-tips"]]
    ];
    for (const [ns, vals] of sets) for (const v of vals) { expect(en[`${ns}.${v}`], `en ${ns}.${v}`).toBeTruthy(); expect(ur[`${ns}.${v}`], `ur ${ns}.${v}`).toBeTruthy(); }
  });

  it("every validation / DB error key resolves", () => {
    const en = getMessages("en");
    for (const k of ["v.required", "v.email", "err.forbidden", "err.company_not_verified", "err.job_locked", "err.already_applied", "err.last_owner", "err.rate_limited"]) expect(en[k], k).toBeTruthy();
  });

  it("static page sections are complete in both languages", () => {
    const en = getMessages("en"), ur = getMessages("ur");
    for (const [prefix, n] of [["about", 5], ["privacy", 9], ["terms", 10]] as const) {
      for (let i = 1; i <= n; i++) for (const m of [en, ur]) { expect(m[`${prefix}.s${i}.t`]).toBeTruthy(); expect(m[`${prefix}.s${i}.b`]).toBeTruthy(); }
      expect(en[`${prefix}.s${n + 1}.t`]).toBeUndefined();
    }
  });
});
