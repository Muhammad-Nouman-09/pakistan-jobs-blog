import { describe, expect, it } from "vitest";
import {
  adsenseSettingsSchema, blogTranslationSchema, categorySchema, companyFieldsSchema, createCompanySchema, featuredSchema,
  generalSettingsSchema, inviteSchema, memberRoleSchema, publishDateToIso, resolvePostSlug, reviewJobSchema, seoSettingsSchema,
  userStatusSchema, validateAdsTxt, verificationSchema
} from "@/lib/validation/admin";

const ID = "3f2a1c4e-9b7d-4e21-8a55-0c1d2e3f4a5b";
const msg = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? "ok" : r.error!.issues[0].message);

describe("reviewJobSchema", () => {
  it("approve needs no reason", () => {
    expect(reviewJobSchema.safeParse({ job: ID, action: "approve" }).success).toBe(true);
  });
  it.each(["reject", "request_changes", "unpublish"])("%s requires a reason", (action) => {
    expect(msg(reviewJobSchema.safeParse({ job: ID, action, reason: "" }))).toBe("v.reason_required");
    expect(msg(reviewJobSchema.safeParse({ job: ID, action, reason: "ab" }))).toBe("v.reason_required");
    expect(reviewJobSchema.safeParse({ job: ID, action, reason: "Missing deadline" }).success).toBe(true);
  });
  it("rejects unknown actions and bad ids", () => {
    expect(reviewJobSchema.safeParse({ job: ID, action: "delete" }).success).toBe(false);
    expect(reviewJobSchema.safeParse({ job: "nope", action: "approve" }).success).toBe(false);
  });
});

describe("featuredSchema / userStatusSchema / memberRoleSchema", () => {
  it("parses the featured flag", () => {
    expect(featuredSchema.parse({ job: ID, featured: "true" }).featured).toBe(true);
    expect(featuredSchema.parse({ job: ID, featured: "false" }).featured).toBe(false);
    expect(featuredSchema.safeParse({ job: ID, featured: "yes" }).success).toBe(false);
  });
  it("only allows active/suspended", () => {
    expect(userStatusSchema.safeParse({ user: ID, status: "suspended" }).success).toBe(true);
    expect(userStatusSchema.safeParse({ user: ID, status: "admin" }).success).toBe(false);
  });
  it("member role changes can never target owner", () => {
    expect(memberRoleSchema.safeParse({ company: ID, user: ID, role: "owner" }).success).toBe(false);
    expect(memberRoleSchema.safeParse({ company: ID, user: ID, role: "viewer" }).success).toBe(true);
  });
});

describe("verificationSchema", () => {
  it("requires a note to reject or suspend", () => {
    expect(msg(verificationSchema.safeParse({ company: ID, status: "rejected", note: "" }))).toBe("v.reason_required");
    expect(msg(verificationSchema.safeParse({ company: ID, status: "suspended" }))).toBe("v.reason_required");
    expect(verificationSchema.safeParse({ company: ID, status: "verified" }).success).toBe(true);
    expect(verificationSchema.safeParse({ company: ID, status: "pending" }).success).toBe(true);
    expect(verificationSchema.safeParse({ company: ID, status: "rejected", note: "No registration" }).success).toBe(true);
  });
});

describe("company schemas", () => {
  const base = { name: "Acme Pvt Ltd", description: "", industry: "", website: "", country: "", city: "Lahore", size: "", email: "", phone: "", address: "" };
  it("accepts a minimal company and normalizes empties", () => {
    const r = companyFieldsSchema.parse(base);
    expect(r.website).toBeUndefined();
    expect(r.size).toBeUndefined();
    expect(r.city).toBe("Lahore");
  });
  it("rejects non-http websites and invalid sizes", () => {
    expect(companyFieldsSchema.safeParse({ ...base, website: "javascript:alert(1)" }).success).toBe(false);
    expect(companyFieldsSchema.safeParse({ ...base, website: "https://acme.example" }).success).toBe(true);
    expect(companyFieldsSchema.safeParse({ ...base, size: "huge" }).success).toBe(false);
  });
  it("createCompanySchema reads the verified checkbox and optional owner email", () => {
    const r = createCompanySchema.parse({ ...base, verified: "on", ownerEmail: "Owner@Example.com" });
    expect(r.verified).toBe(true);
    expect(r.ownerEmail).toBe("owner@example.com");
    expect(createCompanySchema.parse({ ...base }).verified).toBe(false);
    expect(createCompanySchema.safeParse({ ...base, ownerEmail: "bad" }).success).toBe(false);
  });
  it("inviteSchema allows owner (admins only) and validates email", () => {
    expect(inviteSchema.safeParse({ company: ID, email: "a@b.co", role: "owner" }).success).toBe(true);
    expect(inviteSchema.safeParse({ company: ID, email: "nope", role: "viewer" }).success).toBe(false);
  });
});

describe("categorySchema", () => {
  it("validates slug and defaults", () => {
    const r = categorySchema.parse({ id: "", slug: "IT-Jobs", name_en: "IT", name_ur: "", sort_order: "", is_active: "on" });
    expect(r.slug).toBe("it-jobs");
    expect(r.id).toBeUndefined();
    expect(r.sort_order).toBe(100);
    expect(r.is_active).toBe(true);
  });
  it("rejects bad slugs", () => {
    for (const slug of ["a b", "-x", "x--y", "x_y", "اردو", "a"]) {
      expect(categorySchema.safeParse({ slug, name_en: "Name" }).success).toBe(false);
    }
  });
});

describe("blog helpers", () => {
  it("english slug falls back to the title", () => {
    expect(resolvePostSlug("en", "Top 10 Interview Tips!", "")).toEqual({ ok: true, slug: "top-10-interview-tips" });
  });
  it("urdu needs an explicit ascii slug", () => {
    expect(resolvePostSlug("ur", "انٹرویو کی تیاری", "")).toEqual({ ok: false, error: "v.slug_required" });
    expect(resolvePostSlug("ur", "انٹرویو", "interview-tips")).toEqual({ ok: true, slug: "interview-tips" });
  });
  it("rejects invalid explicit slugs", () => {
    expect(resolvePostSlug("en", "T", "Bad Slug")).toEqual({ ok: false, error: "v.slug_invalid" });
    expect(resolvePostSlug("en", "T", "x".repeat(121))).toEqual({ ok: false, error: "v.slug_invalid" });
  });
  it("enforces SEO and title lengths", () => {
    const ok = { title: "A title", content: "x" };
    expect(blogTranslationSchema.safeParse(ok).success).toBe(true);
    expect(msg(blogTranslationSchema.safeParse({ ...ok, seo_title: "x".repeat(71) }))).toBe("v.seo_title_long");
    expect(msg(blogTranslationSchema.safeParse({ ...ok, seo_description: "x".repeat(171) }))).toBe("v.seo_description_long");
    expect(blogTranslationSchema.safeParse({ ...ok, seo_title: "x".repeat(70), seo_description: "x".repeat(170) }).success).toBe(true);
    expect(blogTranslationSchema.safeParse({ title: "ab" }).success).toBe(false);
  });
  it("schedules at 00:00 Pakistan time", () => {
    expect(publishDateToIso("2026-12-01")).toBe("2026-11-30T19:00:00.000Z");
  });
});

describe("settings schemas", () => {
  it("general: validates email, phone, urls", () => {
    expect(generalSettingsSchema.safeParse({ siteName: "Pakistan Jobs", contactEmail: "", supportPhone: "", twitter: "", facebook: "" }).success).toBe(true);
    expect(generalSettingsSchema.safeParse({ siteName: "P", contactEmail: "" }).success).toBe(false);
    expect(generalSettingsSchema.safeParse({ siteName: "Site", contactEmail: "x" }).success).toBe(false);
    expect(generalSettingsSchema.safeParse({ siteName: "Site", twitter: "javascript:1" }).success).toBe(false);
    expect(generalSettingsSchema.safeParse({ siteName: "Site", facebook: "https://facebook.com/x" }).success).toBe(true);
  });
  it("seo: enforces lengths", () => {
    const ok = { defaultTitle: "Pakistan Jobs", defaultDescription: "Government and private jobs in Pakistan.", ogImage: "" };
    expect(seoSettingsSchema.safeParse(ok).success).toBe(true);
    expect(seoSettingsSchema.safeParse({ ...ok, defaultTitle: "x".repeat(71) }).success).toBe(false);
    expect(seoSettingsSchema.safeParse({ ...ok, defaultDescription: "x".repeat(171) }).success).toBe(false);
    expect(seoSettingsSchema.safeParse({ ...ok, ogImage: "ftp://x" }).success).toBe(false);
  });
  it("adsense: publisher required when enabled, slot ids numeric, ads.txt validated", () => {
    const off = { publisherId: "", topBanner: "", inFeed: "", inArticle: "", sidebar: "", adsTxt: "" };
    expect(adsenseSettingsSchema.safeParse(off).success).toBe(true);
    expect(msg(adsenseSettingsSchema.safeParse({ ...off, enabled: "on" }))).toBe("v.adsense_publisher");
    expect(adsenseSettingsSchema.safeParse({ ...off, enabled: "on", publisherId: "ca-pub-1234567890123456" }).success).toBe(true);
    expect(msg(adsenseSettingsSchema.safeParse({ ...off, publisherId: "pub-123" }))).toBe("v.adsense_publisher");
    expect(msg(adsenseSettingsSchema.safeParse({ ...off, topBanner: "12ab" }))).toBe("v.adsense_slot");
    expect(msg(adsenseSettingsSchema.safeParse({ ...off, adsTxt: "garbage line" }))).toBe("v.ads_txt");
  });
});

describe("validateAdsTxt", () => {
  it("accepts records, comments, variables and blank lines", () => {
    const text = [
      "# my ads.txt",
      "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0",
      "",
      "adexchange.example.net, 12345, reseller",
      "contact=ads@example.com",
      "example.org, abc-123, DIRECT # inline comment"
    ].join("\r\n");
    const r = validateAdsTxt(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.records).toBe(3);
      expect(r.text.split("\n")).toEqual([
        "# my ads.txt",
        "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0",
        "",
        "adexchange.example.net, 12345, RESELLER",
        "contact=ads@example.com",
        "example.org, abc-123, DIRECT"
      ]);
    }
  });
  it("accepts empty content", () => {
    expect(validateAdsTxt("")).toEqual({ ok: true, text: "", records: 0 });
  });
  it.each([
    ["not a record", "format"],
    ["google.com, pub-1", "format"],
    ["a, b, c, d, e", "format"],
    ["bad domain!, pub-1, DIRECT", "domain"],
    ["localhost, pub-1, DIRECT", "domain"],
    ["google.com, pub 1, DIRECT", "account"],
    ["google.com, pub-1, PARTNER", "relationship"],
    ["google.com, pub-1, DIRECT, not valid!", "certification"],
    ["FOO=bar", "variable"],
    ["CONTACT=<script>", "variable"],
    ["<script>alert(1)</script>", "format"]
  ])("rejects %j", (line, reason) => {
    const r = validateAdsTxt(`# ok\n${line}`);
    expect(r).toEqual({ ok: false, line: 2, reason });
  });
  it("limits the number of lines", () => {
    const r = validateAdsTxt("# x\n".repeat(600));
    expect(r.ok).toBe(false);
  });
});
