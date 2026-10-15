import { expect, test } from '@playwright/test';
import { addToCart, db, ensureUser, OWNER_EMAIL, placeUpiOrder, signInContext, topUpStock, variantStock } from './support';

test.beforeEach(async ({ context }) => {
  const owner = await ensureUser(OWNER_EMAIL, { staffRole: 'owner' });
  await signInContext(context, owner.email, owner.password);
});

test('inventory changes are recorded and cannot drop below reserved stock', async ({ page, browser }) => {
  const sku = 'AU-VRX-GLACIE-10';
  await topUpStock(sku, 30);
  // A guest's unpaid order reserves one unit.
  const shopper = await browser.newContext();
  const shop = await shopper.newPage();
  await addToCart(shop, 'velocity-runner-x', { color: 'Glacier', size: '10' });
  await placeUpiOrder(shop, { email: `e2e+inv${Date.now()}@example.com` });
  await shopper.close();
  const before = await variantStock(sku);
  expect(before.stock_reserved).toBeGreaterThan(0);

  await page.goto(`/admin/inventory?q=${sku}`);
  const row = page.locator('tr', { hasText: sku });
  await row.getByRole('button', { name: /Change stock/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Set exact count' }).click();
  await dialog.getByLabel('New on-hand count').fill('0');
  await expect(dialog.getByText(/cannot go below the \d+ unit\(s\) reserved/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save stock' })).toBeDisabled();

  await dialog.getByRole('radio', { name: 'Add / remove units' }).click();
  await dialog.getByLabel(/Change \(use a minus sign/).fill('5');
  await dialog.getByLabel('Note (optional)').fill('E2E restock');
  await dialog.getByRole('button', { name: 'Save stock' }).click();
  await expect(page.getByText('Stock updated').first()).toBeVisible();
  const after = await variantStock(sku);
  expect(after.stock_on_hand).toBe(before.stock_on_hand + 5);
  const { rows } = await db.query("select reason, quantity_delta, note from inventory_movements m join product_variants v on v.id = m.variant_id where v.sku = $1 order by m.created_at desc limit 1", [sku]);
  expect(rows[0]).toMatchObject({ reason: 'restock', quantity_delta: 5, note: 'E2E restock' });
});

test('a coupon created in the admin is validated and applied in the cart', async ({ page, browser }) => {
  const code = `E2E${Date.now().toString().slice(-6)}`;
  await page.goto('/admin/coupons');
  await page.getByRole('button', { name: 'New coupon' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Code').fill(code);
  await dialog.getByLabel('Percent off (1–90)').fill('95');
  await dialog.getByRole('button', { name: 'Create coupon' }).click();
  await expect(dialog.getByText('Percentage must be a whole number from 1 to 90.')).toBeVisible();
  await dialog.getByLabel('Percent off (1–90)').fill('15');
  await dialog.getByRole('button', { name: 'Create coupon' }).click();
  await expect(page.getByText('Coupon created').first()).toBeVisible();
  await expect(page.locator('tr', { hasText: code })).toBeVisible();

  const shopper = await browser.newContext();
  const shop = await shopper.newPage();
  await addToCart(shop, 'cloudstep-everyday', { color: 'Oat', size: '5' });
  await shop.goto('/cart');
  const summary = shop.getByRole('complementary', { name: 'Order summary' });
  await summary.getByLabel('Coupon code').fill(code);
  await summary.getByRole('button', { name: 'Apply' }).click();
  await expect(summary.getByText(`Discount (${code})`)).toBeVisible();
  await shopper.close();

  // Unused coupons can be deleted.
  const row = page.locator('tr', { hasText: code });
  await row.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('tr', { hasText: code })).toHaveCount(0);
});

test('approving a review publishes it on the product page', async ({ page, browser }) => {
  const customer = await ensureUser(`e2e-rev-${Date.now()}@example.com`);
  const body = `Great grip on wet roads and very light. (${Date.now()})`;
  const { rows } = await db.query(
    `insert into reviews (product_id, user_id, author_name, rating, title, body, status)
     select id, $1, 'Kabir', 5, 'Light and grippy', $2, 'pending' from products where slug = 'aeroflex-sport' returning id`,
    [customer.id, body],
  );
  const id = rows[0].id;
  try {
    const visitor = await browser.newContext();
    const pub = await visitor.newPage();
    await pub.goto('/products/aeroflex-sport');
    await expect(pub.getByText(body)).toHaveCount(0);

    await page.goto('/admin/reviews');
    const card = page.locator('li', { hasText: body });
    await card.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Review approved and published').first()).toBeVisible();

    await pub.goto('/products/aeroflex-sport');
    await expect(pub.getByText(body)).toBeVisible();
    await visitor.close();
  } finally {
    await db.query('delete from reviews where id = $1', [id]);
  }
});
