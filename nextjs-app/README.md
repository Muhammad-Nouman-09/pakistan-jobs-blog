# Pakistan Jobs Portal

A bilingual (English `/en`, Urdu `/ur` right-to-left), multi-company job portal built on **Next.js 15 (App Router) + TypeScript + Supabase** (Postgres, Auth, Storage, Row Level Security), deployed on Vercel. It evolved from the original "Pakistan Jobs Blog" and keeps its look and feel.

* **Three account types:** Super Admin, Employer (multi-company, owner / recruiter / viewer roles), Job Seeker.
* **Admin-approved publishing:** every job (and every edit to a live job) is reviewed before the public sees it; the last approved version stays online while a revision is pending.
* **Internal and external applications:** external ones are tracked only as link clicks, never shown as "submitted".
* **Resumes:** structured builder, PDF upload to a private bucket, signed-URL access only.
* **SEO / AdSense-ready:** server-rendered pages, `JobPosting` schema, hreflang, sitemap, robots, `ads.txt`, original blog content. (No approval is promised or implied.)

> **Status:** all nine phases are implemented and the test suite passes, but the app has **not yet been run against a live Supabase project** (none was available when it was built). Read [`context.md`](context.md) → *Known issues* and [`docs/deployment.md`](docs/deployment.md) before going live.

## Quick start

```bash
npm install
cp .env.example .env.local          # fill in the Supabase values (see docs/deployment.md)
# apply supabase/migrations/*.sql to your Supabase project (supabase db push, or paste them in order)
npm run dev                         # http://localhost:3000  (redirects to /en)
npm run admin:provision             # promote your account to Super Admin (ADMIN_EMAIL=you@example.com)
```

Without Supabase variables the site still builds and runs, showing a "backend not configured" notice instead of data.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (`next lint`) |
| `npm test` | all tests (database + unit) |
| `npm run test:db` | migrations + RLS/permission tests on in-process Postgres (PGlite) |
| `npm run test:unit` | validators, i18n coverage, SEO/JSON-LD, markdown/XSS, uploads, legacy transform |
| `npm run admin:provision` | the only way to create a Super Admin |
| `npm run migrate:legacy` | dry-run (default) / `-- --apply` migration of the old Redis data |

## Documentation

* [`context.md`](context.md) — project memory: status, decisions, test results, known issues, remaining work
* [`docs/architecture.md`](docs/architecture.md) · [`docs/database.md`](docs/database.md) · [`docs/permissions.md`](docs/permissions.md)
* [`docs/api.md`](docs/api.md) · [`docs/seo.md`](docs/seo.md) · [`docs/deployment.md`](docs/deployment.md) · [`docs/migration.md`](docs/migration.md)
* [`docs/dev-conventions.md`](docs/dev-conventions.md) — how to add pages/actions/strings

The original v1 code (Next.js + Upstash Redis) is preserved in [`legacy/v1/`](legacy/v1) (excluded from the build).
