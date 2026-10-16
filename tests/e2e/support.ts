// Shared helpers for the end-to-end tests.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createServerClient } from '@supabase/ssr';
import type { BrowserContext, Page } from '@playwright/test';

export const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54322/postgres';
export const db = new pg.Pool({ connectionString: DB_URL, max: 4, allowExitOnIdle: true });

function env(): Record<string, string> {
  const file = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  return Object.fromEntries(
    file
      .split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}
export const ENV = env();
export const SUPABASE_URL = ENV.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@auren.test';
export const MERCHANT_UPI_ID = 'sadiajay4311@ybl';

/** Creates (or reuses) a confirmed auth user with a random password via the local auth admin API. */
export async function ensureUser(email: string, opts: { staffRole?: 'owner' | 'admin' | 'editor' | 'support' } = {}) {
  const password = `E2e-${randomBytes(12).toString('base64url')}1`;
  const service = ENV.SUPABASE_SECRET_KEY ?? ENV.SUPABASE_SERVICE_ROLE_KEY;
  const existing = await db.query<{ id: string }>('select id from auth.users where lower(email) = lower($1)', [email]);
  let id = existing.rows[0]?.id;
  if (id) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
      method: 'PUT',
      headers: { apikey: service, Authorization: `Bearer ${service}`, 'content-type': 'application/json' },
      body: JSON.stringify({ password, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`could not reset password for ${email}: ${res.status}`);
  } else {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: service, Authorization: `Bearer ${service}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: 'E2E Test' } }),
    });
    if (!res.ok) throw new Error(`could not create ${email}: ${res.status} ${await res.text()}`);
    id = ((await res.json()) as { id: string }).id;
  }
  if (opts.staffRole) {
    await db.query(
      `insert into public.staff_members (user_id, role, is_active) values ($1, $2, true)
       on conflict (user_id) do update set role = excluded.role, is_active = true`,
      [id, opts.staffRole],
    );
  }
  return { id, email, password };
}

/** Signs in directly against the auth API and adds the SSR session cookie to the browser context. */
export async function signInContext(context: BrowserContext, email: string, password: string) {
  const jar = new Map<string, string>();
  const supabase = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach((c) => jar.set(c.name, c.value)) },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  await new Promise((r) => setTimeout(r, 50));
  const base = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3000');
  await context.addCookies(
    [...jar].filter(([, v]) => v).map(([name, value]) => ({ name, value, domain: base.hostname, path: '/', sameSite: 'Lax' as const })),
  );
}

/** Ensures a variant has at least `min` units available (test setup only; bypasses the inventory API on purpose). */
export async function topUpStock(sku: string, min = 20) {
  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.inventory_write', 'on', true)");
    await client.query(
      'update public.product_variants set stock_on_hand = greatest(stock_on_hand, stock_reserved + $2) where sku = $1',
      [sku, min],
    );
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function variantStock(sku: string) {
  const { rows } = await db.query<{ stock_on_hand: number; stock_reserved: number }>(
    'select stock_on_hand, stock_reserved from public.product_variants where sku = $1',
    [sku],
  );
  return rows[0];
}

export async function orderByNumber(orderNumber: string) {
  const { rows } = await db.query('select * from public.orders where order_number = $1', [orderNumber]);
  return rows[0];
}

/** Adds one unit of a product in the given colour/size to the cart from its product page. */
export async function addToCart(page: Page, slug: string, opts: { color?: string; size: string }) {
  await page.goto(`/products/${slug}`);
  if (opts.color) await page.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio', { name: opts.color }).click();
  await page.getByRole('radiogroup', { name: 'Size' }).getByRole('radio', { name: new RegExp(`^${opts.size}\\b`) }).click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
}

export interface CheckoutDetails {
  email: string;
  name?: string;
}

/** Fills the checkout form and places a manual UPI order. Returns the order number. */
export async function placeUpiOrder(page: Page, details: CheckoutDetails): Promise<string> {
  await page.goto('/checkout');
  await page.getByRole('button', { name: /Place order/ }).waitFor();
  const email = page.locator('#email');
  if (await email.isEditable()) await email.fill(details.email);
  await page.fill('#fullName', details.name ?? 'Asha Verma');
  await page.fill('#phone', '9876543210');
  await page.fill('#line1', '12 MG Road');
  await page.fill('#city', 'Bengaluru');
  await page.fill('#postalCode', '560001');
  await page.selectOption('#state', 'Karnataka');
  await page.locator('aside input[type=checkbox]').check();
  // Wait for the server quote so the expected total is current.
  await page.getByRole('button', { name: /Place order · ₹/ }).waitFor();
  await page.getByRole('button', { name: /Place order/ }).click();
  await page.waitForURL(/\/orders\/[A-Z]{2,4}-\d{6}-[0-9A-Z]{5}$/, { timeout: 60_000 });
  return decodeURIComponent(new URL(page.url()).pathname.split('/').pop()!);
}

/** A tiny valid PNG used as a payment screenshot. */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export function randomUtr() {
  return `4${String(Math.floor(Math.random() * 1e11)).padStart(11, '0')}`;
}
