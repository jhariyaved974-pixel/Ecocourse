import { expect, test } from '@playwright/test';
import { addToCart, db, topUpStock } from './support';


test('browses the catalogue and opens a product page @mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible();
  await page.goto('/shop');
  await expect(page.getByRole('link', { name: /Velocity Runner X/ }).first()).toBeVisible();
  await page.goto('/products/velocity-runner-x');
  await expect(page.getByRole('heading', { level: 1, name: 'Velocity Runner X' })).toBeVisible();
  // Server-rendered product data and SEO metadata come from the database.
  await expect(page).toHaveTitle(/Velocity Runner X/);
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical).toMatch(/\/products\/velocity-runner-x$/);
  const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
  const product = jsonLd.map((t) => JSON.parse(t)).find((d) => d['@type'] === 'Product');
  expect(product?.offers?.priceCurrency).toBe('INR');
  expect(Number(product?.offers?.price)).toBeGreaterThan(0);
});

test('requires a size and refuses sold-out sizes', async ({ page }) => {
  await page.goto('/products/velocity-runner-x');
  await page.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio', { name: 'Ember' }).click();
  // UK 6 in Ember has no stock in the seed data.
  const soldOut = page.getByRole('radiogroup', { name: 'Size' }).getByRole('radio', { name: /^6\b/ });
  await expect(soldOut).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText('Please select a size.')).toBeVisible();
  await soldOut.click({ force: true });
  await expect(soldOut).toHaveAttribute('aria-checked', 'false');
});

test('adds to cart and updates quantities using server prices @mobile', async ({ page }) => {
  await topUpStock('STM-VRX-GLACIE-8', 30);
  await addToCart(page, 'velocity-runner-x', { color: 'Glacier', size: '8' });
  await expect(page.getByRole('dialog', { name: /Your cart/ })).toBeVisible();
  await page.goto('/cart');
  const summary = page.getByRole('complementary', { name: 'Order summary' });
  await expect(summary.getByText('Subtotal (1 item)')).toBeVisible();
  const first = (await summary.locator('dd').first().textContent())!;
  await page.getByRole('button', { name: 'Increase quantity' }).first().click();
  await expect(summary.getByText('Subtotal (2 items)')).toBeVisible();
  const second = (await summary.locator('dd').first().textContent())!;
  const n = (s: string) => Number(s.replace(/[^\d.]/g, ''));
  expect(n(second)).toBeCloseTo(n(first) * 2, 0);
  await page.getByRole('button', { name: /^Remove/ }).first().click();
  await expect(page.getByText('Your cart is empty')).toBeVisible();
});

test('ignores prices tampered with in the browser cart', async ({ page }) => {
  const { rows } = await db.query<{ id: string; product_id: string; price: number; sale_price: number | null }>(
    `select v.id, v.product_id, p.price, p.sale_price from product_variants v join products p on p.id = v.product_id where v.sku = 'STM-VRX-GLACIE-8'`,
  );
  const v = rows[0];
  await page.goto('/');
  await page.evaluate((variant) => {
    localStorage.setItem('auren.cart.v1', JSON.stringify([{ variantId: variant.id, productId: variant.product_id, slug: 'velocity-runner-x', name: 'Velocity Runner X', image: null, colorName: 'Glacier', sizeLabel: 'UK 8', unitPrice: 100, quantity: 1 }]));
  }, v);
  await page.goto('/cart');
  const summary = page.getByRole('complementary', { name: 'Order summary' });
  const real = (v.sale_price ?? v.price) / 100;
  await expect(summary.getByText(`₹${real.toLocaleString('en-IN')}`).first()).toBeVisible();
  await expect(summary.getByText('₹1', { exact: true })).toHaveCount(0);
  // The display hint is corrected from the server quote.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('auren.cart.v1') ?? '[]')[0]?.unitPrice)).toBe(v.sale_price ?? v.price);
});

test('validates coupons on the server', async ({ page }) => {
  await addToCart(page, 'velocity-runner-x', { color: 'Glacier', size: '8' });
  await page.goto('/cart');
  const summary = page.getByRole('complementary', { name: 'Order summary' });
  await summary.getByLabel('Coupon code').fill('NOT-A-REAL-CODE');
  await summary.getByRole('button', { name: 'Apply' }).click();
  await expect(summary.getByText('This coupon code is not valid.')).toBeVisible();
  await summary.getByRole('button', { name: 'Remove coupon' }).click();
  await summary.getByLabel('Coupon code').fill('WELCOME10');
  await summary.getByRole('button', { name: 'Apply' }).click();
  await expect(summary.getByText(/Discount \(WELCOME10\)/)).toBeVisible();
});
