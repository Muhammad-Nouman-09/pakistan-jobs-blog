---
description: "archeus memory: nextjs-app/(root)"
paths:
  - "nextjs-app/**"
---
# nextjs-app/(root) — A Next.js serverless application providing API routes for managing shared job listings, user authentication, accounts, and messaging.
- Next.js App Router (service) — Frontend framework using App Router for page routing and server-side rendering.
- API Routes (service) — Serverless backend endpoints handling business logic for jobs, auth, users, and messages.
- Jobs API (service) — Service for creating, reading, updating, and deleting job listings with scope-based access control.
- Auth Service (service) — Manages session creation/destruction, user authentication validation, and public user data extraction.
- User Service (service) — Service for managing user profiles, verification status, and admin user operations.
- Messaging Service (service) — Service for public message submission and admin message management.
- Settings Service (service) — Service for managing AdSense and other application configuration.
Relations: Next.js App Router contains API Routes; API Routes calls Jobs API; API Routes calls Auth Service; API Routes calls User Service; API Routes calls Messaging Service; API Routes calls Settings Service; API Routes uses Permission System; Auth Service implements Session Management; Jobs API depends_on Redis Database; User Service depends_on Redis Database; Messaging Service depends_on Redis Database; Settings Service depends_on Redis Database; Job Publishing implements Jobs API
