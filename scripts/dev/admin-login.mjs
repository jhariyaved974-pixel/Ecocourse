// Dev helper: signs in to /admin with a local dev account and screenshots a page.
// usage: node scripts/dev/admin-login.mjs <email> <passwordFile> <path> <out.png> [--full]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [email, pwFile, path = '/admin', out = '/tmp/admin.png', ...flags] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:3000/admin/login', { waitUntil: 'networkidle' });
await page.fill('#email', email);
await page.fill('#password', readFileSync(pwFile, 'utf8').trim());
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL((u) => !u.pathname.startsWith('/admin/login'), { timeout: 30000 });
await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: out, fullPage: flags.includes('--full') });
console.log('url:', page.url());
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].slice(0, 10).join('\n'));
await browser.close();
