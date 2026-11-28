# pakistan-jobs-blog

<!-- ARCHEUS:MEMORY:START -->
## Project memory (archeus — auto-maintained)
<!-- Written by archeus from this project's semantic memory graph. Do not edit here — the next pass replaces it. Rebuild: the project's Memory tab -> Build with Claude -->

- **nextjs-app** — API module providing authentication, job management, messaging, and admin user controls with role-based access enforcement; A Next.js job board…
  modules: app, (root), app/api, components, lib
- **pakistan-jobs-blog** — A Next.js job board application providing authentication, job management, messaging, and admin controls with role-based access enforcement
  modules: (root)
- lessons: 6 learned
  · Migrated to Next.js App Router + Upstash Redis serverless — Static HTML site became Next.js App Router; uses Upstash Redis for production data…
  · Admin account created from environment variables — First admin created from ADMIN_EMAIL and ADMIN_PASSWORD env vars instead of hard-coded…
  · Auth: bcrypt hashing + JWT httpOnly cookies — Passwords bcrypt-hashed, sessions stored as signed JWT in httpOnly cookie for security
Detail on demand: run `archeus recall "<topic>"` (Bash) for the task-relevant subgraph of this project's memory.
<!-- ARCHEUS:MEMORY:END -->
