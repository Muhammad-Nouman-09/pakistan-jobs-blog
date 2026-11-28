import { z } from "zod";
import { checkbox, dateField, localeField, optionalEmail, optionalNumber, optionalUrl, uuid } from "./common";
import { slugify, todayPK } from "@/lib/utils";

const body = (max: number) => z.string().trim().max(max, "v.too_long").default("");

const translation = z.object({
  title: z.string().trim().max(200, "v.too_long").default(""),
  description: body(20000), responsibilities: body(10000), requirements: body(10000), benefits: body(10000),
  experience: body(500), education: body(500), salary_text: body(300), how_to_apply: body(5000)
});

export const SALARY_CURRENCIES = ["PKR", "USD", "SAR", "AED", "GBP"] as const;
export const SALARY_PERIODS = ["hour", "day", "month", "year", "project"] as const;

const emptyToUndef = (v: unknown) => (v === "" || v == null ? undefined : v);

export const jobFormSchema = z.object({
  job_id: z.preprocess(emptyToUndef, uuid.optional()),
  company_id: z.preprocess(emptyToUndef, uuid.optional()),
  category_id: z.preprocess(emptyToUndef, uuid.optional()),
  default_language: localeField,
  sector: z.enum(["government", "private"], "v.invalid").default("private"),
  employment_type: z.enum(["full_time", "part_time", "contract", "internship", "temporary", "freelance"], "v.invalid"),
  workplace_type: z.enum(["onsite", "remote", "hybrid"], "v.invalid"),
  province: z.string().trim().max(80, "v.too_long").optional(),
  city: z.string().trim().max(80, "v.too_long").optional(),
  salary_min: optionalNumber,
  salary_max: optionalNumber,
  salary_currency: z.enum(SALARY_CURRENCIES, "v.invalid").default("PKR"),
  salary_period: z.enum(SALARY_PERIODS, "v.invalid").default("month"),
  vacancies: z.coerce.number("v.number").int("v.number").min(1, "v.number").max(10000, "v.number").default(1),
  deadline: z.preprocess(emptyToUndef, dateField.optional()),
  application_method: z.enum(["internal", "external_url", "external_email"], "v.invalid"),
  external_url: optionalUrl,
  external_email: optionalEmail,
  source: z.string().trim().max(300, "v.too_long").optional(),
  sq: z.array(z.object({ text: z.string().trim().max(200, "v.too_long").default(""), required: checkbox.default(false) })).max(5).default([]),
  tr: z.object({ en: translation.optional(), ur: translation.optional() }),
  intent: z.enum(["draft", "submit"]).default("draft")
}).superRefine((v, ctx) => {
  const add = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });
  if (v.salary_min != null && v.salary_max != null && v.salary_min > v.salary_max) add("v.salary_range", ["salary_max"]);
  const main = v.tr[v.default_language];
  if (!main || main.title.length < 3) add("v.title_required", ["tr", v.default_language, "title"]);
  if (v.application_method === "external_url" && !v.external_url && v.intent === "submit") add("v.external_required", ["external_url"]);
  if (v.application_method === "external_email" && !v.external_email && v.intent === "submit") add("v.external_required", ["external_email"]);
  if (v.intent === "submit") {
    if (!main || main.description.length < 30) add("v.content_required", ["tr", v.default_language, "description"]);
    if (!v.deadline || v.deadline < todayPK()) add("v.deadline_past", ["deadline"]);
  }
});

export type JobFormInput = z.infer<typeof jobFormSchema>;

/** Splits the validated form into the arguments of the `save_job` database function. */
export function toSaveJobArgs(v: JobFormInput) {
  const translations: Record<string, z.infer<typeof translation>> = {};
  for (const l of ["en", "ur"] as const) {
    const t = v.tr[l];
    if (t && t.title.length >= 3) translations[l] = t;
  }
  const main = translations.en?.title ?? v.tr[v.default_language]?.title ?? "";
  const slugBase = [slugify(main, 60), slugify(v.city ?? "", 24)].filter(Boolean).join("-") || "job";
  const questions = v.sq
    .filter((q) => q.text)
    .map((q, i) => ({ id: `q${i + 1}`, text: q.text, required: q.required }));
  const fields = {
    default_language: v.default_language, category_id: v.category_id ?? "", sector: v.sector,
    employment_type: v.employment_type, workplace_type: v.workplace_type, province: v.province ?? "", city: v.city ?? "",
    salary_min: v.salary_min ?? "", salary_max: v.salary_max ?? "", salary_currency: v.salary_currency, salary_period: v.salary_period,
    vacancies: v.vacancies, deadline: v.deadline ?? "", application_method: v.application_method,
    external_url: v.application_method === "external_url" ? v.external_url ?? "" : "",
    external_email: v.application_method === "external_email" ? v.external_email ?? "" : "",
    screening_questions: v.application_method === "internal" ? questions : [], source: v.source ?? "", slug_base: slugBase
  };
  return { fields, translations };
}
