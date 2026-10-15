# Local development

## 1. Install

```bash
node --version   # 22 or newer
npm install
```

## 2. Start a local Supabase

Pick one.

**A. Supabase CLI (Docker).** `supabase start` applies `supabase/migrations/*` and
`supabase/seed.sql`. Copy the printed API URL, publishable/anon key and secret/service-role key
into `.env.local`.

**B. Docker-free stack (bundled).** For machines without Docker:

```bash
npm run stack:up          # Postgres 16 :54322, GoTrue, PostgREST, storage shim → http://127.0.0.1:54321
node scripts/local-stack/keys.mjs >> .env.local   # local-only anon + service keys
```

It needs the PostgreSQL 16 server binaries (`/usr/lib/postgresql/16/bin`); GoTrue and
PostgREST release binaries are downloaded on first run. The keys are signed with the
well-known local development secret and are useless anywhere else.

- `npm run stack:reset` drops and recreates the dev database (migrations + seed). It deletes
  local data.
- Uploaded files are kept under `/tmp/pgstack/storage`.

## 3. Environment

Copy `.env.example` to `.env.local` and fill in:

| Variable | Local value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` (or the CLI URL) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | local anon key |
| `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | local service key |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |
| `ORDER_ACCESS_SECRET` | any random 48-byte string |
| `CRON_SECRET` | any random string (16+ chars) |
| `ALLOW_LOCAL_IMAGE_OPTIMIZATION` | `1` (lets next/image read images from 127.0.0.1) |

Email and Razorpay variables can stay empty locally: emails stay queued in `email_outbox`, and
the Razorpay option is hidden at checkout.

## 4. Run

```bash
npm run dev     # http://localhost:3000
```

## 5. Create your admin account

1. Sign up on the storefront (`/signup`) with your email — or create the user in the Supabase
   dashboard (Authentication → Users).
2. Promote that existing account to owner (only works while the store has no owner):

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=<local service key> \
     node scripts/create-admin.mjs you@example.com
   ```

3. Sign in at `/admin/login` and enrol TOTP two-factor authentication.

There is no default admin and no hard-coded password; see [ADMIN.md](ADMIN.md).

## 6. Tests

```bash
npm test             # unit tests
npm run test:db      # database integration tests (needs the local stack; uses an isolated auren_test DB)
npm run test:e2e     # Playwright (needs the dev server and local stack)
npm run typecheck && npm run lint
```

The database tests run against the real migrations, RLS policies and SQL functions — they cover
pricing, coupons, idempotent order placement, the last-unit race, payment approval exactly once,
rejection/resubmission, reservation expiry, late payments, UTR reuse and order/proof visibility.

## 7. Regenerating assets

Product renders, site imagery and GLB models are generated procedurally (no third-party assets):

```bash
npm run render:assets            # everything (slow)
node scripts/render/run.mjs --only velocity-runner-x --photos
npm run seed:generate            # rebuild supabase/seed.sql from scripts/render/catalog.ts
```
