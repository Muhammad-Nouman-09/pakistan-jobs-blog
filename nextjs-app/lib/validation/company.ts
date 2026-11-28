import { z } from "zod";
import { COMPANY_SIZES } from "@/lib/types";
import { emailField, localeField, optionalEmail, optionalText, phoneField, text, urlField, uuid } from "./common";
import { password } from "./auth";

// Zod schemas for the employer area. Messages are i18n KEYS ("v.*"), translated when shown.

const emptyToUndef = (v: unknown) => (v === "" || v == null ? undefined : v);

/** Company web address: http(s) only (javascript:, data: ... never match); the column allows 300 characters. */
const companyWebsite = z.preprocess(emptyToUndef, urlField.max(300, "v.too_long").optional());

export const companySchema = z.object({
  name: text(150, { required: true, min: 2 }),
  description: text(5000),
  industry: optionalText(100),
  website: companyWebsite,
  email: optionalEmail,
  phone: phoneField,
  country: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? "Pakistan" : v), text(80, { required: true })).default("Pakistan"),
  city: optionalText(80),
  address: optionalText(400),
  size: z.preprocess(emptyToUndef, z.enum(COMPANY_SIZES, "v.invalid").optional())
});
export type CompanyInput = z.infer<typeof companySchema>;

export const companyIdSchema = z.object({ company_id: uuid });

export const DOC_TYPES = ["registration", "tax", "authorization", "other"] as const;
export const MAX_COMPANY_DOCS = 10;
export const docUploadSchema = z.object({ company_id: uuid, doc_type: z.enum(DOC_TYPES, "v.invalid").default("registration") });
export const docDeleteSchema = z.object({ company_id: uuid, doc_id: uuid });

export const INVITE_ROLES = ["recruiter", "viewer"] as const;
export const inviteSchema = z.object({ company_id: uuid, email: emailField, role: z.enum(INVITE_ROLES, "v.invalid") });
export const revokeInviteSchema = z.object({ company_id: uuid, invitation_id: uuid });

export const memberRoleSchema = z.object({ company_id: uuid, user_id: uuid, role: z.enum(INVITE_ROLES, "v.invalid") });
export const memberTargetSchema = z.object({ company_id: uuid, user_id: uuid });

/** Invitation tokens are 32 random bytes in base64url (43 characters). */
export const inviteTokenSchema = z.string().trim().min(20, "v.invalid").max(100, "v.invalid").regex(/^[A-Za-z0-9_-]+$/, "v.invalid");
export const acceptInviteSchema = z.object({ token: inviteTokenSchema });

export const REVIEWABLE_STATUSES = ["viewed", "shortlisted", "interview", "selected", "rejected"] as const;
export const applicationStatusSchema = z.object({ application_id: uuid, status: z.enum(REVIEWABLE_STATUSES, "v.invalid") });
export const noteSchema = z.object({ application_id: uuid, note: text(3000, { required: true }) });
export const noteDeleteSchema = z.object({ application_id: uuid, note_id: uuid });

export const employerSettingsSchema = z.object({
  full_name: text(120, { required: true, min: 2 }),
  phone: phoneField,
  city: optionalText(80),
  province: optionalText(80),
  preferred_locale: localeField
});

export const employerPasswordSchema = z.object({
  current_password: z.string().min(1, "v.required").max(128, "v.too_long"),
  password,
  confirm: z.string().max(128, "v.too_long")
}).refine((v) => v.password === v.confirm, { message: "v.confirm_mismatch", path: ["confirm"] });

export const notificationIdSchema = z.object({ notification_id: uuid });

/** Returns the value when it is a UUID, otherwise "" — for building redirect paths from form fields. */
export const uuidOrEmpty = (v: unknown): string => (typeof v === "string" && uuid.safeParse(v).success ? v : "");
