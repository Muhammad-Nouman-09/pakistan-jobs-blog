import type { Locale } from "@/lib/i18n/config";

export type Role = "admin" | "employer" | "job_seeker";
export type AccountStatus = "active" | "suspended";
export type CompanyVerification = "pending" | "verified" | "rejected" | "suspended";
export type MemberRole = "owner" | "recruiter" | "viewer";
export type JobStatus = "draft" | "pending_review" | "approved" | "rejected" | "changes_requested" | "expired" | "archived";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship" | "temporary" | "freelance";
export type WorkplaceType = "onsite" | "remote" | "hybrid";
export type ApplicationMethod = "internal" | "external_url" | "external_email";
export type JobSector = "government" | "private";
export type ApplicationStatus = "submitted" | "viewed" | "shortlisted" | "interview" | "selected" | "rejected" | "withdrawn";

export const JOB_STATUSES: JobStatus[] = ["draft", "pending_review", "approved", "rejected", "changes_requested", "expired", "archived"];
export const EMPLOYMENT_TYPES: EmploymentType[] = ["full_time", "part_time", "contract", "internship", "temporary", "freelance"];
export const WORKPLACE_TYPES: WorkplaceType[] = ["onsite", "remote", "hybrid"];
export const APPLICATION_METHODS: ApplicationMethod[] = ["internal", "external_url", "external_email"];
export const APPLICATION_STATUSES: ApplicationStatus[] = ["submitted", "viewed", "shortlisted", "interview", "selected", "rejected", "withdrawn"];
export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;
export const COMPANY_VERIFICATIONS: CompanyVerification[] = ["pending", "verified", "rejected", "suspended"];

export const PROVINCES = [
  "Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Gilgit-Baltistan",
  "Azad Jammu & Kashmir", "Islamabad Capital Territory"
] as const;

export interface Profile {
  id: string;
  email: string;
  role: Role;
  status: AccountStatus;
  full_name: string;
  phone: string | null;
  city: string | null;
  province: string | null;
  preferred_locale: Locale;
}

export interface Category { id: string; slug: string; name_en: string; name_ur: string | null }

export interface JobListItem {
  job_id: string; slug: string; ref_no: number; title: string; title_locale: Locale;
  company_id: string; company_name: string; company_slug: string; company_logo: string | null;
  category_slug: string | null; category_name: string | null; sector: JobSector;
  employment_type: EmploymentType; workplace_type: WorkplaceType; city: string | null; province: string | null;
  salary_min: number | null; salary_max: number | null; salary_currency: string; salary_period: string; salary_text: string | null;
  vacancies: number; deadline: string; featured: boolean; published_at: string; application_method: ApplicationMethod;
  total_count: number;
}
