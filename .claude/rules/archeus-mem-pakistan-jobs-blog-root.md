---
description: "archeus memory: pakistan-jobs-blog/(root)"
paths:
  - "*"
---
# pakistan-jobs-blog/(root) — A Next.js job board application providing authentication, job management, messaging, and admin controls with role-based access enforcement.
- nextjs-app (module) — Core job board platform with authentication, job management, messaging, and admin controls using Next.js App Router and Upstash Redis.
- Authentication (service) — User authentication system using bcrypt-hashed passwords and JWT tokens in httpOnly cookies.
- Job Management (service) — Service for managing job postings and job board operations.
- Messaging (service) — Service for user-to-user communications on the job board.
- Admin Controls (service) — Administrative interface for managing users, jobs, and role-based access.
- Role-based Access Control (concept) — Authorization system enforcing permissions based on user roles.
- App Router (component) — Next.js App Router component handling application routing and API endpoints.
- Upstash Redis (service) — Serverless Redis database for production data storage.
- JWT (model) — Signed JSON Web Token stored in httpOnly cookies for secure session management.
- bcrypt (concept) — Password hashing algorithm for secure credential storage.
Relations: nextjs-app contains Authentication; nextjs-app contains Job Management; nextjs-app contains Messaging; nextjs-app contains Admin Controls; nextjs-app uses App Router; nextjs-app depends_on Upstash Redis; Authentication uses JWT; Authentication uses bcrypt; Admin Controls implements Role-based Access Control
