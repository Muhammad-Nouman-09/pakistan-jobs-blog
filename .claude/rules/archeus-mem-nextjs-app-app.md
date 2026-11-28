---
description: "archeus memory: nextjs-app/app"
paths:
  - "nextjs-app/**"
---
# nextjs-app/app — A Next.js job board application for Pakistan that enables job seekers to search and apply for verified government and private sector jobs, employers to post jobs, and admins to manage listings and users.
- Job (model) — Job listing data model with title, organization, sector, province, vacancies, salary, education, deadline, and official apply link.
- User (model) — System actor with id, email, password hash, role (admin/employer/seeker), and status (active/suspended/pending).
- Home (component) — Landing page displaying hero section, search bar, featured jobs, category browse, and job statistics.
- FindJobs (component) — Job search and filter page with filtering by sector, province, category, keyword search, and individual job detail view.
- JobCard (component) — Displays an individual job listing with organization, location, deadline, and apply button.
Relations: Home uses JobCard; Home calls useJobs; FindJobs uses JobCard; FindJobs contains Detail; FindJobs calls useJobs; Profile depends_on AuthProvider; Profile calls api; AuthPage depends_on AuthProvider; AuthPage calls api; JobsTab calls api; JobsTab depends_on Job; Contact calls api; RootLayout contains AuthProvider; RootLayout contains Header; useJobs depends_on Job; Header uses User; JobCard uses Job; Job depends_on User; User contains Profile; Profile mentions Contact; AuthProvider mentions User
