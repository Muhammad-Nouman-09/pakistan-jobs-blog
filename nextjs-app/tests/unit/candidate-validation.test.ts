import { describe, expect, it } from "vitest";
import { formToObject, parseWith } from "@/lib/forms";
import {
  MAX_ROWS, MAX_SKILLS, applySchema, certificationRow, educationRow, experienceRow, languageRow, looseContent, passwordChangeSchema,
  profileSchema, projectRow, resumeSchema, skillsField, toResumeContent
} from "@/lib/validation/candidate";
import { profileCompleteness } from "@/lib/services/candidate";

const ok = (r: { success: boolean }) => expect(r.success).toBe(true);
const bad = (r: { success: boolean; error?: { issues: { message: string }[] } }, msg?: string) => {
  expect(r.success).toBe(false);
  if (msg) expect(r.error?.issues[0].message).toBe(msg);
};

describe("education row", () => {
  it("accepts a minimal and a full row", () => {
    ok(educationRow.safeParse({ degree: "BSc", institution: "NUST" }));
    ok(educationRow.safeParse({ degree: "BSc", institution: "NUST", field: "CS", start_year: "2018", end_year: "2022", grade: "3.5" }));
  });
  it("requires degree and institution", () => {
    bad(educationRow.safeParse({ degree: "", institution: "NUST" }), "v.required");
    bad(educationRow.safeParse({ degree: "BSc" }));
  });
  it("rejects bad years and reversed ranges", () => {
    bad(educationRow.safeParse({ degree: "a", institution: "b", start_year: "18" }), "v.year");
    bad(educationRow.safeParse({ degree: "a", institution: "b", start_year: "2022", end_year: "2018" }), "v.date_order");
  });
  it("enforces max lengths", () => {
    bad(educationRow.safeParse({ degree: "x".repeat(121), institution: "b" }), "v.too_long");
  });
});

describe("experience row", () => {
  const base = { title: "Dev", company: "Acme", start: "2020-01" };
  it("accepts open-ended (present) and closed ranges", () => {
    ok(experienceRow.safeParse(base));
    ok(experienceRow.safeParse({ ...base, end: "" }));
    ok(experienceRow.safeParse({ ...base, end: "2021-06", description: "Built things" }));
  });
  it("rejects malformed months and end before start", () => {
    bad(experienceRow.safeParse({ ...base, start: "2020-13" }), "v.month");
    bad(experienceRow.safeParse({ ...base, start: "Jan 2020" }), "v.month");
    bad(experienceRow.safeParse({ ...base, end: "2019-12" }), "v.date_order");
  });
  it("limits description length", () => {
    bad(experienceRow.safeParse({ ...base, description: "x".repeat(2001) }), "v.too_long");
  });
});

describe("projects and URLs", () => {
  it("accepts http and https links", () => {
    ok(projectRow.safeParse({ name: "Site", url: "https://example.com/a?b=1" }));
    ok(projectRow.safeParse({ name: "Site", url: "http://example.com" }));
    ok(projectRow.safeParse({ name: "Site", url: "" }));
  });
  it("rejects dangerous or non-web schemes", () => {
    for (const url of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>", "vbscript:x", "ftp://example.com", "//evil.com", "example.com"]) {
      bad(projectRow.safeParse({ name: "Site", url }), "v.url");
    }
  });
});

describe("certifications and languages", () => {
  it("validates certification rows", () => {
    ok(certificationRow.safeParse({ name: "PMP", issuer: "PMI", year: "2023" }));
    bad(certificationRow.safeParse({ name: "PMP", year: "23" }), "v.year");
  });
  it("only accepts known language levels", () => {
    ok(languageRow.safeParse({ name: "Urdu", level: "native" }));
    bad(languageRow.safeParse({ name: "Urdu", level: "godlike" }), "v.invalid");
    bad(languageRow.safeParse({ name: "Urdu" }));
  });
});

describe("skills", () => {
  it("splits on commas / newlines / Arabic comma and de-duplicates", () => {
    const r = skillsField.safeParse("Excel, excel,\nPython، Word ;  ");
    expect(r.success && r.data).toEqual(["Excel", "Python", "Word"]);
  });
  it("caps the number and length", () => {
    bad(skillsField.safeParse(Array.from({ length: MAX_SKILLS + 1 }, (_, i) => `s${i}`).join(",")), "v.too_many_rows");
    bad(skillsField.safeParse("x".repeat(61)), "v.too_long");
  });
});

describe("profile schema via formToObject", () => {
  const fd = (entries: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(entries)) f.append(k, v); return f; };

  it("parses repeatable rows and drops blank ones", () => {
    const o = formToObject(fd({
      full_name: "Ali Khan", phone: "", city: "Lahore", province: "Punjab", headline: "", skills: "A, B",
      "education[0].degree": "BSc", "education[0].institution": "UET", "education[0].start_year": "",
      "education[1].degree": "", "education[1].institution": "",
      "languages[0].name": "", "languages[0].level": ""
    }));
    const p = parseWith(profileSchema, o);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.data.education).toEqual([{ degree: "BSc", institution: "UET" }]);
      expect(p.data.languages).toEqual([]);
      expect(p.data.skills).toEqual(["A", "B"]);
      expect(p.data.phone).toBeUndefined();
    }
  });

  it("returns an i18n key for the first problem", () => {
    const o = formToObject(fd({ full_name: "Ali", "projects[0].name": "X", "projects[0].url": "javascript:alert(1)" }));
    expect(parseWith(profileSchema, o)).toEqual({ ok: false, error: "v.url" });
  });

  it("requires a name", () => {
    expect(parseWith(profileSchema, { full_name: "" }).ok).toBe(false);
  });

  it("limits the number of rows", () => {
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ name: `C${i}` }));
    expect(parseWith(profileSchema, { full_name: "Ali Khan", certifications: rows })).toEqual({ ok: false, error: "v.too_many_rows" });
    const okRows = rows.slice(0, MAX_ROWS);
    expect(parseWith(profileSchema, { full_name: "Ali Khan", certifications: okRows }).ok).toBe(true);
  });

  it("limits summary and headline length", () => {
    expect(parseWith(profileSchema, { full_name: "Ali Khan", summary: "x".repeat(3001) })).toEqual({ ok: false, error: "v.too_long" });
    expect(parseWith(profileSchema, { full_name: "Ali Khan", headline: "x".repeat(161) })).toEqual({ ok: false, error: "v.too_long" });
  });
});

describe("resume schema", () => {
  const base = { title: "My CV", visibility: "private", personal: { name: "Ali", email: "ali@example.com", phone: "+92 300 1234567", location: "Lahore" } };

  it("accepts a valid resume and builds the stored content", () => {
    const r = resumeSchema.safeParse({ ...base, visibility: "shareable", is_default: "on", skills: "A,B", experience: [{ title: "Dev", company: "Acme", start: "2020-01", end: "" }] });
    ok(r);
    if (r.success) {
      expect(r.data.is_default).toBe(true);
      expect(r.data.remove_pdf).toBe(false);
      const c = toResumeContent(r.data);
      expect(c.skills).toEqual(["A", "B"]);
      expect(c.experience).toHaveLength(1);
      expect(looseContent(c).personal.name).toBe("Ali");
    }
  });
  it("only allows the two visibility values", () => {
    bad(resumeSchema.safeParse({ ...base, visibility: "public" }), "v.invalid");
  });
  it("requires a title of at most 120 characters", () => {
    bad(resumeSchema.safeParse({ ...base, title: "" }), "v.required");
    bad(resumeSchema.safeParse({ ...base, title: "x".repeat(121) }), "v.too_long");
  });
  it("validates the personal e-mail", () => {
    bad(resumeSchema.safeParse({ ...base, personal: { ...base.personal, email: "nope" } }), "v.email");
  });
});

describe("looseContent", () => {
  it("never throws on garbage and keeps only strings", () => {
    expect(looseContent(null).education).toEqual([]);
    expect(looseContent("x").skills).toEqual([]);
    const c = looseContent({ education: [{ degree: 5, institution: "A" }, "bad"], skills: ["a", 1, ""] });
    expect(c.education).toEqual([{ degree: "", institution: "A" }]);
    expect(c.skills).toEqual(["a"]);
  });
});

describe("apply schema", () => {
  const job = "3f0c1d54-2b1e-4a53-9a39-0d8f3b5f6a11";
  const resume = "7d3b0a52-1f0e-4f1a-8c11-5a9d2f7e4b22";
  it("accepts answers keyed by index (as posted by the form)", () => {
    const o = formToObject((() => { const f = new FormData(); f.append("job_id", job); f.append("resume_id", resume); f.append("answers[0].id", "q1"); f.append("answers[0].answer", "Yes"); return f; })());
    const p = parseWith(applySchema, o);
    expect(p.ok).toBe(true);
    if (p.ok) { expect(p.data.answers).toEqual([{ id: "q1", answer: "Yes" }]); expect(p.data.cover_letter).toBe(""); }
  });
  it("rejects a non-uuid resume and an over-long cover letter", () => {
    expect(parseWith(applySchema, { job_id: job, resume_id: "x" })).toEqual({ ok: false, error: "v.resume_required" });
    expect(parseWith(applySchema, { job_id: job, resume_id: resume, cover_letter: "x".repeat(5001) })).toEqual({ ok: false, error: "v.too_long" });
  });
});

describe("password change", () => {
  it("requires matching, policy-compliant passwords", () => {
    bad(passwordChangeSchema.safeParse({ current_password: "old", password: "abcdefghij1", confirm: "abcdefghij2" }), "v.password_mismatch");
    bad(passwordChangeSchema.safeParse({ current_password: "old", password: "short1", confirm: "short1" }), "v.password_short");
    bad(passwordChangeSchema.safeParse({ current_password: "old", password: "abcdefghijk", confirm: "abcdefghijk" }), "v.password_weak");
    ok(passwordChangeSchema.safeParse({ current_password: "old", password: "abcdefghij1", confirm: "abcdefghij1" }));
  });
});

describe("profile completeness", () => {
  const empty = { headline: "", summary: "", skills: [], education: [], experience: [], certifications: [], projects: [], languages: [], hasRow: false };
  it("is 0% for an empty profile and lists everything missing", () => {
    const r = profileCompleteness(empty, 0);
    expect(r.percent).toBe(0);
    expect(r.missing).toHaveLength(7);
  });
  it("reaches 100% when every section and a resume exist", () => {
    const row = [{ degree: "a" }];
    const r = profileCompleteness({ ...empty, headline: "h", summary: "s", skills: ["a"], education: row, experience: row, languages: row }, 1);
    expect(r).toEqual({ percent: 100, missing: [] });
  });
});
