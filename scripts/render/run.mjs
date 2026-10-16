#!/usr/bin/env node
// Generates the original sample-catalogue assets:
//   public/models/<product>.glb                    (meshopt-compressed glTF; shoes and items)
//   public/images/products/<product>/<colour>-<view>.webp
//   public/images/site/*.webp                      (hero, categories, banners)
//
// Usage: node scripts/render/run.mjs [--only=<slug>[,<slug>...]] [--site[=<name>,...]] [--models] [--photos] [--preview] [--side]
//   --site=hero,category-beauty renders only those site images (names without .webp)
//   --preview renders only the first colourway's hero34 view (or side view with --side)
//   Set RENDER_TMP to a private directory when running several renders at once.
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
const only = [...args].find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',').filter(Boolean);
const siteArg = [...args].find((a) => a === '--site' || a.startsWith('--site='));
const wantAll = !siteArg && !args.has('--models') && !args.has('--photos');
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

  const products = catalog.PRODUCTS.filter((p) => !only || only.includes(p.slug));
  if (only && products.length !== only.length) throw new Error(`Unknown slug in --only: ${only.filter((s) => !products.some((p) => p.slug === s)).join(', ')}`);
  const subjectOf = (p, c) => (p.kind === 'shoe' ? { type: 'shoe', silhouette: p.silhouette, colorway: c } : { type: 'item', model: p.model, colorway: c });

  if (wantAll || args.has('--models')) {
    for (const p of products) {
      const b64 = await run({ kind: 'glb', subject: subjectOf(p, p.colorways[0]) });
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
          await savePhoto({ kind: 'photo', subject: subjectOf(p, c), view, background: '#ebe8e2' }, file, 1200, 1200);
        }
      }
    }
  }

  if ((wantAll || siteArg) && !only) {
    const byslug = Object.fromEntries(catalog.PRODUCTS.map((p) => [p.slug, p]));
    const product = (slug) => {
      if (!byslug[slug]) throw new Error(`Unknown product in --site scene: ${slug}`);
      return byslug[slug];
    };
    // Footwear sub-category tiles: shoes at their own (photo) scale.
    const shoe = (slug, ci, position, rotation, scale = 1) => ({
      subject: subjectOf(product(slug), product(slug).colorways[ci]), position, rotation, scale,
    });
    // Mixed scenes are laid out in real metres. Item builders already are; the
    // procedural shoes are ~1 unit long, so they are scaled to a ~30 cm shoe.
    const SHOE_M = 0.3;
    const put = (slug, { c = 0, at = [0, 0], y = 0, ry = 0, rot, s = 1, ...rest } = {}) => {
      const p = product(slug);
      return {
        subject: subjectOf(p, p.colorways[c]),
        position: [at[0], y, at[1]],
        rotation: rot ?? [0, ry, 0],
        scale: s * (p.kind === 'shoe' ? SHOE_M : 1),
        ...rest,
      };
    };
    // Camera directions (fitCamera sets the distance): a three-quarter view from
    // the front right, and a higher one for low, flat products.
    const CAM_34 = { position: [0.9, 1.05, 1.9], target: [0, 0.1, 0], fov: 30 };
    const CAM_HIGH = { position: [0.75, 1.55, 1.6], target: [0, 0.05, 0], fov: 30 };
    const CAM_WIDE = { position: [0.35, 0.8, 2.3], target: [0, 0.1, 0], fov: 28 };
    const DARK = { dark: true, accentLight: '#4ade80' };

    const jobs = [];
    const add = (name, w, h, job) => jobs.push({ name, w, h, job: { kind: 'scene', ...job } });

    // Homepage hero poster / no-WebGL fallback. Mirrors DEFAULT_HERO_MODELS in
    // src/components/three/hero-models.ts: the same five products, positions,
    // rotations and bounding radii (hero units scaled by U metres), floating
    // over a floor at the hero's contact-shadow height.
    const U = 0.13;
    const HERO = [
      ['velocity-runner-x', 0, [0, -0.2, 0.5], 1.25, [0.12, -0.6, 0.05]],
      ['orbit-over-ear-headphones', 0, [-1.5, 1.05, -0.3], 0.85, [0.2, 0.5, -0.1]],
      ['stride-smartwatch-2', 0, [1.5, 1.05, -0.2], 0.7, [0.5, -0.35, 0.08]],
      ['thermosteel-bottle-1l', 0, [-1.6, -1.0, 0], 0.85, [0.05, 0.4, 0.12]],
      ['pulse-wireless-earbuds', 1, [1.55, -1.0, 0.2], 0.68, [0.45, -0.3, 0]],
    ];
    const heroRadius = Math.max(1, ...HERO.map(([, , p, r]) => Math.max(Math.abs(p[0]), Math.abs(p[1])) + r));
    const floor = heroRadius * 0.82 * U;
    const heroItems = HERO.map(([slug, c, p, r, rot]) => ({
      ...put(slug, { c, rot, s: 1 }), scale: 1, fitRadius: r * U, position: [p[0] * U, p[1] * U + floor, p[2] * U],
    }));
    const heroCam = { position: [0, floor, 9 * U], target: [0, floor, 0], fov: 30 };
    const heroLook = { background: '#111112', glow: '#22c55e', groundShadows: true, ...DARK };
    // Desktop: shown at roughly 32–91% of the width (object-position 78%), so the subject sits right of centre.
    add('hero', 2000, 1250, { ...heroLook, items: heroItems, camera: heroCam, fill: 0.7, offsetX: 0.23 });
    // Mobile: cropped to the central square.
    add('hero-mobile', 900, 1200, { ...heroLook, items: heroItems, camera: heroCam, fill: 0.86 });

    // Link previews: brand-neutral, centred, everything grounded.
    add('og-default', 1200, 630, {
      background: '#ebe6dd',
      items: [
        put('metro-laptop-backpack', { c: 0, at: [-0.3, -0.12], ry: 0.4, s: 0.72 }),
        put('orbit-over-ear-headphones', { c: 1, at: [-0.08, -0.21], ry: 0.15 }),
        put('thermosteel-bottle-1l', { c: 0, at: [0.13, -0.15], ry: -0.2, s: 0.85 }),
        put('cuddle-bear-plush', { c: 0, at: [0.33, -0.08], ry: -0.45, s: 0.85 }),
        put('urban-street-pro', { c: 0, at: [0.03, 0.08], ry: -0.35 }),
        put('stride-smartwatch-2', { c: 0, at: [-0.25, 0.16], ry: 0.35, s: 1.7 }),
        put('hydraglow-face-serum', { c: 0, at: [0.21, 0.17], ry: -0.3, s: 1.2 }),
      ],
      camera: CAM_WIDE, fill: 0.8,
    });

    // Department tiles (900×1125): two or three products from each department.
    const tile = (slug, background, items, camera = CAM_34, fill = 0.88, extra = {}) =>
      add(`category-${slug}`, 900, 1125, { background, items, camera, fill, ...extra });
    tile('electronics', '#dde3ea', [
      put('orbit-over-ear-headphones', { c: 0, at: [0.01, -0.09], ry: 0.2 }),
      put('stride-smartwatch-2', { c: 0, at: [0.075, 0.09], ry: -0.3, s: 1.7 }),
      put('pulse-wireless-earbuds', { c: 1, at: [-0.085, 0.07], ry: 0.45, s: 1.5 }),
    ], CAM_HIGH);
    tile('fashion', '#ece2d6', [
      put('metro-laptop-backpack', { c: 1, at: [0.15, -0.16], ry: -0.45, s: 0.7 }),
      put('everyday-cotton-tee', { c: 2, at: [-0.11, -0.04], ry: 0.25, s: 0.46 }),
      put('classic-aviator-sunglasses', { c: 0, at: [0.06, 0.15], ry: 0.25, s: 1.25 }),
    ]);
    tile('footwear', '#e7e2d8', [
      put('urban-street-pro', { c: 0, at: [-0.05, -0.2], ry: Math.PI + 0.45 }),
      put('velocity-runner-x', { c: 2, at: [0.05, 0.12], ry: -0.55 }),
    ], CAM_HIGH, 0.82, { offsetX: -0.1 });
    tile('home-kitchen', '#e1e6dc', [
      put('ceramic-planter-set', { c: 0, at: [0.11, -0.12], ry: -0.3, s: 0.75 }),
      put('thermosteel-bottle-1l', { c: 0, at: [-0.13, -0.09], ry: 0.2, s: 0.85 }),
      put('stoneware-mug-set', { c: 1, at: [-0.01, 0.11], ry: 0.2, s: 0.7 }),
    ]);
    tile('beauty', '#f0e3dc', [
      put('daily-moisturising-lotion', { c: 0, at: [-0.06, -0.045], ry: 0.15 }),
      put('citrus-fresh-body-wash', { c: 0, at: [0.05, -0.07], ry: -0.2 }),
      put('hydraglow-face-serum', { c: 0, at: [0.045, 0.06], ry: -0.2, s: 1.05 }),
    ], CAM_34, 0.82);
    tile('sports-fitness', '#dce6e2', [
      put('flexgrip-yoga-mat', { c: 0, at: [0.0, -0.17], ry: Math.PI + 0.3, s: 0.85 }),
      put('trailhead-camping-lantern', { c: 1, at: [0.15, 0.06], ry: -0.4 }),
      put('powergrip-neoprene-dumbbells', { c: 0, at: [-0.1, 0.08], ry: 0.45 }),
    ], CAM_HIGH);
    tile('toys-kids', '#f1e7cf', [
      put('cuddle-bear-plush', { c: 0, at: [0.06, -0.06], ry: -0.3 }),
      put('build-and-play-blocks', { c: 0, at: [-0.1, 0.13], ry: 0.4, s: 1.1 }),
    ]);
    tile('books-stationery', '#e6e1ee', [
      put('dot-grid-notebook-a5', { c: 0, at: [-0.05, -0.06], ry: 0.35 }),
      put('smooth-gel-pen-set', { c: 0, at: [0.1, 0.18], ry: -0.45 }),
    ], CAM_HIGH, 0.84);

    // Footwear sub-category tiles: one shoe each, unrotated and seen from the
    // product photos' three-quarter angle (a tight fit and contact shadow).
    const shoeTiles = {
      sneakers: ['urban-street-pro', 0, '#e7e2d8'],
      running: ['velocity-runner-x', 1, '#dfe5ea'],
      sports: ['courtvision-elite', 0, '#e4e1ec'],
      casual: ['cloudstep-everyday', 0, '#e6e2d6'],
      formal: ['midnight-leather-classic', 1, '#e2dbd3'],
      boots: ['trailforce-outdoor', 0, '#e0ddd2'],
      sandals: ['coastline-slide', 1, '#e0e6e6'],
    };
    for (const [slug, [shoeSlug, ci, background]] of Object.entries(shoeTiles)) {
      add(`category-${slug}`, 900, 1125, {
        background, items: [shoe(shoeSlug, ci, [0, 0, 0], [0, 0, 0])],
        camera: { position: [1.55, 1.05, 1.85], target: [0, 0.12, 0], fov: 26 }, fill: 0.84,
      });
    }

    // Promo banner (dark; copy sits on the right on large screens, below the image on phones).
    add('banner-performance', 2000, 900, {
      background: '#141517', ...DARK,
      items: [
        put('flexgrip-yoga-mat', { c: 1, at: [0.04, -0.24], ry: 0.12, s: 0.85 }),
        put('trailhead-camping-lantern', { c: 0, at: [-0.33, -0.21], ry: 0.35 }),
        put('velocity-runner-x', { c: 1, at: [-0.02, 0.06], ry: -0.35, s: 1.2 }),
        put('powergrip-neoprene-dumbbells', { c: 0, at: [0.29, 0.02], ry: -0.5 }),
        put('stride-smartwatch-2', { c: 0, at: [-0.26, 0.13], ry: 0.45, s: 1.6 }),
      ],
      camera: CAM_WIDE, fill: 0.48, offsetX: -0.17,
    });
    // Collection spotlight / collection image: cropped to its centre on large
    // screens, with copy over the bottom left, so the products sit centred and high.
    add('banner-essentials', 2000, 900, {
      background: '#e9e4da',
      items: [
        put('metro-laptop-backpack', { c: 1, at: [-0.08, -0.17], ry: 0.3, s: 0.72 }),
        put('everyday-cotton-tee', { c: 0, at: [0.13, -0.2], ry: -0.35, s: 0.42 }),
        put('thermosteel-bottle-1l', { c: 2, at: [0.01, 0.0], ry: 0, s: 0.85 }),
        put('volt-20000-power-bank', { c: 1, at: [0.12, 0.06], ry: -0.4 }),
        put('dot-grid-notebook-a5', { c: 0, at: [-0.11, 0.1], ry: 0.3, s: 0.8 }),
      ],
      camera: CAM_34, fill: 0.56, offsetX: -0.05, offsetY: 0.33,
    });
    // Editorial story (4:5, no text over it): a calm still life.
    add('story-craft', 1200, 1500, {
      background: '#e2dbd0',
      items: [
        put('lumen-led-table-lamp', { c: 0, at: [-0.1, -0.13], ry: 0.2 }),
        put('dot-grid-notebook-a5', { c: 1, at: [0.07, 0.07], ry: -0.35 }),
        put('classic-aviator-sunglasses', { c: 0, at: [0.08, 0.06], y: 0.036, ry: -0.15 }),
        put('hydraglow-face-serum', { c: 0, at: [-0.14, 0.14], ry: 0.2, s: 1.1 }),
      ],
      camera: CAM_34, fill: 0.84,
    });

    const site = path.join(ROOT, 'public/images/site');
    const pick = siteArg && siteArg !== '--site' ? siteArg.split('=')[1].split(',').filter(Boolean) : null;
    if (pick) {
      const unknown = pick.filter((n) => !jobs.some((j) => j.name === n));
      if (unknown.length) throw new Error(`Unknown --site image: ${unknown.join(', ')} (have ${jobs.map((j) => j.name).join(', ')})`);
    }
    for (const { name, w, h, job } of jobs) {
      if (pick && !pick.includes(name)) continue;
      await savePhoto(job, path.join(site, `${name}.webp`), w, h);
    }
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
