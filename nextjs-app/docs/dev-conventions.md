# Development conventions (read before writing app code)

Stack: Next.js 15 App Router, React 19, TypeScript (strict), Supabase (Postgres + Auth + Storage + RLS), zod 4,
plain CSS in `app/globals.css` (NO Tailwind, NO UI library). Node 24. Tests: vitest 3.

## Golden rules
1. **Preserve the design.** Reuse existing classes only: `.container .section .page .form-card .panel .notice(.warn)
   .btn .btn-dark .btn-green .btn-outline .btn-small .btn-danger .btn-block .badge(.badge-red|gray|amber|blue)
   .admin-tabs .admin-row .job-card .card .card-grid .dash-grid .stat-card .table-wrap table.data .row-actions
   .inline-form .grid-2 .filters .pill .muted .error .success .timeline .meter`. If you truly need a new style, append a
   small block at the END of `app/globals.css` (use logical properties: `margin-inline-start`, `text-align:start`, never
   `left/right` — Urdu pages are RTL).
2. **Security is enforced in Postgres.** Every table has RLS; status transitions, memberships, applications go through
   SECURITY DEFINER functions in `supabase/migrations/*_workflow_functions.sql`. In the app use the **user-scoped client**
   (`session.supabase`), never the service-role client, for anything a user does. Never pass role / user id / company id
   from the form as authority — derive from the session; RLS and the DB functions re-check anyway.
3. **No mock data.** Read real data from Supabase. Handle "not configured" (`isConfigured()` false → `<SetupNotice/>`)
   and empty states.
4. **Everything user-visible is localized** (`en` + `ur`). No hard-coded English strings in JSX — use `t("key")`.
5. Do not edit files owned by another area. Do not touch `supabase/migrations/*` (tell the lead if the schema needs a change).

## Request flow
- Pages: `app/[locale]/<area>/.../page.tsx`. Props are async: `export default async function Page(props: PageProps)`;
  resolve with `const { locale, t, sp, params } = await pageCtx(props)` (`lib/page.ts`; 404s on a bad locale).
  Dynamic params: `PageProps<{ id: string }>`.
- Area layout (`app/[locale]/<area>/layout.tsx`): `await requireRole(locale, ["employer"])` (from `lib/auth/session.ts`;
  redirects signed-out / unverified / suspended / wrong-role users) and render `<DashTabs/>` (`components/ui/DashTabs.tsx`).
  Mark private pages `robots: noindex` via `noindexMetadata(title)` from `lib/seo/metadata.ts`.
- Mutations are **server actions** (`"use server"` files, e.g. `app/[locale]/<area>/actions.ts`) bound to plain
  `<form action={fn}>` (no client JS needed). Pattern:
  ```ts
  "use server";
  export async function saveThingAction(fd: FormData) {
    const o = formToObject(fd);                       // lib/forms.ts (supports education[0].degree style keys)
    const locale = isLocale(o.locale) ? o.locale : "en";
    const back = localePath(locale, "/candidate/thing");
    const { supabase, user } = await requireRole(locale, ["job_seeker"]);   // redirects; or assertRole([...]) throws
    if (!(await rateLimit("thing-save", { ...LIMITS.write, identifier: user.id }))) redirectWith(back, { error: "err.rate_limited" });
    const p = parseWith(thingSchema, o);              // zod messages are i18n keys ("v.required")
    if (!p.ok) redirectWith(back, { error: p.error });
    const { error } = await supabase.rpc("some_function", {...});   // or .from("table").insert(...)
    if (error) redirectWith(back, { error: errorKey(error) });       // lib/errors.ts maps DB codes → "err.*" keys
    revalidatePath(back);                              // from next/cache
    redirectWith(back, { msg: "common.saved" });       // shows a Flash notice
  }
  ```
  `redirect()`/`redirectWith()` throw — never call them inside try/catch. Render notices with `<Flash params={sp} t={t}/>`.
  Include `<input type="hidden" name="locale" value={locale}/>` in every form.
- After changing anything shown on public pages (job approved, company verified, blog published, settings) call
  `revalidateTag("public-data")` (from `next/cache`) so cached public pages refresh immediately.
- Destructive actions use `<ConfirmButton message={t("action.confirm")}>` (client component) inside the form.
- File uploads: `validateUpload(file, "pdf"|"logo"|"document")` from `lib/security/files.ts` (checks size, MIME, magic
  bytes, active PDF content) BEFORE `supabase.storage.from(bucket).upload(path, bytes, { contentType, upsert:false })`.
  Paths: `resumes/{user.id}/{randomUUID}.pdf`, `company-logos/{companyId}/{uuid}.{ext}`,
  `company-documents/{companyId}/{uuid}.{ext}`, `blog-images/{uuid}.{ext}`. Never use the client filename in the path.
  Private files are downloaded via `createSignedUrl(path, 60)` made with the USER-scoped client (storage RLS authorizes).
- Rate limit sensitive mutations: `rateLimit(action, {...LIMITS.x, identifier})` from `lib/security/rate-limit.ts`.

## i18n
- Your area owns exactly one module file: `lib/i18n/messages/<area>.ts` exporting `{ en: {...}, ur: {...} }` (flat
  `"area.key": "text"`; `{name}` placeholders). It is already registered in `lib/i18n/messages/index.ts`.
  Shared keys already exist in `common.ts` (nav, actions, enum labels like `jobStatus.*`, `appStatus.*`, `jobType.*`,
  `workplace.*`, `companyStatus.*`, `member.*`, `role.*`, `period.*`) and `errors.ts` (`v.*`, `err.*`) — reuse them.
- Provide **every** key in BOTH `en` and `ur` (Urdu: natural, polite, correct RTL text). `tests/unit/i18n.test.ts` fails if a
  `t("...")` key used in source is missing in English, or if Urdu lacks a key that English has.
- Dates/numbers: `formatDate(v, locale)`, `formatDateTime`, `formatNumber`, `formatSalary` from `lib/utils.ts`.
  Wrap emails/URLs/phone numbers inside Urdu text in `<span className="ltr">`.
- Links: always `localePath(locale, "/employer/jobs")` from `lib/i18n/config.ts`.

## Data access
- User client: `const { supabase } = await requireRole(...)`. Typed row shapes live in `lib/types.ts` (add yours there only
  if shared; otherwise keep local interfaces in your service file). Put queries in `lib/services/<area>.ts`, not in pages.
- PostgREST embeds work on real FKs (e.g. `.select("*, job_translations(*)")`). `count: "exact"` + `.range(from,to)` for
  pagination (page size 20; `pageParam()` and `<Pagination/>` exist).
- DB workflow functions (call with `supabase.rpc(name, args)`): `submit_job_for_review(p_job)`, `withdraw_job`,
  `archive_job`, `restore_job`, `review_job(p_job,p_action,p_reason)` (admin), `set_job_featured`, `create_company(...)`,
  `admin_create_company(...)`, `admin_set_company_verification(p_company,p_status,p_note)`, `resubmit_company_verification`,
  `create_company_invitation(p_company,p_email,p_role,p_token_hash,p_ttl_hours)`, `revoke_company_invitation`,
  `accept_company_invitation(p_token_hash)`, `set_member_role`, `remove_member`, `transfer_company_ownership`,
  `admin_add_member`, `apply_to_job(p_job,p_resume,p_cover,p_answers jsonb)`, `set_application_status(p_app,p_status)`,
  `withdraw_application`, `record_external_click`, `set_user_status(p_user,p_status)`, `admin_stats()`,
  `company_report(p_company)`, `save_job(p_id,p_company,p_fields,p_translations)`. Their error codes map via `lib/errors.ts`.
  Read the SQL before relying on a function — it documents who may call it and what it checks.

## Definition of done for your area
- `npx tsc --noEmit` has no errors **in your files** (other areas may be mid-work — ignore their errors).
- `npx next lint --dir app --dir components --dir lib` clean for your files.
- Keyboard accessible, labelled inputs (`<label htmlFor>`), responsive (the existing 860px breakpoint), works RTL.
- Report: files created, routes, anything you could not finish, any schema change you need.
