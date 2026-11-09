# Implementation report

Date: 9 November 2026. Branch: `claude/interactive-website-templates-x9gt0s`. Live: https://weberact.vercel.app
(website) and https://weberact-admin.vercel.app (admin panel).

## 1. What was implemented

**Technical**
- Structured data on all 13 pages, built from content.json (`tools/seo_schema.py`): Organization,
  WebSite, WebPage/AboutPage/ContactPage, BreadcrumbList, Service (4), FAQPage where FAQs are visible.
  Placeholders are never published as data.
- Open Graph and Twitter tags on every page; branded 1200x630 share image and 512x512 PNG logo
  (`tools/make_brand_images.mjs`).
- Headline text fixed for crawlers and screen readers (spaces between headline lines).
- Proposal page layout shift removed (CLS 0.158 → 0).
- Third-party CDN script removed (smooth scrolling library hosted on the site, hash-verified).
- Branded 404 page (HTTP 404, noindex).
- Referrer policy; sitemap now lists 13 URLs; footer and home cards link to the service pages.
- Ready-to-use hooks, switched on from the admin panel: Google Search Console and Bing verification,
  Google Analytics 4 (loads only after consent), WhatsApp/email/booking links, conversion events
  (`generate_lead`, `whatsapp_click`, `email_click`, `booking_click`, `phone_click`, `cta_click`).

**Content (editable in the admin panel → Service pages)**
- /website-development.html, /technical-seo.html, /ai-automation.html, /b2b-lead-generation.html,
  /international.html: direct answer, who it is for, what is included, process, cost factors, FAQs,
  official sources, related services.
- New, keyword-mapped titles and descriptions for all 13 pages.
- "B2B lead generation" added to the proposal form and the enquiry dashboard.

**Tools**
- `tools/seo_audit.py` (crawler), `tools/validate_schema.py` (JSON-LD checks),
  `tools/test_cms_parity.mjs` extended to the new pages, two n8n workflow templates.

**Documentation** (this folder): technical-audit, keyword-research (+ CSV), keyword-url-map,
international-seo, aeo-strategy, geo-strategy, schema-documentation, content-strategy-90-days,
competitor-analysis, backlink-strategy, conversion-optimization, automation-architecture, this report.

## 2. What was technically validated

| Check | Result |
| --- | --- |
| Site crawl (local build and live) | 13 pages, 0 broken internal links; the local build has 0 issues |
| JSON-LD (`tools/validate_schema.py`) | 13 pages, no problems |
| Schema.org validator | 13 pages, 0 errors, 0 warnings |
| Preview vs build renderers (`tools/test_cms_parity.mjs`) | 29 of 29 identical, including hostile input (tags escaped, `javascript:` links dropped) |
| Build is repeatable | Running the build twice changes nothing |
| Lighthouse mobile (live) | 100/100/100/100 on home, services, proposal, website development, B2B lead generation; CLS 0 everywhere; LCP 1.2–1.5 s (lab) |
| Browser checks (desktop 1366 px, phone 390 px) | No console errors, no failed requests, no horizontal overflow on 9 pages |
| Analytics consent | No analytics before consent; loads after Accept; nothing after Decline; choice remembered; WhatsApp click event recorded |
| Admin panel | New service-page editors with live preview; new settings fields; SEO editor covers 13 pages |
| Your published edits | Diffed against the previous defaults: 5 edits found and kept |
| Citations | Google pages resolve; FTC, ICO, Government of Canada and ACMA URLs confirmed by search (their sites block automated checks); one unverifiable Google quote removed |

## 3. What remains incomplete

| Item | Why | Who |
| --- | --- | --- |
| weberact.co is not registered; canonicals, sitemap and structured data point to it | Purchase needs approval ($29.99 first year, $24.80 renewal via Vercel) | Owner |
| New titles for the 8 original pages are live only after Publish | A version published before this work overrides them; the merged draft is waiting in the admin panel | Owner: Website → Publish |
| Publish does not rebuild the live site automatically | Vercel's production branch is another project's branch; deploy hook not created | Owner: Vercel → weberact → Settings → Environments → Production branch = `claude/interactive-website-templates-x9gt0s`; then create a deploy hook and paste it in admin → Settings |
| Real email, WhatsApp, founders, testimonials, case studies, legal details | Not provided; placeholders are excluded from structured data | Owner |
| Keyword volumes for UK, UAE, Canada, Australia | OpenSEO credits ran out (7 left); Semrush has no API units | Owner: top up credits; then one call per market |
| Backlink and authority metrics for competitors | Same as above | — |
| Security headers (CSP, X-Content-Type-Options) and a /index.html → / redirect | Need a vercel.json for the website project; the repository root's vercel.json belongs to another app | Next step if the WeberAct site moves to its own repository or root directory |
| Google Rich Results Test | No public API; run by hand once the domain is live | Owner or next session |
| Person and Article schema | No real authors or articles yet | After founders' details and guides exist |
| n8n workflows 2, 3, 5–10 | Need Search Console access and credentials | After domain verification |

## 4. External integrations that need credentials

| Integration | Credential | Where it goes |
| --- | --- | --- |
| Google Search Console | Verification code (HTML tag method) | Admin → Header, footer and contact → Search engines and analytics |
| Bing Webmaster Tools | Verification code (meta tag method) | Same place |
| Google Analytics 4 | Measurement ID (G-…) | Same place |
| Booking (Cal.com or Calendly) | Public booking link | Admin → Contact details |
| PageSpeed Insights API | Free API key | n8n environment variable `PSI_API_KEY` |
| Google Sheets / Search Console API | OAuth credential | n8n credential store |
| OpenSEO / Semrush | Credits / API units | Their dashboards |
| Vercel deploy hook | Hook URL | Admin → Settings → Publishing |

## 5. What Google and Bing need to index the site

1. **Register weberact.co** and add it (and www.weberact.co redirecting to it) to the Vercel project
   `weberact`. Until then, every canonical points to a domain that does not exist.
2. **Set the production branch** in Vercel so the domain serves this branch.
3. **Publish** the merged draft in the admin panel.
4. **Verify** the domain in Google Search Console (Domain property via DNS is best; or paste the HTML
   tag code in the admin panel) and in Bing Webmaster Tools (it can import from Search Console).
5. **Submit** https://weberact.co/sitemap.xml in both.
6. **Request indexing** for the home page and the four service pages (URL Inspection in Search Console).
7. Keep weberact.vercel.app from competing: once the domain is live, its pages already declare
   weberact.co as canonical; optionally add a redirect from the vercel.app domain in Vercel's domain
   settings.

## 6. The next 90 days (priorities)

| Days | Priority |
| --- | --- |
| 1–7 | Register the domain, set the production branch and deploy hook, publish the draft, verify Search Console and Bing, submit the sitemap, fill email, WhatsApp, founders and legal details, create the LinkedIn company page |
| 8–30 | Website cost guide and manufacturing website design guide; first real case study; Clutch/GoodFirms/DesignRush listings; import the two n8n workflows |
| 31–60 | SEO for manufacturers and B2B lead generation guides; cold-email-rules-by-country guide (legal review); audit checklist; measure UK/UAE/Canada/Australia keywords; first Search Console review (queries ranking 8–20, low-CTR pages) |
| 61–90 | Automation guides (lead qualification, CRM); original study for digital PR; expert-commentary outreach (owner-approved); quarterly answer-engine check; refresh service pages with real proof |

Full plan: content-strategy-90-days.md and backlink-strategy.md.
