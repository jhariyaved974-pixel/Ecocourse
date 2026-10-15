# Deployment

Target: **Supabase** (database, auth, storage) + **Vercel** (Next.js app and cron jobs).
Nothing here is done automatically — each step needs your accounts and credentials.

## 0. Git repository

The code lives in Git (this repository). Work on a branch, open a pull request, and let Vercel
build a preview for every PR. Protect the production branch and never commit `.env*` files
(they are ignored; `.env.example` contains placeholders only).

## 1. Supabase project

1. Create a project (region close to your customers, e.g. Mumbai `ap-south-1`) or use an
   existing one. **If the project already holds data from an earlier version of the store, read
   [LEGACY-DATA.md](LEGACY-DATA.md) first** — the first migration moves those tables into a
   `legacy` schema (nothing is deleted) and a later migration imports what can be reused.
2. Take a backup before applying migrations to a project that has data (Database → Backups).
3. Apply the migrations in `supabase/migrations/` in filename order:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push             # applies pending migrations
   ```

   (Or run each file in order in the SQL editor.) Do **not** run `supabase/seed.sql` in
   production unless you want the fictional sample catalogue.
4. Auth settings (Authentication → URL configuration / Providers / MFA):
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/auth/callback` (and your Vercel preview pattern if needed)
   - Email provider enabled, **Confirm email** on.
   - MFA: enable TOTP (staff can be required to use it from Admin → Staff & security).
   - Optional: point Auth's SMTP at your email provider so confirmation/reset emails come from your domain.
5. Storage: the migrations create the buckets and policies — `catalog-media` (public read) and
   `payment-proofs` (**private**). Check in Storage that `payment-proofs` is not public.
6. Optional `pg_cron`: if the extension is available, migration `20261014120700` schedules the
   unpaid-order expiry every 5 minutes. Otherwise the Vercel cron below does it.
7. Copy the API URL, publishable (anon) key and secret (service-role) key.

## 2. Vercel

1. Import the Git repository as a new project (framework preset: Next.js). Build command
   `next build`, output default. Choose the function region nearest your Supabase region
   (e.g. `bom1` Mumbai).
2. Environment variables (Production and Preview) — see `.env.example` for descriptions:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
   `SUPABASE_SECRET_KEY`, `ORDER_ACCESS_SECRET`, `CRON_SECRET`, and when ready `RESEND_API_KEY`,
   `EMAIL_FROM`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
   Generate secrets with
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
   Never reuse the local development keys.
3. Cron jobs are declared in `vercel.json`:
   - `/api/cron/expire-orders` — releases stock held by unpaid orders whose reservation expired.
   - `/api/cron/send-emails` — delivers queued transactional emails (and consent-based cart reminders).
   Vercel sends `Authorization: Bearer $CRON_SECRET`. **Hobby plans only run crons once a day**:
   on Hobby, rely on `pg_cron` for expiry (step 1.6) and expect delayed emails, or upgrade to Pro
   for the configured schedules.
4. Add your domain (Project → Domains) and set `NEXT_PUBLIC_SITE_URL` to it.
5. Deploy. After the first deployment, create the first owner — see [ADMIN.md](ADMIN.md).

## 3. Email (Resend)

1. Verify your sending domain in Resend (SPF/DKIM DNS records).
2. Set `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `AUREN <orders@yourdomain.in>`) in Vercel.
3. Queued emails (`email_outbox`) are delivered by the cron job; failed sends retry with backoff.

## 4. Razorpay (optional)

1. Create API keys in **Test mode** first; set the three `RAZORPAY_*` variables.
2. Add a webhook: URL `https://<your-domain>/api/webhooks/razorpay`, secret =
   `RAZORPAY_WEBHOOK_SECRET`, events `payment.captured`, `payment.failed`, `order.paid`,
   `refund.processed`.
3. Enable Razorpay in Admin → Payment settings (the toggle stays disabled until keys exist).
4. Orders are marked paid only from server-side verification of Razorpay's signed data
   (webhook / API fetch), never from the browser redirect. Switch to live keys only after a
   complete test-mode purchase and refund.

## 5. Domain and HTTPS

Add the domain in Vercel (Project → Domains) and create the DNS records it shows. Vercel issues
and renews TLS certificates automatically; HSTS is sent by the app in production. Then update
`NEXT_PUBLIC_SITE_URL`, the Supabase Auth Site URL / redirect URLs, the Resend sender domain and
the Razorpay webhook URL to the final domain, and redeploy.

## 6. Monitoring and error logging

- **Vercel**: Runtime Logs and Observability show server errors from pages, Server Actions, route
  handlers and cron runs (each error in the UI shows a reference digest that matches the logs).
  Enable Vercel Web Analytics/Speed Insights if wanted.
- **Supabase**: Logs Explorer (API, Postgres, Auth, Storage) and **Database → Advisors**
  (security and performance lints — run after every migration).
- **Business monitoring** inside the app: the admin dashboard highlights overdue payment reviews,
  late payments and orders needing attention; `email_outbox` shows failed emails.
- Optional: add an error tracker (e.g. Sentry) — not bundled, to avoid sending customer data to a
  third party without your decision.

## 7. Production smoke test (after every production deploy)

1. `/`, `/shop`, a product page, `/sitemap.xml`, `/robots.txt` load over HTTPS.
2. Add to cart → checkout → place a UPI order → the order page shows the right UPI ID, amount
   and QR.
3. `/admin/login` → dashboard loads; the new order appears in Orders and (after uploading a proof)
   in UPI payments.
4. Cancel the test order from the admin (stock returns) and check the audit log entry.
5. Check Vercel logs for errors during the test.

## 8. Go-live checklist

- [ ] Migrations applied; `payment-proofs` bucket is private; RLS enabled on every table
      (Supabase → Database → Advisors shows no "RLS disabled" errors). This query must return
      no rows:

      ```sql
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
      ```
- [ ] Owner account created with `scripts/create-admin.mjs`; TOTP enrolled; "Require MFA for
      staff" switched on.
- [ ] Payment settings reviewed: UPI ID (default `sadiajay4311@ybl`), payee name, reservation
      and review windows, instructions. Scan the preview QR with a UPI app and confirm the payee.
- [ ] Store settings, shipping methods, tax rules (GST bands — confirm with your tax adviser),
      policy pages (returns, shipping, privacy, terms) reviewed for your business.
- [ ] Sample products replaced or archived; real product photos and stock entered.
- [ ] Email domain verified and a test order email received.
- [ ] A full test order: place → pay a small real UPI amount → upload proof → verify in
      Admin → UPI payments against your bank statement → confirm → ship.
- [ ] Backups/PITR configured ([BACKUP.md](BACKUP.md)).
- [ ] `NEXT_PUBLIC_SITE_URL` matches the production domain; `/sitemap.xml` and `/robots.txt` load.
