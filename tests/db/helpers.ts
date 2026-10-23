// Helpers for database integration tests. They run against the local stack
// (scripts/local-stack/stack.sh) and exercise the real migrations, RLS
// policies and SQL functions exactly as PostgREST would: each call runs in a
// transaction that assumes the caller's role and JWT claims.
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';

export const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54322/auren_test';
export const AUTHENTICATOR_URL = DB_URL.replace('postgres://postgres@', 'postgres://authenticator:postgres@');

export const admin = new pg.Pool({ connectionString: DB_URL, max: 10 });
const apiPool = new pg.Pool({ connectionString: AUTHENTICATOR_URL, max: 30 });

export type Role = 'anon' | 'authenticated' | 'service_role';
export interface Actor {
  role: Role;
  sub?: string;
  email?: string;
  aal?: 'aal1' | 'aal2';
}

export const anon: Actor = { role: 'anon' };
export const service: Actor = { role: 'service_role' };

/** Runs `sql` as the given actor inside its own transaction (like a PostgREST request). */
export async function as<T = Record<string, unknown>>(actor: Actor, sql: string, params: unknown[] = []): Promise<T[]> {
  const client = await apiPool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${actor.role}`);
    const claims = { role: actor.role, sub: actor.sub, email: actor.email, aal: actor.aal ?? 'aal1' };
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    const result = await client.query(sql, params);
    await client.query('commit');
    return result.rows as T[];
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function rpc<T = unknown>(actor: Actor, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const names = Object.keys(args);
  const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as result`;
  // node-pg turns JS arrays into Postgres arrays; jsonb parameters need JSON text.
  const values = names.map((n) => (n === 'p_lines' && Array.isArray(args[n]) ? JSON.stringify(args[n]) : args[n]));
  const rows = await as<{ result: T }>(actor, sql, values);
  return rows[0]?.result as T;
}

export async function createUser(email = `user-${randomUUID().slice(0, 8)}@example.com`): Promise<Actor> {
  const id = randomUUID();
  await admin.query(
    `insert into auth.users (id, instance_id, email, aud, role, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
     values ($1, '00000000-0000-0000-0000-000000000000', $2, 'authenticated', 'authenticated', '{"full_name":"Test User"}', '{}', now(), now(), now())`,
    [id, email],
  );
  return { role: 'authenticated', sub: id, email, aal: 'aal1' };
}

export async function createStaff(role: 'owner' | 'admin' | 'editor' | 'support'): Promise<Actor> {
  const user = await createUser(`${role}-${randomUUID().slice(0, 8)}@example.com`);
  await admin.query(`insert into public.staff_members (user_id, role) values ($1, $2)`, [user.sub, role]);
  return user;
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export interface TestVariant {
  productId: string;
  variantId: string;
  sku: string;
}

/**
 * Creates a published product with one colour and one variant per entry in
 * `stock`. Option values default to blouse sizes ("32", "34", ...); pass
 * `options` (same length as `stock`) and `variantLabel` for other products.
 */
export async function createProduct(opts: {
  price?: number;
  salePrice?: number | null;
  stock?: number[];
  options?: string[];
  variantLabel?: string;
  gender?: 'men' | 'women' | 'kids' | 'unisex';
  categorySlug?: string;
  status?: 'draft' | 'published';
} = {}): Promise<{ productId: string; slug: string; variants: TestVariant[] }> {
  const client = await admin.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('app.inventory_write', 'on', true)`);
    const slug = `test-shoe-${randomUUID().slice(0, 8)}`;
    const sku = slug.toUpperCase();
    const { rows: [asset] } = await client.query(
      `insert into public.media_assets (kind, external_url, mime_type, label) values ('image', '/images/test.webp', 'image/webp', 'test') returning id`,
    );
    const { rows: [product] } = await client.query(
      `insert into public.products (name, slug, sku, price, sale_price, status, category_id, variant_label, gender)
       values ($1, $2, $3, $4, $5, 'draft', (select id from public.categories where slug = $6), $7, $8) returning id`,
      [`Test Shoe ${slug.slice(-4)}`, slug, sku, opts.price ?? 250000, opts.salePrice ?? null, opts.categorySlug ?? 'classic-blouses',
        opts.variantLabel ?? 'Size', opts.gender ?? 'unisex'],
    );
    await client.query(`insert into public.product_media (product_id, asset_id, is_cover) values ($1, $2, true)`, [product.id, asset.id]);
    const { rows: [color] } = await client.query(
      `insert into public.product_colors (product_id, name, hex, family) values ($1, 'Black', '#111111', 'black') returning id`,
      [product.id],
    );
    const variants: TestVariant[] = [];
    for (const [i, stock] of (opts.stock ?? [5]).entries()) {
      const vsku = `${sku}-${i}`;
      const { rows: [v] } = await client.query(
        `insert into public.product_variants (product_id, color_id, size_label, size_sort, sku, stock_on_hand) values ($1, $2, $3, $4, $5, $6) returning id`,
        [product.id, color.id, opts.options?.[i] ?? `${32 + 2 * i}`, i + 1, vsku, stock],
      );
      variants.push({ productId: product.id, variantId: v.id, sku: vsku });
    }
    if ((opts.status ?? 'published') === 'published') {
      await client.query(`update public.products set status = 'published' where id = $1`, [product.id]);
    }
    await client.query('commit');
    return { productId: product.id, slug, variants };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function variantStock(variantId: string) {
  const { rows } = await admin.query(`select stock_on_hand, stock_reserved, available from public.product_variants where id = $1`, [variantId]);
  return rows[0] as { stock_on_hand: number; stock_reserved: number; available: number };
}

export interface PlacedOrder {
  order_id: string;
  order_number: string;
  total: number;
  token: string;
  tokenHash: string;
  replayed: boolean;
}

export function orderPayload(lines: { variant_id: string; quantity: number }[], extra: Record<string, unknown> = {}) {
  const token = randomUUID() + randomUUID();
  return {
    token,
    payload: {
      id: randomUUID(),
      idempotency_key: randomUUID(),
      access_token_hash: sha256(token),
      email: 'buyer@example.com',
      phone: '+91 98765 43210',
      customer_name: 'Asha Buyer',
      payment_method: 'upi_manual',
      shipping_method: 'standard',
      shipping_address: { line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', postal_code: '560001' },
      lines,
      ...extra,
    },
  };
}

export async function placeOrder(lines: { variant_id: string; quantity: number }[], extra: Record<string, unknown> = {}): Promise<PlacedOrder> {
  const { token, payload } = orderPayload(lines, extra);
  const result = await rpc<Omit<PlacedOrder, 'token' | 'tokenHash'>>(service, 'place_order', { p_order: payload });
  return { ...result, token, tokenHash: payload.access_token_hash };
}

export async function submitProof(order: PlacedOrder, opts: { utr?: string | null; file?: boolean; sha?: string } = {}) {
  const file = opts.file ?? true;
  return rpc<{ proof_id: string; replayed: boolean; payment_status: string; late?: boolean }>(service, 'submit_payment_proof', {
    p_order_number: order.order_number,
    p_token_hash: order.tokenHash,
    p_user_id: null,
    p_utr: opts.utr === undefined ? `${Math.floor(100000000000 + Math.random() * 899999999999)}` : opts.utr,
    p_paid_at: new Date().toISOString(),
    p_payer_upi_id: null,
    p_note: null,
    p_file_path: file ? `orders/${order.order_id}/${randomUUID()}.png` : null,
    p_file_mime: file ? 'image/png' : null,
    p_file_size: file ? 1234 : null,
    p_file_sha256: file ? (opts.sha ?? sha256(randomUUID())) : null,
    p_ip_hash: null,
  });
}

export async function orderRow(id: string) {
  const { rows } = await admin.query(`select * from public.orders where id = $1`, [id]);
  return rows[0];
}

export async function expectDbError(promise: Promise<unknown>, match: { code?: string; hint?: string; message?: RegExp }) {
  try {
    await promise;
  } catch (err) {
    const e = err as { code?: string; hint?: string; message: string };
    if (match.code && e.code !== match.code) throw new Error(`Expected code ${match.code}, got ${e.code}: ${e.message}`);
    if (match.hint && e.hint !== match.hint) throw new Error(`Expected hint ${match.hint}, got ${e.hint}: ${e.message}`);
    if (match.message && !match.message.test(e.message)) throw new Error(`Unexpected message: ${e.message}`);
    return e;
  }
  throw new Error('Expected the database call to fail, but it succeeded');
}
