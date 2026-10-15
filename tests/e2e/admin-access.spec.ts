import { expect, test } from '@playwright/test';
import { db, ensureUser, OWNER_EMAIL, signInContext } from './support';


test('anonymous visitors are sent to the admin login and admin endpoints refuse them', async ({ page }) => {
  for (const path of ['/admin', '/admin/orders', '/admin/payments', '/admin/products', '/admin/products/new']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/login/);
  }
  const res = await page.request.get('/admin/payments/proofs/00000000-0000-4000-8000-000000000000', { maxRedirects: 0 });
  expect([303, 307, 401, 403, 404]).toContain(res.status());
  expect(res.status()).not.toBe(200);
});

test('a signed-in customer cannot use the admin', async ({ page, context }) => {
  const customer = await ensureUser(`e2e-customer-${Date.now()}@example.com`);
  await signInContext(context, customer.email, customer.password);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login\?error=not_staff/);
  await expect(page.getByText('That account does not have admin access.')).toBeVisible();
  await page.goto('/admin/payments');
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('staff sign in with the login form and sign out', async ({ page }) => {
  const owner = await ensureUser(OWNER_EMAIL, { staffRole: 'owner' });
  await page.goto('/admin/login');
  await page.fill('#email', owner.email);
  await page.fill('#password', owner.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin(\/mfa)?$/);
  if (page.url().endsWith('/admin')) {
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    // dispatchEvent: the Next.js dev-tools badge overlaps the sidebar footer in development.
    await page.getByRole('button', { name: 'Sign out' }).first().dispatchEvent('click');
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  }
});

test('wrong passwords are refused without revealing whether the account exists', async ({ page }) => {
  await page.goto('/admin/login');
  await page.fill('#email', 'nobody-here@example.com');
  await page.fill('#password', 'definitely-wrong-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Incorrect email or password.')).toBeVisible();
});
