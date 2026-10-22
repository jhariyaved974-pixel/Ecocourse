// Renders the share images (og/*.png) and logo.png from the site's own files.
// Usage, from the repository root (its devDependencies include Playwright):
//   npm install && npx playwright install chromium && node autowebly/_dev/render-images.mjs
// Set CHROME to use a different Chromium/Chrome binary.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const file = path.join(site, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(site) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: 'light' });
for (const v of ['home', 'b2b']) {
  await page.goto(`${base}/_dev/og-image.html?v=${v}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(site, 'og', v === 'b2b' ? 'b2b-lead-generation.png' : 'home.png') });
}
await page.setViewportSize({ width: 512, height: 512 });
await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${fs.readFileSync(path.join(site, 'favicon.svg'), 'utf8').replace('<svg ', '<svg width="512" height="512" ')}`);
await page.screenshot({ path: path.join(site, 'logo.png'), omitBackground: true });
await browser.close();
server.close();
