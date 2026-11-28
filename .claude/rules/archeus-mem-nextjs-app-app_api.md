---
description: "archeus memory: nextjs-app/app/api"
paths:
  - "nextjs-app/**"
---
# nextjs-app/app/api — API module providing authentication, job management, messaging, and admin user controls with role-based access enforcement.
- DatabaseService (service) — Persistence layer providing get/save operations for users, jobs, messages, and AdSense settings.
- JobService (service) — Validates job data and enforces permission checks for job access and modification.
- Message (model) — Contact form submission containing name, email, subject, message text, and read status.
- Session (model) — JWT-based session token management for user authentication and authorization.
- AdSenseSettings (model) — Ad network configuration with publisher id, enabled flag, and slot ids for page placements.
- Authentication (component) — POST login/register/logout and GET me endpoints for session management and user registration.
- JobManagement (component) — GET/POST jobs list, PUT/DELETE individual jobs with admin/employer permissions.
- MessageHandling (component) — POST public contact messages, GET all messages (admin only), PATCH read status, DELETE messages.
Relations: Authentication uses DatabaseService; JobManagement uses JobService; JobManagement uses DatabaseService; MessageHandling uses DatabaseService; ProfileManagement uses DatabaseService; UserAdministration uses DatabaseService; SettingsManagement uses DatabaseService; DatabaseService contains Message; DatabaseService contains AdSenseSettings; Session mentions Authentication
