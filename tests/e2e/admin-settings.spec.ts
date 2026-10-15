import { expect, test, type Page } from '@playwright/test';
import { addToCart, ensureUser, MERCHANT_UPI_ID, OWNER_EMAIL, placeUpiOrder, signInContext, topUpStock } from './support';

async function savePaymentSettings(page: Page) {
  await page.getByRole('button', { name: 'Save payment settings' }).click();
}

test.beforeEach(async ({ context }) => {
  const owner = await ensureUser(OWNER_EMAIL, { staffRole: 'owner' });
  await signInContext(context, owner.email, owner.password);
});

test('changing the merchant UPI ID needs confirmation and updates new order pages', async ({ page, browser }) => {
  const newId = 'auren.e2e@okaxis';
  await topUpStock('AU-CSE-OAT-5', 30);
  await page.goto('/admin/settings/payments');
  const staffEmail = page.getByLabel('Staff alert email');
  if (await staffEmail.isVisible()) await staffEmail.fill('alerts@example.com');
  await page.getByLabel('Merchant UPI ID').fill(newId);
  await savePaymentSettings(page);
  await expect(page.getByText('Type the new UPI ID again to confirm the change.')).toBeVisible();
  await page.getByLabel('Confirm new UPI ID').fill(newId);
  await savePaymentSettings(page);
  await expect(page.getByText(`Saved. New orders now show ${newId}.`).first()).toBeVisible();

  try {
    const shopper = await browser.newContext();
    const shop = await shopper.newPage();
    await addToCart(shop, 'cloudstep-everyday', { color: 'Oat', size: '5' });
    await placeUpiOrder(shop, { email: `e2e+upi${Date.now()}@example.com` });
    await expect(shop.getByText(newId, { exact: true }).first()).toBeVisible();
    const href = (await shop.locator('a[href^="upi://pay"]').getAttribute('href'))!;
    expect(new URLSearchParams(href.slice(10)).get('pa')).toBe(newId);
    await shopper.close();
  } finally {
    // Restore through the UI so the cached settings are refreshed too.
    await page.goto('/admin/settings/payments');
    await page.getByLabel('Merchant UPI ID').fill(MERCHANT_UPI_ID);
    await page.getByLabel('Confirm new UPI ID').fill(MERCHANT_UPI_ID);
    await savePaymentSettings(page);
    await expect(page.getByText(`Saved. New orders now show ${MERCHANT_UPI_ID}.`).first()).toBeVisible();
  }
});

test('maintenance mode closes and reopens the storefront', async ({ page, browser }) => {
  const visitor = await browser.newContext();
  const pub = await visitor.newPage();
  await page.goto('/admin/settings');
  const toggle = page.getByRole('switch', { name: 'Maintenance mode' });
  await toggle.click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Store settings saved').first()).toBeVisible();
  try {
    await pub.goto('/shop');
    await expect(pub.getByRole('heading', { name: 'Back shortly' })).toBeVisible();
  } finally {
    await page.reload();
    await page.getByRole('switch', { name: 'Maintenance mode' }).click();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Store settings saved').first()).toBeVisible();
  }
  await pub.goto('/shop');
  await expect(pub.getByRole('heading', { name: 'All shoes' })).toBeVisible();
  await visitor.close();
});
