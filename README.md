# AUREN — premium footwear store

A full-stack, shoe-only e-commerce site for the Indian market: editorial storefront with an
interactive 3D hero, product pages with colour-aware galleries and 3D models, a real cart and
checkout, **manual UPI payments verified by staff against bank records**, optional Razorpay,
and a complete admin panel (catalogue, media, CMS, orders, payments, inventory, coupons,
reviews, customers, settings, staff and audit log).

Supabase (Postgres, Auth, Storage) is the source of truth. Prices, discounts, shipping, tax and
stock are always computed and reserved inside the database; the browser only says what the
shopper picked.

> Status: this repository contains the application, database migrations, seed data, tests and
> deployment configuration. It is **not live** until the steps in
> [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) have been completed with real credentials.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components, Server Actions, Route Handlers), React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4, Radix primitives, shadcn-style components, Motion |
| 3D | React Three Fiber, Drei, Three.js (meshopt-compressed GLB models generated in `scripts/render`) |
| Data | Supabase Postgres with Row Level Security, Supabase Auth (email + TOTP MFA for staff), Supabase Storage |
| Validation | Zod on every server boundary; database check constraints and SQL functions as the last line |
| Payments | Manual UPI (QR + deep link + proof upload + staff verification); Razorpay (optional, webhook-confirmed) |
| Email | Resend REST API through a transactional outbox |
| Hosting | Vercel (app + cron), Supabase (database, auth, storage) |
| Tests | Vitest (unit + database integration against a real Postgres), Playwright (browser flows) |

## Quick start (local)

Requirements: Node 22+, and either the Supabase CLI with Docker **or** the bundled
Docker-free local stack (PostgreSQL 16 + GoTrue + PostgREST + a storage shim).

```bash
npm install
cp .env.example .env.local          # fill in values — see docs/SETUP.md
npm run stack:up                    # Docker-free local Supabase-compatible stack (or: supabase start)
npm run dev                         # http://localhost:3000
```

Full instructions, including how to get local keys and create the first admin:
[docs/SETUP.md](docs/SETUP.md).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run typecheck` | Generate route types and run `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (UPI link/QR data, money, tokens, file sniffing, emails, signatures…) |
| `npm run test:db` | Recreates the isolated `auren_test` database and runs the database integration tests (orders, payments, RLS, concurrency) |
| `npm run test:e2e` | Playwright browser tests |
| `npm run stack:up` / `stack:reset` / `stack:down` | Local Supabase-compatible stack |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the local database |
| `npm run seed:generate` | Regenerate `supabase/seed.sql` from `scripts/render/catalog.ts` |
| `npm run render:assets` | Re-render product photos, site imagery and GLB models (headless Chromium) |
| `node scripts/create-admin.mjs <email>` | Secure bootstrap of the first store owner (see docs/ADMIN.md) |

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — local development, environment variables, test accounts
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Supabase project, migrations, storage, Vercel, cron, go-live checklist
- [docs/ADMIN.md](docs/ADMIN.md) — first owner, roles, MFA, daily operations
- [docs/PAYMENTS.md](docs/PAYMENTS.md) — manual UPI flow and verification procedure, statuses, Razorpay
- [docs/STORAGE.md](docs/STORAGE.md) — buckets, upload validation, private payment proofs
- [docs/BACKUP.md](docs/BACKUP.md) — backups, restore drills, exports
- [docs/SECURITY.md](docs/SECURITY.md) — security model and controls
- [docs/LEGACY-DATA.md](docs/LEGACY-DATA.md) — how the earlier store's data is preserved and imported

## Project layout

```
src/app/(store)/        storefront routes (home, shop, product, cart, checkout, orders, account, auth)
src/app/admin/          admin panel (login + MFA, and the role-gated panel)
src/app/api/            route handlers (payment proof upload, cron, Razorpay, webhooks)
src/components/         UI (ui/, store/, product/, home/, three/, checkout/, orders/, admin/)
src/lib/                data access, security helpers, payments, email, catalog/content queries
supabase/migrations/    schema, RLS, SQL functions (order engine, payments, admin operations)
supabase/seed.sql       sample catalogue (generated)
scripts/                local stack, asset rendering, seed generation, admin bootstrap, dev helpers
tests/                  unit/, db/ (integration), e2e/
```

## Sample catalogue

The seed creates original sample products — Velocity Runner X, Urban Street Pro, AeroFlex
Sport, Midnight Leather Classic, CloudStep Everyday, Phantom High-Top, TrailForce Outdoor,
CourtVision Elite and Coastline Slide — with procedurally generated product renders and 3D
models. They are fictional; no third-party brands, endorsements or reviews are implied. Replace
them with your real catalogue from the admin panel.
