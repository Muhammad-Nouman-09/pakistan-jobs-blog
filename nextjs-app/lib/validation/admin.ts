import { z } from "zod";
import { slugify } from "@/lib/utils";
import { COMPANY_SIZES, COMPANY_VERIFICATIONS } from "@/lib/types";
import { PUBLISHER_RE, SLOT_RE } from "@/lib/services/settings";
import { checkbox, dateField, emailField, optionalEmail, optionalText, phoneField, text, urlField, uuid } from "./common";

// Schema messages are i18n keys. "v.*" keys unique to the admin area live in lib/i18n/messages/admin.ts.

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const emptyToUndef = (v: unknown) => (v === "" || v == null ? undefined : v);

// ------------------------------------------------------------------ jobs
export const REVIEW_ACTIONS = ["approve", "reject", "request_changes", "unpublish"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const reviewJobSchema = z
  .object({
    job: uuid,
    action: z.enum(REVIEW_ACTIONS, "v.invalid"),
    reason: z.string().trim().max(2000, "v.too_long").default("")
  })
  .superRefine((v, ctx) => {
    if (v.action !== "approve" && v.reason.length < 3) ctx.addIssue({ code: "custom", message: "v.reason_required", path: ["reason"] });
  });

export const featuredSchema = z.object({
  job: uuid,
  featured: z.enum(["true", "false"], "v.invalid").transform((v) => v === "true")
});

// ------------------------------------------------------------------ companies
const optionalWebsite = z.preprocess(emptyToUndef, urlField.max(300, "v.too_long").optional());
const optionalSize = z.preprocess(emptyToUndef, z.enum(COMPANY_SIZES, "v.invalid").optional());

export const companyFieldsSchema = z.object({
  name: text(150, { required: true, min: 2 }),
  description: optionalText(5000),
  industry: optionalText(100),
  website: optionalWebsite,
  country: optionalText(80),
  city: optionalText(80),
  size: optionalSize,
  email: optionalEmail,
  phone: phoneField,
  address: optionalText(400)
});

export const createCompanySchema = companyFieldsSchema.extend({
  verified: checkbox,
  ownerEmail: optionalEmail
});

export const companyIdSchema = z.object({ company: uuid });

export const verificationSchema = z
  .object({
    company: uuid,
    status: z.enum(COMPANY_VERIFICATIONS, "v.invalid"),
    note: z.string().trim().max(1000, "v.too_long").default("")
  })
  .superRefine((v, ctx) => {
    if ((v.status === "rejected" || v.status === "suspended") && v.note.length < 3) {
      ctx.addIssue({ code: "custom", message: "v.reason_required", path: ["note"] });
    }
  });

export const memberRoleSchema = z.object({ company: uuid, user: uuid, role: z.enum(["recruiter", "viewer"], "v.invalid") });
export const memberRefSchema = z.object({ company: uuid, user: uuid });
export const addMemberSchema = z.object({ company: uuid, email: emailField, role: z.enum(["owner", "recruiter", "viewer"], "v.invalid") });
export const inviteSchema = addMemberSchema;
export const revokeInviteSchema = z.object({ company: uuid, invitation: uuid });

// ------------------------------------------------------------------ users
export const userStatusSchema = z.object({ user: uuid, status: z.enum(["active", "suspended"], "v.invalid") });

// ------------------------------------------------------------------ categories
export const categorySchema = z.object({
  id: z.preprocess(emptyToUndef, uuid.optional()),
  slug: z.string().trim().toLowerCase().min(2, "v.slug_invalid").max(60, "v.too_long").regex(SLUG_RE, "v.slug_invalid"),
  name_en: text(120, { required: true, min: 2 }),
  name_ur: optionalText(120),
  sort_order: z.preprocess(
    (v) => (v === "" || v == null ? 100 : Number(v)),
    z.number("v.number").int("v.number").min(0, "v.number").max(100000, "v.number")
  ),
  is_active: checkbox
});
export const categoryDeleteSchema = z.object({ id: uuid });

// ------------------------------------------------------------------ blog
export const POST_STATUSES = ["draft", "published", "archived"] as const;
export const POST_LOCALES = ["en", "ur"] as const;
export type PostLocale = (typeof POST_LOCALES)[number];

export const blogTranslationSchema = z.object({
  title: text(200, { required: true, min: 3 }),
  slug: z.string().trim().toLowerCase().max(120, "v.too_long").default(""),
  excerpt: z.string().trim().max(500, "v.too_long").default(""),
  content: z.string().trim().max(100000, "v.too_long").default(""),
  seo_title: z.string().trim().max(70, "v.seo_title_long").default(""),
  seo_description: z.string().trim().max(170, "v.seo_description_long").default("")
});

export const blogPostSchema = z.object({
  id: z.preprocess(emptyToUndef, uuid.optional()),
  category: z.preprocess(emptyToUndef, uuid.optional())
});

export const postStatusSchema = z.object({
  post: uuid,
  status: z.enum(POST_STATUSES, "v.invalid"),
  publish_date: z.preprocess(emptyToUndef, dateField.optional())
});
export const postDeleteSchema = z.object({ post: uuid });

/**
 * URL slug of a post translation. English falls back to a slug made from the title; Urdu titles produce no
 * ASCII text, so Urdu always needs an explicit English-style slug.
 */
export function resolvePostSlug(locale: PostLocale, title: string, explicit: string): { ok: true; slug: string } | { ok: false; error: string } {
  const raw = (explicit || "").trim().toLowerCase();
  const slug = raw || (locale === "en" ? slugify(title, 120) : "");
  if (!slug) return { ok: false, error: "v.slug_required" };
  if (slug.length > 120 || !SLUG_RE.test(slug)) return { ok: false, error: "v.slug_invalid" };
  return { ok: true, slug };
}

/** Scheduled/publish date (YYYY-MM-DD) -> ISO timestamp at 00:00 Pakistan time. */
export const publishDateToIso = (d: string) => new Date(`${d}T00:00:00+05:00`).toISOString();

// ------------------------------------------------------------------ settings
const optionalUrlField = z.preprocess(emptyToUndef, urlField.optional());

export const generalSettingsSchema = z.object({
  siteName: text(80, { required: true, min: 2 }),
  contactEmail: optionalEmail,
  supportPhone: phoneField,
  twitter: optionalUrlField,
  facebook: optionalUrlField
});

export const seoSettingsSchema = z.object({
  defaultTitle: text(70, { required: true, min: 5 }),
  defaultDescription: z.string().trim().min(20, "v.too_short").max(170, "v.too_long"),
  ogImage: optionalUrlField
});

export const adsenseSettingsSchema = z
  .object({
    enabled: checkbox,
    publisherId: z.string().trim().max(40, "v.too_long").default(""),
    topBanner: z.string().trim().max(30, "v.too_long").default(""),
    inFeed: z.string().trim().max(30, "v.too_long").default(""),
    inArticle: z.string().trim().max(30, "v.too_long").default(""),
    sidebar: z.string().trim().max(30, "v.too_long").default(""),
    adsTxt: z.string().max(20000, "v.too_long").default("")
  })
  .superRefine((v, ctx) => {
    if (v.publisherId && !PUBLISHER_RE.test(v.publisherId)) ctx.addIssue({ code: "custom", message: "v.adsense_publisher", path: ["publisherId"] });
    if (v.enabled && !v.publisherId) ctx.addIssue({ code: "custom", message: "v.adsense_publisher", path: ["publisherId"] });
    for (const k of ["topBanner", "inFeed", "inArticle", "sidebar"] as const) {
      if (v[k] && !SLOT_RE.test(v[k])) ctx.addIssue({ code: "custom", message: "v.adsense_slot", path: [k] });
    }
    const ads = validateAdsTxt(v.adsTxt);
    if (!ads.ok) ctx.addIssue({ code: "custom", message: "v.ads_txt", path: ["adsTxt"] });
  });

// ------------------------------------------------------------------ ads.txt
export type AdsTxtResult = { ok: true; text: string; records: number } | { ok: false; line: number; reason: "format" | "domain" | "account" | "relationship" | "certification" | "variable" | "too_many_lines" };

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const ACCOUNT_RE = /^[A-Za-z0-9._:-]{1,100}$/;
const CERT_RE = /^[A-Za-z0-9]{1,64}$/;
const VARIABLE_RE = /^(CONTACT|SUBDOMAIN|OWNERDOMAIN|MANAGERDOMAIN|INVENTORYPARTNERDOMAIN)\s*=\s*([^\s<>"'`][^<>"'`\u0000-\u001f]{0,199})$/i;
export const ADS_TXT_MAX_LINES = 500;

/**
 * Validates ads.txt content line by line. Accepted lines: blank, `# comment`, `KEY=value` variables
 * (CONTACT, SUBDOMAIN, OWNERDOMAIN, MANAGERDOMAIN, INVENTORYPARTNERDOMAIN) and
 * `domain, account-id, DIRECT|RESELLER[, certification-id]` records (a trailing `# comment` is allowed).
 * Anything else is rejected with the 1-based line number. Returns normalized text (LF line endings,
 * trimmed lines, no trailing blank lines).
 */
export function validateAdsTxt(input: string): AdsTxtResult {
  const lines = String(input ?? "").replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > ADS_TXT_MAX_LINES) return { ok: false, line: ADS_TXT_MAX_LINES + 1, reason: "too_many_lines" };
  const out: string[] = [];
  let records = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const n = i + 1;
    if (line === "" || line.startsWith("#")) { out.push(line); continue; }
    const body = line.replace(/\s+#.*$/, "").trim();
    if (body.includes("=")) {
      if (!VARIABLE_RE.test(body)) return { ok: false, line: n, reason: "variable" };
      out.push(body);
      continue;
    }
    const parts = body.split(",").map((p) => p.trim());
    if (parts.length < 3 || parts.length > 4) return { ok: false, line: n, reason: "format" };
    if (!DOMAIN_RE.test(parts[0])) return { ok: false, line: n, reason: "domain" };
    if (!ACCOUNT_RE.test(parts[1])) return { ok: false, line: n, reason: "account" };
    if (!/^(DIRECT|RESELLER)$/i.test(parts[2])) return { ok: false, line: n, reason: "relationship" };
    if (parts[3] !== undefined && !CERT_RE.test(parts[3])) return { ok: false, line: n, reason: "certification" };
    out.push(parts.slice(0, 3).map((p, idx) => (idx === 2 ? p.toUpperCase() : p)).concat(parts[3] ? [parts[3]] : []).join(", "));
    records++;
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return { ok: true, text: out.join("\n"), records };
}
