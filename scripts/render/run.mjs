#!/usr/bin/env node
// Generates the original sample-catalogue assets:
//   public/models/<product>.glb                    (meshopt-compressed glTF)
//   public/images/products/<product>/<colour>-<view>.webp
//   public/images/site/*.webp                      (hero, categories, banners)
//
// Usage: node scripts/render/run.mjs [--only=<slug>] [--site] [--models] [--photos] [--preview]
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, quantize, simplify, weld, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_TMP = process.env.RENDER_TMP ?? path.join(ROOT, '.render-cache');
const args = new Set(process.argv.slice(2));
const only = [...args].find((a) => a.startsWith('--only='))?.split('=')[1];
const wantAll = !args.has('--site') && !args.has('--models') && !args.has('--photos');
const SS = 1.6; // supersampling factor

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function bundle() {
  await mkdir(OUT_TMP, { recursive: true });
  // The catalogue module is TypeScript; bundle it for Node use as well.
  await build({
    entryPoints: [path.join(ROOT, 'scripts/render/catalog.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: path.join(OUT_TMP, 'catalog.mjs'), logLevel: 'error',
  });
  await build({
    entryPoints: [path.join(ROOT, 'scripts/render/entry.ts')],
    bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true,
    outfile: path.join(OUT_TMP, 'entry.js'), logLevel: 'error',
  });
  return import(path.join(OUT_TMP, 'catalog.mjs'));
}

async function compressGlb(input, output) {
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.readBinary(new Uint8Array(input));
  await doc.transform(
    dedup(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.55, error: 0.0004 }),
    prune(),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  await writeFile(output, await io.writeBinary(doc));
}

async function main() {
  const catalog = await bundle();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.setContent('<!doctype html><html><body style="margin:0;background:#000"></body></html>');
  await page.addScriptTag({ path: path.join(OUT_TMP, 'entry.js') });
  await page.waitForFunction(() => window.ready === true);

  const run = (job) => page.evaluate((j) => window.runJob(j), job);
  const savePhoto = async (job, file, outW, outH) => {
    const dataUrl = await run({ ...job, width: Math.round(outW * SS), height: Math.round(outH * SS) });
    const png = Buffer.from(dataUrl.split(',')[1], 'base64');
    await mkdir(path.dirname(file), { recursive: true });
    await sharp(png).resize(outW, outH, { kernel: 'lanczos3' }).webp({ quality: 84, effort: 5 }).toFile(file);
    console.log('  wrote', path.relative(ROOT, file));
  };

  const products = catalog.PRODUCTS.filter((p) => !only || p.slug === only);

  if (wantAll || args.has('--models')) {
    for (const p of products) {
      const b64 = await run({ kind: 'glb', silhouette: p.silhouette, colorway: p.colorways[0] });
      const file = path.join(ROOT, 'public/models', `${p.slug}.glb`);
      await mkdir(path.dirname(file), { recursive: true });
      await compressGlb(Buffer.from(b64, 'base64'), file);
      console.log('  wrote', path.relative(ROOT, file));
    }
  }

  if (wantAll || args.has('--photos')) {
    const views = args.has('--preview') ? (args.has('--side') ? ['side'] : ['hero34']) : catalog.PRODUCT_VIEWS;
    for (const p of products) {
      for (const c of args.has('--preview') ? p.colorways.slice(0, 1) : p.colorways) {
        for (const view of views) {
          const file = path.join(ROOT, 'public/images/products', p.slug, `${slugify(c.name)}-${view}.webp`);
          await savePhoto({ kind: 'photo', silhouette: p.silhouette, colorway: c, view, background: '#ebe8e2' }, file, 1200, 1200);
        }
      }
    }
  }

  if ((wantAll || args.has('--site')) && !only) {
    const byslug = Object.fromEntries(catalog.PRODUCTS.map((p) => [p.slug, p]));
    const shoe = (slug, ci, position, rotation, scale = 1) => ({
      silhouette: byslug[slug].silhouette, colorway: byslug[slug].colorways[ci], position, rotation, scale,
    });
    const site = path.join(ROOT, 'public/images/site');
    // Hero fallback (also used as the poster behind the WebGL hero).
    await savePhoto({
      kind: 'scene', background: '#121214', dark: true, accentLight: '#f97316',
      shoes: [shoe('velocity-runner-x', 0, [0.05, 0.2, 0], [0.18, -0.55, 0.2], 1)],
      camera: { position: [0.2, 0.5, 2.6], target: [0.05, 0.28, 0], fov: 26 },
    }, path.join(site, 'hero.webp'), 2000, 1250);
    await savePhoto({
      kind: 'scene', background: '#121214', dark: true, accentLight: '#f97316',
      shoes: [shoe('velocity-runner-x', 0, [0.0, 0.2, 0], [0.18, -0.55, 0.2], 1)],
      camera: { position: [0.1, 0.55, 2.9], target: [0.0, 0.3, 0], fov: 30 },
    }, path.join(site, 'hero-mobile.webp'), 900, 1200);
    // Category tiles.
    const tiles = {
      sneakers: shoe('urban-street-pro', 0, [0, 0, 0], [0, -0.7, 0]),
      running: shoe('velocity-runner-x', 1, [0, 0, 0], [0, -0.7, 0]),
      sports: shoe('courtvision-elite', 0, [0, 0, 0], [0, -0.7, 0]),
      casual: shoe('cloudstep-everyday', 0, [0, 0, 0], [0, -0.7, 0]),
      formal: shoe('midnight-leather-classic', 1, [0, 0, 0], [0, -0.7, 0]),
      boots: shoe('trailforce-outdoor', 0, [0, 0, 0], [0, -0.7, 0]),
      sandals: shoe('coastline-slide', 1, [0, 0, 0], [0, -0.7, 0]),
    };
    const tileBg = { sneakers: '#e7e2d8', running: '#dfe5ea', sports: '#e4e1ec', casual: '#e6e2d6', formal: '#e2dbd3', boots: '#e0ddd2', sandals: '#e0e6e6' };
    for (const [slug, s] of Object.entries(tiles)) {
      await savePhoto({
        kind: 'scene', background: tileBg[slug], shoes: [s],
        camera: { position: [0.9, 1.05, 1.9], target: [0, 0.1, 0], fov: 30 },
      }, path.join(site, `category-${slug}.webp`), 900, 1125);
    }
    // Editorial / promo banners.
    await savePhoto({
      kind: 'scene', background: '#1a1a1d', dark: true, accentLight: '#38bdf8',
      shoes: [
        shoe('trailforce-outdoor', 0, [-0.55, 0, -0.1], [0, 0.5, 0]),
        shoe('courtvision-elite', 0, [0.6, 0, 0.05], [0, -0.6, 0]),
      ],
      camera: { position: [0, 0.75, 3.4], target: [0, 0.2, 0], fov: 32 },
    }, path.join(site, 'banner-performance.webp'), 2000, 900);
    await savePhoto({
      kind: 'scene', background: '#e9e4da',
      shoes: [
        shoe('cloudstep-everyday', 0, [-0.5, 0, 0.05], [0, 0.6, 0]),
        shoe('urban-street-pro', 0, [0.55, 0, -0.08], [0, -0.5, 0]),
      ],
      camera: { position: [0, 0.85, 3.3], target: [0, 0.12, 0], fov: 32 },
    }, path.join(site, 'banner-essentials.webp'), 2000, 900);
    await savePhoto({
      kind: 'scene', background: '#d9d3c7',
      shoes: [shoe('midnight-leather-classic', 1, [0, 0, 0], [0, -0.35, 0])],
      camera: { position: [0.5, 0.45, 1.5], target: [0.05, 0.08, 0], fov: 30 },
    }, path.join(site, 'story-craft.webp'), 1200, 1500);
    await savePhoto({
      kind: 'scene', background: '#121214', dark: true, accentLight: '#f97316',
      shoes: [shoe('velocity-runner-x', 2, [0, 0.12, 0], [0.12, -0.6, 0.15])],
      camera: { position: [0.2, 0.45, 2.6], target: [0, 0.22, 0], fov: 26 },
    }, path.join(site, 'og-default.webp'), 1200, 630);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
