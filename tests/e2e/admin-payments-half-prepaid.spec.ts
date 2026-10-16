// Half prepaid (advance at checkout, balance online before dispatch) as staff
// see it: verify the advance against the expected amount, pack the order while
// the balance is outstanding, verify the balance, then ship. See docs/PAYMENTS.md.
//
// The shopper side (checkout and the order page) is covered by the storefront
// specs; here the order and its proofs are created exactly as the server does
// it (place_order / submit_payment_proof with the service role) so this spec
// only depends on the admin screens.
import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type Browser } from '@playwright/test';
import { db, ensureUser, ENV, orderByNumber, PNG_1PX, randomUtr, signInContext, SUPABASE_URL, topUpStock } from './support';
import { halfPrepaidAdvance } from '../../src/lib/admin/payment-plans';
import { formatMoney, paiseToRupeeString } from '../../src/lib/utils';

const SKU = 'STM-CSE-OAT-7';
// A dedicated owner: other specs (and their global setup) reset the shared
// OWNER_EMAIL password, which signs that account out mid-test.
const PLANS_OWNER_EMAIL = 'e2e-owner-plans@auren.test';
const SERVICE_KEY = ENV.SUPABASE_SECRET_KEY ?? ENV.SUPABASE_SERVICE_ROLE_KEY;
const sha256 = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');

/** Runs one SQL statement as a PostgREST role inside its own transaction and returns `result`. */
async function asRole<T>(role: 'service_role' | 'authenticated', claims: Record<string, unknown>, sql: string, params: unknown[]): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role, ...claims })]);
    const { rows } = await client.query(sql, params);
    await client.query('commit');
    return rows[0]?.result as T;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

interface PlacedOrder {
  id: string;
  orderNumber: string;
  total: number;
  advance: number;
  balance: number;
  tokenHash: string;
}

/** Places a half-prepaid manual UPI order the way the checkout action does (service role, amounts computed by the database). */
async function placeHalfPrepaidOrder(email: string): Promise<PlacedOrder> {
  const { rows } = await db.query<{ id: string }>('select id from public.product_variants where sku = $1', [SKU]);
  const token = randomUUID() + randomUUID();
  const tokenHash = sha256(token);
  const result = await asRole<{ order_id: string; order_number: string; total: number; payment_plan: string; advance_amount: number; balance_amount: number }>(
    'service_role',
    {},
    'select public.place_order(p_order => $1::jsonb) as result',
    [
      JSON.stringify({
        id: randomUUID(),
        idempotency_key: randomUUID(),
        access_token_hash: tokenHash,
        user_id: '',
        email,
        phone: '+91 98765 43210',
        customer_name: 'Asha Verma',
        shipping_address: { line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', postal_code: '560001' },
        lines: [{ variant_id: rows[0].id, quantity: 1 }],
        shipping_method: 'standard',
        payment_method: 'upi_manual',
        payment_plan: 'half_prepaid',
        // Client-supplied amounts are ignored by the database.
        advance_amount: 100,
      }),
    ],
  );
  expect(result.payment_plan).toBe('half_prepaid');
  return {
    id: result.order_id,
    orderNumber: result.order_number,
    total: result.total,
    advance: result.advance_amount,
    balance: result.balance_amount,
    tokenHash,
  };
}

/** Uploads a screenshot to private storage and submits a proof like the payment-proof route does. */
async function submitProof(order: PlacedOrder, utr: string) {
  const path = `orders/${order.id}/${randomUUID()}.png`;
  const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/payment-proofs/${path}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'image/png' },
    body: new Uint8Array(PNG_1PX),
  });
  expect(upload.ok, `proof upload failed: ${upload.status}`).toBeTruthy();
  return asRole<{ proof_id: string; payment_status: string; purpose: string; expected_amount: number }>(
    'service_role',
    {},
    `select public.submit_payment_proof(
       p_order_number => $1, p_token_hash => $2, p_user_id => null, p_utr => $3, p_paid_at => now(),
       p_payer_upi_id => null, p_note => null, p_file_path => $4, p_file_mime => 'image/png',
       p_file_size => $5, p_file_sha256 => $6, p_ip_hash => null) as result`,
    [order.orderNumber, order.tokenHash, utr, path, PNG_1PX.length, sha256(PNG_1PX)],
  );
}

async function adminPage(browser: Browser) {
  const owner = await ensureUser(PLANS_OWNER_EMAIL, { staffRole: 'owner' });
  const context = await browser.newContext();
  await signInContext(context, owner.email, owner.password);
  return { owner, context, page: await context.newPage() };
}

async function count(sql: string, params: unknown[]) {
  const { rows } = await db.query<{ n: number }>(sql, params);
  return rows[0].n;
}

test.beforeAll(async () => {
  await topUpStock(SKU, 20);
});

test('the settings preview rounds the advance exactly like the database', async () => {
  const cases: [number, number][] = [
    [149_900, 50],
    [99_999, 50],
    [10_001, 50],
    [100_000, 50],
    [99_999, 10],
    [149_900, 33],
    [100, 90],
    [123_457, 77],
  ];
  for (const [total, pct] of cases) {
    const { rows } = await db.query<{ a: number }>('select public.half_prepaid_advance($1, $2) as a', [total, pct]);
    expect(halfPrepaidAdvance(total, pct), `${total} at ${pct}%`).toBe(rows[0].a);
  }
});

test('staff verify the advance, pack the order, verify the balance and only then ship', async ({ browser }) => {
  const order = await placeHalfPrepaidOrder(`e2e+half${Date.now()}@example.com`);
  expect(order.advance).toBe(halfPrepaidAdvance(order.total, 50));
  expect(order.balance).toBe(order.total - order.advance);
  const advanceUtr = randomUtr();
  const advanceProof = await submitProof(order, advanceUtr);
  expect(advanceProof).toMatchObject({ purpose: 'advance', expected_amount: order.advance, payment_status: 'proof_submitted' });

  const admin = await adminPage(browser);
  const { page } = admin;

  // Queue: the proof's purpose, the amount to find and the plan.
  await page.goto('/admin/payments');
  const row = page.getByRole('row').filter({ hasText: order.orderNumber });
  await expect(row).toBeVisible();
  await expect(row.getByText('Half prepaid')).toBeVisible();
  await expect(row.getByText('Advance', { exact: true })).toBeVisible();
  await expect(row.getByText(formatMoney(order.advance), { exact: true })).toBeVisible();

  // Review: the expected amount is the advance, not the order total.
  await page.goto(`/admin/payments/${order.id}`);
  await expect(page.getByTestId('expected-credit')).toHaveText(formatMoney(order.advance));
  await expect(page.getByText(`Confirm a credit of exactly ${formatMoney(order.advance)} (advance)`)).toBeVisible();
  const approve = page.getByRole('button', { name: /Verify & mark paid/ });
  await expect(approve).toBeDisabled();
  await expect(page.locator('#verified-amount')).toHaveValue(paiseToRupeeString(order.advance));
  await expect(page.locator('#bank-reference')).toHaveValue(advanceUtr);
  await page.getByRole('checkbox', { name: /I personally checked/ }).click();

  // A different amount (the full total) is refused by the database.
  await page.fill('#verified-amount', paiseToRupeeString(order.total));
  await approve.click();
  await expect(page.getByText(`The amount does not match the expected advance of ${formatMoney(order.advance)}`).first()).toBeVisible();
  expect(await orderByNumber(order.orderNumber)).toMatchObject({ amount_paid: 0, order_status: 'payment_review', payment_status: 'proof_submitted' });

  await page.fill('#verified-amount', paiseToRupeeString(order.advance));
  await approve.click();
  await expect(page.getByText(/Advance verified\. The order is confirmed; the balance of .+ is due before dispatch/).first()).toBeVisible();
  const afterAdvance = await orderByNumber(order.orderNumber);
  expect(afterAdvance).toMatchObject({
    payment_status: 'partially_paid',
    order_status: 'confirmed',
    amount_paid: order.advance,
    payment_reference: advanceUtr,
  });
  expect(afterAdvance.balance_due_at).not.toBeNull();
  expect(await count("select count(*)::int as n from public.audit_logs where action = 'payment.advance_approved' and entity_id = $1", [order.id])).toBe(1);
  expect(await count("select count(*)::int as n from public.inventory_movements where order_id = $1 and reason = 'sale'", [order.id])).toBe(1);
  await expect(page.getByText('Advance received — waiting for the balance')).toBeVisible();

  // Order page: plan and amounts; Processing is allowed, Shipped is locked.
  await page.goto(`/admin/orders/${order.id}`);
  await expect(page.getByText('Advance received — balance due').first()).toBeVisible();
  await expect(page.getByText('Balance outstanding').first()).toBeVisible();
  const lockedShip = page.locator('#fulfil-status option[value="locked-shipped"]');
  await expect(lockedShip).toBeDisabled();
  await expect(page.getByText(`Shipped and Delivered unlock once the balance of ${formatMoney(order.balance)} is verified`)).toBeVisible();
  await expect(page.locator('#fulfil-status')).toHaveValue('processing');
  await page.getByRole('button', { name: 'Mark as processing' }).click();
  await expect(page.getByText('Order marked as processing.').first()).toBeVisible();
  expect((await orderByNumber(order.orderNumber)).order_status).toBe('processing');
  await expect(page.getByRole('button', { name: 'Mark as shipped' })).toBeDisabled();

  // The database refuses to ship while the balance is unpaid, whatever the UI shows.
  await expect(
    asRole('authenticated', { sub: admin.owner.id, email: PLANS_OWNER_EMAIL, aal: 'aal1' }, "select public.update_order_fulfillment(p_order_id => $1, p_status => 'shipped', p_tracking_number => 'TRK12345') as result", [order.id]),
  ).rejects.toMatchObject({ hint: 'balance_not_paid' });

  // Orders list and dashboard show the balance to collect.
  await page.goto(`/admin/orders?q=${order.orderNumber}`);
  await expect(page.getByRole('row').filter({ hasText: order.orderNumber }).getByText(`Balance ${formatMoney(order.balance)}`)).toBeVisible();
  await page.goto('/admin');
  await expect(page.getByText('Balance outstanding').first()).toBeVisible();
  await expect(page.getByText('Balance due', { exact: true })).toBeVisible();

  // The shopper pays the balance and uploads its proof; the order keeps its status.
  const balanceUtr = randomUtr();
  const balanceProof = await submitProof(order, balanceUtr);
  expect(balanceProof).toMatchObject({ purpose: 'balance', expected_amount: order.balance, payment_status: 'proof_submitted' });
  expect(await orderByNumber(order.orderNumber)).toMatchObject({ order_status: 'processing', payment_status: 'proof_submitted' });

  await page.goto('/admin/payments');
  const balanceRow = page.getByRole('row').filter({ hasText: order.orderNumber });
  await expect(balanceRow.getByText('Balance', { exact: true })).toBeVisible();
  await expect(balanceRow.getByText(formatMoney(order.balance), { exact: true })).toBeVisible();

  await page.goto(`/admin/payments/${order.id}`);
  await expect(page.getByTestId('expected-credit')).toHaveText(formatMoney(order.balance));
  await expect(page.locator('#verified-amount')).toHaveValue(paiseToRupeeString(order.balance));
  await expect(page.locator('#bank-reference')).toHaveValue(balanceUtr);
  await page.getByRole('checkbox', { name: /I personally checked/ }).click();

  // The advance UTR cannot pay for the balance too.
  await page.fill('#bank-reference', advanceUtr);
  await page.getByRole('button', { name: /Verify & mark paid/ }).click();
  await expect(page.getByText(/already verified the advance of this order/).first()).toBeVisible();
  expect((await orderByNumber(order.orderNumber)).payment_status).toBe('proof_submitted');

  await page.fill('#bank-reference', balanceUtr);
  await page.getByRole('button', { name: /Verify & mark paid/ }).click();
  await expect(page.getByText('Balance verified. The order is fully paid and ready to ship.').first()).toBeVisible();
  const paid = await orderByNumber(order.orderNumber);
  expect(paid).toMatchObject({ payment_status: 'verified_paid', order_status: 'processing', amount_paid: order.total, balance_reference: balanceUtr });
  expect(await count("select count(*)::int as n from public.audit_logs where action = 'payment.balance_approved' and entity_id = $1", [order.id])).toBe(1);
  expect(await count("select count(*)::int as n from public.inventory_movements where order_id = $1 and reason = 'sale'", [order.id])).toBe(1);

  // Fully paid: Shipped is available now.
  await page.goto(`/admin/orders/${order.id}`);
  await expect(page.locator('#fulfil-status option[value="locked-shipped"]')).toHaveCount(0);
  await page.locator('#fulfil-status').selectOption('shipped');
  await page.fill('#fulfil-number', 'STMTRACK1234');
  await page.getByRole('button', { name: 'Mark as shipped' }).click();
  await expect(page.getByText('Order marked as shipped.').first()).toBeVisible();
  expect(await orderByNumber(order.orderNumber)).toMatchObject({ order_status: 'shipped', tracking_number: 'STMTRACK1234' });
  await admin.context.close();
});

test('payment settings validate the plan fields and preview the split live', async ({ browser }) => {
  const admin = await adminPage(browser);
  const { page } = admin;
  const before = (await db.query('select advance_percent, balance_due_days from public.payment_settings')).rows[0];
  await page.goto('/admin/settings/payments');
  const example = page.getByTestId('plan-example');
  await expect(page.getByLabel('Half prepaid advance (%)')).toHaveValue(String(before.advance_percent));

  await page.getByLabel('Half prepaid advance (%)').fill('50');
  await expect(example).toContainText('On a ₹1,499 order: ₹750 now, ₹749 before dispatch');
  await page.getByLabel('Half prepaid advance (%)').fill('40');
  await expect(example).toContainText('On a ₹1,499 order: ₹600 now, ₹899 before dispatch');
  await page.getByLabel('Balance due within (days)').fill('10');
  await expect(example).toContainText('within 10 days');

  // Out-of-range values are refused and nothing is saved.
  const staffEmail = page.getByLabel('Staff alert email');
  if ((await staffEmail.isVisible()) && !(await staffEmail.inputValue())) await staffEmail.fill('alerts@example.com');
  await page.getByLabel('Half prepaid advance (%)').fill('95');
  await page.getByLabel('Balance due within (days)').fill('0');
  await expect(example).toContainText('Enter a whole number from 10 to 90');
  await page.getByRole('button', { name: 'Save payment settings' }).click();
  await expect(page.getByText('Half prepaid advance: at most 90.')).toBeVisible();
  await expect(page.getByText('Balance due within: at least 1.')).toBeVisible();
  const after = (await db.query('select advance_percent, balance_due_days from public.payment_settings')).rows[0];
  expect(after).toEqual(before);
  await admin.context.close();
});
