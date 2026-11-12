import { expect, test, type Page } from '@playwright/test';

// Runs against seeded demo data (scripts/seed-demo.mjs) and an admin account. Set:
//   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_CLIENT_EMAIL, E2E_OTHER_EMAIL, E2E_CLIENT_PASSWORD (the DEMO_PASSWORD)
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL!, password: process.env.E2E_ADMIN_PASSWORD! };
const CLIENT = { email: process.env.E2E_CLIENT_EMAIL ?? 'demo.client@weberact.test', password: process.env.E2E_CLIENT_PASSWORD! };
const OTHER = { email: process.env.E2E_OTHER_EMAIL ?? 'demo.other@weberact.test', password: process.env.E2E_CLIENT_PASSWORD! };
const SHOTS = process.env.E2E_SCREENSHOTS;
const run = Date.now().toString(36);
const errors: string[] = [];

async function login(page: Page, who: { email: string; password: string }) {
  page.on('pageerror', e => errors.push(`${who.email}: ${e.message}`));
  await page.goto('/login');
  await page.getByLabel('Work email').fill(who.email);
  await page.getByLabel('Password', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
}
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

test.describe.configure({ mode: 'serial' });
let projectUrl = '', invoiceUrl = '';

test('sign-in rejects a wrong password and protects every page', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await page.getByLabel('Work email').fill(CLIENT.email);
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('not right');
  await shot(page, '01-login');
  const api = await page.request.get('/api/invoices/00000000-0000-0000-0000-000000000000/pdf');
  expect(api.status()).toBe(401);
});

test('client dashboard, project page, stages and files', async ({ page }) => {
  await login(page, CLIENT);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: /Welcome back, Demo/ })).toBeVisible();
  await expect(page.getByText('Active projects')).toBeVisible();
  await expect(page.getByRole('link', { name: /Export website redesign/ }).first()).toBeVisible();
  await shot(page, '02-client-dashboard');
  await page.getByRole('link', { name: /Export website redesign/ }).first().click();
  await expect(page.getByText('Current stage')).toBeVisible();
  await expect(page.getByText('— Development').first()).toBeVisible();
  await expect(page.getByText('The build is on the staging link')).toBeVisible();
  await expect(page.getByText('Sitemap (demo).pdf')).toBeVisible();
  projectUrl = page.url();
  await shot(page, '03-client-project');
});

test('client billing: invoice statuses, details and PDF', async ({ page }) => {
  await login(page, CLIENT);
  await page.goto('/billing');
  await expect(page.getByText('Remaining balance')).toBeVisible();
  await expect(page.getByText('Overdue').first()).toBeVisible();   // demo invoice 1 is past due and part paid
  await shot(page, '04-client-billing');
  await page.getByRole('link', { name: /^WA-\d{4}-\d{4}$/ }).first().click();
  await expect(page.getByText('Balance due').first()).toBeVisible();
  invoiceUrl = page.url();
  const id = invoiceUrl.split('/').pop();
  const pdf = await page.request.get(`/api/invoices/${id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await shot(page, '05-client-invoice');
});

test('client accepts a contract electronically', async ({ page }) => {
  await login(page, CLIENT);
  await page.goto('/contracts');
  await page.getByRole('link', { name: /Website development agreement/ }).click();
  await expect(page.getByText('not a certified digital signature').first()).toBeVisible();
  await page.getByLabel('Your full name').fill('Demo Client');
  await page.getByText('I have read the contract').click();
  await page.getByRole('button', { name: 'Accept contract' }).click();
  await expect(page.getByText('Accepted electronically')).toBeVisible();
  await expect(page.getByText('Document fingerprint')).toBeVisible();
  await shot(page, '06-client-contract-accepted');
});

test('client onboarding: autosave, upload and submit', async ({ page }) => {
  await login(page, CLIENT);
  await page.goto('/onboarding');
  await page.getByLabel('Phone').fill('+91 98765 43210');
  await page.getByLabel('Country').selectOption('India');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /Website Development/ }).click();
  await page.getByRole('button', { name: /^SEO/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Business description').fill('We export precision industrial valves to buyers in Europe and the Middle East.');
  await page.getByLabel('Project objectives').fill('Double qualified overseas RFQs within six months.');
  await page.getByLabel('Target audience').fill('Procurement managers at EPC contractors.');
  await expect(page.getByText(/Saved/)).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(page.getByText('logo.svg')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Double qualified overseas RFQs')).toBeVisible();
  await page.getByText('I confirm these details are correct').click();
  await shot(page, '07-client-onboarding-review');
  await page.getByRole('button', { name: 'Submit onboarding' }).click();
  await expect(page.getByRole('heading', { name: 'Onboarding submitted' })).toBeVisible();
});

test('client messages and revision request', async ({ page }) => {
  await login(page, CLIENT);
  await page.goto('/messages');
  await page.getByRole('button', { name: /Homepage copy/ }).click();
  await expect(page.getByText('It will be on the staging link by Thursday.')).toBeVisible();
  const text = `Thanks, looking forward to it (${run})`;
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(text)).toBeVisible();
  await shot(page, '08-client-messages');
  await page.goto('/requests');
  await page.getByLabel('Title').fill(`Swap the hero photo (${run})`);
  await page.getByLabel('Details').fill('Use the night shot of the factory.');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText(`Swap the hero photo (${run})`)).toBeVisible();
});

test('another client cannot reach this client by URL or API', async ({ page }) => {
  await login(page, OTHER);
  await expect(page.getByRole('link', { name: /Export website redesign/ })).toHaveCount(0);
  await page.goto(projectUrl);
  await expect(page.getByRole('heading', { name: 'This page is not here' })).toBeVisible();
  const id = invoiceUrl.split('/').pop();
  expect((await page.request.get(`/api/invoices/${id}/pdf`)).status()).toBe(404);
  await page.goto(invoiceUrl.replace(/.*\/billing/, '/billing'));
  await expect(page.getByRole('heading', { name: 'This page is not here' })).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/dashboard/);   // clients are sent away from the control center
  expect((await page.request.get('/api/reports/00000000-0000-0000-0000-000000000000')).status()).toBe(403);
});

test('admin overview, stage update reaches the client', async ({ page, browser }) => {
  await login(page, ADMIN);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText('Monthly revenue')).toBeVisible();
  await shot(page, '09-admin-overview');
  await page.goto('/admin/projects');
  await page.getByRole('link', { name: /Export website redesign/ }).click();
  await page.getByRole('button', { name: 'Advance here' }).click();
  await expect(page.getByText('Stage updated')).toBeVisible();
  await shot(page, '10-admin-project');
  const ctx = await browser.newContext(); const client = await ctx.newPage();
  await login(client, CLIENT);
  await client.goto(projectUrl);
  await expect(client.getByText('— Review').first()).toBeVisible();
  await client.goto('/notifications');
  await expect(client.getByText('Export website redesign: Review')).toBeVisible();
  await ctx.close();
});

test('admin creates a client, project, invoice and records payment', async ({ page }) => {
  await login(page, ADMIN);
  await page.goto('/admin/clients');
  await page.getByRole('button', { name: 'New client' }).click();
  await page.getByLabel('Company name').fill(`Test Co ${run}`);
  await page.getByLabel('Full name').fill('Test Person');
  await page.getByLabel('Email', { exact: true }).fill(`test.${run}@weberact.test`);
  await page.getByRole('button', { name: 'Create client' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Test Co ${run}`) })).toBeVisible();
  await expect(page.getByText(`test.${run}@weberact.test`)).toBeVisible();
  await shot(page, '11-admin-client');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Project name').fill(`Launch site ${run}`);
  await page.getByRole('button', { name: 'Premium Website Development' }).click();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Launch site ${run}`) })).toBeVisible();
  await page.goto('/admin/invoices');
  await page.getByRole('button', { name: 'New invoice' }).click();
  await page.getByLabel('Client').selectOption({ label: `Test Co ${run}` });
  await page.getByLabel('Description').fill('Website design, milestone 1');
  await page.getByLabel('Unit price').fill('1200');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Issue invoice' }).click();
  await expect(page.getByRole('heading', { name: /^WA-\d{4}-\d{4}$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Record payment' }).click();
  await page.getByLabel('Reference').fill('E2E-REF');
  await page.getByRole('button', { name: 'Record payment' }).last().click();
  await expect(page.getByText('Paid').first()).toBeVisible();
  await shot(page, '12-admin-invoice');
});

test('admin sees the client message and onboarding', async ({ page }) => {
  await login(page, ADMIN);
  await page.goto('/admin/messages');
  await page.getByRole('button', { name: /Homepage copy/ }).click();
  await expect(page.getByText(`Thanks, looking forward to it (${run})`)).toBeVisible();
  await page.goto('/admin/onboarding');
  await expect(page.getByText('Meridian Exports (Demo)').first()).toBeVisible();
  await page.getByText('Meridian Exports (Demo)').first().click();
  await expect(page.getByText('Double qualified overseas RFQs')).toBeVisible();
  await shot(page, '13-admin-onboarding');
  await page.goto('/admin/seo');
  await expect(page.getByText('Leave a field empty when the number is not available')).toBeVisible();
});

test('mobile layout and no page errors', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await login(page, CLIENT);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' }).last()).toBeVisible();
  await shot(page, '14-mobile-menu');
  await ctx.close();
  expect(errors).toEqual([]);
});
