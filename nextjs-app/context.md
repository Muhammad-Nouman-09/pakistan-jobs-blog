# Pakistan Jobs Portal — Project Context

Central project memory. Last updated: 2026-11-23 — **all 9 phases implemented; verified by typecheck, lint, 221 automated tests and a production build; NOT yet run against a live Supabase project** (see §15).

---

## 1. Product overview

A bilingual (English `/en`, Urdu `/ur` RTL), multi-company job portal that grew out of "Pakistan Jobs Blog" (a hand-curated government/private job board). Three account types:

* **Super Admin** — moderates companies and jobs, manages users, categories, blog, settings, AdSense, reports, audit log.
* **Employer** — creates/owns companies (owner / recruiter / viewer members), submits jobs for approval, manages applications.
* **Job Seeker** — profile, resumes (builder + private PDF), saved jobs, internal applications, external apply links.

Editorial identity kept from v1: "No agents, no fees, no middlemen", real last dates, anti-scam notices.

## 2. Technology stack

Next.js 15.5 (App Router) · React 19 · TypeScript 6 (strict) · Supabase (Postgres 17, Auth, Storage, RLS) · zod 4 · plain CSS (`app/globals.css`, the original design + additions) · Vercel. Dev: vitest 3 (pinned — vitest 5.1.1 failed on a trivial test in this environment), `@electric-sql/pglite` (in-process Postgres for migration/RLS tests), tsx, ESLint 8 + `eslint-config-next`.
Removed: `@upstash/redis`, `bcryptjs`, `jose` (v1 auth/Redis). Added runtime deps: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `server-only` only.

## 3. Repository structure

```
nextjs-app/
  app/                 [locale]/(public, auth, candidate, employer, admin, invitations, dashboard) · api/ · auth/callback · sitemap.ts robots.ts ads.txt/
  components/          Header, Footer, JobCard, JsonLd, StaticPage, LanguageSwitcher · ui/ (Flash, Pagination, Breadcrumbs, DashTabs, StatusBadge, ConfirmButton, Markdown…) · ads/ · jobs/JobForm · candidate/ employer/ admin/
  lib/                 supabase/ (server, anon, admin, middleware) · auth/session · i18n/ (+messages/*) · services/ · validation/ · security/ (rate-limit, files, tokens) · seo/ · legacy/transform · actions/job-actions · markdown, forms, errors, utils, email, env, types
  supabase/            migrations/ (8 files) · config.toml
  tests/               db/ (PGlite: migrations + RLS + workflows) · unit/
  scripts/             provision-admin.ts · migrate-legacy.ts
  docs/                architecture, database, permissions, api, seo, deployment, migration, dev-conventions
  legacy/v1/           the original v1 code (Redis + JWT), excluded from the build
  data/legacy-seed-jobs.json   the 6 original seed jobs (used by the migration test)
  middleware.ts · next.config.ts · vercel.json · tsconfig.json · vitest.config.mts
```

## 4. Architecture — see `docs/architecture.md`

Key decisions: DB-enforced workflow (definer functions + RLS) · working-copy vs published-copy for jobs · user-scoped Supabase client for everything a user does, anon client for cached public pages, service role only for rate limiting / cron / contact form / scripts · server actions + plain forms (no client JS needed for mutations) · i18n with English fallback and per-language content.

## 5. Database schema — see `docs/database.md`

Migrations `20261123000001…08` (identity/companies, jobs/applications/content, workflow functions, RLS+search, storage, seed data, `save_job`, contact messages). Tables: profiles, candidate_profiles, companies, company_private, company_members, company_invitations, company_verification_documents, job_categories, jobs, job_translations, job_published(+_translations), job_reviews, job_external_clicks, resumes, saved_jobs, applications, application_answers/events/notes, notifications, audit_logs, site_settings, rate_limits, contact_messages, blog_categories, blog_posts, blog_post_translations.

## 6. Authentication — see `docs/permissions.md`

Supabase Auth (e-mail confirmation required), cookie sessions via `@supabase/ssr`, `auth.getUser()` validation on every request, middleware refresh, password policy ≥10 chars + letter + digit, rate-limited login/register/reset (uniform errors, no account enumeration), password reset and confirmation-resend flows. Admin only via `npm run admin:provision`. Suspended/unverified accounts blocked in app and DB.

## 7. Permissions — `docs/permissions.md` (matrix + mechanisms)

## 8. API routes — `docs/api.md`

## 9. Job workflow

Employer saves draft (`save_job`) → submits (`submit_job_for_review`: company must be verified; category, city, future deadline, ≥30-char description in main language, valid external link) → admin approve / reject (reason) / request changes (reason) → approved copy published (`job_published`). Editing a live job creates a draft revision; the approved copy stays online until re-approved. Full history in `job_reviews`. Deadline passing hides the job (PKT) and the cron marks it `expired`. Employers cannot approve (guard trigger + definer check + tests).

## 10. Company workflow

Employer creates a company (pending) with logo and verification documents → admin verifies / rejects (note) / suspends → rejected owners can resubmit. Platform-managed companies are created by admins and get owners/recruiters/viewers assigned. Membership via invitations (hashed token, expiry, single use, e-mail-bound), role changes, member removal/leave, ownership transfer, last-owner protection.

## 11. Application workflow

Internal: seeker picks a **shareable** resume + cover letter + screening answers → `apply_to_job` stores a resume snapshot (later edits don't alter it), prevents duplicates (partial unique index; withdrawal allows re-apply), notifies recruiters. Employers (owner/recruiter) review, change status (viewed/shortlisted/interview/selected/rejected), add private notes, download the resume via signed URL; candidates track status history and may withdraw (snapshot redacted). External: the apply button records a **click** only (never an application), the destination comes from the DB, and the UI says external applications are not tracked.

## 12. Resume management

Structured builder (personal, summary, education, experience, skills, certifications, projects, languages as JSONB), multiple resumes, default selection, privacy (`private` / `shareable`), preview, PDF upload to private bucket (5 MB, magic-byte + active-content checks), signed-URL download (60 s). "PDF download" of a *built* resume = browser Print → Save as PDF (print stylesheet); no server-side PDF generator was added to avoid a heavy dependency.

## 13. Bilingual implementation

`/en` `/ur`, English default (cookie remembers choice), `lang`/`dir`, RTL CSS with logical properties, language switcher, 1,234 UI strings in each language (`lib/i18n/messages/*`, coverage enforced by a test), localized validation/DB errors, per-language job and blog content with explicit "only available in…" notices, localized metadata/hreflang. **Urdu text is AI-drafted and needs native review.**

## 14. SEO & AdSense readiness — `docs/seo.md`

## 15. Environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, optional `RESEND_API_KEY`/`EMAIL_FROM`; scripts: `ADMIN_EMAIL`, `LEGACY_REDIS_URL/TOKEN` or `LEGACY_DB_FILE`. Documented in `.env.example`. (The pre-existing `.env.local` still contains only the old v1 variables; it was not modified.)

## 16. Completed phases

| # | Phase | Status | Notes |
|---|---|---|---|
| 0 | Audit + context | ✅ | v1 audited (Redis blobs, client-rendered pages, jobs auto-published, no rate limits…) |
| 1 | Foundation | ✅ | TypeScript, Supabase clients, 8 migrations, Auth, roles, middleware, env, admin provisioning, migration script + report |
| 2 | Companies | ✅ | self/platform-managed, verification, members, invitations, ownership transfer, documents, logos |
| 3 | Jobs & approval | ✅ | drafts, review, history, revisions, expiry, DB-enforced |
| 4 | Public site & SEO | ✅ | home (v1 layout kept), search/filters/sort/pagination, SEO job URLs, company pages, JSON-LD, sitemap/robots/ads.txt |
| 5 | Candidates | ✅ | profile, resume builder, PDF upload, privacy, saved jobs, history |
| 6 | Applications | ✅ | internal + external, employer management, notes, notifications |
| 7 | Admin | ✅ | overview, jobs, companies, users, applications (read-only), categories, blog, messages, notifications, reports, settings, audit |
| 8 | Bilingual & content | ✅ | en/ur RTL, blog CMS (draft/publish/archive, per-language), static pages |
| 9 | Final prep | ⚠️ partial | Everything that can be verified offline is verified; live-Supabase testing, staging walkthrough and production deployment are **not done** (no project/credentials) |

**UI changes vs v1 (deliberate, minimal):** nav gained *Companies* and *Career Blog*; language switcher added; hero "post a job" input became a button; hero copy generalised (multi-company); job cards link to the detail page (the direct "Apply now" external link moved to the detail page so clicks can be tracked); everything else (palette, type, buttons, cards, footer structure, breakpoints) is unchanged. Verified with headless-Chrome screenshots (desktop + 390 px, en + ur): no horizontal overflow on 11 public pages.

## 17. Testing results (2026-11-23, all actually run)

| Check | Result |
|---|---|
| `tsc --noEmit` (strict) | 0 errors |
| `next lint` | 0 errors; 6 warnings (`<img>` for Supabase-hosted logos — intentional) |
| `vitest run` | **221 passed / 13 files** (0 failed) |
| ↳ `tests/db` (run the real migrations on PGlite, test as each role) | accounts-companies 22 · jobs 32 · applications 27 · contact 3 · migrations 2 |
| ↳ `tests/unit` | core 24 · i18n 8 · seo 11 · admin 37 · candidate 28 · employer 15+3 · legacy transform 9 |
| `next build` | success (108 static pages generated) |
| Production-server smoke test (curl, unconfigured mode) | 25 routes: redirects, 404s, 401 cron, private routes → login, legacy redirects; `lang=ur dir=rtl`, canonical/hreflang/OG, robots, sitemap, `X-Robots-Tag` on private paths, security headers |
| Mobile/RTL layout | 11 pages × 390 px: no overflow (CDP emulation); desktop screenshots reviewed |
| Legacy migration dry-run (6 real seed jobs) | 6 jobs → 6 platform companies, 0 rejected |

**Requirement coverage by tests** (spec §15): job seekers can't create jobs/companies ✔ · employers can't access other companies' jobs/applications ✔ · recruiters can't modify ownership ✔ · viewers can't edit ✔ · employers can't approve ✔ · pending (unverified) companies can't submit ✔ · unapproved jobs not public ✔ · candidates can't read others' resumes/applications ✔ (table + storage) · external applications never create applications ✔ · suspended accounts blocked ✔ · expired jobs excluded ✔ · Urdu/English dictionaries complete ✔. A real bug found and fixed by these tests: `company_member_role()` returned `NULL` for non-members, which made `if not can_manage_company()` silently pass in PL/pgSQL (non-members could have created invitations / set application status) — helpers now return `false`, with regression tests.

## 18. Known issues / limitations (honest list)

1. **Not run against live Supabase.** Migrations/RLS/functions are tested on PGlite with an emulated `auth`/`storage` schema; the Supabase Auth flows (confirmation e-mail, reset, PKCE callback), Storage API behaviour (e.g. uploads using `INSERT … RETURNING`), PostgREST query shapes in dashboards, and signed URLs are **untested**. Two PostgREST constructs flagged by the author as most likely to need adjustment: the `.neq("applications.status","withdrawn")` embed filter (employer jobs list) and the `resume_snapshot->applicant->>full_name` select (employer applications list).
2. **No browser tests of authenticated flows.** Dashboards were type-checked, linted, built and unit-tested but never rendered with real data; only public pages were visually checked (in "not configured" mode).
3. **Supabase "Confirm email" must be enabled** in the dashboard (documented; `config.toml` sets it locally). The DB also refuses actions from unconfirmed users.
4. **Urdu translations are AI-drafted**; **legal pages (Privacy, Terms) are generic drafts** — both need human/professional review before launch.
5. **No original blog content** is shipped (by design — no generated filler). AdSense requires real content and review by Google; approval is not promised.
6. Rate limiting is Postgres-backed and **fails open** if the limiter is unreachable or the service key is missing (logged).
7. **No Content-Security-Policy** header yet (needs tuning for AdSense/Next inline scripts). No Sentry/monitoring integration.
8. DB row types are hand-written (no generated Supabase types); hand-tuned PostgREST selects are not type-checked.
9. Form validation failures redirect back with an error and lose typed input (server-action, no-JS design); inputs carry HTML5 constraints to reduce this.
10. Built resumes download via browser print (no server PDF generator). No account-deletion UI, no blog-category management UI, no admin user-detail page, no candidate search for employers (resume privacy `shareable` only means "can be attached to applications").
11. Legacy: old numeric job ids are not mapped (`/find-jobs?id=` → job list); legacy admins are not migrated; migrated users must confirm e-mail (or use `--confirm-emails`).
12. Employer application detail marks an application *viewed* during page render (idempotent RPC).
13. Search uses Postgres `simple` text config (no stemming); `next lint` is deprecated in Next 16 (migrate to ESLint CLI later).
14. Two Supabase projects already exist in the connected account (`coupon-crawler` — an unrelated app — and a paused unnamed project). **Neither was touched**; create a dedicated project for this portal.

## 19. Remaining tasks (owner / next steps)

1. Create the Supabase project, apply migrations, configure Auth/SMTP (docs/deployment.md), set env vars, deploy to Vercel **staging**.
2. Run the end-to-end staging walkthrough of every role; fix whatever the live backend reveals (see §18.1).
3. `npm run admin:provision`; optionally `npm run migrate:legacy` (dry-run first) using the old Redis credentials.
4. Write original blog articles; review Urdu + legal copy; set real contact details; configure AdSense after content/traffic exist.
5. Add CSP, error monitoring, scheduled DB backups; generate Supabase types (`supabase gen types`).

## 20. Deployment instructions — `docs/deployment.md`

## Changelog

- 2026-11-28 — Header fix: removed the duplicate "Find Jobs" CTA (the main-nav link is the only one); header is one non-wrapping row at ≥1201 px and collapses to a hamburger dropdown (`components/Header.tsx`, `.header-menu`/`.nav-toggle` in `app/globals.css`) — same elements for every width, closes on link click/Escape/route change. Checked in headless Chrome at 1920/1440/1280/1201/1200/1024/768/430/390 px (en + ur).
- 2026-11-28 — Staging bug-fix pass (see `docs/bug-fix-report.md`): failed job searches now show an error instead of "no jobs"; Closing Soon empty state; loading state for /jobs; admin job list flags approved-but-past-deadline jobs as Expired; date-rule regression tests (231 tests pass). Recovered the three deleted jobs to `docs/recovery/deleted-jobs-recovery.json` (draft-only, not restored). Staging appears to run `legacy/v1` (Redis) — confirm before deploying.
- 2026-11-23 — Phase 0 audit; Phases 1–9 implemented (schema + 8 migrations, workflow functions, RLS, storage, auth, public site, candidate/employer/admin dashboards, i18n, SEO, scripts, docs). 221 tests passing; build green; live-Supabase verification outstanding.
