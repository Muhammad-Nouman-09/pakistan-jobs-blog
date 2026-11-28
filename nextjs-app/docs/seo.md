# SEO and AdSense readiness

## Implemented

| Item | Where / how |
|---|---|
| Server-rendered content | Home, jobs, job detail, companies, blog, static pages are server components (verified: job text is in the HTML, not fetched client-side as in v1) |
| SEO-friendly job URLs | `/{locale}/jobs/sales-executive-lahore-123` — slug + trailing `ref_no`; a wrong slug 308-redirects to the canonical one |
| Unique metadata | `lib/seo/metadata.ts` `pageMetadata()` — title, description (≤160), canonical, Open Graph, Twitter; job titles include the company |
| Canonical + hreflang | every page lists `en`, `ur`, `x-default` **only for languages that exist** (a job/post with one language advertises one) |
| Structured data | `JobPosting` (only for open, approved jobs — `validThrough` = end of deadline day in PKT, salary, location or `TELECOMMUTE`, `directApply` only for on-site applications) · `Organization` (company pages, site) · `WebSite` + SearchAction · `BreadcrumbList` · `Article` |
| Sitemap | `app/sitemap.ts`: static pages, **open** jobs, verified companies, published posts, with per-language alternates; hourly revalidation |
| robots | `app/robots.ts`: blocks `/api/`, `/auth/`, dashboards, invitations, apply pages; dashboards/auth also send `X-Robots-Tag: noindex` + meta robots |
| Expired / removed jobs | removed from listings, facets and sitemap the moment the deadline passes (PKT); the page stays 200 with a "closed" notice, `noindex` and no JobPosting for 30 days, then 404. Archived/unpublished jobs 404 immediately. Cron marks them `expired`. |
| Breadcrumbs | visible (`Breadcrumbs`) + JSON-LD |
| Language | `<html lang dir>`, RTL layout, localized metadata |
| ads.txt | `/ads.txt` from admin settings; line-validated before saving and again before serving |
| Original content | Blog (Career Guides, Interview Preparation, Resume Writing, Salary Guides, Education Guides, Job Search Tips) with admin CMS; About / Contact / Privacy / Terms in both languages |
| Search Console | verify via DNS or the `google-site-verification` meta (add to `app/[locale]/layout.tsx` metadata `verification`) — no code change needed for sitemap submission |

## AdSense guardrails

Ads render only through `components/ads/AdSlot.tsx`, only when enabled with a valid `ca-pub-…` id and slot id, only on public content pages (home, job list, job detail, company, blog), labelled "Advertisement", with spacing from controls. They are **never** rendered on auth, dashboards, resume/application pages or the contact form. AdSense approval depends on Google's review of the live site (content quality, traffic, policy compliance); nothing here guarantees it.

## Before asking Google for review (owner checklist)

1. Publish **original** blog articles (the CMS is built; the content is yours to write or commission — do not publish copied or auto-generated text).
2. Have the Privacy Policy and Terms reviewed by a qualified professional and add your real contact e-mail in Admin → Settings → General.
3. Have the Urdu strings and pages reviewed by a native speaker.
4. Set `NEXT_PUBLIC_SITE_URL`, submit `/sitemap.xml` in Search Console, make sure there are enough genuine, approved listings.
5. Add your publisher id, slot ids and `ads.txt` line in Admin → Settings → AdSense.
