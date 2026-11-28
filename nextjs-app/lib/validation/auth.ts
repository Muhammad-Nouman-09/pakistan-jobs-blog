import { z } from "zod";
import { emailField, localeField, text } from "./common";

// Password policy: >= 10 chars with a letter and a digit. (Supabase Auth also enforces its own minimum.)
export const password = z.string().min(10, "v.password_short").max(128, "v.too_long")
  .regex(/[A-Za-z]/, "v.password_weak").regex(/\d/, "v.password_weak");

export const registerSchema = z.object({
  full_name: text(120, { required: true, min: 2 }),
  email: emailField,
  password,
  role: z.enum(["employer", "job_seeker"], "v.invalid"),      // "admin" is not an accepted value — ever
  accept_terms: z.literal("on", "v.accept_terms"),
  locale: localeField.optional()
});

export const loginSchema = z.object({ email: emailField, password: z.string().min(1, "v.required").max(128) });
export const forgotSchema = z.object({ email: emailField });
export const resetSchema = z.object({ password });
