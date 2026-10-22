# Autowebly SEO audit and implementation — 22 October 2026

Site: https://autowebly.vercel.app/ (Vercel project `autowebly`, static HTML, no build step).
Nothing has been deployed: every change below is in this folder, waiting for your approval.

## 1. What the site is

Autowebly offers business automation, website development and SEO to small businesses in India
and clients worldwide. The live site has four URLs: `/` (home, with a quote form that writes to the
Supabase table `autowebly_leads`), `/blog/` (empty so far), `/privacy.html`, and a 404 page.

The site's source was not in Git. The only copy was the CLI upload behind the production
deployment. It is now restored in `autowebly/`, byte-for-byte: every file matches the deployment's
SHA-1 file id (commit "Import the live Autowebly static site as deployed").

## 2. Baseline audit (before changes)

Rendering is fine. Every page is plain server-delivered HTML, so search engines see all content
without running JavaScript.

**Already right:** unique titles and descriptions of good length; `lang`, charset and viewport set;
correct self-referencing canonicals; `robots.txt` allows everything and names the sitemap; valid
sitemap; missing pages return a real 404 with `noindex`; the alternate hostname
(`autowebly-vedjhariya009-3873.vercel.app`) already gets `X-Robots-Tag: noindex` from Vercel, so
there is no duplicate-host problem; semantic headings; Lighthouse SEO score 100.

| Priority | Issue |
| --- | --- |
| Critical | None found |
| High | Source code existed only as a deployment upload, with no version control |
| High | No social share image anywhere (`og:image` missing); blog and privacy pages had no Open Graph tags at all |
| High | Structured data used `ProfessionalService`, a LocalBusiness subtype, which Google expects to have a street address; the site has none |
| High | The B2B sales pipeline service you sell had no page, so it could not rank for anything |
| Medium | Mobile first paint 3.0 s (lab): Google Fonts CSS was render-blocking (~850 ms estimated) and the two scripts weren't deferred |
| Medium | WCAG AA contrast failures: service tags 2.84:1 and the "running" label 4.34:1 (4.5:1 needed); the form's success and error messages also failed |
| Medium | Loading Google Fonts sends every visitor's IP address to Google, and the privacy policy doesn't say so |
| Medium | `/blog/` is indexed but empty, and says "New articles are added every week" — **not changed, needs your decision** (section 6) |
| Low | Blog and privacy pages had no skip link, brand mark, theme colour, or link to the services |
| Low | No raster logo or Apple touch icon |
| Low | `.node.run:nth-of-type` animation delays target the connector lines, so the hero nodes pulse in sync (cosmetic, left as is) |

## 3. Keyword research (verified data)

Source: OpenSEO (DataForSEO), Google India, English, retrieved 22 Oct 2026. Volume is average
monthly searches; KD is keyword difficulty 0–100; "–" means no estimate. 17 credits used.
Semrush could not be used: the account has no API units left (see https://www.semrush.com/mcp-access).

| Keyword | Volume | KD | Used for |
| --- | ---: | ---: | --- |
| seo services india | 2,900 | 28 | Future SEO service page |
| website development company in india | 1,900 | 44 | Future website service page |
| seo services for small business | 1,600 | 64 | Home (existing positioning) |
| ai sdr | 720 | 19 | Informational; article idea |
| ai lead generation | 480 | 40 | B2B page |
| b2b lead generation agency | 320 | 17 | B2B page (primary) |
| b2b lead generation services | 260 | 26 | B2B page (primary) |
| whatsapp automation for business | 260 | 15 | Article or automation page |
| business automation services | 170 | – | Home |
| sales pipeline management | 170 | 45 | B2B page (secondary) |
| b2b lead generation company in india | 110 | 14 | B2B page |
| ai sales automation | 90 | – | B2B page (secondary) |
| b2b sales pipeline | 20 | – | Too small to target alone |

**Conclusion:** buyers search for "B2B lead generation", not "B2B sales pipeline". The new page keeps
your flyer's headline but uses `/b2b-lead-generation/` for the URL, title and description.
Rankings depend on far more than the page itself. A new site on a `vercel.app` subdomain has no
authority yet, so expect months, not weeks, even for low-KD terms.

## 4. Changes made

**New page: `/b2b-lead-generation/`**, built from your flyer in the site's existing design. It has
the hero, six capabilities, all three plans with their prices, setup fees and features, the
assurance strip, a four-question FAQ, and a consultation form. Each plan's "Get started" button
preselects that plan in the form. Leads arrive in `autowebly_leads` with
`services = ["sales-pipeline", "plan-…"]` and `page = "/b2b-lead-generation/"`.

The page also has a unique title and description, a canonical, Open Graph and Twitter tags, its own
share image, and `Service` + `OfferCatalog` structured data. The structured data lists the real
prices as monthly subscription and setup-fee price specifications.

I changed three flyer claims so they don't promise outcomes the site can't back up, in line with
its "We don't promise rankings" stance. **Restore the originals if you have evidence for them:**

| Flyer | On the page | Why |
| --- | --- | --- |
| Secure & Compliant Data Handling | Secure data handling | "Compliant" needs a named standard (e.g. DPDP Act) you can stand behind |
| Higher Conversion Rates | Built to improve conversion | No results to cite yet |
| More leads · Better quality · Real opportunities | Omitted | Outcome promise |

**Home page:** a fourth service card linking to the new page. "Three services…" became "Services
that work better together", since there are now four. Also added: a nav and footer link, a
"B2B lead generation" option in the quote form, and a link from the cost FAQ to the published plans.

**Across all pages:**
- Social share images (`og/home.png`, `og/b2b-lead-generation.png`, 1200×630) plus `og:site_name`,
  image size and alt text, and `twitter:card` on every indexable page.
- Structured data on home is now `Organization` + `WebSite`. It keeps your founder, email, area
  served and services, adds `logo.png` (512×512), and links to the new service.
- Fonts are self-hosted. They are the same Archivo, Instrument Sans and JetBrains Mono files from
  Google, latin + latin-ext subsets, SIL Open Font License. This removes two third-party
  connections from the critical path and stops sending visitor IPs to Google. The two most-used
  files are preloaded, and `vercel.json` caches `/fonts/*` for a year.
- `defer` on `config.js` and `form.js`.
- Contrast: new `--signal-text` / `--ok-text` tokens for small text in light mode. Dark mode is
  unchanged.
- Blog and privacy pages got a skip link, the brand mark, a theme colour, the new nav link, and
  `aria-current` on the active nav item. Between 761 and 900 px, "Our SEO promise" is hidden so the
  header stays on one line.
- `sitemap.xml` now includes the new page.

**Files:** `index.html`, `b2b-lead-generation/index.html` (new), `blog/index.html`, `privacy.html`,
`404.html`, `styles.css`, `form.js`, `sitemap.xml`, `vercel.json` (new), `.vercelignore` (new),
`fonts/` (new), `og/` (new), `logo.png` (new), `_dev/` (new: share image template and renderer),
`README.md` and this report (neither is deployed).

## 5. Verification

Unless stated otherwise, measured on a local server that mimics Vercel's static serving. These are
Lighthouse 12.8 lab runs with simulated throttling, not field data. The PageSpeed Insights API
returned "quota exceeded" because it needs an API key. A new, low-traffic site has no Chrome UX
Report data, so **no Core Web Vitals pass can be claimed**.

| Page | Before (mobile / desktop) | After (mobile / desktop) |
| --- | --- | --- |
| Home performance | 86 / 100 | 96 / 100 |
| Home accessibility | 96 / 96 | 100 / 100 |
| Home best practices / SEO | 100 / 100 | 100 / 100 |
| Home mobile FCP · LCP · CLS | 3.0 s · 3.0 s · 0 | 1.5 s · 2.3 s · 0 |
| B2B page (new) | – | 95 / 100 performance; 100 a11y, best practices, SEO |
| Blog, privacy | – | 99 / 100 performance; 100 a11y, best practices, SEO |

- **axe-core (WCAG 2.1 A/AA + best practice):** 0 violations on 5 pages × desktop/mobile ×
  light/dark. The baseline had 4 failures on home.
- **Layout:** no horizontal scroll at 390 px, and a single-line header at every width from 320 to
  1600 px on every page.
- **Links:** 65 link and asset checks, all 200, every `#fragment` exists. Sitemap URLs are 200
  and self-canonical, there's no robots meta on indexable pages, and missing pages return 404.
- **Structured data:** 27 typed nodes. Every type, property and enumeration value is valid against
  the schema.org v30.0 vocabulary. Google's Rich Results Test was not reachable from the build
  environment; run it after deploying (section 7).
- **Form:** tested on both pages with the Supabase request intercepted, so no test row was written.
  Payloads match the table and its constraints (`services` holds at most 6 items).
- **ESLint** with the repository's config: 0 errors. One warning (unused `err` in `form.js`) was
  already in the live code.
- **Not checked:** the live deployment (nothing deployed), real-device testing, Google's own tools.

## 6. Needs your input

1. **Approve deployment** (section 8).
2. **Information buyers need before contacting you:** do prices include GST? Is there a minimum
   term or notice period? Which CRMs do you support? What are the "defined service levels"? Is
   there USD pricing for international clients? Once answered, these belong in the B2B FAQ.
3. **Blog:** either publish the first articles, or mark `/blog/` `noindex` and take it out of the
   sitemap until there are posts. Also reword "New articles are added every week" if that isn't
   true yet.
4. **Proof:** case studies, client logos or results you have permission to publish. They are the
   strongest trust and ranking signal you can add.
5. **Profiles for structured data:** LinkedIn company page, WhatsApp number, and a business address
   if you want local SEO / Google Business Profile.

## 7. Google Search Console setup

1. Open https://search.google.com/search-console → **Add property** → **URL prefix** →
   `https://autowebly.vercel.app/`. A Domain property isn't possible, because you don't control
   `vercel.app`'s DNS.
2. Verify with **HTML tag**. Send me the `<meta name="google-site-verification" …>` tag, or paste it
   into the `<head>` of `index.html`, then deploy and click Verify. The **HTML file** method also
   works: put Google's `google….html` file in `autowebly/` and deploy.
3. **Sitemaps** → submit `https://autowebly.vercel.app/sitemap.xml`.
4. **URL Inspection** → inspect `https://autowebly.vercel.app/` and
   `https://autowebly.vercel.app/b2b-lead-generation/` → **Test live URL** → **Request indexing**.
5. Monitor **Pages** (which URLs are indexed and why others aren't) and **Performance → Search
   results** (clicks, impressions, CTR and average position; filter by page or query, compare
   28-day periods). Being live is not the same as being indexed. Check the report rather than
   assuming.
6. Optional: in Bing Webmaster Tools, import the property from Search Console (free).
7. Connect the Google account to OpenSEO (project → Integrations) so I can read Search Console data
   directly next time.
8. After deploying, run https://search.google.com/test/rich-results on both pages and share-preview
   a link in WhatsApp or LinkedIn to see the new images.

## 8. Deploying to Vercel

See `README.md`. In short, from `autowebly/`: `npx vercel link` (choose the existing `autowebly`
project), then `npx vercel` for a preview, check it, then `npx vercel --prod`. Or connect this
repository in Vercel with Root Directory `autowebly` and Framework Preset *Other*. The site needs no
paid plan, custom domain or DNS change. A custom domain is still worth considering later for
brand trust; if you add one, update the canonical, sitemap and Open Graph URLs to match.

## 9. Next 30 days

| Week | Work |
| --- | --- |
| 1 | Deploy; verify Search Console; submit the sitemap; request indexing for home and the B2B page; connect Search Console to OpenSEO; Rich Results Test on both pages |
| 2 | Answer section 6 item 2 and add it to the B2B FAQ; write the first two genuinely useful articles from real questions, e.g. how a B2B sales pipeline works end to end, and WhatsApp automation for small businesses (260 searches/month, KD 15) |
| 3 | Earn legitimate references: free agency listings (Clutch, GoodFirms), a LinkedIn company page linked from the site, "Website by Autowebly" credits on client sites with permission, a guest article for an Indian SME or startup publication. No bought links. |
| 4 | Review Search Console: are all four URLs indexed, which queries show impressions, and where is CTR low (rewrite those titles and descriptions)? If you can supply distinct content (process, price ranges, examples), plan dedicated SEO and website-development service pages ("seo services india" 2,900/month; "website development company in india" 1,900/month). |
