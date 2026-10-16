# Go live in 8 steps

Full details: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Nothing here contains real keys; you add
your own in Vercel and Supabase.

1. **Supabase**: create a project (region Mumbai). Take a backup first if you reuse an existing
   project (see docs/LEGACY-DATA.md). Apply the migrations in `supabase/migrations/` in order
   (`supabase db push`, or paste each file into the SQL editor). Do **not** run `supabase/seed.sql`
   in production unless you want the sample products.
2. **Storage**: the migrations create the buckets (`media` public, `payment-proofs` private).
3. **Auth**: Authentication → URL configuration → Site URL = your domain; add
   `https://<your-domain>/auth/callback` to the redirect URLs.
4. **Vercel**: import this repository/zip as a Next.js project and set the environment variables
   from `.env.example`. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), `SUPABASE_SECRET_KEY` (or service role key), `NEXT_PUBLIC_SITE_URL`,
   `ORDER_ACCESS_SECRET` (48+ random characters) and `CRON_SECRET`. Optional: `RESEND_API_KEY`
   + `EMAIL_FROM` (emails), `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` + `RAZORPAY_WEBHOOK_SECRET`.
5. **Deploy**, then open the site and check the home page loads.
6. **First admin**: sign up on the site with your email, then run (locally, with the production
   URL and service key in your shell only):
   `NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/create-admin.mjs you@yourdomain.in`
   Then sign in at `/admin/login` and turn on two-factor authentication.
7. **Payments**: Admin → Settings → Payments: confirm the UPI ID (`sadiajay4311@ybl` by default),
   payee name, advance % for Half prepaid (default 50%) and balance due days. Place one test order
   and verify it in Admin → UPI payments against your bank statement.
8. **Products**: Admin → Products → New product; upload photos in the editor, set price, options
   and stock, then Publish. Replace or archive the sample products.

Before announcing the site: complete the checklist in docs/DEPLOYMENT.md §8 (legal pages,
support contact, domain/HTTPS, email sender domain, Razorpay test payment if enabled).
