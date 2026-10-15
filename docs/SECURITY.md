# Security model

## Principles

- **The database decides.** Row Level Security is enabled on every table with deny-by-default
  policies. Money, stock and status changes happen only inside `SECURITY DEFINER` SQL functions
  that check the caller's role (`require_role`), lock rows in a fixed order and validate state
  transitions. Check constraints make impossible states unrepresentable (e.g. shipped without a
  verified payment, paid without a payment record, totals that do not add up).
- **The browser is untrusted.** It sends only choices (variant, quantity, coupon code, address).
  Prices, discounts, shipping, tax and totals are computed server-side by `compute_quote`, and
  `place_order` recomputes them in the same transaction that reserves stock. The localStorage
  cart is a convenience only.
- **Least privilege for keys.** The service-role key exists only in server code for checkout,
  proof storage, cron jobs, webhooks and customer order lookup — never in client bundles
  (`server-only` imports). Staff features use the staff member's own session so RLS applies.

## Authentication and authorisation

- Customers: Supabase Auth email + password (10+ chars, letters and numbers), email
  confirmation, password reset by email; sign-in/sign-up/reset are rate limited and do not
  reveal whether an email is registered. Post-login redirects accept same-site paths only.
- Staff: separate `/admin/login`; access only via `staff_members` (owner/admin/editor/support).
  Optional or mandatory TOTP MFA; when required, the database treats sessions below AAL2 as
  non-staff. First owner is created with `bootstrap_owner` (works only while no owner exists).
  Sign-up metadata can never grant roles (only the display name and marketing consent are copied).
- Every admin page and Server Action checks the role on the server (`requireStaffPage`,
  `staffAction`), and the SQL layer checks again.

## Orders and payments

- Guest order access uses an HMAC-derived token (`ORDER_ACCESS_SECRET`); the database stores only
  its SHA-256. The token travels in an httpOnly cookie; emailed `?t=` links are converted into the
  cookie and stripped from the URL by the proxy.
- Checkout is idempotent; stock reservations prevent overselling (tested with concurrent
  last-unit purchases).
- Manual UPI payments are confirmed only by an owner/admin who attests to seeing the credit in
  bank records; amount and UTR are checked in SQL; approvals are idempotent and audited.
- Payment proofs: content-sniffed, re-encoded, private bucket, signed URLs for admins only.
- Razorpay: signatures verified with constant-time comparison; webhooks are the source of truth;
  provider events are deduplicated.

## Web protections

- Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, strict Referrer-Policy,
  Permissions-Policy, COOP, HSTS (production). Admin and order pages are `noindex` / `no-store`.
- Server Actions get Next.js's built-in origin check; state-changing Route Handlers verify the
  `Origin`/`Referer` against the site (`isSameOrigin`). Webhooks/cron use secrets instead.
- Postgres-backed rate limits on login, sign-up, password reset, checkout, quotes, search,
  newsletter, reviews, order lookup and proof uploads.
- CMS content is plain text or Markdown rendered without raw HTML; links are limited to site
  paths, `https:`, `mailto:` and `tel:`. No executable content can be published.
- Errors shown to users are generic; database messages are only shown when raised deliberately
  by our SQL functions.

## Audit

`audit_logs` is append-only and records staff changes to payments, orders, catalogue, inventory,
content, settings and staff, with the actor and before/after details.

## Secrets

No secrets are committed (`.env*` is ignored; `.env.example` holds placeholders only). Rotate
keys in Supabase/Razorpay/Resend and update Vercel if a secret is ever exposed.

## Reporting

If you find a vulnerability, contact the store owner privately rather than opening a public issue.
