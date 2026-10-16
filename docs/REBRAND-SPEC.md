# Rebrand spec: "Save The Money" general store

Working spec for turning the shoe-only AUREN store into **Save The Money**, a general
e-commerce store that sells every kind of product (footwear becomes one department).
It is the single source of truth for the agents doing the work; remove it once the
rebrand is merged.

## 1. Brand

| Item | Value |
| --- | --- |
| Store name (display) | **Save The Money** |
| Wordmark | "Save The Money" set in the display font; no third-party logos |
| Tagline | Everything you need, for less. |
| SEO title | Save The Money — Everyday products at honest prices |
| SEO title template | `%s · Save The Money` |
| SEO description | Shop electronics, fashion, footwear, home & kitchen, beauty, sports, toys and stationery at honest prices. Pay securely by UPI. Delivery across India. |
| Order number prefix (default) | `STM` (orders look like `STM-123456-ABCDE`) |
| SKU prefix (sample data) | `STM-` |
| Accent colour (default) | `#15803D` (money green; white text on it is 5:1) |
| Voice | Value-focused, plain, trustworthy. No fake urgency, no invented reviews, no "lowest price guaranteed" style claims. |

Internal identifiers (localStorage keys such as `auren.cart.v1`, cookie prefix `au_ord_`,
Resend idempotency prefixes, test DB name `auren_test`) stay as they are: they are invisible
to shoppers and renaming them only risks breakage. Everything **user-visible** says
Save The Money.

## 2. Catalogue model (database)

The migrations have **not** been applied to any deployed project yet, so they are edited in
place (the history then describes a general store from the start). Local databases are
recreated with `scripts/local-stack/stack.sh reset`.

### 2.1 Category tree
- `categories.parent_id` already exists. Use **two levels**: departments (top level) and
  sub-categories. The sample tree is `CATEGORIES` in `scripts/render/catalog.ts`.
- Products are assigned to a leaf category. A department page (`/category/electronics`)
  lists products in the department **and all its sub-categories**; a sub-category page lists
  its own products.
- `categories.size_guide_id` links a guide (footwear departments → footwear guide, clothing →
  clothing guide). A product's own `size_guide_id` overrides it; otherwise the category's
  guide (or its parent's) is used; **no** global default guide is shown for unrelated
  products (a power bank has no size guide).

### 2.2 Variant options
- New column `products.variant_label text not null default 'Size'`
  (`check (char_length(trim(variant_label)) between 1 and 30)`) — the name of the option a
  shopper picks: "Size", "Strap size", "Weight", "Capacity", "Option".
- `product_variants.size_label` keeps its name in the database but means "option value".
- A product with exactly one active variant per colour whose value is `Standard` has **no
  options**: the storefront hides the option picker and auto-selects the variant; admin shows
  "No options (single variant)".
- Colours stay as they are (`product_colors`, optional). With a single colour the storefront
  shows the colour name but no swatch picker.
- `admin_save_product(p_product jsonb)` reads `p_product ->> 'variant_label'` (trimmed,
  default 'Size'). CSV import/export gains a `variant_label` column.

### 2.3 Generic size guides
Replace the shoe-specific columns with a generic table layout:
- `size_guides`: keep `id, name, intro, notes, is_default`, add
  `columns text[] not null check (cardinality(columns) between 1 and 8)` (header labels,
  each 1–30 chars).
- `size_guide_rows`: replace `uk, us, eu, foot_length_cm` with
  `cells text[] not null` (same length as the guide's `columns`, each cell ≤ 30 chars),
  keep `id, size_guide_id, sort_order`.
- Seeded guides: **"Footwear (UK/India)"** columns `UK, US, EU, Foot length (cm)` (rows from
  the old shoe guide) and **"Clothing (unisex)"** columns `Size, Chest (in), Length (in)`
  (rows S–XXL: 36–38/27, 38–40/28, 40–42/29, 42–44/30, 44–46/31). `is_default` no longer
  means "show everywhere"; keep the column but set it false for both.

### 2.4 Settings defaults
`store_settings` defaults and the seeded row use the brand values in section 1
(store name, tagline, SEO fields, `order_number_prefix 'STM'`, `accent_color '#15803D'`).
`DEFAULT_SETTINGS` in `src/lib/content/queries.ts` mirrors them.

## 3. Sample catalogue

`scripts/render/catalog.ts` is the source of truth (categories, collections, 33 products:
24 procedural "items" across 7 departments + the 9 existing shoes under Footwear).
`scripts/generate-seed.ts` turns it into `supabase/seed.sql`. Images live at
`public/images/products/<slug>/<colour-slug>-<view>.webp` (views `hero34`, `side`, `top`,
1200×1200 WebP) and 3D models at `public/models/<slug>.glb`, rendered by
`node scripts/render/run.mjs` from the procedural builders in `scripts/render/items/`.

Site imagery (`public/images/site/`): `hero.webp`, `hero-mobile.webp`, `og-default.webp`,
`banner-*.webp`, `story-*.webp`, and one tile per department
`category-<department-slug>.webp` (900×1125) plus the existing footwear sub-category tiles.

## 4. Storefront rules
- No shoe-only copy outside footwear contexts ("pairs", "find your fit", "UK sizes",
  "stride" …). Footwear product pages may still talk about sizes and pairs.
- Header navigation: departments with their sub-categories (mega menu on desktop, nested
  list on mobile), plus Deals/New/collections as configured in navigation links.
- Catalogue filters: price, department/category, brand, colour, rating, availability, on
  sale. The option facet ("Size") only appears when the listing is scoped to a category
  and the values are not just `Standard`; it is titled with the products' variant label when
  they share one, otherwise "Size / option". The audience facet (men/women/kids) only appears
  when the listing contains non-unisex products.
- Cart, checkout, order pages and emails show the option as `<variant label>: <value>`
  and omit it for `Standard`.
- 3D hero: a composition of several product models (e.g. headphones, smartwatch, a sneaker,
  bottle) instead of a single shoe; same performance budget, reduced-motion and no-WebGL
  fallbacks as today.

## 5. Who owns what (parallel work)

| Area | Files |
| --- | --- |
| Data | `supabase/migrations/**`, `supabase/seed.sql`, `scripts/generate-seed.ts`, `supabase/tests/**`, `tests/db/**`, `src/lib/database.types.ts` |
| Renders | `scripts/render/items/<own file>.ts` only; product images/models for own products |
| Storefront | `src/app/(store)/**`, `src/app/layout.tsx`, `src/app/icon*`, `src/app/globals.css`, `src/components/{store,home,product,cart,checkout,three,account,orders,ui}/**`, `src/lib/{catalog,content,cart,wishlist,email}/**` |
| Admin | `src/app/admin/**`, `src/components/admin/**`, `src/lib/admin/**` |
| Docs & tests | `README.md`, `docs/**`, `tests/e2e/**`, `tests/unit/**` |
