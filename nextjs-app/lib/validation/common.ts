import { z } from "zod";

// Schema messages are i18n KEYS ("v.*"), translated when shown (see lib/i18n/messages/errors.ts).
export const text = (max: number, opts: { min?: number; required?: boolean } = {}) => {
  const base = z.string().trim().max(max, "v.too_long");
  return opts.required ? base.min(opts.min ?? 1, "v.required") : base;
};

export const optionalText = (max: number) =>
  z.string().trim().max(max, "v.too_long").optional().transform((v) => (v ? v : undefined));

export const emailField = z.string().trim().toLowerCase().max(200, "v.too_long").regex(/^\S+@\S+\.\S+$/, "v.email");
export const optionalEmail = z.preprocess((v) => (v === "" ? undefined : v), emailField.optional());

/** http(s) URL only — javascript:, data: and friends are rejected. */
export const urlField = z.string().trim().max(500, "v.too_long").regex(/^https?:\/\/[^\s]+$/i, "v.url");
export const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), urlField.optional());

export const uuid = z.string().uuid("v.invalid");
export const localeField = z.enum(["en", "ur"], "v.invalid");

export const phoneField = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.string().trim().regex(/^[+\d][\d\s\-()]{6,25}$/, "v.phone").optional()
);

export const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "v.date");
export const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number("v.number").nonnegative("v.number").max(1e9, "v.number").optional()
);
export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
