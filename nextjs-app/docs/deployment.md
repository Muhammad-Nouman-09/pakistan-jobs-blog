# Deployment (Supabase + Vercel)

Nothing below has been executed against a real project yet — it was written alongside the code and the migrations are tested on a local Postgres. Do steps 1–6 on a **staging** project first.

## 1. Create the Supabase project
Create a **new, dedicated** project (do not reuse one that holds other apps' data). Note the project URL, the publishable/anon key and the service-role key (Project Settings → API).

## 2. Apply the database
```bash
npm i -g supabase            # or use npx
supabase link --project-ref <ref>
supabase db push             # applies supabase/migrations/*.sql in order
```
(Or paste the files into the SQL editor, in file order.) Then run the Supabase **Security Advisor** and fix anything it reports on tables you add later.

## 3. Required Auth settings (Dashboard → Authentication)
* **Email → "Confirm email": ON.** (The database also refuses actions from unconfirmed users.)
* **Site URL** = your production origin; **Redirect URLs** include `https://<domain>/auth/callback`.
* Minimum password length ≥ 10; enable leaked-password protection if your plan has it.
* **SMTP:** configure a real SMTP provider (the built-in mailer is rate-limited and for testing only).
* Email templates: keep the default `{{ .ConfirmationURL }}` links (they land on `/auth/callback`).
* Rate limits: keep Supabase's defaults or tighten them; the app adds its own limits on top.

## 4. Storage
Buckets `resumes` and `company-documents` (private) and `company-logos`, `blog-images` (public) are created by migration 05 together with their policies. Verify in Dashboard → Storage that `resumes` is **not** public.

## 5. Environment variables (Vercel → Settings → Environment Variables)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (**server-only**, never `NEXT_PUBLIC_`), `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, optional `RESEND_API_KEY` + `EMAIL_FROM`. Use different values for Preview and Production. Never commit real values (`.env*.local` is git-ignored).

## 6. Provision the first administrator
Register normally, confirm the e-mail, then locally with the env vars set:
```bash
ADMIN_EMAIL=you@example.com npm run admin:provision
```
(If the account does not exist the script creates it and e-mails a password-set link.) This is the only way to create an admin.

## 7. Migrate the old data (optional)
See [migration.md](migration.md). Always dry-run first.

## 8. Deploy to Vercel
Import the repo, **Root Directory = `nextjs-app`**, framework Next.js, Node 20+. `vercel.json` schedules the daily expiry cron (`/api/cron/expire-jobs`, 01:30 PKT); Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. Add the production domain, set `NEXT_PUBLIC_SITE_URL` to it, redeploy.

## 9. Go-live checklist
- [ ] Staging walkthrough of every role (register employer → create company → admin verifies → create job → admin approves → public page → seeker applies → employer shortlists) — **this has not been performed yet**
- [ ] Confirm e-mail confirmation is ON and a real SMTP provider works
- [ ] `resumes` bucket private; try opening a resume URL while signed out (must fail)
- [ ] Security Advisor clean; RLS enabled on all tables
- [ ] Admin provisioned; test credentials removed; no secrets in the repo or client bundle (`grep -r SERVICE_ROLE .next/static` returns nothing)
- [ ] Legal pages + Urdu copy reviewed; contact e-mail set
- [ ] Sitemap submitted; Lighthouse/mobile pass on real devices
- [ ] Error monitoring (Vercel logs / Sentry) and Supabase backups (Pro plan: daily backups + PITR; otherwise schedule `pg_dump`)

## Backups and logging
Supabase Pro includes daily backups (and optional PITR); on the free plan export regularly (`supabase db dump`). Application errors surface in Vercel runtime logs; the error boundary shows a digest reference. `audit_logs` records admin/workflow actions.

## Known gaps to decide before launch
No Content-Security-Policy header yet (AdSense and Next inline scripts need a tuned policy); rate limiting fails **open** if the limiter itself is unreachable; no Sentry integration; see `context.md` → Known issues.
