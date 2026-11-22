# Pakistan Jobs Blog — Next.js (serverless)

Next.js App Router port of the static site in the parent folder. The old
localStorage logic is now serverless API routes (`app/api/**`), so jobs,
accounts and messages are shared across visitors.

## Run locally

```
npm install
cp .env.example .env.local   # set AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run dev
```

Without Redis credentials, dev data is stored in `.data/db.json`.

## Deploy (Vercel)

1. Import this folder as a project (root directory `nextjs-app`).
2. Add the **Upstash Redis** integration (Marketplace), which sets
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
3. Set `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. The admin account is
   created on first request if no admin exists. Change the password afterwards.

## API

| Route | Access |
|---|---|
| `GET /api/jobs` | public, published jobs |
| `GET /api/jobs?scope=manage` | admin (all) / verified employer (own) |
| `POST /api/jobs`, `PUT/DELETE /api/jobs/[id]` | admin, or verified employer for own jobs |
| `POST /api/auth/register`, `/login`, `/logout`, `GET /api/auth/me` | public / session |
| `PATCH /api/profile` | signed in |
| `GET /api/users`, `PATCH/DELETE /api/users/[id]` | admin |
| `POST /api/messages` | public; `GET`, `PATCH`, `DELETE` admin |
| `GET /api/settings`, `PUT /api/settings` | public read / admin write (AdSense) |

## What changed vs. the static version

- Passwords hashed with bcrypt; sessions are signed JWTs in an httpOnly cookie.
  The old hard-coded demo admin password is gone.
- All permission checks (employer owns job, only admin sets Featured, pending
  employers blocked, `javascript:` apply links rejected) now run on the server.
- Unpublished jobs are no longer visible through the public detail view.

## Known limits

- Data is stored as one JSON value per collection (jobs, users, messages), so
  two simultaneous writes can overwrite each other. Fine for a small blog;
  move to a real database (e.g. Supabase/Postgres) if traffic grows.
- No rate limiting on login/register/contact. Add one (e.g. `@upstash/ratelimit`)
  before going public.
- AdSense settings are saved and editable, but the page does not yet inject the
  AdSense script (the static version didn't either).
