import { describe, expect, it } from "vitest";
import {
  acceptInviteSchema, applicationStatusSchema, companySchema, docUploadSchema, employerPasswordSchema, employerSettingsSchema,
  inviteSchema, memberRoleSchema, noteSchema, uuidOrEmpty
} from "@/lib/validation/company";

const UUID = "0b6c1f0e-6a46-4d3f-9a43-6d3a7a1b9c11";
const msg = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

describe("companySchema", () => {
  const ok = { name: "Acme Traders", description: "We trade.", country: "Pakistan" };

  it("accepts a minimal company and applies defaults", () => {
    const r = companySchema.safeParse({ name: "Acme Traders", description: "", country: "", website: "", email: "", phone: "", size: "", city: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.country).toBe("Pakistan");
      expect(r.data.website).toBeUndefined();
      expect(r.data.size).toBeUndefined();
    }
  });

  it("requires a name of at least 2 characters", () => {
    expect(msg(companySchema.safeParse({ ...ok, name: "" }))).toBe("v.required");
    expect(msg(companySchema.safeParse({ ...ok, name: "A" }))).toBe("v.required");
  });

  it("only accepts http(s) websites", () => {
    expect(companySchema.safeParse({ ...ok, website: "https://acme.pk" }).success).toBe(true);
    expect(msg(companySchema.safeParse({ ...ok, website: "javascript:alert(1)" }))).toBe("v.url");
    expect(msg(companySchema.safeParse({ ...ok, website: "data:text/html,x" }))).toBe("v.url");
    expect(msg(companySchema.safeParse({ ...ok, website: "ftp://acme.pk" }))).toBe("v.url");
    expect(msg(companySchema.safeParse({ ...ok, website: `https://acme.pk/${"a".repeat(300)}` }))).toBe("v.too_long");
  });

  it("validates email, phone and size", () => {
    expect(msg(companySchema.safeParse({ ...ok, email: "nope" }))).toBe("v.email");
    expect(msg(companySchema.safeParse({ ...ok, phone: "abc" }))).toBe("v.phone");
    expect(companySchema.safeParse({ ...ok, phone: "+92 300 1234567", email: "HR@Acme.PK", size: "51-200" }).success).toBe(true);
    expect(msg(companySchema.safeParse({ ...ok, size: "huge" }))).toBe("v.invalid");
  });

  it("limits description and address length", () => {
    expect(msg(companySchema.safeParse({ ...ok, description: "x".repeat(5001) }))).toBe("v.too_long");
    expect(msg(companySchema.safeParse({ ...ok, address: "x".repeat(401) }))).toBe("v.too_long");
  });
});

describe("invitations and members", () => {
  it("invitations accept recruiter or viewer only (never owner)", () => {
    expect(inviteSchema.safeParse({ company_id: UUID, email: "A@B.PK", role: "recruiter" }).success).toBe(true);
    expect(inviteSchema.safeParse({ company_id: UUID, email: "a@b.pk", role: "owner" }).success).toBe(false);
    expect(inviteSchema.safeParse({ company_id: UUID, email: "a@b.pk", role: "admin" }).success).toBe(false);
    expect(inviteSchema.safeParse({ company_id: "x", email: "a@b.pk", role: "viewer" }).success).toBe(false);
    expect(inviteSchema.safeParse({ company_id: UUID, email: "not-an-email", role: "viewer" }).success).toBe(false);
  });

  it("normalizes the invited email to lower case", () => {
    const r = inviteSchema.safeParse({ company_id: UUID, email: "  Person@Example.PK ", role: "viewer" });
    expect(r.success && r.data.email).toBe("person@example.pk");
  });

  it("member role changes cannot promote to owner", () => {
    expect(memberRoleSchema.safeParse({ company_id: UUID, user_id: UUID, role: "owner" }).success).toBe(false);
    expect(memberRoleSchema.safeParse({ company_id: UUID, user_id: UUID, role: "viewer" }).success).toBe(true);
  });

  it("invitation tokens must look like base64url", () => {
    expect(acceptInviteSchema.safeParse({ token: "A".repeat(43) }).success).toBe(true);
    expect(acceptInviteSchema.safeParse({ token: "short" }).success).toBe(false);
    expect(acceptInviteSchema.safeParse({ token: `${"A".repeat(30)}../..` }).success).toBe(false);
    expect(acceptInviteSchema.safeParse({}).success).toBe(false);
  });
});

describe("applications and documents", () => {
  it("only reviewable statuses can be set (not submitted / withdrawn)", () => {
    for (const status of ["viewed", "shortlisted", "interview", "selected", "rejected"]) {
      expect(applicationStatusSchema.safeParse({ application_id: UUID, status }).success).toBe(true);
    }
    for (const status of ["submitted", "withdrawn", "hired"]) {
      expect(applicationStatusSchema.safeParse({ application_id: UUID, status }).success).toBe(false);
    }
  });

  it("notes are required and bounded", () => {
    expect(noteSchema.safeParse({ application_id: UUID, note: "  " }).success).toBe(false);
    expect(noteSchema.safeParse({ application_id: UUID, note: "Good fit" }).success).toBe(true);
    expect(noteSchema.safeParse({ application_id: UUID, note: "x".repeat(3001) }).success).toBe(false);
  });

  it("document types are whitelisted", () => {
    expect(docUploadSchema.safeParse({ company_id: UUID }).success).toBe(true);
    expect(docUploadSchema.safeParse({ company_id: UUID, doc_type: "tax" }).success).toBe(true);
    expect(docUploadSchema.safeParse({ company_id: UUID, doc_type: "../etc" }).success).toBe(false);
  });
});

describe("settings", () => {
  it("validates the profile fields and locale", () => {
    expect(employerSettingsSchema.safeParse({ full_name: "Ali Khan", phone: "", city: "", province: "", preferred_locale: "ur" }).success).toBe(true);
    expect(employerSettingsSchema.safeParse({ full_name: "A", preferred_locale: "en" }).success).toBe(false);
    expect(employerSettingsSchema.safeParse({ full_name: "Ali Khan", preferred_locale: "fr" }).success).toBe(false);
  });

  it("password change needs a strong, confirmed password", () => {
    const base = { current_password: "old-secret", password: "NewSecret123", confirm: "NewSecret123" };
    expect(employerPasswordSchema.safeParse(base).success).toBe(true);
    expect(msg(employerPasswordSchema.safeParse({ ...base, confirm: "Different123" }))).toBe("v.confirm_mismatch");
    expect(msg(employerPasswordSchema.safeParse({ ...base, password: "short1", confirm: "short1" }))).toBe("v.password_short");
    expect(msg(employerPasswordSchema.safeParse({ ...base, password: "onlyletterslong", confirm: "onlyletterslong" }))).toBe("v.password_weak");
  });
});

describe("uuidOrEmpty", () => {
  it("passes UUIDs and blanks everything else (used to build redirect paths)", () => {
    expect(uuidOrEmpty(UUID)).toBe(UUID);
    expect(uuidOrEmpty("../../evil")).toBe("");
    expect(uuidOrEmpty(undefined)).toBe("");
    expect(uuidOrEmpty(["a"])).toBe("");
  });
});
