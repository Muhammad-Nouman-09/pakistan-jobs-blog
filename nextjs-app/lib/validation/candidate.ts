import { z } from "zod";
import { emailField, localeField, phoneField, text, urlField, uuid } from "./common";
import { password } from "./auth";

// Zod schemas for the job-seeker area. Messages are i18n keys ("v.*"), see lib/i18n/messages/candidate.ts.
// Shapes mirror what is stored in candidate_profiles / resumes.content (jsonb) and what the forms post
// (inputs are named like `education[0].degree`, parsed by formToObject).

export const MAX_ROWS = 20;
export const MAX_SKILLS = 50;      // candidate_profiles.skills has cardinality <= 50
export const MAX_RESUMES = 10;

// ---- primitives -------------------------------------------------------------------------------------------
const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Optional trimmed text: "" becomes undefined (key is then dropped from the stored JSON). */
const opt = (max: number) => z.preprocess(emptyToUndef, z.string().trim().max(max, "v.too_long").optional());
const optYear = z.preprocess(emptyToUndef, z.string().trim().regex(/^(19|20)\d{2}$/, "v.year").optional());
const month = z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "v.month");
const optMonth = z.preprocess(emptyToUndef, month.optional());
/** http(s) only. javascript:, data:, vbscript: etc. never match. */
const optHttpUrl = z.preprocess(emptyToUndef, urlField.optional());

/**
 * Repeatable rows. Accepts what formToObject yields (array, or an object keyed by index), drops rows whose
 * every field is blank (the UI keeps a spare empty row), and caps the row count.
 */
function rows<T extends z.ZodTypeAny>(row: T, max = MAX_ROWS) {
  return z.preprocess((v) => {
    if (v == null || v === "") return [];
    const list = Array.isArray(v) ? v : typeof v === "object" ? Object.values(v as Record<string, unknown>) : v;
    if (!Array.isArray(list)) return v;
    return list.filter((r) => r && typeof r === "object" && Object.values(r as Record<string, unknown>).some((x) => String(x ?? "").trim() !== ""));
  }, z.array(row).max(max, "v.too_many_rows"));
}

// ---- row shapes -------------------------------------------------------------------------------------------
export const educationRow = z.object({
  degree: text(120, { required: true }),
  institution: text(160, { required: true }),
  field: opt(120),
  start_year: optYear,
  end_year: optYear,
  grade: opt(60)
}).refine((r) => !r.start_year || !r.end_year || r.end_year >= r.start_year, { message: "v.date_order", path: ["end_year"] });

export const experienceRow = z.object({
  title: text(120, { required: true }),
  company: text(160, { required: true }),
  location: opt(120),
  start: month,
  end: optMonth,                       // empty = present
  description: opt(2000)
}).refine((r) => !r.end || r.end >= r.start, { message: "v.date_order", path: ["end"] });

export const certificationRow = z.object({ name: text(160, { required: true }), issuer: opt(160), year: optYear });
export const projectRow = z.object({ name: text(160, { required: true }), url: optHttpUrl, description: opt(1000) });
export const LANGUAGE_LEVELS = ["basic", "conversational", "fluent", "native"] as const;
export const languageRow = z.object({ name: text(60, { required: true }), level: z.enum(LANGUAGE_LEVELS, "v.invalid") });

export type EducationRow = z.infer<typeof educationRow>;
export type ExperienceRow = z.infer<typeof experienceRow>;
export type CertificationRow = z.infer<typeof certificationRow>;
export type ProjectRow = z.infer<typeof projectRow>;
export type LanguageRow = z.infer<typeof languageRow>;

/** Comma / newline / Arabic-comma separated list -> unique, trimmed, bounded array. */
export const skillsField = z.preprocess((v) => {
  if (v == null) return [];
  const raw = Array.isArray(v) ? v.join(",") : String(v);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw.split(/[,\n\r،;]+/)) {
    const k = s.trim();
    if (k && !seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); out.push(k); }
  }
  return out;
}, z.array(z.string().max(60, "v.too_long")).max(MAX_SKILLS, "v.too_many_rows"));

const sections = {
  education: rows(educationRow),
  experience: rows(experienceRow),
  certifications: rows(certificationRow),
  projects: rows(projectRow),
  languages: rows(languageRow)
};

// ---- profile ----------------------------------------------------------------------------------------------
/** Columns of `profiles` a user may change (see the column-level GRANT in the RLS migration). */
export const accountFields = {
  full_name: text(120, { required: true, min: 2 }),
  phone: phoneField,
  city: opt(80),
  province: opt(80)
};

export const profileSchema = z.object({
  ...accountFields,
  headline: opt(160),
  summary: opt(3000),
  skills: skillsField,
  ...sections
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const settingsSchema = z.object({ ...accountFields, preferred_locale: localeField });

export const passwordChangeSchema = z.object({
  current_password: z.string().min(1, "v.required").max(128, "v.too_long"),
  password,
  confirm: z.string().max(128, "v.too_long")
}).refine((v) => v.password === v.confirm, { message: "v.password_mismatch", path: ["confirm"] });

// ---- resumes ----------------------------------------------------------------------------------------------
export const RESUME_VISIBILITY = ["private", "shareable"] as const;

export const resumeSchema = z.object({
  title: text(120, { required: true }),
  visibility: z.enum(RESUME_VISIBILITY, "v.invalid"),
  personal: z.object({
    name: opt(120),
    email: z.preprocess(emptyToUndef, emailField.optional()),
    phone: phoneField,
    location: opt(160)
  }).default({}),
  summary: opt(3000),
  skills: skillsField,
  ...sections,
  is_default: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  remove_pdf: z.preprocess((v) => v === "on" || v === "true", z.boolean())
});
export type ResumeInput = z.infer<typeof resumeSchema>;

/** What is stored in resumes.content. */
export interface ResumeContent {
  personal: { name?: string; email?: string; phone?: string; location?: string };
  summary?: string;
  skills: string[];
  education: EducationRow[];
  experience: ExperienceRow[];
  certifications: CertificationRow[];
  projects: ProjectRow[];
  languages: LanguageRow[];
}

export function toResumeContent(p: ResumeInput): ResumeContent {
  return {
    personal: p.personal, summary: p.summary, skills: p.skills, education: p.education, experience: p.experience,
    certifications: p.certifications, projects: p.projects, languages: p.languages
  };
}

// ---- stored JSON -> safe shapes (tolerant; used when rendering, never throws) --------------------------------
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const asList = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x)) : [];
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export interface LooseRow { [k: string]: string }
const looseRows = (v: unknown): LooseRow[] =>
  asList(v).map((r) => Object.fromEntries(Object.entries(r).map(([k, x]) => [k, str(x)])));

export interface LooseContent {
  personal: { name: string; email: string; phone: string; location: string };
  summary: string;
  skills: string[];
  education: LooseRow[];
  experience: LooseRow[];
  certifications: LooseRow[];
  projects: LooseRow[];
  languages: LooseRow[];
}

/** Normalises resumes.content / resume_snapshot.content / candidate_profiles columns for display or form defaults. */
export function looseContent(raw: unknown): LooseContent {
  const o = asObj(raw);
  const p = asObj(o.personal);
  return {
    personal: { name: str(p.name), email: str(p.email), phone: str(p.phone), location: str(p.location) },
    summary: str(o.summary),
    skills: Array.isArray(o.skills) ? o.skills.map(str).filter(Boolean) : [],
    education: looseRows(o.education),
    experience: looseRows(o.experience),
    certifications: looseRows(o.certifications),
    projects: looseRows(o.projects),
    languages: looseRows(o.languages)
  };
}

// ---- applying / small actions ---------------------------------------------------------------------------------
export const applySchema = z.object({
  job_id: uuid,
  resume_id: z.string().uuid("v.resume_required"),
  cover_letter: z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(5000, "v.too_long")),
  answers: z.preprocess(
    (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v as Record<string, unknown>) : []),
    z.array(z.object({ id: z.string().trim().min(1).max(100), answer: z.string().trim().max(3000, "v.too_long") })).max(30)
  )
});

export const idSchema = z.object({ id: uuid });
export const toggleSaveSchema = z.object({ job_id: uuid });
export const applicationFilterSchema = z.enum(["submitted", "viewed", "shortlisted", "interview", "selected", "rejected", "withdrawn"]);
