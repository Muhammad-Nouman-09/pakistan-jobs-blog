---
description: "archeus memory: nextjs-app/lib"
paths:
  - "nextjs-app/lib/**"
---
# nextjs-app/lib — Library module providing database storage, authentication, job validation, and utility functions for a Pakistan jobs blog platform.
- Database (service) — Storage abstraction layer supporting Upstash Redis in production and local JSON file storage in development.
- AdSense (model) — Advertisement configuration with publisher ID and ad slot settings.
- JobValidator (service) — Validates and sanitizes job posting data, enforces field constraints and permission rules.
- Utilities (service) — Helper functions for date formatting, URL validation, CV text processing, and HTTP API calls.
Relations: JobValidator uses Utilities; Database contains AdSense
