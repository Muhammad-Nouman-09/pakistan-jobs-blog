import { isWebUrl } from "@/lib/util";

const TEXT = ["title", "organization", "category", "city", "salary", "education", "experience",
  "postedDate", "deadline", "description", "requirements", "howToApply", "applyUrl", "source"];
const PROVINCES = ["All Pakistan", "Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan",
  "Gilgit-Baltistan", "Azad Jammu & Kashmir", "Islamabad", "Islamabad Capital Territory"];

// Validates and builds a job from request input. `existing` is null for a new job.
// Returns { job } or { error }.
export function cleanJob(b, existing, user) {
  const isAdmin = user.role === "admin";
  const job = {};
  for (const k of TEXT) job[k] = String(b[k] ?? "").trim().slice(0, 8000);
  if (!job.title || !job.deadline) return { error: "Title and last date are required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(job.deadline)) return { error: "Last date must be a valid date." };
  const vacancies = parseInt(b.vacancies, 10);
  if (!vacancies || vacancies < 1) return { error: "Vacancies must be at least 1." };
  if (job.applyUrl && !isWebUrl(job.applyUrl)) {
    return { error: "Apply link must start with http:// or https:// (no javascript: or other links)." };
  }
  job.vacancies = vacancies;
  job.sector = b.sector === "Private" ? "Private" : "Government";
  job.province = PROVINCES.includes(b.province) ? b.province : "All Pakistan";
  job.category = job.category || "General";
  job.status = existing ? existing.status : "published";
  // Only the admin can set Featured; an employer edit keeps the admin's value.
  job.featured = isAdmin ? !!b.featured : existing ? !!existing.featured : false;
  job.employerId = isAdmin ? (existing ? existing.employerId ?? null : null) : user.id;
  if (existing) job.id = existing.id;
  return { job };
}

export const canManage = (user, job) =>
  user.role === "admin" || (user.role === "employer" && job.employerId === user.id);
