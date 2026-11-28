# Architecture

One Next.js application, one Supabase project. No microservices.

```
Browser ──► Vercel (Next.js 15)                       Supabase
            ├─ middleware.ts   locale redirect, session refresh, noindex headers
            ├─ app/[locale]/…  server components (public pages, ISR 60 s via anon client)
            │                  dashboards (dynamic, user-scoped client + RLS)
            ├─ server actions  all mutations (zod-validated, rate-limited)  ─────► PostgREST / RPC  ─► Postgres (RLS + SECURITY DEFINER workflow functions)
            ├─ route handlers  /api/session, /api/cron/expire-jobs, signed-URL redirects, /auth/callback ─► Auth, Storage
            └─ app/sitemap.ts, robots.ts, ads.txt
```

## Layers

| Layer | Where | Rule |
|---|---|---|
| UI | `app/[locale]/**/page.tsx`, `components/` | Server components by default; client components only for interactivity (header session widget, language switcher, repeatable resume rows, confirm buttons, ad unit). Existing CSS classes (`app/globals.css`) only. |
| Business logic | Postgres functions (`supabase/migrations`) | Status transitions, approvals, applications, membership. The database is the source of truth, so a bug in the UI cannot bypass them. |
| Data access | `lib/services/*.ts`, `lib/supabase/*` | Three clients: **user-scoped** (`server.ts`, carries the user's JWT → RLS), **anon** (`anon.ts`, cookie-less, cached, public data only), **service-role** (`admin.ts`, `server-only`; rate limiting, cron, contact form). |
| Authentication | Supabase Auth + `lib/auth/session.ts` | `auth.getUser()` validates the JWT on every request; `requireRole()` gates pages/actions; e-mail must be confirmed; suspended accounts are blocked in both app and database. |
| Authorization | `lib/auth/session.ts` + RLS (`…_rls_policies.sql`) | See [permissions.md](permissions.md). |
| Validation | `lib/validation/*` (zod) + DB `check` constraints | Messages are i18n keys. |
| Handlers | server actions (`actions.ts` next to each area) and route handlers | Pattern in [dev-conventions.md](dev-conventions.md). |

## Rendering strategy

* **Public pages** (home, jobs, job detail, companies, blog, static pages): server-rendered, data from the anon client with `revalidate: 60` and a `public-data` cache tag. Approving a job, verifying a company, publishing a post or saving settings calls `revalidateTag("public-data")` so changes appear immediately. The signed-in header state is fetched client-side from `/api/session`, so the page shell is cacheable.
* **Dashboards / apply / invitation pages:** always dynamic (`cookies()` is read first in `createClient()`).
* **Metadata:** every page has unique title/description, canonical, hreflang (only for languages that exist), Open Graph/Twitter; see [seo.md](seo.md).

## Job lifecycle

```
draft ──submit_job_for_review──► pending_review ──review_job(approve)──► approved ──deadline passes──► expired
  ▲  ▲                                │  │                                  │  (cron)
  │  └── withdraw_job ────────────────┘  ├─ reject ─► rejected               └─ edit ─► draft revision (live copy stays online)
  └──────── edit ◄── changes_requested ◄─┘                  archive_job / admin unpublish ─► archived (live copy removed)
```

`jobs` is the employer's working copy; `job_published` (+ translations) is the last **approved** public copy, written only by `publish_job_copy()` inside `review_job()`. Public queries read only `job_published`.

## Internationalisation

`lib/i18n`: flat dictionaries per area in `lib/i18n/messages/*` (`{ en, ur }`), `createT(locale)` with an explicit missing-key policy (falls back to **English**, never to a machine translation; recorded in `missingKeys`). Routes `/en`, `/ur`; `<html lang dir>`; RTL via logical CSS properties and `[dir=rtl]` overrides at the end of `globals.css`. Job and blog **content** is stored per language (`job_translations`, `blog_post_translations`); a missing translation is shown in the language it exists in with an explicit notice.

## Security boundaries (summary)

Row Level Security on every table · no client write path for privileged state · definer functions re-check the caller · private resume storage with owner/employer-via-application policies · short-lived signed URLs minted with the *user's* client · upload validation (size, MIME, magic bytes, active-PDF check) · Postgres-backed rate limiting · audit log of admin/workflow actions · service-role key only in server-only modules.
