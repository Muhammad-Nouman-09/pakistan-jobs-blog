import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";
import { hasActivePdfContent, safeFileName, sniff, validateUpload } from "@/lib/security/files";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { formToObject, safeNext } from "@/lib/forms";
import { errorCode } from "@/lib/errors";
import { daysLeft, formatSalary, refFromSlug, slugify, todayPK } from "@/lib/utils";
import { jobFormSchema, toSaveJobArgs } from "@/lib/validation/job";
import { loginSchema, registerSchema } from "@/lib/validation/auth";

const bytes = (...n: number[]) => new Uint8Array(n);
const file = (data: Uint8Array | string, name = "x.pdf", type = "application/pdf") => new File([data as BlobPart], name, { type });
const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF";

describe("markdown renderer is XSS-safe", () => {
  it("escapes raw HTML and scripts", () => {
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)> **ok**');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong>ok</strong>");
  });
  it("only allows http(s), mailto and same-site links", () => {
    expect(renderMarkdown("[a](javascript:alert(1))")).not.toContain("href");
    expect(renderMarkdown("[a](data:text/html;base64,AAAA)")).not.toContain("href");
    expect(renderMarkdown("[a](//evil.example/x)")).not.toContain("href");
    expect(renderMarkdown("[a](https://example.com/p?x=1&y=2)")).toContain('href="https://example.com/p?x=1&amp;y=2"');
    expect(renderMarkdown("[a](/en/jobs)")).toContain('href="/en/jobs"');
    expect(renderMarkdown("[a](https://e.com)")).toContain('rel="nofollow noopener noreferrer"');
  });
  it("renders headings (never an extra h1), lists and quotes", () => {
    const html = renderMarkdown("# Title\n\n## Sub\n\n- a\n- b\n\n1. x\n2. y\n\n> quote");
    expect(html).toContain("<h2>Title</h2>");
    expect(html).not.toContain("<h1>");
    expect(html).toContain("<ul><li>a</li><li>b</li></ul>");
    expect(html).toContain("<ol><li>x</li><li>y</li></ol>");
    expect(html).toContain("<blockquote>quote</blockquote>");
  });
  it("breaks attribute-injection attempts in link text and urls", () => {
    const html = renderMarkdown('[x" onmouseover="alert(1)](https://e.com/" onmouseover="alert(1))');
    expect(html).not.toMatch(/<a [^>]*onmouseover=/);
  });
});

describe("upload validation (type, signature, size)", () => {
  it("accepts a real PDF and rejects a renamed executable or text file", async () => {
    expect((await validateUpload(file(PDF), "pdf")).ok).toBe(true);
    expect(await validateUpload(file("MZ\x90\x00 exe", "cv.pdf"), "pdf")).toEqual({ ok: false, error: "file_invalid_type" });
    expect(await validateUpload(file("just text", "cv.pdf"), "pdf")).toEqual({ ok: false, error: "file_invalid_type" });
  });
  it("trusts the signature, not the declared MIME type or extension", async () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
    expect(await validateUpload(file(png, "cv.pdf", "application/pdf"), "pdf")).toEqual({ ok: false, error: "file_invalid_type" });
    const ok = await validateUpload(file(png, "logo.exe", "application/x-msdownload"), "logo");
    expect(ok.ok && ok.mime).toBe("image/png");
  });
  it("enforces size limits and missing files", async () => {
    expect(await validateUpload(file(PDF + "a".repeat(5 * 1024 * 1024)), "pdf")).toEqual({ ok: false, error: "file_too_large" });
    expect(await validateUpload(null, "pdf")).toEqual({ ok: false, error: "file_missing" });
    expect(await validateUpload(file(""), "pdf")).toEqual({ ok: false, error: "file_missing" });
    const bigJpeg = new Uint8Array(1024 * 1024 + 10); bigJpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(await validateUpload(file(bigJpeg, "l.jpg", "image/jpeg"), "logo")).toEqual({ ok: false, error: "file_too_large" });
  });
  it("rejects PDFs containing scripts or embedded files, accepts WebP, sniffs unknown as null", async () => {
    expect(hasActivePdfContent(new TextEncoder().encode("%PDF-1.4 /OpenAction << /S /JavaScript /JS (app.alert(1)) >>"))).toBe(true);
    expect(await validateUpload(file("%PDF-1.4 /Launch /EmbeddedFile"), "pdf")).toEqual({ ok: false, error: "file_active_content" });
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniff(webp)?.mime).toBe("image/webp");
    expect(sniff(bytes(1, 2, 3))).toBeNull();
  });
  it("sanitises display file names", () => {
    expect(safeFileName("../../etc/passwd")).not.toContain("/");
    expect(safeFileName("<b>cv</b>.pdf")).not.toMatch(/[<>]/);
  });
});

describe("tokens, redirects, forms, errors", () => {
  it("tokens are random, URL-safe, and only their hash is derived", () => {
    const a = generateToken(), b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
  });
  it("safeNext blocks open redirects", () => {
    expect(safeNext("/en/employer", "/x")).toBe("/en/employer");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "/ok\r\nSet-Cookie:x=1", "", null, undefined]) expect(safeNext(bad as string, "/x")).toBe("/x");
  });
  it("formToObject builds nested rows and ignores prototype pollution", () => {
    const fd = new FormData();
    fd.append("education[0].degree", "BSc"); fd.append("education[1].degree", "MSc"); fd.append("tr.en.title", "T"); fd.append("name", "A");
    fd.append("__proto__.polluted", "yes"); fd.append("constructor.prototype.x", "y"); fd.append("$ACTION_ID_1", "z");
    const o = formToObject(fd);
    expect(o.education).toEqual([{ degree: "BSc" }, { degree: "MSc" }]);
    expect(o.tr.en.title).toBe("T");
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.keys(o)).not.toContain("$ACTION_ID_1");
  });
  it("maps database errors to stable codes without leaking internals", () => {
    expect(errorCode({ message: "company_not_verified" })).toBe("company_not_verified");
    expect(errorCode({ message: "new row violates row-level security policy", code: "42501" })).toBe("forbidden");
    expect(errorCode({ message: "duplicate key value violates unique constraint", code: "23505" })).toBe("duplicate");
    expect(errorCode({ message: "connection refused to 10.0.0.5" })).toBe("generic");
  });
});

describe("dates, slugs, money", () => {
  it("todayPK uses Pakistan time (UTC+5)", () => {
    expect(todayPK(new Date("2026-11-23T18:59:00Z"))).toBe("2026-11-23");
    expect(todayPK(new Date("2026-11-23T19:01:00Z"))).toBe("2026-11-24");
  });
  it("daysLeft is inclusive of the deadline day", () => {
    const now = new Date("2026-11-23T10:00:00Z");
    expect(daysLeft("2026-11-23", now)).toBe(0);
    expect(daysLeft("2026-11-24", now)).toBe(1);
    expect(daysLeft("2026-11-22", now)).toBe(-1);
    expect(daysLeft(null, now)).toBeNull();
  });
  it("slugify and ref extraction", () => {
    expect(slugify("Sales Executive — Lahore (Gulberg)!")).toBe("sales-executive-lahore-gulberg");
    expect(slugify("ڈیٹا اینالسٹ")).toBe("");
    expect(refFromSlug("sales-executive-lahore-123")).toBe(123);
    expect(refFromSlug("nonsense")).toBeNull();
    expect(refFromSlug("a-b-12x")).toBeNull();
  });
  it("formats salary ranges", () => {
    expect(formatSalary(80000, 120000, "PKR", "month")).toBe("PKR 80,000 – 120,000 / month");
    expect(formatSalary(null, null)).toBe("");
    expect(formatSalary(50000, 50000, "PKR", "month")).toBe("PKR 50,000 / month");
  });
});

describe("auth validation", () => {
  const ok = { full_name: "Ali Khan", email: " ALI@Example.COM ", password: "longenough1", role: "job_seeker", accept_terms: "on" };
  it("normalises e-mail and accepts a valid registration", () => {
    const r = registerSchema.safeParse(ok);
    expect(r.success && r.data.email).toBe("ali@example.com");
  });
  it("can never register an admin, a bogus role, a weak password or without accepting terms", () => {
    for (const bad of [{ role: "admin" }, { role: "superuser" }, { role: "" }, { password: "short1" }, { password: "alllettersnodigit" }, { password: "1234567890" }, { accept_terms: undefined }, { email: "nope" }]) {
      expect(registerSchema.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it("login requires both fields", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });
});

describe("job form validation", () => {
  const base = {
    default_language: "en", employment_type: "full_time", workplace_type: "onsite", application_method: "internal", vacancies: "2",
    city: "Lahore", deadline: "2099-01-01", "tr": { en: { title: "Data Analyst", description: "Analyse data and build dashboards for our team." } }, intent: "submit"
  };
  it("accepts a valid submission and builds database arguments (slug base, only filled translations)", () => {
    const r = jobFormSchema.safeParse({ ...base, tr: { ...base.tr, ur: { title: "", description: "" } }, sq: [{ text: "Years of experience?", required: "on" }, { text: "" }] });
    expect(r.success).toBe(true);
    if (!r.success) return;
    const { fields, translations } = toSaveJobArgs(r.data);
    expect(Object.keys(translations)).toEqual(["en"]);
    expect(fields.slug_base).toBe("data-analyst-lahore");
    expect(fields.screening_questions).toEqual([{ id: "q1", text: "Years of experience?", required: true }]);
  });
  it("rejects bad states: no title, short description on submit, past deadline, inverted salary, bad URL/email", () => {
    const bad = (o: object) => jobFormSchema.safeParse({ ...base, ...o }).success;
    expect(bad({ tr: { en: { title: "", description: "x".repeat(40) } } })).toBe(false);
    expect(bad({ tr: { en: { title: "Valid title", description: "short" } } })).toBe(false);
    expect(bad({ deadline: "2000-01-01" })).toBe(false);
    expect(bad({ salary_min: "500", salary_max: "100" })).toBe(false);
    expect(bad({ application_method: "external_url", external_url: "javascript:alert(1)" })).toBe(false);
    expect(bad({ application_method: "external_url", external_url: "" })).toBe(false);
    expect(bad({ application_method: "external_email", external_email: "nope" })).toBe(false);
    expect(bad({ vacancies: "0" })).toBe(false);
    expect(bad({ employment_type: "dictator" })).toBe(false);
  });
  it("lets a draft be saved with minimal content, but still needs a title", () => {
    expect(jobFormSchema.safeParse({ ...base, intent: "draft", deadline: "", tr: { en: { title: "Draft title", description: "" } } }).success).toBe(true);
    expect(jobFormSchema.safeParse({ ...base, intent: "draft", tr: { en: { title: "", description: "" } } }).success).toBe(false);
  });
  it("an Urdu-only job needs an Urdu title and uses a safe fallback slug", () => {
    const r = jobFormSchema.safeParse({ ...base, default_language: "ur", tr: { ur: { title: "استاد درکار ہیں", description: "ہمیں ایک تجربہ کار استاد کی ضرورت ہے جو بچوں کو پڑھا سکے۔" } } });
    expect(r.success).toBe(true);
    if (r.success) expect(toSaveJobArgs(r.data).fields.slug_base).toBe("lahore");
    expect(jobFormSchema.safeParse({ ...base, default_language: "ur" }).success).toBe(false);
  });
});
