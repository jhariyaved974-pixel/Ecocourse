# WeberAct website: how it is hosted and edited

## Where things live

| Part | Where |
| --- | --- |
| Website and admin dashboard | Vercel project `weberact`, built from the branch `claude/interactive-website-templates-x9gt0s` |
| Live address | https://weberact.vercel.app (and https://weberact.co once the domain is added) |
| Admin dashboard | `/admin.html` on the live address |
| Database, sign-in, images | Supabase project `weberact` (`gdzwpwmpngogcbxqkxjy`) |
| Database setup script | `tools/supabase/weberact.sql` (safe to run again) |

## How a build works

Vercel runs, from the repository root:

    python3 tools/fetch_content.py && python3 tools/weberact_pages.py --domain weberact.co

1. `fetch_content.py` downloads the copy published from the dashboard (the `live` row of
   `site_content`). If the database cannot be reached, it keeps the committed `weberact/content.json`.
2. `weberact_pages.py` writes that content, the shared header and footer, canonical tags,
   `sitemap.xml` and `robots.txt` into the pages. The `weberact/` folder is what Vercel serves.

The project's "Ignored Build Step" builds only this branch, so pushes to the repository's other
projects never start a WeberAct build.

## Editing the website

Sign in at `/admin.html`, open **Website**, edit, **Save draft**, then **Publish**. With a deploy hook
saved under **Team and settings**, Publish rebuilds the site straight away (about a minute).
Without one, published changes appear at the next build (the next push to the branch).

Create the deploy hook in Vercel: project `weberact`, Settings, Git, Deploy Hooks, name it
"Dashboard publish", branch `claude/interactive-website-templates-x9gt0s`, then copy the URL into
the dashboard.

## Sign-in emails

In Supabase, Authentication, URL Configuration:

- Site URL: `https://weberact.co/admin.html` (or `https://weberact.vercel.app/admin.html` until the domain is live)
- Redirect URLs: add `https://weberact.vercel.app/admin.html` and `https://weberact.co/admin.html`

## Tests

    node tools/test_cms_parity.mjs     # the dashboard preview and the build render the same HTML
