// Dev helper: node scripts/dev/screenshot.mjs <url> <out.png> [width] [height] [--full] [--wait=ms]
import { chromium } from '@playwright/test';
const [url, out, w = '1440', h = '900', ...flags] = process.argv.slice(2);
const full = flags.includes('--full');
const wait = Number(flags.find((f) => f.startsWith('--wait='))?.split('=')[1] ?? 1500);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(wait);
if (full) {
  // Trigger in-view reveals before a full-page capture.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
}
await page.screenshot({ path: out, fullPage: full });
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].slice(0, 10).join('\n'));
await browser.close();
