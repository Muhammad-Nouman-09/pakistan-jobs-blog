# Database

PostgreSQL on Supabase. Migrations are plain SQL in `supabase/migrations/` and are applied in file order (`supabase db push`, or paste them into the SQL editor in order). They are tested end-to-end on an in-process Postgres (`npm run test:db`) with a minimal emulation of Supabase's `auth`/`storage` objects (`tests/db/supabase-stub.sql`).

| Migration | Contents |
|---|---|
| `…01_core_identity_companies` | enums, `profiles`, auth trigger, helper/authorization functions, `job_categories`, `companies`, `company_private`, `company_members`, `company_invitations`, `company_verification_documents`, guard triggers |
| `…02_jobs_applications_content` | `jobs`, `job_translations`, `job_published(+_translations)`, `job_reviews`, `job_external_clicks`, `candidate_profiles`, `resumes`, `saved_jobs`, `applications`, `application_answers/events/notes`, `notifications`, `audit_logs`, `site_settings`, `rate_limits`, `blog_*` |
| `…03_workflow_functions` | `SECURITY DEFINER` workflow functions (the only way to change privileged state) |
| `…04_rls_policies` | RLS policies, column grants, `search_jobs`, `list_companies`, `job_facets` |
| `…05_storage` | buckets (`resumes`, `company-documents` private; `company-logos`, `blog-images` public) and storage policies |
| `…06_seed_reference_data` | job categories (en/ur), blog categories, default settings |
| `…07_save_job` | atomic job + translations save (`SECURITY INVOKER`) |
| `…08_contact_messages` | contact inbox (server-written, admin-read) |

## Tables (all `uuid` keys, timestamps, RLS enabled)

* **Identity:** `profiles` (1:1 `auth.users`; `role` admin/employer/job_seeker, `status` active/suspended) · `candidate_profiles`
* **Companies:** `companies` (public descriptive fields, `verification_status`, `managed_by` self/platform) · `company_private` (e-mail, phone, address, rejection note — never public) · `company_members` (owner/recruiter/viewer) · `company_invitations` (SHA-256 token hash, expiry, accepted/revoked) · `company_verification_documents`
* **Jobs:** `jobs` (working copy; `ref_no` identity → slug `title-city-<ref_no>`) · `job_translations` (en/ur, per-language content) · `job_published` + `job_published_translations` (approved public copy, `tsvector` search) · `job_reviews` (append-only history with snapshot) · `job_categories` · `job_external_clicks`
* **Applications:** `applications` (resume snapshot, status, partial unique index → one live application per candidate+job; withdrawn frees the slot) · `application_answers` · `application_events` (status history) · `application_notes` (employer-only)
* **Candidates:** `resumes` (structured JSONB sections, optional private PDF, `visibility` private/shareable, one default per user) · `saved_jobs`
* **Platform:** `notifications` · `audit_logs` · `site_settings` (`general`/`seo`/`adsense`) · `rate_limits` · `contact_messages` · `blog_categories`, `blog_posts`, `blog_post_translations`

JSONB is used only for genuinely flexible structures: resume sections, screening questions, notification payloads, audit metadata, settings.

## Key indexes

`jobs(company_id,status)`, `jobs(status,deadline)`, `job_published` GIN on `search_tsv`, `(deadline)`, `(company_id)`, `(category_id)`, `(province,city)`, `(featured desc, published_at desc)`; `company_members(user_id)`, `(company_id,role)`; `applications(company_id,status,submitted_at desc)`, `(candidate_id,submitted_at desc)`, partial unique `(job_id,candidate_id) where status<>'withdrawn'`; `notifications(user_id,created_at desc)`; `audit_logs(created_at desc)`.

## Important behaviours enforced in the database

* Sign-up trigger whitelists the role (`employer` | `job_seeker`); `admin` can never come from the client. `provision_admin()` is executable only by `service_role`.
* Guard triggers block clients from changing `profiles.role/status/email`, `companies.verification_status/managed_by`, `jobs.status/featured/published_at`.
* A job in review is locked for employers; editing an approved/expired job flips it to `draft` (new revision) while `job_published` stays online.
* Last company owner cannot leave/be demoted. Invitations store only a token hash and can be accepted only by the invited, confirmed e-mail.
* `today_pk()` (Asia/Karachi) defines "today" for deadlines.

## Conventions for new migrations

Add a new numbered file, never edit an applied one. Every new table needs `enable row level security` and explicit policies; Supabase auto-grants table privileges to `anon`/`authenticated`, so revoke what clients must not do (see the end of migration 04 and 08). Workflow functions: `security definer`, `set search_path = ''`, check `auth.uid()` inside, `revoke execute … from public, anon` unless intentionally public.
