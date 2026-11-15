// Render WeberAct's social share image (1200 x 630) and a square PNG logo (512 x 512) from the brand
// artwork in weberact/assets. Run after changing the logo or the tagline:
//   node tools/make_brand_images.mjs        (needs Playwright with Chromium)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');  // a globally installed Playwright works too (NODE_PATH)
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'weberact');
const mark = readFileSync(path.join(site, 'assets/logo.svg'), 'utf8').replace(/fill="#7a1c33"/g, 'fill="currentColor"');
const font = 'data:font/woff2;base64,' + readFileSync(path.join(site, 'assets/fonts/schibsted-grotesk-latin.woff2')).toString('base64');
const content = JSON.parse(readFileSync(path.join(site, 'content.json'), 'utf8'));
const tagline = (content.settings.tagline || 'Build. Automate. Accelerate.').replace(/[<>&]/g, '');
const base = `@font-face{font-family:S;font-weight:400 900;src:url(${font}) format("woff2")}*{margin:0;box-sizing:border-box}body{font-family:S,sans-serif}`;

const og = `<style>${base}
body{width:1200px;height:630px;background:radial-gradient(120% 140% at 85% 0%,#94263f 0%,#7a1c33 45%,#4a1020 100%);color:#fff;position:relative;overflow:hidden}
.frame{position:absolute;inset:28px;border:1.5px solid rgba(198,162,78,.55);border-radius:18px}
.mark{position:absolute;left:84px;top:86px;width:190px;color:#c6a24e}.mark svg{width:100%;height:auto;display:block}
h1{position:absolute;left:84px;top:238px;font-size:96px;font-weight:600;letter-spacing:-.05em;line-height:1}
.tag{position:absolute;left:88px;top:356px;font-size:40px;font-weight:600;letter-spacing:.02em;color:#e3c57a}
.svc{position:absolute;left:88px;bottom:86px;font-size:25px;color:#f1dfe4;letter-spacing:-.01em}
.dom{position:absolute;right:84px;bottom:86px;font-size:22px;letter-spacing:.14em;text-transform:uppercase;color:#c6a24e}
</style><div class="frame"></div><div class="mark">${mark}</div><h1>WeberAct</h1><div class="tag">${tagline}</div>
<div class="svc">Websites · Technical SEO · AI automation · B2B lead generation</div><div class="dom">weberact.co</div>`;

const logo = `<style>${base}body{width:512px;height:512px;background:#fff;display:grid;place-items:center}.m{width:400px;color:#7a1c33}.m svg{width:100%;height:auto;display:block}</style><div class="m">${mark}</div>`;

const b = await chromium.launch();
for (const [html, w, h, out] of [[og, 1200, 630, 'assets/og-image.png'], [logo, 512, 512, 'assets/logo-512.png']]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.setContent(html); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(site, out), type: 'png' });
  console.log('wrote', out);
}
await b.close();
