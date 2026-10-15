// Dev helper: drives add-to-cart → checkout → order → proof submission in Chromium.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const out = process.argv[2] ?? '/tmp';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const step = async (name, fn) => {
  process.stdout.write(`- ${name} … `);
  try { await fn(); } catch (e) { console.log('FAILED', e.message.split('\n')[0]); console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n')); await page.screenshot({ path: `${out}/failure.png`, fullPage: true }); await browser.close(); process.exit(1); }
  console.log('ok');
};

await step('open product', async () => { await page.goto('http://localhost:3000/products/velocity-runner-x', { waitUntil: 'networkidle' }); });
await step('pick size + add to cart', async () => {
  await page.getByRole('radio', { name: /^8/ }).first().click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.waitForTimeout(800);
});
await step('go to checkout', async () => { await page.goto('http://localhost:3000/checkout', { waitUntil: 'networkidle' }); await page.waitForSelector('text=Place order'); });
await step('fill form', async () => {
  await page.fill('#email', 'shopper@example.com');
  await page.fill('#fullName', 'Asha Verma');
  await page.fill('#phone', '9876543210');
  await page.fill('#line1', '12 MG Road');
  await page.fill('#city', 'Bengaluru');
  await page.fill('#postalCode', '560001');
  await page.selectOption('#state', 'Karnataka');
  await page.locator('aside input[type=checkbox]').check();
  await page.waitForTimeout(600);
});
await page.screenshot({ path: `${out}/checkout.png`, fullPage: true });
await step('place order', async () => {
  await page.getByRole('button', { name: /Place order/ }).click();
  await page.waitForURL(/\/orders\/AU-/, { timeout: 30000 });
  await page.waitForSelector('text=Pay with UPI');
});
const url = page.url();
await page.screenshot({ path: `${out}/order.png`, fullPage: true });
const uri = await page.getAttribute('a[href^="upi://"]', 'href');
console.log('  order url:', url);
console.log('  upi uri:', uri);
await step('submit proof', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  writeFileSync(`${out}/proof.png`, png);
  await page.setInputFiles('#proof-file', `${out}/proof.png`);
  await page.fill('#utr', '412345678901');
  await page.locator('input[name="confirm"]').check();
  await page.getByRole('button', { name: 'Submit payment details' }).click();
  await page.waitForSelector('text=Awaiting Payment Verification', { timeout: 30000 });
});
await page.screenshot({ path: `${out}/order-awaiting.png`, fullPage: true });
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
