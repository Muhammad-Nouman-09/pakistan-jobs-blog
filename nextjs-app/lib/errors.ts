// Maps database / auth errors to i18n keys under "err.*". Workflow functions raise short machine codes
// (see migration 3); everything else collapses to a generic message so internals never reach the UI.

const KNOWN = [
  "forbidden", "job_not_found", "invalid_status", "company_not_verified", "category_required", "location_required",
  "deadline_required", "deadline_passed", "content_required", "external_url_required", "external_email_required",
  "reason_required", "invalid_action", "job_locked", "company_not_found", "company_limit", "invalid_email", "invalid_ttl",
  "already_member", "invalid_invitation", "wrong_account_type", "use_transfer", "member_not_found", "last_owner",
  "answer_required", "resume_not_found", "resume_private", "already_applied", "not_internal", "job_closed",
  "invalid_answers", "cover_too_long", "application_not_found", "user_not_found", "forbidden_job_change",
  "forbidden_company_change", "forbidden_profile_change"
] as const;

export type ErrorLike = { message?: string; code?: string } | null | undefined;

export function errorCode(e: ErrorLike): string {
  const msg = e?.message ?? "";
  const hit = KNOWN.find((k) => msg === k || msg.includes(k));
  if (hit) return hit;
  if (e?.code === "42501" || /row-level security|permission denied/i.test(msg)) return "forbidden";
  if (e?.code === "23505") return "duplicate";
  if (e?.code === "23514" || e?.code === "22P02" || e?.code === "23502") return "invalid";
  if (e?.code === "23503") return "in_use";
  return "generic";
}

export const errorKey = (e: ErrorLike) => `err.${errorCode(e)}`;
