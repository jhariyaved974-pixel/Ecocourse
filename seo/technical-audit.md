# WeberAct technical SEO audit

Audit date: 9 November 2026. Site audited: https://weberact.vercel.app (the live build; the canonical
domain weberact.co is not registered yet). Tools used: `tools/seo_audit.py` (crawler written for this
site, standard library only), Lighthouse 12.6.0 (mobile, simulated throttling), `tools/validate_schema.py`,
the Schema.org validator (validator.schema.org), Playwright (rendering, layout and console checks) and
direct HTTP checks with curl.

Not used, because no account or credential is connected: Google Search Console, Google Analytics 4,
Bing Webmaster Tools, Google PageSpeed Insights field data (CrUX) and Google's Rich Results Test. The
site has no real-user traffic yet, so field Core Web Vitals do not exist; all speed figures below are
lab measurements.

## Summary

| | Before (baseline) | After |
| --- | --- | --- |
| Indexable pages | 8 | 13 (5 new) |
| Broken internal links | 0 | 0 |
| Pages with structured data | 0 of 8 | 13 of 13, valid in the Schema.org validator (0 errors, 0 warnings) |
| Pages with Open Graph and Twitter tags | 1 of 8 (no image) | 13 of 13, with a 1200x630 share image |
| Titles within 30–65 characters | 1 of 8 | 13 of 13 in the build (7 wait for the draft to be published, see below) |
| Lighthouse mobile, home | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Lighthouse mobile, proposal page | Performance 93, CLS 0.158 | Performance 100, CLS 0 |
| Third-party scripts on every page | 1 (cdn.jsdelivr.net) | 0 (Google Analytics only after consent, when switched on) |
| 404 page | Vercel default, plain text | Branded page, HTTP 404, noindex |

Lighthouse scores are Performance / Accessibility / Best practices / SEO. Raw reports: `seo/data/`.

## Issues found and their status

| # | Issue | Severity | Affected URL | SEO impact | Recommended solution | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Canonical URLs, sitemap and Open Graph URLs point to https://weberact.co/, which does not resolve (domain not registered) | Critical | All pages | Google is told the real address is a domain that does not exist; it may ignore the canonical, index the vercel.app address, or index nothing | Register weberact.co, add it to the Vercel project `weberact`, then submit the sitemap in Search Console and Bing | **Open, needs the owner** (domain purchase, about $29.99 first year) |
| 2 | Headlines split into lines without spaces: crawlers, answer engines and screen readers read "The website yourbusinessdeserves to berepresented by." | High | /, /services.html, /work.html, /method.html, /about.html, /proposal.html | The most prominent text on each page (the H1) was garbled for every machine reader | Put a space between the line elements (they are block elements, so nothing changes visually) | **Fixed** in tools/cms.py and the admin preview renderer |
| 3 | No structured data on any page | High | All pages | Search and AI answer engines had no explicit facts about the organisation, services, pages or breadcrumbs | JSON-LD graph per page built from content.json | **Fixed**: Organization, WebSite, WebPage/AboutPage/ContactPage, BreadcrumbList, Service, FAQPage (see schema-documentation.md) |
| 4 | Only four broad service anchors on one page; no page for B2B lead generation; no dedicated page per service | High | /services.html | Each service competes for its searches with a section of a shared page; no page could rank for "technical seo services", "b2b lead generation" and similar | Dedicated pages with a direct answer, process, cost factors, FAQs and sources | **Fixed**: 4 service pages + 1 international page |
| 5 | Layout shift on the proposal page while the form loads | High | /proposal.html | CLS 0.158 (above the 0.1 "good" threshold) | Reserve the height of the first form step before the script draws it | **Fixed**: CLS 0 |
| 6 | Seven titles of 15–29 characters ("Work — WeberAct") with no search terms | Medium | /work.html, /services.html, /method.html, /about.html, /proposal.html, /terms.html, /privacy.html | Weak relevance signals and click-through | Descriptive titles mapped to keywords (keyword-url-map.md) | **Fixed in the build and in the admin draft**; live after the owner presses Publish (see note A) |
| 7 | Open Graph and Twitter tags only on the home page, and no share image anywhere | Medium | All pages | Links shared on LinkedIn, WhatsApp, X and Slack showed no image and generic text | Tags on every page from the same SEO fields; branded 1200x630 image | **Fixed** |
| 8 | Third-party script (smooth scrolling library) loaded from cdn.jsdelivr.net on every page | Medium | All pages | Extra DNS and TLS connection; visitors' IP addresses sent to a third party (relevant under UK GDPR) | Host the identical file on the site (SHA-256 verified against npm and the CDN) | **Fixed** |
| 9 | Vercel's plain-text 404 | Medium | Any unknown URL | Dead end for visitors and crawlers that follow old links | Branded 404 with links to the main pages, noindex | **Fixed** (HTTP 404 status kept) |
| 10 | No Search Console, Bing or analytics hooks | Medium | All pages | No way to verify the site, see queries or measure enquiries | Admin fields for Google and Bing verification codes and a GA4 ID; analytics loads only after consent | **Fixed (ready)**, needs the owner's codes |
| 11 | Footer linked only to anchors on the services page | Low | All pages | Weak internal links to service content | Footer links to each service page and the international page; home cards link to service pages | **Fixed** |
| 12 | No PNG logo for search engines | Low | Organization data | Google's logo guidelines need a crawlable raster image | 512x512 PNG generated from the brand artwork | **Fixed** |
| 13 | /index.html serves the same page as / | Low | / and /index.html | Duplicate URL | Canonical points to / on both | **Mitigated by canonical**; a redirect needs a vercel.json rule in the website project (not added: the repository root's vercel.json belongs to another app) |
| 14 | No security headers beyond HSTS (no CSP, X-Content-Type-Options, Referrer-Policy header) | Low | All pages | Not a ranking factor; a trust and safety item | Referrer policy added as a meta tag. Full headers need a vercel.json for the website project | **Partly fixed**; see open items |
| 15 | Stylesheet is render-blocking (about 33 KB, 8 KB compressed) | Low | All pages | Lighthouse hint only; LCP is 1.2–1.5 s in lab tests | Inline critical CSS if the stylesheet grows | **Accepted** for now |
| 16 | Placeholder content: client names, testimonials, founders, project results, email and WhatsApp | Medium | /, /work.html, /about.html, legal pages | Thin and unverifiable content; placeholders are excluded from structured data by design | Replace with real, permissioned content in the admin panel | **Open, needs the owner** |
| 17 | Proposal form had no B2B lead generation option | Low | /proposal.html | Lead-generation enquiries could not say what they wanted | Option added; dashboard charts know it | **Fixed** |

Note A (published content wins). The website is built from the version published in the admin panel.
A version was published on 9 November 2026 at 19:08 UTC, before these changes, so its page titles
override the new ones. That published copy contained five edits by the owner (top line and badge "Built
to act.", two full stops in the services headline, an empty footer line). The new titles were merged
with those five edits into the **draft** (not the published copy): open the admin panel, check Website
→ Search and sharing, and press Publish. Nothing the owner wrote was overwritten.

## Checks that passed

- Every page returns HTTP 200 over HTTPS with HSTS; HTML, CSS and JS are served compressed (Brotli).
- One H1 per page; no heading-level jumps; `lang="en"` on every page.
- No images without alt text (the site uses CSS and inline SVG; content images added through the admin
  get alt text from the project or person name).
- robots.txt allows everything and lists the sitemap; the sitemap lists all 13 indexable pages; every
  sitemap URL is reachable through internal links.
- No JavaScript is needed to read content: pages are pre-rendered at build time from content.json
  (the header, footer and all copy are in the HTML).
- Mobile: no horizontal overflow at 390 px on any page; tap targets and text sizes pass Lighthouse.
- Lighthouse accessibility and best practices: 100 on every page tested.

## How to repeat this audit

    python3 tools/seo_audit.py https://weberact.co --json audit.json
    python3 tools/validate_schema.py weberact --domain weberact.co
    npx lighthouse https://weberact.co/ --only-categories=performance,accessibility,best-practices,seo
