// Half prepaid (advance at checkout, balance online before dispatch) as staff
// see it: verify the advance against the expected amount, pack the order while
// the balance is outstanding, verify the balance, then ship. See docs/PAYMENTS.md.
//
// The shopper places the order through the real checkout and submits both
// proofs from the real order page (tests/e2e/support.ts helpers); every staff
// step goes through the admin screens.
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  addToCart,
  db,
  ensureUser,
  orderByNumber,
  placeHalfPrepaidUpiOrder,
  randomUtr,
  signInContext,
  submitProofOnOrderPage,
  topUpStock,
} from './support';
import { halfPrepaidAdvance } from '../../src/lib/admin/payment-plans';
import { formatMoney, paiseToRupeeString } from '../../src/lib/utils';

const SKU = 'STM-CSE-OAT-7';
// A dedicated owner: other specs (and their global setup) reset the shared
// OWNER_EMAIL password, which signs that account out mid-test.
const PLANS_OWNER_EMAIL = 'e2e-owner-plans@auren.test';

/** Runs one SQL statement as an authenticated PostgREST user inside its own transaction and returns `result`. */
async function asStaff<T>(userId: string, email: string, sql: string, params: unknown[]): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'authenticated', sub: userId, email, aal: 'aal1' })]);
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

async function adminPage(browser: Browser) {
  const owner = await ensureUser(PLANS_OWNER_EMAIL, { staffRole: 'owner' });
  const context = await browser.newContext();
  await signInContext(context, owner.email, owner.password);
  return { owner, context, page: await context.newPage() };
}

/**
 * Adds one unit from the product page and waits until the cart holds it. On a
 * cold dev server the first click can land before the page has hydrated, so the
 * click is retried only while the cart is still empty.
 */
async function addOneToCart(page: Page, slug: string, opts: { color?: string; size: string }) {
  await addToCart(page, slug, opts);
  // Adding opens the cart drawer (which hides the header from assistive tech); either signal means the item is in.
  const added = page
    .getByRole('dialog')
    .getByText(/^Your cart \([1-9]\d*\)$/)
    .or(page.getByRole('button', { name: /^Open cart, [1-9]/ }));
  let first = true;
  await expect(async () => {
    if (!first && !(await added.count())) await page.getByRole('button', { name: 'Add to cart' }).click();
    first = false;
    await expect(added.first()).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
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

test('staff verify the advance, pack the order, verify the balance and only then ship', async ({ page, browser }) => {
  // Shopper: a half-prepaid manual UPI order through the checkout, then the advance proof.
  await addOneToCart(page, 'cloudstep-everyday', { color: 'Oat', size: '7' });
  const orderNumber = await placeHalfPrepaidUpiOrder(page, { email: `e2e+halfadmin${Date.now()}@example.com` });
  const placed = await orderByNumber(orderNumber);
  expect(placed).toMatchObject({ payment_plan: 'half_prepaid', payment_method: 'upi_manual', amount_paid: 0, payment_status: 'unpaid' });
  const order = { id: placed.id as string, total: placed.total as number, advance: placed.advance_amount as number, balance: placed.total - placed.advance_amount };
  // The database computed the advance (exact percentage rounded up to a whole rupee).
  expect(order.advance).toBe(halfPrepaidAdvance(order.total, placed.advance_percent));
  expect(order.balance).toBeGreaterThan(0);

  const advanceUtr = randomUtr();
  await submitProofOnOrderPage(page, advanceUtr);
  const advanceProofs = await db.query('select purpose, expected_amount, utr from public.payment_proofs where order_id = $1', [order.id]);
  expect(advanceProofs.rows).toEqual([{ purpose: 'advance', expected_amount: order.advance, utr: advanceUtr }]);

  const admin = await adminPage(browser);
  const staff = admin.page;

  // Queue: the proof's purpose, the amount to find (the advance, not the total) and the plan.
  await staff.goto('/admin/payments');
  const row = staff.getByRole('row').filter({ hasText: orderNumber });
  await expect(row).toBeVisible();
  await expect(row.getByText('Half prepaid')).toBeVisible();
  await expect(row.getByText('Advance', { exact: true })).toBeVisible();
  await expect(row.getByText(formatMoney(order.advance), { exact: true })).toBeVisible();
  await expect(row.getByText(`Paid ${formatMoney(0)} of ${formatMoney(order.total)}`)).toBeVisible();

  // Review: the approve form is pre-filled with the advance and asks staff to confirm it in the bank statement.
  await staff.goto(`/admin/payments/${order.id}`);
  await expect(staff.getByTestId('expected-credit')).toHaveText(formatMoney(order.advance));
  await expect(staff.getByText(`Confirm a credit of exactly ${formatMoney(order.advance)} (advance)`)).toBeVisible();
  await expect(staff.getByText('Confirm this exact amount in your bank statement', { exact: false }).first()).toBeVisible();
  const approve = staff.getByRole('button', { name: /Verify & mark paid/ });
  await expect(approve).toBeDisabled();
  await expect(staff.locator('#verified-amount')).toHaveValue(paiseToRupeeString(order.advance));
  await expect(staff.locator('#bank-reference')).toHaveValue(advanceUtr);
  await staff.getByRole('checkbox', { name: /I personally checked/ }).click();

  // A different amount (the full total) is refused by the database, which names the expected advance.
  await staff.fill('#verified-amount', paiseToRupeeString(order.total));
  await approve.click();
  await expect(staff.getByText(`The amount does not match the expected advance of ${formatMoney(order.advance)}`).first()).toBeVisible();
  expect(await orderByNumber(orderNumber)).toMatchObject({ amount_paid: 0, order_status: 'payment_review', payment_status: 'proof_submitted' });

  await staff.fill('#verified-amount', paiseToRupeeString(order.advance));
  await approve.click();
  await expect(staff.getByText(`Advance verified. The order is confirmed; the balance of ${formatMoney(order.balance)} is due before dispatch.`).first()).toBeVisible();
  const afterAdvance = await orderByNumber(orderNumber);
  expect(afterAdvance).toMatchObject({ payment_status: 'partially_paid', order_status: 'confirmed', amount_paid: order.advance, payment_reference: advanceUtr });
  expect(afterAdvance.balance_due_at).not.toBeNull();
  expect(await count("select count(*)::int as n from public.audit_logs where action = 'payment.advance_approved' and entity_id = $1", [order.id])).toBe(1);
  expect(await count("select count(*)::int as n from public.inventory_movements where order_id = $1 and reason = 'sale'", [order.id])).toBe(1);
  await expect(staff.getByText('Advance received — waiting for the balance')).toBeVisible();

  // The "Balance due" queue tab lists it with the balance amount.
  await staff.goto('/admin/payments?tab=balance');
  const dueRow = staff.getByRole('row').filter({ hasText: orderNumber });
  // The amount badge and the due-date column both say "Balance due".
  await expect(dueRow.getByText('Balance due', { exact: true }).first()).toBeVisible();
  await expect(dueRow.getByText(/^\d{1,2} \w{3} \d{4}$/)).toBeVisible();
  await expect(dueRow.getByText(formatMoney(order.balance), { exact: true })).toBeVisible();

  // Order page: plan and amounts; the cancel dialog refunds the advance received.
  await staff.goto(`/admin/orders/${order.id}`);
  await expect(staff.getByText('Advance received — balance due').first()).toBeVisible();
  await expect(staff.getByText('Balance outstanding').first()).toBeVisible();
  await staff.getByRole('button', { name: 'Cancel order' }).click();
  const cancelDialog = staff.getByRole('dialog');
  await expect(cancelDialog.getByText(`${formatMoney(order.advance)} was received for this order: a refund of ${formatMoney(order.advance)} becomes pending.`)).toBeVisible();
  await cancelDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(cancelDialog).toBeHidden();

  // Processing is allowed, Shipped is locked with the reason.
  const lockedShip = staff.locator('#fulfil-status option[value="locked-shipped"]');
  await expect(lockedShip).toBeDisabled();
  await expect(staff.getByText(`Shipped and Delivered unlock once the balance of ${formatMoney(order.balance)} is verified`)).toBeVisible();
  await expect(staff.locator('#fulfil-status')).toHaveValue('processing');
  await staff.getByRole('button', { name: 'Mark as processing' }).click();
  await expect(staff.getByText('Order marked as processing.').first()).toBeVisible();
  expect((await orderByNumber(orderNumber)).order_status).toBe('processing');
  await expect(staff.getByRole('button', { name: 'Mark as shipped' })).toBeDisabled();

  // The database refuses to ship while the balance is unpaid, whatever the UI shows.
  await expect(
    asStaff(admin.owner.id, PLANS_OWNER_EMAIL, "select public.update_order_fulfillment(p_order_id => $1, p_status => 'shipped', p_tracking_number => 'TRK12345') as result", [order.id]),
  ).rejects.toMatchObject({ hint: 'balance_not_paid' });

  // Orders list and dashboard show the balance to collect.
  await staff.goto(`/admin/orders?q=${orderNumber}`);
  await expect(staff.getByRole('row').filter({ hasText: orderNumber }).getByText(`Balance ${formatMoney(order.balance)}`)).toBeVisible();
  await staff.goto('/admin/orders?payment=partially_paid');
  await expect(staff.getByRole('row').filter({ hasText: orderNumber })).toBeVisible();
  await staff.goto('/admin');
  await expect(staff.getByText('Balance outstanding').first()).toBeVisible();
  await expect(staff.getByText('Balance due', { exact: true })).toBeVisible();

  // Shopper pays the balance from the order page; the order keeps its status.
  await page.reload();
  const balanceUtr = randomUtr();
  await submitProofOnOrderPage(page, balanceUtr);
  const balanceProofs = await db.query("select expected_amount, utr from public.payment_proofs where order_id = $1 and purpose = 'balance'", [order.id]);
  expect(balanceProofs.rows).toEqual([{ expected_amount: order.balance, utr: balanceUtr }]);
  expect(await orderByNumber(orderNumber)).toMatchObject({ order_status: 'processing', payment_status: 'proof_submitted', amount_paid: order.advance });

  await staff.goto('/admin/payments');
  const balanceRow = staff.getByRole('row').filter({ hasText: orderNumber });
  await expect(balanceRow.getByText('Balance', { exact: true })).toBeVisible();
  await expect(balanceRow.getByText(formatMoney(order.balance), { exact: true })).toBeVisible();

  await staff.goto(`/admin/payments/${order.id}`);
  await expect(staff.getByTestId('expected-credit')).toHaveText(formatMoney(order.balance));
  await expect(staff.locator('#verified-amount')).toHaveValue(paiseToRupeeString(order.balance));
  await expect(staff.locator('#bank-reference')).toHaveValue(balanceUtr);
  await staff.getByRole('checkbox', { name: /I personally checked/ }).click();

  // The advance UTR cannot pay for the balance too.
  await staff.fill('#bank-reference', advanceUtr);
  await staff.getByRole('button', { name: /Verify & mark paid/ }).click();
  await expect(staff.getByText(/already verified the advance of this order/).first()).toBeVisible();
  expect((await orderByNumber(orderNumber)).payment_status).toBe('proof_submitted');

  await staff.fill('#bank-reference', balanceUtr);
  await staff.getByRole('button', { name: /Verify & mark paid/ }).click();
  await expect(staff.getByText('Balance verified. The order is fully paid and ready to ship.').first()).toBeVisible();
  const paid = await orderByNumber(orderNumber);
  expect(paid).toMatchObject({ payment_status: 'verified_paid', order_status: 'processing', amount_paid: order.total, balance_reference: balanceUtr });
  expect(await count("select count(*)::int as n from public.audit_logs where action = 'payment.balance_approved' and entity_id = $1", [order.id])).toBe(1);
  // Stock was deducted once, when the advance was verified.
  expect(await count("select count(*)::int as n from public.inventory_movements where order_id = $1 and reason = 'sale'", [order.id])).toBe(1);

  // Fully paid: Shipped is available now.
  await staff.goto(`/admin/orders/${order.id}`);
  await expect(staff.locator('#fulfil-status option[value="locked-shipped"]')).toHaveCount(0);
  await staff.locator('#fulfil-status').selectOption('shipped');
  await staff.fill('#fulfil-number', 'STMTRACK1234');
  await staff.getByRole('button', { name: 'Mark as shipped' }).click();
  await expect(staff.getByText('Order marked as shipped.').first()).toBeVisible();
  expect(await orderByNumber(orderNumber)).toMatchObject({ order_status: 'shipped', tracking_number: 'STMTRACK1234' });

  // Nothing is left to pay on the shopper's order page.
  await page.reload();
  await expect(page.locator('a[href^="upi://pay"]')).toHaveCount(0);
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
