import { expect, test } from '@playwright/test';
import { addToCart, db, topUpStock } from './support';


test('browses the catalogue and opens a product page @mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible();
  await page.goto('/shop');
  await expect(page.getByRole('link', { name: /Classic Silk Blouse, Elbow Sleeve/ }).first()).toBeVisible();
  await page.goto('/products/classic-silk-elbow-sleeve-blouse');
  await expect(page.getByRole('heading', { level: 1, name: 'Classic Silk Blouse, Elbow Sleeve' })).toBeVisible();
  // Server-rendered product data and SEO metadata come from the database.
  await expect(page).toHaveTitle(/Classic Silk Blouse, Elbow Sleeve/);
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical).toMatch(/\/products\/classic-silk-elbow-sleeve-blouse$/);
  const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
  const product = jsonLd.map((t) => JSON.parse(t)).find((d) => d['@type'] === 'Product');
  expect(product?.offers?.priceCurrency).toBe('INR');
  expect(Number(product?.offers?.price)).toBeGreaterThan(0);
});

test('requires a size and refuses sold-out sizes', async ({ page }) => {
  await page.goto('/products/classic-silk-elbow-sleeve-blouse');
  await page.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio', { name: 'Emerald' }).click();
  // Size 42 in Emerald has no stock in the seed data.
  const soldOut = page.getByRole('radiogroup', { name: 'Size' }).getByRole('radio', { name: /^42\b/ });
  await expect(soldOut).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText('Please select a size.')).toBeVisible();
  await soldOut.click({ force: true });
  await expect(soldOut).toHaveAttribute('aria-checked', 'false');
});

test('adds to cart and updates quantities using server prices @mobile', async ({ page }) => {
  await topUpStock('ANV-CSE-ANTIQU-36', 30);
  await addToCart(page, 'classic-silk-elbow-sleeve-blouse', { color: 'Antique Gold', size: '36' });
  await expect(page.getByRole('dialog', { name: /Your bag/ })).toBeVisible();
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
    `select v.id, v.product_id, p.price, p.sale_price from product_variants v join products p on p.id = v.product_id where v.sku = 'ANV-CSE-ANTIQU-36'`,
  );
  const v = rows[0];
  await page.goto('/');
  await page.evaluate((variant) => {
    localStorage.setItem('auren.cart.v1', JSON.stringify([{ variantId: variant.id, productId: variant.product_id, slug: 'classic-silk-elbow-sleeve-blouse', name: 'Classic Silk Blouse, Elbow Sleeve', image: null, colorName: 'Antique Gold', sizeLabel: '36', unitPrice: 100, quantity: 1 }]));
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
  await addToCart(page, 'classic-silk-elbow-sleeve-blouse', { color: 'Antique Gold', size: '36' });
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
