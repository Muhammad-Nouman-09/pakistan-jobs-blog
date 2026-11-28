# Permissions

Authorization is enforced **in Postgres** (RLS + definer functions). The UI hides what a user cannot do, but nothing depends on the UI. An account is *active* only if its profile is not suspended **and** its e-mail is confirmed — every policy and function checks this (`current_profile_ok()`), so a suspended or unverified user with a still-valid JWT can do nothing protected.

## Matrix

| Action | Anonymous | Job seeker | Viewer | Recruiter | Owner | Admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Read approved jobs of verified companies, verified companies, published posts | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Create / edit own profile, resumes, save jobs | | ✔ | | | | |
| Apply internally (shareable resume) | | ✔ | | | | |
| See own applications / withdraw | | ✔ | | | | |
| Create a company (pending verification) | | | | | ✔ (employer accounts) | |
| Edit company info, logo, documents, invite/remove members, change roles, transfer ownership | | | | | ✔ | ✔ |
| Read company info, jobs, review history, reports | | | ✔ | ✔ | ✔ | ✔ |
| Create / edit job drafts, submit, withdraw, archive | | | | ✔ | ✔ | ✔ |
| Read & update applications, add notes, download resumes | | | | ✔ | ✔ | read-only |
| **Approve / reject / request changes / unpublish / feature jobs** | | | | | | ✔ |
| Verify / reject / suspend companies; create platform-managed companies; assign members | | | | | | ✔ |
| Suspend / reactivate users (not admins, not self) | | | | | | ✔ |
| Categories, blog, settings, AdSense, audit log, reports, contact inbox | | | | | | ✔ |
| Create an admin | **nobody** through the app — only `npm run admin:provision` (service role) | | | | | |

Recruiters can **not** change membership or transfer ownership; viewers can **not** edit anything; employers can **not** approve their own jobs; a company must be **verified** before a job can be submitted or approved; unapproved jobs are never publicly readable; candidates can only read their own resumes/applications; employers only applications to their own companies; admins cannot read resume tables directly (only the snapshot attached to an application, for moderation).

## Mechanisms

| Concern | Mechanism |
|---|---|
| Privilege escalation | `profiles` guard trigger + column-level grants; role whitelist in the sign-up trigger; `provision_admin` service-role only |
| Unauthorized publication | no client write policy on `job_published`/`job_reviews`; `jobs` guard trigger rejects status/featured changes by clients; `review_job` checks `is_admin()` |
| IDOR | every query runs under RLS with the caller's JWT; RPCs re-derive the company from the row (e.g. `application_notes` insert must match the application's real company); ids from forms are never authority |
| Cross-company access | `company_member_role()` / `can_*` helpers return `false` (not `NULL`) for non-members — a regression test covers the `NULL`-in-`if not` pitfall |
| Resume privacy | private bucket; owner folder policy; employers via `can_read_resume_object()` (non-withdrawn application to their company); signed URLs (60 s) minted with the user's client; withdrawal redacts the snapshot |
| Invitations | 256-bit token, only SHA-256 stored, expiry, single use, bound to the invited confirmed e-mail, uniform error |
| Abuse | Postgres-backed rate limits (login, register, reset, contact, apply, upload, invite, click), honeypot on contact, upload validation |
| Audit | `audit_logs` written by definer functions for job/company/membership/user actions; readable by admins only, never writable by clients |

## Tests

`tests/db/*.test.ts` exercise every row above as the corresponding role against the real migrations. Run `npm run test:db`.
