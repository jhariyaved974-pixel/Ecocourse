import { expect, test, type Browser } from '@playwright/test';
import { addToCart, db, ensureUser, orderByNumber, OWNER_EMAIL, placeUpiOrder, PNG_1PX, randomUtr, signInContext, topUpStock, variantStock } from './support';

const SKU = 'AU-CSE-OAT-6';

test.beforeAll(async () => {
  await topUpStock(SKU, 30);
});

async function adminPage(browser: Browser) {
  const owner = await ensureUser(OWNER_EMAIL, { staffRole: 'owner' });
  const context = await browser.newContext();
  await signInContext(context, owner.email, owner.password);
  return { context, page: await context.newPage() };
}

test('an approved UPI payment confirms the order once, deducts stock once and is audited', async ({ page, browser }) => {
  const start = await variantStock(SKU);
  await addToCart(page, 'cloudstep-everyday', { color: 'Oat', size: '6' });
  const orderNumber = await placeUpiOrder(page, { email: `e2e+approve${Date.now()}@example.com` });
  const utr = randomUtr();
  await page.setInputFiles('#proof-file', { name: 'payment.png', mimeType: 'image/png', buffer: PNG_1PX });
  await page.fill('#utr', utr);
  await page.locator('input[name="confirm"]').check();
  await page.getByRole('button', { name: 'Submit payment details' }).click();
  await expect(page.getByRole('heading', { name: 'Awaiting Payment Verification' })).toBeVisible();
  const order = await orderByNumber(orderNumber);

  const admin = await adminPage(browser);
  await admin.page.goto('/admin/payments');
  await expect(admin.page.getByText(orderNumber).first()).toBeVisible();
  await admin.page.goto(`/admin/payments/${order.id}`);
  const approve = admin.page.getByRole('button', { name: /Verify & mark paid/ });
  // Approval is impossible until the admin attests to the bank credit.
  await expect(approve).toBeDisabled();
  await admin.page.getByRole('checkbox', { name: /I personally checked/ }).click();
  await admin.page.fill('#verified-amount', ((order.total - 100) / 100).toFixed(2));
  await approve.click();
  await expect(admin.page.getByText(/does not match|mismatch/i).first()).toBeVisible();
  expect((await orderByNumber(orderNumber)).payment_status).not.toBe('verified_paid');
  await admin.page.fill('#verified-amount', (order.total / 100).toFixed(2));
  await expect(admin.page.locator('#bank-reference')).toHaveValue(utr);
  await approve.click();
  await expect(admin.page.getByText('Payment verified').first()).toBeVisible();

  const paid = await orderByNumber(orderNumber);
  expect(paid.payment_status).toBe('verified_paid');
  expect(paid.order_status).toBe('confirmed');
  expect(paid.payment_reference).toBe(utr);
  const end = await variantStock(SKU);
  expect(end.stock_on_hand).toBe(start.stock_on_hand - 1);
  expect(end.stock_reserved).toBe(start.stock_reserved);
  const sales = await db.query("select count(*)::int as n from inventory_movements where order_id = $1 and reason = 'sale'", [order.id]);
  expect(sales.rows[0].n).toBe(1);
  const audit = await db.query("select actor_email from audit_logs where action = 'payment.approved' and entity_id = $1", [order.id]);
  expect(audit.rows).toHaveLength(1);
  expect(audit.rows[0].actor_email).toBe(OWNER_EMAIL);

  // Admin order view and the customer's order page agree.
  await admin.page.goto(`/admin/orders/${order.id}`);
  await expect(admin.page.getByText('Confirmed').first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('Payment verified — order confirmed')).toBeVisible();
  await admin.context.close();
});

test('a rejected payment stays unpaid and the customer is asked to resubmit', async ({ page, browser }) => {
  await addToCart(page, 'cloudstep-everyday', { color: 'Oat', size: '6' });
  const orderNumber = await placeUpiOrder(page, { email: `e2e+reject${Date.now()}@example.com` });
  await page.setInputFiles('#proof-file', { name: 'payment.png', mimeType: 'image/png', buffer: PNG_1PX });
  await page.fill('#utr', randomUtr());
  await page.locator('input[name="confirm"]').check();
  await page.getByRole('button', { name: 'Submit payment details' }).click();
  await expect(page.getByRole('heading', { name: 'Awaiting Payment Verification' })).toBeVisible();
  const order = await orderByNumber(orderNumber);

  const admin = await adminPage(browser);
  await admin.page.goto(`/admin/payments/${order.id}`);
  await admin.page.getByRole('button', { name: /Request new proof/ }).first().click();
  await admin.page.getByLabel('Reason (visible to the customer)').fill('The screenshot does not show the UTR. Please upload a clearer one.');
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Request new proof' }).click();
  await expect(admin.page.getByText('New proof requested').first()).toBeVisible();

  const after = await orderByNumber(orderNumber);
  expect(after.payment_status).toBe('rejected');
  expect(after.order_status).toBe('pending_payment');
  expect(after.paid_at).toBeNull();
  await page.reload();
  await expect(page.getByText(/could not verify your payment yet/).first()).toBeVisible();
  await expect(page.getByText('The screenshot does not show the UTR.', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit payment details' })).toBeVisible();
  await admin.context.close();
});
