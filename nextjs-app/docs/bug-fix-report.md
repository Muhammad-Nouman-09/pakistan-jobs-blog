# Bug-fix report — staging test (KnowledgeMentor / Pakistan Jobs Portal)

Date: 2026-11-28. Scope: repository `f:\pakistan-jobs-blog` (branch `main`), app in `nextjs-app/`.

## 0. Read this first

1. **Which code the staging site runs is not confirmed.** The repository has two apps:
   * **v2 (current, `app/`, `lib/`, `supabase/`)** — Next.js + Supabase (Postgres, Auth, RLS). Most reported behaviour is *already* correct here (Pakistan-time deadlines, expiry, archive/restore, detail pages, forgot-password, AdSense tab named "AdSense").
   * **v1 (`legacy/v1/`, excluded from the build)** — Next.js + Upstash Redis. Almost every reported symptom matches **v1** text and logic exactly:
     * `legacy/v1/app/page.js:37` shows the stat **"live job ads"**; `legacy/v1/app/find-jobs/page.js:93` has a **"Closing soon"** heading.
     * `legacy/v1/app/admin/page.js:75` deletes with a browser `confirm("Delete this job?")` and no in-flight guard.
     * `legacy/v1/lib/util.js:3` computes days with `Math.ceil((deadline + 23:59:59 − now) / 86400000)` (millisecond arithmetic, not calendar days).
     * `legacy/v1/app/admin/page.js:10` and `legacy/v1/app/find-jobs/page.js:10` list **both** "Islamabad" and "Islamabad Capital Territory".
     * The v1 site name is "Pakistan Jobs Blog" everywhere; the "AdSense and Settings" tab label does not exist in v2 (v2 uses `admin.settings.adsense` = "AdSense").
   * **Action required from the owner:** confirm which code is deployed to staging. The fixes in §3 are in v2. If staging runs v1, those fixes must be ported to `legacy/v1` (or v1 retired in favour of v2 after the Supabase setup in `docs/deployment.md`).

2. **No production data was changed.** No database writes were made. Both Supabase projects visible to the connector (`emgtpbrdwlocezvlkycu`, `ehiyurjtksesbwyknfdb`) are **INACTIVE (paused)**. They were not restored, resumed or modified, because that requires your approval. Neither project is named for this portal.

3. **KnowledgeMentor logo kit: not present in the repository.** A search of the whole repo for "KnowledgeMentor" returned nothing, and there is no `public/` folder with brand assets. Branding was **not** changed (see §4).

## 1. Data protection and recovery (Part 2 / Part 9)

### 1.1 What was inspected

| Source | Found? | Result |
|---|---|---|
| Git history (`6dc4ed0`, `78cb8d7`) | yes | No job data committed beyond seed files. |
| `nextjs-app/.data/db.json` (local JSON store used when Redis/Supabase is not configured) | **yes** | 6 published job records, including all three deleted jobs. |
| `nextjs-app/data/legacy-seed-jobs.json` | yes | Older seed set (MES, NASTP, etc.). Does **not** contain the three deleted jobs. |
| `legacy/v1/data/jobs.json` | yes | Legacy seed data (not inspected in full; no deleted-job matches by title). |
| Supabase audit / migration history | **not reachable** | Both projects INACTIVE. `supabase/migrations/` has no data migration that inserts these jobs. |
| Admin audit log (`audit_logs`, v2) | **not reachable** | Database paused. |
| Vercel / Upstash backups | not accessible from this session | Requires owner access to the Upstash console and Vercel dashboard. |

### 1.2 Recovery result

* **Recovered verbatim from `.data/db.json` into `docs/recovery/deleted-jobs-recovery.json`:**
  * id 3 — *FPSC Consolidated Advertisement 4/2026 — 278 Posts (BS-16 to BS-20)*
  * id 4 — *Staff Welfare Organization Jobs 2026 — 7 Posts (BPS-01 to BPS-11), Balochistan Quota*
  * id 6 — *Wafaqi Mohtasib Jobs 2026 — Chowkidar (BPS-01), Quetta*
* **Not re-inserted** into any database. The recovered file says `restoreStatus: "draft"`. Restoring means creating them as **drafts** (not published) and verifying every field against the official advertisement, because the snapshot is a development copy and may not be the last version before deletion. **Approval needed** before any write.
* Jobs 1, 2 and 5 in the same snapshot (MES, NASTP, ISSI) were not part of the incident. Their current live state is unknown to this session.

### 1.3 Test-record cleanup (Part 9)

* `TEST, Admin Login Retest Job, Do Not Apply` and `TEST, Upload Test Job, Do Not Apply` were searched for in `.data/db.json`, `legacy-seed-jobs.json`, and `legacy/v1/data/jobs.json`: **no matches**. The Supabase database could not be checked (paused). Nothing was deleted. Owner should confirm in the live system by exact title and ID.

### 1.4 Deletion safety (Part 2 requirements)

* v2 has **no hard-delete path for jobs**. Removal is `archive_job` (owner) / `review_job(unpublish)` (admin), with `restore_job` to recover (`supabase/migrations/20261123000003_workflow_functions.sql:163-188`). Both write `job_reviews` and `audit_logs`. UI uses a confirm step (`components/employer/JobActions.tsx`).
* Hard delete of jobs is **not** exposed in the app. It remains a database-admin operation.
* v1 (`legacy/v1/app/admin/page.js:75`) has **no** safeguards: a single `confirm()` and no disabled state while the request runs, no audit log, no archive. This is the most likely cause of the reported accidental deletions. **Not fixed in v1** (see §5).

## 2. Bug register

| # | Bug | Root cause | Affected files | Status |
|---|---|---|---|---|
| B1 | Four jobs deleted instead of one | v1 admin delete has no per-row guard, no audit log, no soft delete (`legacy/v1/app/admin/page.js:75`, `legacy/v1/app/api/jobs/[id]/route.js:32`). | legacy/v1 | **Not fixed in v1.** v2 has archive/restore + audit. |
| B2 | Recovery of the three deleted jobs | Deleted by B1; no backups. | — | **Recovered to file** (§1.2). Restore needs approval. |
| B3 | Automated clicks do nothing on delete | v1 uses `confirm()` plus a fetch without state; automation dismisses the native dialog. | legacy/v1 | **Not fixed in v1.** |
| B4 | Closed jobs shown / jobs closing today missing on homepage | v1 filters by `daysLeft < 0` with `Math.ceil` millisecond arithmetic; "today" is computed in server UTC. | `legacy/v1/lib/util.js:1-3` | v2: **already correct** (`today_pk()` in Asia/Karachi, `deadline >= today_pk()` in `search_jobs`, `job_facets`, `list_companies`). |
| B5 | Days-left wording and off-by-one | v1 uses `Math.ceil`, so "closes today" can become 1 day. | `legacy/v1/lib/util.js` | v2: **already correct** (`daysLeft` uses calendar-day difference). Covered by new tests (§3.2). |
| B6 | Failed request shown as empty | v2 `searchJobs` returned `[]` with `configured: true` on DB error, so the UI displayed "no jobs". | `lib/services/public.ts`, `app/[locale]/page.tsx`, `app/[locale]/jobs/page.tsx` | **Fixed** (§3.1). |
| B7 | Closing Soon had no empty state | Sidebar and hero list rendered nothing (no message) when empty. | `app/[locale]/page.tsx`, `app/[locale]/jobs/page.tsx` | **Fixed.** Shows "No closing jobs right now." only after a successful empty response. |
| B8 | Expired approved jobs look active in admin | Admin list showed the stored status (`approved`) although the deadline had passed; the cron only sets `expired` once a day. | `app/[locale]/admin/jobs/page.tsx` | **Fixed** (display only, stored status unchanged). |
| B9 | "0 live job ads" / "No jobs here yet" flash before data | v1 counts come from a list loaded in the browser (`legacy/v1/components/useJobs.js`, not traced further). v2 renders on the server; it had no loading state for navigation. | legacy/v1 (`app/page.js`); v2 `app/[locale]/jobs/` | v2: **loading state added** (`app/[locale]/jobs/loading.tsx`, `components/ui/LoadingNotice.tsx`) showing "Loading jobs...". v1 **not fixed**. |
| B10 | Islamabad listed twice | v1 hard-codes two province strings (`legacy/v1/app/admin/page.js:10`, `legacy/v1/app/find-jobs/page.js:10`, `legacy/v1/lib/jobs.js:6`, `legacy/v1/lib/util.js:18`). | legacy/v1 | v2: **already consistent**. Single list in `lib/types.ts:24` uses "Islamabad Capital Territory". v1 **not fixed**. |
| B11 | "View Details" did not open a proper page | v1 renders job details in a list view, not a route. | legacy/v1 | v2: **already has** `/jobs/[slug]` (not-found for unknown, closed notice and no apply action for expired, `noindex`). v1 not fixed. |
| B12 | Forgot password missing | — | — | v2: **already present** (`/auth/forgot`, `/auth/reset`, Supabase `resetPasswordForEmail`, non-enumerating, rate-limited). Not live-tested (no Supabase project). v1: not verified. |
| B13 | Admin "AdSense and Settings" label | Label exists only in v1. | legacy/v1 | v2: **already named "AdSense"** (`lib/i18n/messages/admin.ts:146`). v1 not changed. |
| B14 | KnowledgeMentor branding | Brand assets and brand name not in repository. | — | **Blocked** (§4). |
| B15 | Responsive overflow at 390–1920 px | Not tested in this session (no staging URL, no browser run). | — | **Not verified.** |

## 3. Fixes implemented (v2)

### 3.1 Failed requests are errors, not empty results (B6)
* `lib/services/public.ts` — `searchJobs` now returns `error: boolean`. On a database error it returns `error: true` (previously it returned an empty list that looked like "no results").
* `app/[locale]/page.tsx` — homepage "Latest jobs" and the Closing Soon block show `err.generic` on error, and the "no jobs" text only when `error` is false.
* `app/[locale]/jobs/page.tsx` — result list and Closing Soon sidebar show the error message on failure.

### 3.2 Date logic regression tests (B4, B5)
* `tests/unit/job-dates.test.ts` (new, 10 tests) covers Asia/Karachi calendar-date rules: closing today = 0, tomorrow = 1, +2, +5, yesterday = closed, UTC-vs-PKT boundary (19:00Z = next day in Karachi), 23:59 PKT still open, month boundary (30 Nov → 1 Dec), year boundary (31 Dec → 1 Jan), null deadline, no millisecond rounding, singular/plural wording (`1 day left` / `2 days left`).

### 3.3 Closing Soon empty state (B7)
* New key `jobs.noClosing` = "No closing jobs right now." (English, as specified). Urdu draft: "اس وقت کوئی نوکری جلد بند ہونے والی نہیں ہے۔" — **needs native review**.

### 3.4 Loading state (B9)
* `app/[locale]/jobs/loading.tsx` + `components/ui/LoadingNotice.tsx` (client component, reads locale from the URL) show "Loading jobs..." during navigation. A server-only `loading.tsx` failed static prerendering (`Cannot destructure property 'locale'`), so the client version was used. Verified by a production build (108/108 pages).

### 3.5 Admin expired indicator (B8)
* `app/[locale]/admin/jobs/page.tsx` shows **Expired** for approved jobs whose deadline is before today (Pakistan date). The stored status is not changed, so approval history is preserved.

## 4. Not done, and why

* **KnowledgeMentor branding (Part 12).** The logo kit is not in the repository. The platform name "Pakistan Jobs Blog" is also stored in the database (`site_settings`, seeded in `supabase/migrations/20261123000006_seed_reference_data.sql:30-31`), so a text change needs a data migration. **Needed from you:** the logo files (SVG/PNG, favicon) and confirmation of the exact name and tagline.
* **Restoring the three deleted jobs.** Needs your approval; see §1.2. Recommended path: admin creates them as drafts from `recovery/deleted-jobs-recovery.json`, verifies each field against the official advertisement, then submits for review.
* **Supabase projects.** Both are INACTIVE. Restoring a paused project is a platform action; not performed without approval.
* **Staging deployment and browser/responsive tests (Parts 14, 16).** Not run: no staging URL or credentials in this session, and no live Supabase. These need to be run against staging.
* **Legacy v1 fixes (B1, B3, B9, B10, B13).** Not applied. If staging runs v1, these are the bugs that matter, and they must be fixed in `legacy/v1`.
* **Password recovery, live.** Code is present but unverified end-to-end (needs Supabase Auth e-mail and a reset link).

## 5. Test results (run in this session)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Lint | `npx next lint` | 0 errors, 6 warnings (pre-existing `<img>` warnings) |
| Unit + DB tests | `npx vitest run` | **14 files, 231 tests passed** (baseline 221; +10 new date tests) |
| Production build | `npx next build` | success, 108/108 static pages |

Not run: Playwright/browser interaction tests, responsive viewport tests, staging API tests, database permission tests against a live Supabase project.

## 6. Files changed

* `lib/services/public.ts` — `searchJobs` error flag.
* `app/[locale]/page.tsx` — error and empty states for latest jobs and Closing Soon.
* `app/[locale]/jobs/page.tsx` — error and empty states; Closing Soon empty state.
* `app/[locale]/jobs/loading.tsx` (new), `components/ui/LoadingNotice.tsx` (new) — loading state.
* `app/[locale]/admin/jobs/page.tsx` — Expired indicator.
* `lib/i18n/messages/public.ts` — keys `jobs.loading`, `jobs.noClosing` (en + ur).
* `tests/unit/job-dates.test.ts` (new).
* `docs/recovery/deleted-jobs-recovery.json` (new) — recovered records, draft-only.
* `docs/bug-fix-report.md` (new, this file).

Database changes: **none**.

## 7. Remaining manual tasks (owner)

1. Confirm which code is on staging (v2 or `legacy/v1`).
2. Approve restoring the three jobs as drafts (`docs/recovery/deleted-jobs-recovery.json`) and verify each against the official advertisement.
3. Confirm the three TEST records by exact title and ID in the live database; none were found locally.
4. Unpause or restore the Supabase project for this portal (both are INACTIVE), or confirm which project is meant.
5. Provide the KnowledgeMentor logo kit and exact brand name.
6. Have a native speaker review the new Urdu string `jobs.noClosing` and `jobs.loading`.
7. Run the browser and responsive checks (390, 430, 768, 1024, 1440, 1920 px) against staging.
