// Dev helper: screenshot an admin page as a local staff account without going
// through the /admin/login form (whose rate limit is shared by everyone on this
// machine). Signs in directly against the local auth API and injects the SSR
// session cookie into Playwright.
//
// usage: node scripts/dev/admin-shot.mjs <path> <out.png> [--full] [--width=1440]
//          [--email=owner@auren.test] [--password-file=<file>] [--state=<file to also save storage state>]
import { createServerClient } from '@supabase/ssr';
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const [path = '/admin', out = '/tmp/admin.png', ...flags] = process.argv.slice(2);
const flag = (name, fallback) => flags.find((f) => f.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const email = flag('email', 'owner@auren.test');
const passwordFile = flag('password-file', process.env.ADMIN_PASSWORD_FILE);
if (!passwordFile) throw new Error('Pass --password-file=<file> or set ADMIN_PASSWORD_FILE');

const jar = new Map();
const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach((c) => jar.set(c.name, c.value)) },
});
const { error } = await supabase.auth.signInWithPassword({ email, password: readFileSync(passwordFile, 'utf8').trim() });
if (error) throw new Error(`sign in failed: ${error.message}`);
await new Promise((r) => setTimeout(r, 100));
const cookies = [...jar]
  .filter(([, v]) => v)
  .map(([name, value]) => ({ name, value, domain: 'localhost', path: '/', expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: false, secure: false, sameSite: 'Lax' }));
const state = { cookies, origins: [] };
if (flag('state')) writeFileSync(flag('state'), JSON.stringify(state));

const width = Number(flag('width', '1440'));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const context = await browser.newContext({ viewport: { width, height: 900 }, storageState: state });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const response = await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: out, fullPage: flags.includes('--full') });
console.log('status:', response?.status(), 'url:', page.url());
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (overflow > 0) console.log('HORIZONTAL OVERFLOW px:', overflow);
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].slice(0, 10).join('\n'));
await browser.close();
