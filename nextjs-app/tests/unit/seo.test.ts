import { describe, expect, it } from "vitest";
import { articleJsonLd, breadcrumbJsonLd, jobPostingJsonLd, jsonLdString } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { validateAdsTxtBasic } from "@/lib/seo/adstxt";
import type { JobDetail } from "@/lib/services/public";

const job = (o: Partial<JobDetail> = {}): JobDetail => ({
  job_id: "j1", ref_no: 123, slug: "sales-executive-lahore-123", company_id: "c1", category_id: null, default_language: "en", sector: "private",
  employment_type: "full_time", workplace_type: "onsite", country: "Pakistan", province: "Punjab", city: "Lahore", salary_min: 80000, salary_max: 120000,
  salary_currency: "PKR", salary_period: "month", vacancies: 3, deadline: "2026-12-31", application_method: "internal", external_url: null, external_email: null,
  screening_questions: [], source: null, featured: false, published_at: "2026-11-01T10:00:00Z", approved_at: "2026-11-01T10:00:00Z", job_published_translations: [],
  companies: { id: "c1", name: "Alpha Tech", slug: "alpha-tech", logo_path: null, website: "https://alpha.example", city: "Lahore", industry: "Software", description: "d", size: "11-50", country: "Pakistan", created_at: "2026-01-01" },
  job_categories: null, ...o
});
const NOW = new Date("2026-11-23T08:00:00Z");

describe("JobPosting structured data", () => {
  it("is produced for an open job with the required Google fields", () => {
    const ld = jobPostingJsonLd(job(), "en", { title: "Sales Executive", description: "Sell things" }, NOW) as Record<string, any>;
    expect(ld["@type"]).toBe("JobPosting");
    expect(ld.title).toBe("Sales Executive");
    expect(ld.datePosted).toBe("2026-11-01");
    expect(ld.validThrough).toBe("2026-12-31T23:59:59+05:00");
    expect(ld.employmentType).toBe("FULL_TIME");
    expect(ld.hiringOrganization.name).toBe("Alpha Tech");
    expect(ld.jobLocation.address.addressCountry).toBe("PK");
    expect(ld.baseSalary.value).toMatchObject({ minValue: 80000, maxValue: 120000, unitText: "MONTH" });
    expect(ld.directApply).toBe(true);
    expect(ld.url).toContain("/en/jobs/sales-executive-lahore-123");
  });

  it("is NOT produced for an expired job (deadline passed in Pakistan time)", () => {
    expect(jobPostingJsonLd(job({ deadline: "2026-11-22" }), "en", { title: "t", description: "d" }, NOW)).toBeNull();
  });

  it("a job whose deadline is today (PKT) is still eligible", () => {
    // 2026-11-23T23:30 PKT == 18:30Z on the 23rd
    expect(jobPostingJsonLd(job({ deadline: "2026-11-23" }), "en", { title: "t", description: "d" }, new Date("2026-11-23T18:30:00Z"))).not.toBeNull();
    // 00:30 PKT on the 24th == 19:30Z on the 23rd -> closed
    expect(jobPostingJsonLd(job({ deadline: "2026-11-23" }), "en", { title: "t", description: "d" }, new Date("2026-11-23T19:30:00Z"))).toBeNull();
  });

  it("remote jobs use TELECOMMUTE instead of a location; external applications are not directApply", () => {
    const ld = jobPostingJsonLd(job({ workplace_type: "remote", application_method: "external_url" }), "ur", { title: "t", description: "d" }, NOW) as Record<string, any>;
    expect(ld.jobLocationType).toBe("TELECOMMUTE");
    expect(ld.jobLocation).toBeUndefined();
    expect(ld.directApply).toBe(false);
    expect(ld.inLanguage).toBe("ur");
  });

  it("escapes < so structured data can never close the script tag", () => {
    const s = jsonLdString({ a: "</script><script>alert(1)</script>" });
    expect(s).not.toContain("</script>");
    expect(JSON.parse(s).a).toBe("</script><script>alert(1)</script>");
  });

  it("breadcrumbs and articles are well formed", () => {
    const b = breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Jobs", path: "/jobs" }, { name: "X" }], "en") as any;
    expect(b.itemListElement.map((i: any) => i.position)).toEqual([1, 2, 3]);
    expect(b.itemListElement[2].item).toBeUndefined();
    const a = articleJsonLd({ title: "T", description: "D", path: "/blog/t", locale: "ur", published: "2026-01-01", modified: "2026-01-02", publisher: "P" }) as any;
    expect(a["@type"]).toBe("Article");
    expect(a.mainEntityOfPage).toContain("/ur/blog/t");
  });
});

describe("page metadata", () => {
  it("emits canonical, hreflang for BOTH locales, x-default and Open Graph", () => {
    const m = pageMetadata({ locale: "ur", path: "/jobs", title: "T", description: "D" });
    expect(m.alternates?.canonical).toContain("/ur/jobs");
    const langs = m.alternates?.languages as Record<string, string>;
    expect(Object.keys(langs).sort()).toEqual(["en", "ur", "x-default"]);
    expect(langs["x-default"]).toContain("/en/jobs");
    expect(m.openGraph?.locale).toBe("ur_PK");
    expect(m.robots).toMatchObject({ index: true });
  });

  it("does not advertise a translation that does not exist", () => {
    const m = pageMetadata({ locale: "en", path: "/jobs/x-1", title: "T", description: "D", availableLocales: ["en"] });
    expect(Object.keys(m.alternates?.languages as object).sort()).toEqual(["en", "x-default"]);
  });

  it("noindex and description trimming", () => {
    const m = pageMetadata({ locale: "en", path: "/x", title: "T", description: "word ".repeat(100), noindex: true });
    expect(m.robots).toMatchObject({ index: false });
    expect((m.description ?? "").length).toBeLessThanOrEqual(160);
  });
});

describe("ads.txt validation", () => {
  it("accepts IAB records, comments and variables", () => {
    expect(validateAdsTxtBasic("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n# comment\nCONTACT=ads@example.com")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(validateAdsTxtBasic("<script>alert(1)</script>")).toBe(false);
    expect(validateAdsTxtBasic("google.com, pub-1, MAYBE")).toBe(false);
    expect(validateAdsTxtBasic("")).toBe(false);
  });
});
