# SEO operations: automation architecture (n8n)

Design rules:
- Free tools first; Google Sheets is the reporting database.
- Workflows **read and report**. Nothing publishes content, changes pages or contacts anyone without
  a person approving it.
- No Claude API key is assumed. Analysis by Claude happens only through a supported integration (for
  example an n8n AI node with a key the owner adds later, or by pasting the weekly sheet into Claude).
- Credentials live in n8n's credential store, never in workflow files or this repository.

## Building blocks already in the repository

| Tool | What it does | Runs where |
| --- | --- | --- |
| `tools/seo_audit.py` | Crawls the site: status, titles, descriptions, canonical, H1, headings, alt text, JSON-LD, broken links, sitemap coverage, duplicate titles | Anywhere with Python 3 (n8n "Execute Command" on self-hosted n8n, GitHub Actions, a laptop) |
| `tools/validate_schema.py` | Validates all JSON-LD (references, required properties, URLs, FAQ text visible) | Same |
| `seo/n8n/weekly-technical-audit.json` | Importable n8n workflow: sitemap → each page → checks → Google Sheet | n8n (cloud or self-hosted) |
| `seo/n8n/weekly-pagespeed.json` | Importable n8n workflow: PageSpeed Insights API (field + lab Core Web Vitals) → Google Sheet | n8n |

Both workflow files were checked: valid JSON, all code nodes parse, all connections resolve, and the
audit logic was run against the built pages (same results as `tools/seo_audit.py`).

## The ten workflows

| # | Workflow | Trigger | Source | Output (Google Sheets tab) | Needs | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Weekly technical audit | Monday 05:00 | Site HTML via sitemap | "Technical audit" | Google Sheets credential | **Template ready** (`weekly-technical-audit.json`) |
| 2 | Search Console performance | Monday 07:00 | Search Console API (searchAnalytics.query: query, page, country, device) | "GSC weekly" | Google OAuth credential with Search Console access; verified property | Design below |
| 3 | Keyword tracking | Weekly | Search Console queries filtered to the keyword map; optionally OpenSEO rank tracker (paid credits) | "Keywords" | As 2 | Design below |
| 4 | PageSpeed monitoring | Monday 06:00 | PageSpeed Insights API (free, API key) | "PageSpeed" | `PSI_API_KEY` environment variable (free Google Cloud key), Sheets credential | **Template ready** (`weekly-pagespeed.json`) |
| 5 | Broken-link detection | Weekly | Workflow 1 output + external links on each page (HEAD requests) | "Links" | — | Extend workflow 1 |
| 6 | Content recommendations | Monthly | Sheets data from 2–3 (pages with impressions but low CTR; queries ranking 8–20) | "Recommendations" (draft list for a person) | Optional AI node with the owner's own key | Design below |
| 7 | Indexing alerts | Daily | Search Console URL Inspection API for the 13 key URLs; sitemap status | Email or Slack to the owner | Google OAuth; email/Slack credential | Design below |
| 8 | Competitor monitoring | Monthly | Live results for 10 keywords per market (OpenSEO `get_serp_results`, ~5 credits per keyword) | "Competitors" | OpenSEO credits | Design below |
| 9 | Monthly SEO report | 1st of the month | Tabs 1–8 | A Google Doc or Sheet summary for the owner | Sheets/Docs credential | Design below |
| 10 | Website change monitoring | Daily | Hash of each page's title, description, H1, canonical and robots tag; compare with yesterday | "Changes" + alert on unexpected changes (for example a noindex) | — | Design below |

### Workflow 2 in detail (Search Console)

1. Schedule (weekly).
2. HTTP Request (Google OAuth2 credential, scope `webmasters.readonly`):
   `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query` with
   `{"startDate": "<7 days ago>", "endDate": "<yesterday>", "dimensions": ["query","page","country"], "rowLimit": 5000}`.
3. Code: flatten rows; tag each query with its cluster from keyword-url-map.md; flag queries whose
   page is not the mapped URL (possible cannibalisation).
4. Google Sheets append.

### Human approval gate (for anything beyond reporting)

```
Recommendation (sheet row) → owner marks "approved" in the sheet → separate workflow picks up
approved rows → creates a draft (never publishes) → owner reviews in the admin panel → Publish
```

Outreach, content publishing and page changes always stop at a draft for a person.

## Setting it up (owner)

1. Create one Google Sheet with the tabs named in the table.
2. In n8n: add a Google Sheets credential; for workflows 2, 3 and 7 a Google OAuth credential with
   Search Console access.
3. Get a free PageSpeed Insights API key (Google Cloud console) and set `PSI_API_KEY` in n8n.
4. Import the two JSON files, replace `PASTE_GOOGLE_SHEET_URL`, run each once manually, then activate.
5. After weberact.co is live and verified, build workflows 2, 3, 7 and 10 from the designs above.

Cost: n8n self-hosted is free (the cloud plan is paid); Google Sheets, Search Console and the PageSpeed
API are free within their quotas; OpenSEO and Semrush are paid and optional.
