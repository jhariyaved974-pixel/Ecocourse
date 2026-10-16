// Archive + import of the previous single-page-app catalogue. Builds a separate
// database that looks like the old project (supabase/tests/legacy_fixture.sql),
// applies every migration on top of it, and checks how the shoe catalogue lands
// in the general store: legacy categories become sub-categories of Footwear.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DB_URL } from './helpers';

const ROOT = path.resolve(__dirname, '../..');
const LEGACY_DB = 'auren_legacy_test';
const LEGACY_URL = DB_URL.replace(/\/[^/?]+(\?.*)?$/, `/${LEGACY_DB}`);
const MAINTENANCE_URL = DB_URL.replace(/\/[^/?]+(\?.*)?$/, '/template1');
const MIGRATIONS = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
const IMPORT_MIGRATION = MIGRATIONS.find((f) => f.includes('import_legacy_catalog'))!;

function psql(url: string, args: string[], input?: string) {
  return execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PGOPTIONS: '--client-min-messages=warning' },
  });
}

let db: pg.Pool;

beforeAll(async () => {
  psql(MAINTENANCE_URL, ['-c', `drop database if exists ${LEGACY_DB} with (force)`, '-c', `create database ${LEGACY_DB}`]);
  psql(LEGACY_URL, ['-f', path.join(ROOT, 'scripts/local-stack/bootstrap.sql')]);
  // Same auth schema as the test database (created by GoTrue), without the
  // triggers that point at public.* functions (the migrations add them).
  psql(LEGACY_URL, ['-c', 'drop schema if exists auth cascade']);
  const authSchema = execFileSync('pg_dump', ['--schema-only', '--schema=auth', '--no-owner', DB_URL], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter((line) => !line.includes('EXECUTE FUNCTION public.')).join('\n');
  psql(LEGACY_URL, [], authSchema);
  psql(LEGACY_URL, ['-c', 'grant usage on schema auth to anon, authenticated, service_role']);

  psql(LEGACY_URL, ['-f', path.join(ROOT, 'supabase/tests/legacy_fixture.sql')]);
  for (const file of MIGRATIONS) {
    psql(LEGACY_URL, ['--single-transaction', '-f', path.join(ROOT, 'supabase/migrations', file)]);
  }
  db = new pg.Pool({ connectionString: LEGACY_URL, max: 2 });
}, 180_000);

afterAll(async () => {
  await db?.end();
  psql(MAINTENANCE_URL, ['-c', `drop database if exists ${LEGACY_DB} with (force)`]);
});

async function snapshot() {
  const { rows: categories } = await db.query(
    `select c.slug, c.name, p.slug as parent, g.name as guide, c.is_visible
     from public.categories c left join public.categories p on p.id = c.parent_id left join public.size_guides g on g.id = c.size_guide_id
     order by c.slug`);
  const { rows: products } = await db.query(
    `select p.slug, p.sku, p.status, p.variant_label, c.slug as category, cp.slug as department, p.price, p.sale_price,
            (select count(*)::int from public.product_variants v where v.product_id = p.id) as variants,
            (select array_agg(distinct v.size_label order by v.size_label) from public.product_variants v where v.product_id = p.id) as sizes
     from public.products p left join public.categories c on c.id = p.category_id left join public.categories cp on cp.id = c.parent_id
     order by p.slug`);
  return { categories, products };
}

describe('legacy catalogue import', () => {
  it('archives the old tables instead of dropping them', async () => {
    const { rows } = await db.query(`select table_name from information_schema.tables where table_schema = 'legacy' order by table_name`);
    expect(rows.map((r) => r.table_name)).toEqual(['activity_log', 'admins', 'categories', 'coupons', 'deals', 'products', 'site_settings', 'subscribers']);
    const { rows: [counts] } = await db.query(`select (select count(*)::int from legacy.products) as products, (select count(*)::int from legacy.categories) as categories`);
    expect(counts).toEqual({ products: 4, categories: 4 });
  });

  it('turns legacy categories into sub-categories of the Footwear department', async () => {
    const { categories } = await snapshot();
    const bySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));
    expect(bySlug.footwear).toMatchObject({ parent: null, guide: 'Footwear (UK/India)' });
    // Already part of the baseline footwear tree: reused, not duplicated.
    expect(bySlug.running).toMatchObject({ parent: 'footwear', guide: 'Footwear (UK/India)' });
    expect(bySlug.sneakers).toMatchObject({ parent: 'footwear' });
    expect(bySlug.sandals).toMatchObject({ parent: 'footwear', name: 'Sandals & Slides' });
    expect(bySlug.slides).toBeUndefined();
    // 'outdoor' belongs to Sports & Fitness in the new catalogue; the shoes get their own footwear sub-category.
    expect(bySlug.outdoor).toMatchObject({ parent: 'sports-fitness' });
    expect(bySlug['outdoor-footwear']).toMatchObject({ parent: 'footwear', name: 'Outdoor', guide: 'Footwear (UK/India)', is_visible: true });
    // Every category is at most two levels deep.
    const { rows: [deep] } = await db.query(
      `select count(*)::int as n from public.categories c join public.categories p on p.id = c.parent_id where p.parent_id is not null`);
    expect(deep.n).toBe(0);
  });

  it('imports products as drafts with UK sizes and the "Size" variant label', async () => {
    const { products } = await snapshot();
    const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
    expect(Object.keys(bySlug).sort()).toEqual(['aero-run-2', 'cloud-slide', 'court-classic', 'trail-grip']);
    expect(bySlug['aero-run-2']).toMatchObject({
      sku: 'AERO-RUN-2', status: 'draft', variant_label: 'Size', category: 'running', department: 'footwear',
      price: 329900, sale_price: 179900, variants: 12,
    });
    expect(bySlug['aero-run-2'].sizes).toEqual(['UK 10', 'UK 11', 'UK 6', 'UK 7', 'UK 8', 'UK 9']);
    expect(bySlug['cloud-slide']).toMatchObject({ category: 'sandals', department: 'footwear', variants: 6 });
    expect(bySlug['court-classic']).toMatchObject({ category: 'sneakers', department: 'footwear' });
    expect(bySlug['trail-grip']).toMatchObject({ category: 'outdoor-footwear', department: 'footwear', variant_label: 'Size' });
    const { rows: [stock] } = await db.query(`select coalesce(sum(stock_on_hand), 0)::int as n from public.product_variants`);
    expect(stock.n).toBe(0);
  });

  it('imports coupons, subscribers and shipping settings', async () => {
    const { rows: coupons } = await db.query(`select code, discount_type, value, min_subtotal from public.coupons order by code`);
    // WELCOME10 comes from the baseline content (the legacy copy is skipped); SAVE200 from the old store.
    expect(coupons).toEqual([
      { code: 'SAVE200', discount_type: 'fixed', value: 20000, min_subtotal: 199900 },
      { code: 'WELCOME10', discount_type: 'percentage', value: 10, min_subtotal: 249900 },
    ]);
    const { rows: subs } = await db.query(`select email, source from public.newsletter_subscribers`);
    expect(subs).toEqual([{ email: 'legacy.subscriber@example.com', source: 'legacy' }]);
    const { rows: shipping } = await db.query(`select code, fee, free_over, min_days, max_days from public.shipping_methods order by code`);
    expect(shipping).toEqual([
      { code: 'express', fee: 14900, free_over: null, min_days: 1, max_days: 2 },
      { code: 'standard', fee: 9900, free_over: 149900, min_days: 3, max_days: 5 },
    ]);
  });

  it('is idempotent', async () => {
    const before = await snapshot();
    psql(LEGACY_URL, ['--single-transaction', '-f', path.join(ROOT, 'supabase/migrations', IMPORT_MIGRATION)]);
    expect(await snapshot()).toEqual(before);
  });
});
