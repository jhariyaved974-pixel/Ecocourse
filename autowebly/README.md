# Autowebly website

Static site served at https://autowebly.vercel.app/ (Vercel project `autowebly`). Plain HTML, one
stylesheet, two small scripts. There is no build step: what is in this folder is what gets deployed.

| Path | What it is |
| --- | --- |
| `index.html` | Home: services, process, SEO promise, FAQ, quote form |
| `b2b-lead-generation/index.html` | AI-powered B2B sales pipeline service: what's included, plans and pricing, FAQ, consultation form |
| `blog/index.html` | Blog index. Posts go between the `POSTS:START` / `POSTS:END` markers |
| `privacy.html`, `404.html` | Privacy policy; not-found page (`noindex`, served with status 404) |
| `styles.css` | All styles, including the self-hosted `@font-face` rules |
| `form.js`, `config.js` | Quote form: inserts into the Supabase table `autowebly_leads` with the publishable key (RLS allows anonymous insert only) |
| `fonts/` | Archivo, Instrument Sans and JetBrains Mono (latin + latin-ext), SIL Open Font License, see `fonts/OFL.txt` |
| `og/`, `logo.png` | Social share images (1200×630) and the 512×512 logo used in structured data |
| `robots.txt`, `sitemap.xml` | Crawl rules and the list of indexable URLs |
| `vercel.json` | Only adds a one-year cache header for `/fonts/*` |
| `_dev/` | Share image template and renderer (not deployed, see `.vercelignore`) |

## Deploy

Since 22 October 2026, deployments are built from this repository on GitHub. The settings are
**Root Directory** `autowebly`, **Framework Preset** *Other*, no build command and no output
directory. The project does not deploy automatically on push.

- **Deploy on every push:** connect this repository under Vercel → autowebly → Settings → Git,
  keeping Root Directory `autowebly`.
- **Deploy with the CLI:** first check Settings → Build and Deployment → Root Directory. If it is
  `autowebly`, run `npx vercel` (preview) and `npx vercel --prod` from the **repository root**. If
  it is empty, run them from **inside `autowebly/`**. Running from the wrong folder either fails or
  deploys the store in the repository root instead of this site.

After deploying, check: `/`, `/b2b-lead-generation/`, `/robots.txt`, `/sitemap.xml`, a missing page
returning 404, and the quote form on both pages (a test lead should appear in `autowebly_leads`).

## Keeping SEO in order

- **New page**: give it a unique `<title>` and meta description, a canonical URL on
  `https://autowebly.vercel.app/…`, Open Graph tags, one `<h1>`, a link to it from an existing page,
  and add it to `sitemap.xml` with today's date as `lastmod`.
- **Edited page**: update its `lastmod` in `sitemap.xml`.
- **Prices**: the B2B prices appear in the page body, the JSON-LD block in its `<head>`, the meta
  description, the plan select in its form, the home page card and FAQ, and `og/b2b-lead-generation.png`.
  Change them everywhere together.
- **Share images**: edit `_dev/og-image.html`, then from the repository root run
  `npm install && npx playwright install chromium && node autowebly/_dev/render-images.mjs`.
- **Form options**: values sent in `services` are free text; the table allows at most 6 per lead.
- **IndexNow** (tells Bing, Yandex and others about changed pages; Google doesn't use it): keep
  `3c3f1e55cf0e40dba5f00dbe925b7727.txt` at the site root. After publishing new or changed pages,
  submit their URLs through the OpenSEO project.
