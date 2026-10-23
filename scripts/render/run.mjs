#!/usr/bin/env node
// Renders the sample-catalogue photographs and site imagery from the
// procedural textiles in scripts/render/textiles (headless Chromium, Canvas 2D):
//   public/images/products/<product>/<colour>-<view>.webp   (1200×1500)
//   public/images/site/*.webp                               (hero, categories, banners, OG)
//
// Usage: node scripts/render/run.mjs [--only=<slug>[,<slug>...]] [--site[=<name>,...]] [--photos] [--preview]
//   --site=hero,category-banarasi renders only those site images (names without .webp)
//   --preview renders only the first colourway's first view of each product
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_TMP = process.env.RENDER_TMP ?? path.join(ROOT, '.render-cache');
const args = new Set(process.argv.slice(2));
const only = [...args].find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',').filter(Boolean);
const siteArg = [...args].find((a) => a === '--site' || a.startsWith('--site='));
const siteOnly = siteArg?.includes('=') ? siteArg.split('=')[1].split(',').filter(Boolean) : null;
const wantAll = !siteArg && !args.has('--photos');
const SS = 1.5; // supersampling factor

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function bundle() {
  await mkdir(OUT_TMP, { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, 'scripts/render/catalog.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: path.join(OUT_TMP, 'catalog.mjs'), logLevel: 'error',
  });
  await build({
    entryPoints: [path.join(ROOT, 'scripts/render/textiles/entry.ts')],
    bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true,
    outfile: path.join(OUT_TMP, 'textiles.js'), logLevel: 'error',
  });
  return import(`${path.join(OUT_TMP, 'catalog.mjs')}?t=${Date.now()}`);
}

const subjectOf = (p, c) => ({ key: `${p.slug}/${slugify(c.name)}`, design: p.design, colors: c.colors });

async function main() {
  const catalog = await bundle();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ path: path.join(OUT_TMP, 'textiles.js') });
  await page.waitForFunction(() => window.textilesReady === true);

  const save = async (job, file) => {
    const outW = job.width;
    const outH = job.height;
    const dataUrl = await page.evaluate((j) => window.runTextileJob(j), { ...job, width: Math.round(outW * SS), height: Math.round(outH * SS) });
    await mkdir(path.dirname(file), { recursive: true });
    await sharp(Buffer.from(dataUrl.split(',')[1], 'base64')).resize(outW, outH, { kernel: 'lanczos3' }).webp({ quality: 84, effort: 5 }).toFile(file);
    console.log('  wrote', path.relative(ROOT, file));
  };

  const bySlug = Object.fromEntries(catalog.PRODUCTS.map((p) => [p.slug, p]));
  const product = (slug) => {
    if (!bySlug[slug]) throw new Error(`Unknown product: ${slug}`);
    return bySlug[slug];
  };

  if (wantAll || args.has('--photos')) {
    const products = catalog.PRODUCTS.filter((p) => !only || only.includes(p.slug));
    if (only && products.length !== only.length) throw new Error(`Unknown slug in --only: ${only.filter((s) => !bySlug[s]).join(', ')}`);
    for (const p of products) {
      const views = catalog.viewsFor(p);
      for (const c of args.has('--preview') ? p.colorways.slice(0, 1) : p.colorways) {
        for (const view of args.has('--preview') ? views.slice(0, 1) : views) {
          const file = path.join(ROOT, 'public/images/products', p.slug, `${slugify(c.name)}-${view}.webp`);
          await save({ kind: p.kind, view, subject: subjectOf(p, c), width: catalog.PHOTO_WIDTH, height: catalog.PHOTO_HEIGHT }, file);
        }
      }
    }
  }

  if ((wantAll || siteArg) && !only) {
    // item(slug, colourway index) → a scene item.
    const item = (slug, ci = 0) => {
      const p = product(slug);
      return { kind: p.kind, subject: subjectOf(p, p.colorways[ci]) };
    };
    const scenes = {
      hero: { width: 1600, height: 1800, layout: 'rail', items: [item('chanderi-zari-buti'), item('jangla-banarasi-katan'), item('meenakshi-temple-border-kanjivaram'), item('vaira-oosi-soft-silk'), item('kasu-butta-kanjivaram')] },
      'hero-mobile': { width: 900, height: 1100, layout: 'rail', items: [item('jangla-banarasi-katan'), item('meenakshi-temple-border-kanjivaram'), item('vaira-oosi-soft-silk')] },
      'category-saris': { width: 900, height: 1125, layout: 'drape', items: [item('meenakshi-temple-border-kanjivaram', 1)] },
      'category-blouses': { width: 900, height: 1125, layout: 'blouse', items: [item('zardozi-sweetheart-blouse')] },
      'category-kanjivaram': { width: 900, height: 1125, layout: 'drape', items: [item('kasu-butta-kanjivaram')] },
      'category-banarasi': { width: 900, height: 1125, layout: 'drape', items: [item('jangla-banarasi-katan')] },
      'category-chanderi-maheshwari': { width: 900, height: 1125, layout: 'drape', items: [item('chanderi-zari-buti')] },
      'category-cotton-linen': { width: 900, height: 1125, layout: 'drape', items: [item('ilkal-tope-teni')] },
      'category-organza-tissue': { width: 900, height: 1125, layout: 'drape', items: [item('embroidered-organza')] },
      'category-classic-blouses': { width: 900, height: 1125, layout: 'blouse', items: [item('classic-silk-elbow-sleeve-blouse')] },
      'category-occasion-blouses': { width: 900, height: 1125, layout: 'blouse', items: [item('boat-neck-brocade-blouse')] },
      'story-loom': { width: 1200, height: 1500, layout: 'detail', items: [item('meenakshi-temple-border-kanjivaram', 1)] },
      'story-stack': { width: 1200, height: 1500, layout: 'stack', items: [item('kasavu-tissue'), item('chanderi-zari-buti', 1), item('vaira-oosi-soft-silk', 1), item('kasu-butta-kanjivaram', 1), item('meenakshi-temple-border-kanjivaram')] },
      'banner-wedding': { width: 2000, height: 1000, layout: 'folds', items: [item('jangla-banarasi-katan', 1), item('meenakshi-temple-border-kanjivaram'), item('kadhua-butidar-banarasi')] },
      'banner-blouses': { width: 2000, height: 1000, layout: 'blouses', items: [item('classic-silk-elbow-sleeve-blouse'), item('zardozi-sweetheart-blouse', 1), item('boat-neck-brocade-blouse')] },
      'og-default': { width: 1200, height: 630, layout: 'folds', items: [item('kasu-butta-kanjivaram'), item('meenakshi-temple-border-kanjivaram', 1), item('chanderi-zari-buti')] },
    };
    for (const [name, scene] of Object.entries(scenes)) {
      if (siteOnly && !siteOnly.includes(name)) continue;
      await save({ kind: 'site', name, ...scene }, path.join(ROOT, 'public/images/site', `${name}.webp`));
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
