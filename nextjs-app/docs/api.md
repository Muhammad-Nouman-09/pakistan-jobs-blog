# API surface

The app has very few HTTP endpoints: pages are server-rendered and **mutations are server actions** (POSTs handled by Next with built-in origin checks, validated with zod, rate-limited). Data access goes through PostgREST/RPC under the caller's identity, so the database RLS policies are the real API contract.

## Route handlers

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/session` | GET | cookie (optional) | `{ user: { name, role } | null }` for the header. Never returns e-mail or ids. `no-store`. |
| `/api/cron/expire-jobs` | GET | `Authorization: Bearer $CRON_SECRET` (constant-time compare; closed if unset) | Marks approved jobs past their deadline as `expired`, revalidates public pages. Scheduled daily by `vercel.json`. |
| `/auth/callback` | GET | e-mail link token | Exchanges the PKCE `code` / `token_hash` for a session; `next` must be a same-site path. |
| `/ads.txt` | GET | public | Served from admin AdSense settings (404 when empty/invalid). |
| `/sitemap.xml`, `/robots.txt` | GET | public | See [seo.md](seo.md). |
| `/{locale}/candidate/resumes/[id]/pdf` | GET | job seeker (owner) | 302 to a 60 s signed URL of their own PDF. |
| `/{locale}/employer/applications/[id]/pdf` | GET | owner/recruiter of the company | 302 to a 60 s signed URL (storage policy authorizes). |
| `/{locale}/employer/companies/[id]/documents/[docId]` · `/{locale}/admin/companies/[id]/documents/[doc]` · `/{locale}/admin/applications/[id]/resume` | GET | owner / admin | Signed URLs created at click time. |

## Pages (all under `/{locale}`, `locale` = `en` | `ur`)

* **Public:** `/`, `/jobs`, `/jobs/[slug]` (`…-<ref_no>`), `/companies`, `/companies/[slug]`, `/blog`, `/blog/[slug]`, `/about`, `/contact`, `/privacy`, `/terms`
* **Auth:** `/auth/login`, `/auth/register`, `/auth/forgot`, `/auth/reset`, `/auth/check-email`, `/auth/suspended`; `/dashboard` (role redirect); `/invitations/accept?token=`
* **Candidate** (`/candidate/…`): overview, profile, resumes (+ `new`, `[id]`, `[id]/preview`), applications (+ `[id]`), saved, notifications, settings; apply: `/jobs/[slug]/apply`
* **Employer** (`/employer/…`): overview, companies (+ `new`, `[id]`, `[id]/team`), jobs (+ `new`, `[id]`, `[id]/edit`), pending, applications (+ `[id]`), reports, notifications, settings
* **Admin** (`/admin/…`): overview, jobs (+ `[id]`, `[id]/edit`), companies (+ `new`, `[id]`), users, applications (+ `[id]`), categories, blog (+ `new`, `[id]`, `[id]/preview`), messages, notifications, reports, settings (`general`, `seo`, `adsense`), audit
* Legacy URLs: `/find-jobs` → `/en/jobs`, `/auth` → `/en/auth/login`, `/profile` → `/en/dashboard` (301); any other path without a locale is redirected by middleware.

## Database RPC (called with the user's JWT; each re-checks the caller)

`save_job`, `submit_job_for_review`, `withdraw_job`, `archive_job`, `restore_job`, `review_job` (admin), `set_job_featured` (admin), `create_company`, `admin_create_company`, `admin_set_company_verification`, `resubmit_company_verification`, `create_company_invitation`, `revoke_company_invitation`, `accept_company_invitation`, `set_member_role`, `remove_member`, `transfer_company_ownership`, `admin_add_member`, `apply_to_job`, `set_application_status`, `withdraw_application`, `record_external_click` (anonymous allowed), `set_user_status` (admin), `admin_stats`, `company_report`; public reads: `search_jobs`, `list_companies`, `job_facets`. Service-role only: `rate_limit_hit`, `expire_jobs`, `provision_admin`. Error codes (e.g. `company_not_verified`, `job_locked`, `already_applied`) are mapped to localized messages in `lib/errors.ts`.
