import { expect, test } from '@playwright/test';
import { addToCart, db, MERCHANT_UPI_ID, orderByNumber, placeUpiOrder, PNG_1PX, randomUtr, SUPABASE_URL, topUpStock, variantStock } from './support';

const SKU = 'AU-CSE-OAT-5';

test.beforeAll(async () => {
  await topUpStock(SKU, 30);
});

test('places a UPI order showing the configured UPI ID, exact amount and QR @mobile', async ({ page }) => {
  const before = await variantStock(SKU);
  await addToCart(page, 'cloudstep-everyday', { color: 'Oat', size: '5' });
  const orderNumber = await placeUpiOrder(page, { email: `e2e+${Date.now()}@example.com` });
  const order = await orderByNumber(orderNumber);
  expect(order.payment_method).toBe('upi_manual');
  expect(order.payment_status).toBe('unpaid');
  expect(order.order_status).toBe('pending_payment');
  expect(order.reservation_expires_at).not.toBeNull();
  // Stock is reserved, not yet deducted.
  const after = await variantStock(SKU);
  expect(after.stock_reserved).toBe(before.stock_reserved + 1);
  expect(after.stock_on_hand).toBe(before.stock_on_hand);

  await expect(page.getByRole('heading', { name: 'Pay with UPI' })).toBeVisible();
  await expect(page.getByText(MERCHANT_UPI_ID, { exact: true }).first()).toBeVisible();
  const href = (await page.locator('a[href^="upi://pay"]').getAttribute('href'))!;
  const params = new URLSearchParams(href.slice('upi://pay?'.length));
  expect(params.get('pa')).toBe(MERCHANT_UPI_ID);
  expect(params.get('am')).toBe((order.total / 100).toFixed(2));
  expect(params.get('cu')).toBe('INR');
  expect(params.get('tn')).toContain(orderNumber);
  const qr = page.getByRole('img', { name: /UPI QR code/ });
  await expect(qr).toBeVisible();
  // The QR encodes the same payment link (it is generated server-side from the settings and the order).
  expect(await qr.getAttribute('alt')).toContain(MERCHANT_UPI_ID);
  await expect(page.getByText(/does not complete the payment/)).toBeVisible();
});

test('accepts a payment proof only from the order owner and stores it privately', async ({ page, browser }) => {
  await addToCart(page, 'cloudstep-everyday', { color: 'Oat', size: '5' });
  const orderNumber = await placeUpiOrder(page, { email: `e2e+${Date.now()}@example.com` });

  // Another visitor (no order cookie, not signed in) can neither see the order nor upload a proof.
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(`/orders/${orderNumber}`);
  await expect(strangerPage.getByRole('heading', { name: 'Order not found' })).toBeVisible();
  const forged = await strangerPage.request.post(`/api/orders/${orderNumber}/payment-proof`, {
    headers: { origin: new URL(page.url()).origin },
    multipart: { utr: randomUtr(), paidAt: new Date().toISOString(), payerUpiId: '', note: '', confirm: 'on', file: { name: 'p.png', mimeType: 'image/png', buffer: PNG_1PX } },
  });
  expect(forged.status()).toBe(404);
  await stranger.close();

  // Cross-site requests are refused even with the right cookie.
  const crossSite = await page.request.post(`/api/orders/${orderNumber}/payment-proof`, {
    headers: { origin: 'https://evil.example' },
    multipart: { utr: randomUtr(), paidAt: new Date().toISOString(), confirm: 'on' },
  });
  expect(crossSite.status()).toBe(403);

  // A disguised file (text renamed to .png) is rejected by content sniffing.
  await page.setInputFiles('#proof-file', { name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from('<html><script>alert(1)</script></html>') });
  await page.fill('#utr', randomUtr());
  await page.locator('input[name="confirm"]').check();
  await page.getByRole('button', { name: 'Submit payment details' }).click();
  await expect(page.getByText(/Upload a JPG, PNG or WebP screenshot, or a PDF receipt/).first()).toBeVisible();

  // The real screenshot is accepted.
  const utr = randomUtr();
  await page.setInputFiles('#proof-file', { name: 'payment.png', mimeType: 'image/png', buffer: PNG_1PX });
  await page.fill('#utr', utr);
  await page.getByRole('button', { name: 'Submit payment details' }).click();
  await expect(page.getByRole('heading', { name: 'Awaiting Payment Verification' })).toBeVisible();

  const order = await orderByNumber(orderNumber);
  expect(order.payment_status).toBe('proof_submitted');
  expect(order.order_status).toBe('payment_review');
  const { rows } = await db.query('select * from payment_proofs where order_id = $1', [order.id]);
  expect(rows).toHaveLength(1);
  expect(rows[0].utr).toBe(utr);
  expect(rows[0].file_path).toMatch(new RegExp(`^orders/${order.id}/[0-9a-f-]{36}\\.jpg$`));
  expect(rows[0].file_mime).toBe('image/jpeg');
  // The private bucket never serves the file publicly.
  const pub = await page.request.get(`${SUPABASE_URL}/storage/v1/object/public/payment-proofs/${rows[0].file_path}`);
  expect(pub.ok()).toBe(false);
});

test('a double-clicked checkout creates exactly one order', async ({ page }) => {
  const email = `e2e+double${Date.now()}@example.com`;
  await addToCart(page, 'cloudstep-everyday', { color: 'Oat', size: '5' });
  await page.goto('/checkout');
  await page.fill('#email', email);
  await page.fill('#fullName', 'Ravi Kumar');
  await page.fill('#phone', '9876543210');
  await page.fill('#line1', '4 Park Street');
  await page.fill('#city', 'Kolkata');
  await page.fill('#postalCode', '700016');
  await page.selectOption('#state', 'West Bengal');
  await page.locator('aside input[type=checkbox]').check();
  const place = page.getByRole('button', { name: /Place order · ₹/ });
  await place.waitFor();
  await place.dblclick();
  await page.waitForURL(/\/orders\//, { timeout: 60_000 });
  const { rows } = await db.query('select count(*)::int as n from orders where email = $1', [email]);
  expect(rows[0].n).toBe(1);
});
