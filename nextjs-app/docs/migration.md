# Migrating the v1 data (Upstash Redis → Supabase)

`scripts/migrate-legacy.ts` (logic in `lib/legacy/transform.ts`, unit-tested) moves users, jobs, contact messages and AdSense settings from the old store. The old store is only **read**; nothing is deleted anywhere. Re-running skips records that already exist.

```bash
# DRY RUN (default): reads v1, writes only migration-report-<timestamp>.json
LEGACY_REDIS_URL=… LEGACY_REDIS_TOKEN=…  npm run migrate:legacy     # the old UPSTASH_REDIS_REST_URL / _TOKEN
# or, for a local dev database:   LEGACY_DB_FILE=.data/db.json npm run migrate:legacy

# Apply (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
npm run migrate:legacy -- --apply            # add --confirm-emails to pre-confirm migrated e-mails
```

## Mapping

| v1 | v2 |
|---|---|
| user `seeker` | `job_seeker` account (bcrypt hash imported as-is, so passwords keep working); profile fields → `profiles`, `candidate_profiles`, and one **private** resume "Imported from the previous site" holding the old free-text CV |
| user `employer` | `employer` account + a self-managed company (`companyName`, `companyAbout`, `website`, `phone`) with the user as **owner**; `active` → company **verified**, `pending` → **pending** |
| user `admin` | **not migrated** (manual review) — create administrators with `npm run admin:provision` |
| `suspended` | account `suspended` |
| job (published) | approved job + public copy (`external_url` = old official apply link, `source`, pay scale text → `salary_text`, `postedDate` → publication date); past-deadline jobs become `expired`; assigned to the employer's company, or to a **platform-managed verified company** named after `organization` |
| job (draft) / published but no valid deadline or apply link | `draft`, listed under *manual review* |
| category text | matched to `job_categories` by name, or created |
| contact messages | `contact_messages` (read flag kept) |
| AdSense | `site_settings.adsense` only if the publisher id/slot ids are well-formed (otherwise disabled + manual review) |

Migrated e-mails are **not** auto-confirmed (v1 never verified them): users confirm via "resend confirmation" or the password-reset flow, unless you pass `--confirm-emails`. Old numeric job ids are not preserved, so `/find-jobs?id=3` links land on the job list.

## Report

`migration-report-<timestamp>.json` (git-ignored — it contains personal data) lists: `created`, `skipped` (already present), `rejected` (with reasons: invalid e-mail, duplicate, missing bcrypt hash, unknown role, title too short …) and `manualReview`. Every legacy record is accounted for in exactly one list. A dry-run of the six real seed jobs in `data/legacy-seed-jobs.json` produced: 6 jobs → 6 platform-managed companies, 0 rejected, 0 manual review.

After verifying the result in Supabase, the Redis integration and the `UPSTASH_*` variables can be removed from Vercel. The old code is kept in `legacy/v1/` for reference.
