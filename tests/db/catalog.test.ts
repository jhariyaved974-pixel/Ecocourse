// Catalogue model for the general store: variant labels, generic size guides,
// the two-level category tree (departments and sub-categories) and listings
// that include a department's sub-categories.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, anon, as, createProduct, createStaff, createUser, expectDbError, rpc, service, type Actor } from './helpers';

let editor: Actor;
let support: Actor;
let customer: Actor;

const uid = () => randomUUID().slice(0, 8);

/** Creates a department with the given sub-categories (unique slugs) as the database owner. */
async function createTree(subs = 2) {
  const tag = uid();
  const { rows: [dept] } = await admin.query(
    `insert into public.categories (name, slug) values ($1, $2) returning id, slug`, [`Dept ${tag}`, `dept-${tag}`]);
  const children: { id: string; slug: string }[] = [];
  for (let i = 0; i < subs; i += 1) {
    const { rows: [c] } = await admin.query(
      `insert into public.categories (parent_id, name, slug, sort_order) values ($1, $2, $3, $4) returning id, slug`,
      [dept.id, `Sub ${tag} ${i}`, `sub-${tag}-${i}`, i + 1]);
    children.push(c);
  }
  return { dept: dept as { id: string; slug: string }, children };
}

beforeAll(async () => {
  editor = await createStaff('editor');
  support = await createStaff('support');
  customer = await createUser();
});

afterAll(async () => {
  await admin.end();
});

describe('products.variant_label', () => {
  function payload(extra: Record<string, unknown> = {}) {
    const tag = uid().toUpperCase();
    return {
      name: `Test Watch ${tag}`,
      slug: `test-watch-${tag.toLowerCase()}`,
      sku: `TW-${tag}`,
      price: 399900,
      status: 'draft',
      colors: [{ key: 'black', name: 'Black', hex: '#111111', family: 'black' }],
      variants: [
        { color_key: 'black', size_label: 'S/M', size_sort: 1, sku: `TW-${tag}-SM`, initial_stock: 2 },
        { color_key: 'black', size_label: 'M/L', size_sort: 2, sku: `TW-${tag}-ML`, initial_stock: 0 },
      ],
      ...extra,
    };
  }

  it('is saved trimmed by admin_save_product and returned to the admin', async () => {
    const res = await rpc<{ id: string; variant_label: string }>(editor, 'admin_save_product', {
      p_product: payload({ variant_label: '  Strap size  ' }),
    });
    expect(res.variant_label).toBe('Strap size');
    const { rows } = await admin.query(`select variant_label, sku from public.products where id = $1`, [res.id]);
    expect(rows[0].variant_label).toBe('Strap size');

    const listed = await as<{ variant_label: string }>(editor, `select variant_label from public.admin_list_products(p_query => $1)`, [rows[0].sku]);
    expect(listed.map((r) => r.variant_label)).toEqual(['Strap size']);
    const inventory = await as<{ variant_label: string; size_label: string }>(editor,
      `select variant_label, size_label from public.admin_list_inventory(p_query => $1) order by size_label desc`, [rows[0].sku]);
    expect(inventory.map((r) => `${r.variant_label}: ${r.size_label}`)).toEqual(['Strap size: S/M', 'Strap size: M/L']);
  });

  it("defaults to 'Size', keeps the stored label when omitted on update and is copied by duplicate_product", async () => {
    const base = payload();
    const created = await rpc<{ id: string; variant_label: string }>(editor, 'admin_save_product', { p_product: base });
    expect(created.variant_label).toBe('Size');

    const { rows: variants } = await admin.query(`select id, sku, size_label from public.product_variants where product_id = $1 order by size_sort`, [created.id]);
    const { rows: [color] } = await admin.query(`select id from public.product_colors where product_id = $1`, [created.id]);
    const update = {
      ...base,
      id: created.id,
      colors: [{ id: color.id, key: color.id, name: 'Black', hex: '#111111', family: 'black' }],
      variants: variants.map((v, i) => ({ id: v.id, color_key: color.id, size_label: v.size_label, size_sort: i + 1, sku: v.sku })),
    };
    await rpc(editor, 'admin_save_product', { p_product: { ...update, variant_label: 'Weight' } });
    const omitted = await rpc<{ variant_label: string }>(editor, 'admin_save_product', { p_product: update });
    expect(omitted.variant_label).toBe('Weight');
    const blank = await rpc<{ variant_label: string }>(editor, 'admin_save_product', { p_product: { ...update, variant_label: '   ' } });
    expect(blank.variant_label).toBe('Size');

    await rpc(editor, 'admin_save_product', { p_product: { ...update, variant_label: 'Capacity' } });
    const copyId = await rpc<string>(editor, 'duplicate_product', { p_product_id: created.id });
    const { rows } = await admin.query(`select variant_label, status from public.products where id = $1`, [copyId]);
    expect(rows[0]).toMatchObject({ variant_label: 'Capacity', status: 'draft' });
  });

  it('rejects labels longer than 30 characters', async () => {
    await expectDbError(
      rpc(editor, 'admin_save_product', { p_product: payload({ variant_label: 'x'.repeat(31) }) }),
      { code: '23514' },
    );
  });

  it('is snapshotted on order lines and shown in quotes', async () => {
    const { variants } = await createProduct({ stock: [3], options: ['2 × 3 kg'], variantLabel: 'Weight', categorySlug: 'occasion-blouses' });
    const quote = await rpc<{ lines: { variant_label: string; size_label: string }[]; priced_lines: { variant_label: string }[] }>(
      service, 'compute_quote', { p_lines: [{ variant_id: variants[0].variantId, quantity: 1 }] });
    expect(quote.lines[0]).toMatchObject({ variant_label: 'Weight', size_label: '2 × 3 kg' });
    expect(quote.priced_lines[0].variant_label).toBe('Weight');
  });
});

describe('generic size guides', () => {
  it('seeds the blouse guide and links it through the blouse categories', async () => {
    const { rows: guides } = await admin.query(
      `select name, columns, is_default, (select count(*)::int from public.size_guide_rows r where r.size_guide_id = g.id) as rows
       from public.size_guides g where name not like 'Test%' order by name`);
    expect(guides).toEqual([
      { name: 'Blouse', columns: ['Size', 'Bust (in)', 'Under-bust (in)', 'Shoulder (in)', 'Length (in)'], is_default: false, rows: 6 },
    ]);
    const { rows: links } = await admin.query(
      `select c.slug, g.name as guide from public.categories c left join public.size_guides g on g.id = c.size_guide_id
       where c.slug in ('saris', 'kanjivaram', 'blouses', 'classic-blouses', 'occasion-blouses') order by c.slug`);
    expect(Object.fromEntries(links.map((l) => [l.slug, l.guide]))).toEqual({
      blouses: 'Blouse', 'classic-blouses': 'Blouse', kanjivaram: null, 'occasion-blouses': 'Blouse', saris: null,
    });
    // Rows are anonymous-readable (product pages) and keep the column order.
    const rows = await as<{ cells: string[] }>(anon,
      `select r.cells from public.size_guide_rows r join public.size_guides g on g.id = r.size_guide_id
       where g.name = 'Blouse' order by r.sort_order limit 1`);
    expect(rows[0].cells).toEqual(['32', '32', '27', '13.5', '14']);
  });

  it('saves a guide with its rows and lets the number of columns change in one save', async () => {
    const name = `Rings ${uid()}`;
    const id = await rpc<string>(editor, 'admin_save_size_guide', {
      p_guide: { name, intro: 'Measure an existing ring.', columns: [' Size ', 'Diameter (mm)'], rows: [{ cells: ['6', ' 16.5 '] }, { cells: ['7', '17.3'] }] },
    });
    let { rows } = await admin.query(`select g.columns, array_agg(r.cells order by r.sort_order) as cells
      from public.size_guides g join public.size_guide_rows r on r.size_guide_id = g.id where g.id = $1 group by g.columns`, [id]);
    expect(rows[0].columns).toEqual(['Size', 'Diameter (mm)']);
    expect(rows[0].cells).toEqual([['6', '16.5'], ['7', '17.3']]);

    await rpc(editor, 'admin_save_size_guide', {
      p_guide: { id, name, columns: ['Size', 'Diameter (mm)', 'Circumference (mm)'], rows: [{ cells: ['6', '16.5', ''] }] },
    });
    ({ rows } = await admin.query(`select cells from public.size_guide_rows where size_guide_id = $1`, [id]));
    expect(rows.map((r) => r.cells)).toEqual([['6', '16.5', '']]);

    // Saving without "rows" keeps the rows; "columns" may be omitted on update.
    await rpc(editor, 'admin_save_size_guide', { p_guide: { id, name: `${name} (edited)` } });
    ({ rows } = await admin.query(`select count(*)::int as n from public.size_guide_rows where size_guide_id = $1`, [id]));
    expect(rows[0].n).toBe(1);
  });

  it('validates columns and cells', async () => {
    const name = `Invalid ${uid()}`;
    await expectDbError(rpc(editor, 'admin_save_size_guide', { p_guide: { name, rows: [] } }), { hint: 'size_guide_columns_invalid' });
    await expectDbError(
      rpc(editor, 'admin_save_size_guide', { p_guide: { name, columns: Array.from({ length: 9 }, (_, i) => `C${i}`) } }),
      { hint: 'size_guide_columns_invalid' },
    );
    await expectDbError(rpc(editor, 'admin_save_size_guide', { p_guide: { name, columns: ['Size', ''] } }), { hint: 'size_guide_columns_invalid' });
    await expectDbError(
      rpc(editor, 'admin_save_size_guide', { p_guide: { name, columns: ['Size', 'Chest'], rows: [{ cells: ['S', '36', '27'] }] } }),
      { hint: 'size_guide_cells_mismatch', message: /Row 1 has 3 cell/ },
    );
    await expectDbError(
      rpc(editor, 'admin_save_size_guide', { p_guide: { name, columns: ['Size', 'Chest'], rows: [{ cells: [' ', '36'] }] } }),
      { hint: 'size_guide_rows_invalid' },
    );
    await expectDbError(
      rpc(editor, 'admin_save_size_guide', { p_guide: { name, columns: ['Size', 'Chest'], rows: [{ cells: ['S', 'x'.repeat(31)] }] } }),
      { hint: 'size_guide_rows_invalid' },
    );
    const { rows } = await admin.query(`select count(*)::int as n from public.size_guides where name = $1`, [name]);
    expect(rows[0].n).toBe(0);
  });

  it('enforces one cell per column on direct table writes too', async () => {
    const id = await rpc<string>(editor, 'admin_save_size_guide', {
      p_guide: { name: `Direct ${uid()}`, columns: ['Size', 'Chest'], rows: [{ cells: ['S', '36'] }] },
    });
    await expectDbError(
      as(editor, `insert into public.size_guide_rows (size_guide_id, cells) values ($1, $2)`, [id, ['M']]),
      { code: '23514', hint: 'size_guide_cells_mismatch' },
    );
    await expectDbError(
      as(editor, `update public.size_guides set columns = $2 where id = $1`, [id, ['Size', 'Chest', 'Length']]),
      { code: '23514', hint: 'size_guide_cells_mismatch' },
    );
    // Same number of columns (renaming a header) is fine.
    await as(editor, `update public.size_guides set columns = $2 where id = $1`, [id, ['Size', 'Chest (in)']]);
  });

  it('is limited to catalogue staff', async () => {
    const guide = { p_guide: { name: `Nope ${uid()}`, columns: ['Size'] } };
    await expectDbError(rpc(anon, 'admin_save_size_guide', guide), { code: '42501' });
    await expectDbError(rpc(customer, 'admin_save_size_guide', guide), { code: '42501' });
    await expectDbError(rpc(support, 'admin_save_size_guide', guide), { code: '42501' });
  });
});

describe('category tree', () => {
  it('allows at most two levels', async () => {
    const { dept, children } = await createTree(1);
    await expectDbError(
      as(editor, `insert into public.categories (parent_id, name, slug) values ($1, 'Too deep', $2)`, [children[0].id, `deep-${uid()}`]),
      { code: '23514', hint: 'category_too_deep' },
    );
    // A department with sub-categories cannot be moved under another department.
    const other = await createTree(0);
    await expectDbError(
      as(editor, `update public.categories set parent_id = $1 where id = $2`, [other.dept.id, dept.id]),
      { code: '23514', hint: 'category_too_deep' },
    );
    // A category without children can become a sub-category, and back.
    await as(editor, `update public.categories set parent_id = $1 where id = $2`, [dept.id, other.dept.id]);
    await as(editor, `update public.categories set parent_id = null where id = $1`, [other.dept.id]);
  });

  it('seeds the departments and sub-categories of the sample catalogue', async () => {
    const { rows } = await admin.query(
      `select p.slug as parent, c.slug from public.categories c left join public.categories p on p.id = c.parent_id
       where c.slug in ('saris', 'blouses', 'kanjivaram', 'banarasi', 'cotton-linen', 'classic-blouses', 'occasion-blouses') order by c.slug`);
    expect(Object.fromEntries(rows.map((r) => [r.slug, r.parent]))).toEqual({
      banarasi: 'saris', blouses: null, 'classic-blouses': 'blouses', 'cotton-linen': 'saris', kanjivaram: 'saris', 'occasion-blouses': 'blouses', saris: null,
    });
    const { rows: depts } = await admin.query(`select slug from public.categories where parent_id is null and slug not like 'dept-%' order by sort_order`);
    expect(depts.map((d) => d.slug)).toEqual(['saris', 'blouses']);
  });
});

describe('department listings include sub-categories', () => {
  it('search_products and category_and_descendants cover the whole department', async () => {
    const { dept, children } = await createTree(2);
    const a = await createProduct({ categorySlug: children[0].slug, options: ['S/M', 'M/L'], stock: [2, 3], variantLabel: 'Strap size' });
    const b = await createProduct({ categorySlug: children[1].slug, options: ['Standard'], stock: [4] });
    const c = await createProduct({ categorySlug: dept.slug, options: ['Standard'], stock: [1], gender: 'kids' });
    await createProduct({ categorySlug: children[1].slug, options: ['Standard'], stock: [1], status: 'draft' });

    const inDept = await as<{ slug: string; total_count: string }>(anon,
      `select slug, total_count from public.search_products(p_category_slug => $1, p_limit => 60)`, [dept.slug]);
    expect(inDept.map((r) => r.slug).sort()).toEqual([a.slug, b.slug, c.slug].sort());
    expect(Number(inDept[0].total_count)).toBe(3);

    const inSub = await as<{ slug: string }>(anon, `select slug from public.search_products(p_category_slug => $1)`, [children[0].slug]);
    expect(inSub.map((r) => r.slug)).toEqual([a.slug]);

    const ids = await as<{ id: string }>(anon, `select public.category_and_descendants($1) as id`, [dept.slug]);
    expect(ids.map((r) => r.id).sort()).toEqual([dept.id, ...children.map((ch) => ch.id)].sort());

    // Hidden sub-categories are not part of the public department listing.
    await admin.query(`update public.categories set is_visible = false where id = $1`, [children[1].id]);
    const visible = await as<{ slug: string }>(anon, `select slug from public.search_products(p_category_slug => $1, p_limit => 60)`, [dept.slug]);
    expect(visible.map((r) => r.slug).sort()).toEqual([a.slug, c.slug].sort());
  });

  it('works for the seeded sari and blouse departments', async () => {
    const saris = await as<{ slug: string; category_slug: string }>(anon,
      `select slug, category_slug from public.search_products(p_category_slug => 'saris', p_limit => 60)`);
    expect(saris.map((r) => r.slug)).toEqual(expect.arrayContaining(['meenakshi-temple-border-kanjivaram', 'jangla-banarasi-katan', 'kota-doria-checks']));
    expect(saris.map((r) => r.slug)).not.toContain('classic-silk-elbow-sleeve-blouse');
    expect(new Set(saris.map((r) => r.category_slug))).toEqual(new Set(['kanjivaram', 'banarasi', 'chanderi-maheshwari', 'cotton-linen', 'organza-tissue']));
    const banarasi = await as<{ slug: string }>(anon, `select slug from public.search_products(p_category_slug => 'banarasi', p_limit => 60)`);
    expect(banarasi.map((r) => r.slug).sort()).toEqual(['jangla-banarasi-katan', 'kadhua-butidar-banarasi', 'tanchoi-banarasi']);
  });

  it('catalog_facets is scoped to the department and leaves out "Standard"', async () => {
    const { dept, children } = await createTree(2);
    await createProduct({ categorySlug: children[0].slug, options: ['S/M', 'M/L'], stock: [2, 3], variantLabel: 'Strap size', price: 300000, salePrice: 250000 });
    await createProduct({ categorySlug: children[1].slug, options: ['Standard'], stock: [4], price: 99900, gender: 'kids' });

    type Facets = { sizes: string[]; variant_labels: string[]; genders: string[]; colors: string[]; price_min: number; price_max: number;
      categories: { slug: string; parent_slug: string | null; product_count: number }[] };
    const facets = await rpc<Facets>(anon, 'catalog_facets', { p_category_slug: dept.slug });
    expect(facets.sizes).toEqual(['S/M', 'M/L']);
    expect(facets.variant_labels).toEqual(['Strap size']);
    expect(facets.genders.sort()).toEqual(['kids', 'unisex']);
    expect(facets.colors).toEqual(['black']);
    expect([facets.price_min, facets.price_max]).toEqual([99900, 250000]);
    expect(facets.categories.map((c) => [c.slug, c.parent_slug, c.product_count])).toEqual([
      [children[0].slug, dept.slug, 1], [children[1].slug, dept.slug, 1],
    ]);

    const noOptions = await rpc<Facets>(anon, 'catalog_facets', { p_category_slug: children[1].slug });
    expect(noOptions.sizes).toEqual([]);
    expect(noOptions.variant_labels).toEqual([]);

    const everything = await rpc<Facets>(anon, 'catalog_facets', {});
    expect(everything.sizes).toEqual(expect.arrayContaining(['32', '42', 'S/M']));
    expect(everything.sizes).not.toContain('Standard');
  });

  it('orders option values naturally across products', async () => {
    // Seeded blouses run 32-42 (size_sort is a per-product position); numeric sizes sort as numbers.
    const blouses = await rpc<{ sizes: string[]; variant_labels: string[] }>(anon, 'catalog_facets', { p_category_slug: 'blouses' });
    expect(blouses.sizes.filter((s) => /^\d+$/.test(s))).toEqual(['32', '34', '36', '38', '40', '42']);
    expect(blouses.variant_labels).toContain('Size');
    // Saris have no options.
    const saris = await rpc<{ sizes: string[] }>(anon, 'catalog_facets', { p_category_slug: 'saris' });
    expect(saris.sizes).toEqual([]);
  });

  it('a coupon for a department applies to products in its sub-categories', async () => {
    const { dept, children } = await createTree(1);
    const code = `DEPT${uid().toUpperCase()}`;
    const { rows: [coupon] } = await admin.query(
      `insert into public.coupons (code, discount_type, value, scope, is_active) values ($1, 'percentage', 10, 'categories', true) returning id`, [code]);
    await admin.query(`insert into public.coupon_categories (coupon_id, category_id) values ($1, $2)`, [coupon.id, dept.id]);
    const inside = await createProduct({ categorySlug: children[0].slug, price: 100000, stock: [5] });
    const outside = await createProduct({ categorySlug: 'audio', price: 100000, stock: [5], options: ['Standard'] });

    const ok = await rpc<{ discount: number; coupon: { error_code: string | null } }>(service, 'compute_quote', {
      p_lines: [{ variant_id: inside.variants[0].variantId, quantity: 1 }, { variant_id: outside.variants[0].variantId, quantity: 1 }],
      p_coupon_code: code,
    });
    expect(ok.coupon.error_code).toBeNull();
    expect(ok.discount).toBe(10000);
    const no = await rpc<{ coupon: { error_code: string } }>(service, 'compute_quote', {
      p_lines: [{ variant_id: outside.variants[0].variantId, quantity: 1 }], p_coupon_code: code,
    });
    expect(no.coupon.error_code).toBe('not_applicable');
  });
});

describe('store settings', () => {
  it('uses the Anvaya brand defaults', async () => {
    const rows = await as<Record<string, string>>(anon,
      `select store_name, tagline, seo_title, seo_title_template, order_number_prefix, accent_color from public.store_settings`);
    expect(rows[0]).toEqual({
      store_name: 'Anvaya',
      tagline: 'Handwoven saris, and blouses cut to wear with them.',
      seo_title: 'Anvaya — Handwoven saris and blouses',
      seo_title_template: '%s · Anvaya',
      order_number_prefix: 'ANV',
      accent_color: '#7A2232',
    });
  });
});

describe('publishing without photos', () => {
  /** A draft product with one colour and one active size, and no media. */
  async function photoless(tags: string[]) {
    const tag = uid();
    const client = await admin.connect();
    try {
      const { rows: [p] } = await client.query(
        `insert into public.products (name, slug, sku, price, status, category_id, tags)
         values ($1, $2, $3, 150000, 'draft', (select id from public.categories where slug = 'classic-blouses'), $4) returning id`,
        [`Drawn ${tag}`, `drawn-${tag}`, `DRAWN-${tag}`.toUpperCase(), tags],
      );
      const { rows: [c] } = await client.query(
        `insert into public.product_colors (product_id, name, hex, family) values ($1, 'Navy', '#1d2a4a', 'blue') returning id`, [p.id]);
      await client.query(
        `insert into public.product_variants (product_id, color_id, size_label, size_sort, sku) values ($1, $2, 'UK 8', 1, $3)`,
        [p.id, c.id, `DRAWN-${tag}-8`.toUpperCase()]);
      return p.id as string;
    } finally {
      client.release();
    }
  }

  it('allows a drawn shoe (shoe type tag + colour) to be published without an image', async () => {
    const id = await photoless(['runner']);
    await admin.query(`update public.products set status = 'published' where id = $1`, [id]);
    const { rows } = await admin.query(`select status from public.products where id = $1`, [id]);
    expect(rows[0].status).toBe('published');
  });

  it('still requires an image for every other product', async () => {
    const id = await photoless(['gift']);
    await expectDbError(admin.query(`update public.products set status = 'published' where id = $1`, [id]), { hint: 'publish_requires_image' });
  });
});
