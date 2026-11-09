# WeberAct website: how it is hosted and edited

## Where things live

| Part | Where |
| --- | --- |
| Website | Vercel project `weberact`, served from `weberact/`. Address: https://weberact.vercel.app (https://weberact.co once the domain is added) |
| Admin dashboard | Separate Vercel project `weberact-admin`, built by `tools/build_admin.py` from `weberact-admin/`. Address: https://weberact-admin.vercel.app |
| Database, sign-in, images | Supabase project `weberact` (`gdzwpwmpngogcbxqkxjy`) |
| Database setup script | `tools/supabase/weberact.sql` (safe to run again) |

Both Vercel projects build only the branch `claude/interactive-website-templates-x9gt0s` (their
"Ignored Build Step" skips every other branch), so the repository's other projects never start a
WeberAct build.

## One admin account

The dashboard has a single account: the email in `public.admins`. It has no sign-up screen, the
database refuses any change to the admin list from the website or dashboard, and new sign-ups are
switched off in Supabase (Authentication, Sign In / Providers, "Allow new users to sign up": off).
The account itself is created once in Supabase: Authentication, Users, Add user, Create new user,
with "Auto Confirm User" ticked.

## How the website is built

Vercel runs, from the repository root:

    python3 tools/fetch_content.py && python3 tools/weberact_pages.py --domain weberact.co

1. `fetch_content.py` downloads the copy published from the dashboard (the `live` row of
   `site_content`). If the database cannot be reached, it keeps the committed `weberact/content.json`.
2. `weberact_pages.py` writes that content, the shared header and footer, canonical tags,
   `sitemap.xml` and `robots.txt` into the pages. The `weberact/` folder is what Vercel serves.

## How the dashboard is built

    python3 tools/build_admin.py      # writes dist-admin/

It contains the dashboard, its scripts, and a private copy of the website under `site/` that the
live preview edits in place (marked noindex; `robots.txt` blocks the whole deployment).

## Editing the website

Sign in to the dashboard, open **Website**, edit, **Save draft**, then **Publish**. With a deploy hook
saved under **Settings**, Publish rebuilds the website straight away (about a minute). Without one,
published changes appear at the next build.

Create the deploy hook in Vercel: project `weberact`, Settings, Git, Deploy Hooks, name it
"Dashboard publish", branch `claude/interactive-website-templates-x9gt0s`, then copy the URL into
the dashboard. For Publish to update the live address, the project's production branch must be the
same branch (Settings, Environments, Production, Branch Tracking).

## Password reset emails

In Supabase, Authentication, URL Configuration:

- Site URL: `https://weberact-admin.vercel.app/`
- Redirect URLs: add `https://weberact-admin.vercel.app/`

## Tests

    node tools/test_cms_parity.mjs     # the dashboard preview and the build render the same HTML
