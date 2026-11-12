# WeberAct Client Portal

A private portal for WeberAct clients, with a control center for the WeberAct team. It runs as its own
app next to the public website (`../weberact/`) and its content admin (`../weberact-admin/`), and
shares their Supabase project.

| | Client portal (`/dashboard`, …) | Admin control center (`/admin`, …) |
| --- | --- | --- |
| Who | Client contacts WeberAct has added | Emails in `public.admins`, plus team members |
| Sees | Their own company only | Every client |
| Does | Projects and live stages, onboarding, contracts (accept), billing and invoice PDFs, files, messages, requests and feedback, SEO and performance reports, notifications | Clients, contacts and invites, projects and stages, services, onboarding review, contracts, invoices and payments, files and folders, messages, SEO reports, announcements, team, activity log, client reports (PDF), settings |

Stack: Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind CSS 4, Motion (Framer
Motion), Recharts, Lucide, React Hook Form and Zod, Supabase (Postgres, Auth, Storage, Realtime),
pdf-lib.

## How security works

- **Row level security on every table** (`supabase/migrations/20261110000100_portal.sql`). A client
  reads only rows of its own organization (`my_org()`). Changing an id in a URL or an API request
  returns nothing. Staff access (`is_staff()`) and admin-only actions (money, team, settings) are
  checked in the database, then again in every server action.
- **Invite-only accounts.** A login account can only be created for an email in `admins`, an active
  `team_members` row, or a client contact. This replaces the old admin-only trigger. The website
  dashboard still admits only `public.admins`.
- **Private files.** Everything lives in the private `portal` storage bucket, under
  `<organization id>/…`. Storage policies let a client read only its own folder, and write only into
  `uploads/` and `messages/`. Downloads use signed links that expire after 2 minutes.
- **Contracts.** Acceptance happens only through `accept_contract()`. It records:
  - the account, email and typed name;
  - the time, and the IP address and browser as seen by Supabase;
  - a SHA-256 fingerprint of the exact document.

  Accepted contracts are locked. The UI states that this is an electronic acceptance record, not a
  certified digital signature.
- **Invoices.**
  - Totals are calculated from line items in the database and cannot be typed in.
  - Numbers (`WA-2026-0001`) are assigned in sequence when an invoice is issued.
  - Issued invoices cannot be edited or deleted; void them instead.
  - Payments above the balance are refused.
  - Payment status (Paid, Partially paid, Pending, Overdue) is calculated by the database, never
    stored by hand.
- **Secrets stay on the server.** Only `NEXT_PUBLIC_*` values reach the browser. Online payments are
  recorded only after the provider's signature is verified on the server.
- **No invented data.** SEO and performance figures come from Search Console, Analytics 4 or
  PageSpeed Insights, or are typed in from those tools. Empty fields show "Not available".

## Environment variables

Copy `.env.example` to `.env.local` and fill it in. On Vercel, add the same variables under Project
Settings → Environment Variables.

| Variable | Needed for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Everything (required) |
| `NEXT_PUBLIC_SITE_URL` | Links in invite, password and email messages |
| `SUPABASE_SECRET_KEY` | Sending invites from the admin panel, online payments, the daily job |
| `CRON_SECRET` | Protecting `/api/cron/daily` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email notifications (in-app notifications work without them) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | INR payments |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | International card payments |
| `PAGESPEED_API_KEY` | A higher PageSpeed Insights quota (optional) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Importing Search Console and Analytics 4 data |

Admin → Settings → Integrations shows which of these are switched on.

## Set up the database

Apply the migrations in `supabase/migrations/` in order. You can use the Supabase SQL editor,
`supabase db push`, or the Supabase MCP tools. They are written to run once.

1. `20261110000000_weberact_base.sql`: the shared admin list. It is already on the hosted project
   and is safe to run again.
2. `20261110000100_portal.sql`: all portal tables, rules, triggers, the storage bucket and realtime.
3. `20261110000200_demo_cleanup.sql`: lets the demo seed remove its own data.

Then, in Supabase:

- **Authentication → URL Configuration**:
  - add `https://<portal domain>/**` to Redirect URLs;
  - keep the Site URL as it is, or set it to the portal.
- **Authentication → Emails**: for production volume, set up custom SMTP. The built-in sender
  allows only a few emails per hour.
- **To let invited clients sign in with an email link** without `SUPABASE_SECRET_KEY`, allow
  sign-ups (Authentication → Sign In / Providers). The database still refuses every email WeberAct
  has not added.

## Use it

1. Sign in at `/login` with the admin email. Its account and admin role carry over.
2. Admin → Clients → **New client**. This adds the company and its first contact.
   - With `SUPABASE_SECRET_KEY` set, the contact gets an invite email.
   - Without it, the contact signs in with "Email link".
3. Create a project: assign services, a manager and dates.
4. Move the project through its 8 stages. The client sees each change live and gets a notification.
5. Upload deliverables, send contracts, issue invoices and record payments.

## Run locally

```bash
npm install
npm run stack:up        # Postgres + Auth + REST + storage on 127.0.0.1:54321, applies the migrations
node scripts/local-stack/keys.mjs   # prints local-only keys for .env.local
npm run dev
```

The local stack needs PostgreSQL 16 binaries. It downloads GoTrue and PostgREST on first run, and
does not include Realtime, so pages refresh on navigation instead of live.

## Demo data

```bash
SUPABASE_URL=… SUPABASE_SECRET_KEY=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… DEMO_PASSWORD='…' npm run seed:demo
node scripts/seed-demo.mjs --clean    # removes all of it
```

- **What it creates:** two "(Demo)" companies marked `is_demo`, and three accounts on the reserved
  `weberact.test` domain:
  - `demo.client@weberact.test`
  - `demo.other@weberact.test`
  - `demo.manager@weberact.test`
- **Passwords:** none are stored in the repository; all three use `DEMO_PASSWORD`.
- **SEO:** no metrics are seeded, so the demo shows the "not connected" state.

## Testing

```bash
node scripts/test-db.mjs          # 62 database checks on the local stack: isolation, roles, invoices, contracts, storage
E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… E2E_CLIENT_PASSWORD="$DEMO_PASSWORD" npm run test:e2e
npm run typecheck && npm run lint && npm run build
```

The end-to-end suite (`tests/portal.spec.ts`) signs in as a client, a second client and an admin.
It checks:

- the dashboard, project stages, billing and PDFs;
- contract acceptance;
- onboarding with autosave and upload;
- messages and requests;
- that the second client cannot open the first client's pages or PDFs;
- that an admin's stage change reaches the client;
- creating a client, project and invoice, and recording a payment;
- the phone layout, with no browser errors anywhere.

## Deploy (Vercel)

1. Create a project with Root Directory `weberact-portal` and framework Next.js.
2. Add the environment variables above.
3. Deploy. `vercel.json` schedules `/api/cron/daily` once a day at 09:00 IST, for deadline reminders
   and email digests.

Payment webhooks:

- Razorpay: `https://<portal>/api/payments/razorpay/webhook`, event `payment.captured`.
- Stripe: `https://<portal>/api/payments/stripe/webhook`, event `checkout.session.completed`.
