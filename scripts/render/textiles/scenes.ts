// Product photographs composed from woven cloth: folded and draped saris,
// blouses laid flat, and close-ups. Output is a canvas of the requested size.

import { canvas, ctx2d, hashString, mix, rgba, rng, shade, weaveCloth, palette, stamp, paisleyPath, type ClothSpec, type Ctx } from './cloth';
import type { BlouseColors, BlouseDesign, SariColors, SariDesign } from './types';

// ----------------------------------------------------------------------------- backdrop & light

export interface Backdrop {
  /** Main tone of the surface the textile rests on. */
  tone: string;
}

export const STUDIO: Backdrop = { tone: '#e9e3d8' };

export function paintBackdrop(c: Ctx, w: number, h: number, bd: Backdrop, seed: number) {
  const g = c.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, shade(bd.tone, 0.18));
  g.addColorStop(0.55, bd.tone);
  g.addColorStop(1, shade(bd.tone, -0.08));
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // Hand-made paper / plaster grain.
  const r = rng(seed);
  const tile = canvas(256, 256);
  const t = ctx2d(tile);
  const img = t.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (r() - 0.5) * 26;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  t.putImageData(img, 0, 0);
  c.save();
  c.globalCompositeOperation = 'overlay';
  c.globalAlpha = 0.35;
  c.fillStyle = c.createPattern(tile, 'repeat')!;
  c.fillRect(0, 0, w, h);
  c.restore();
  vignette(c, w, h, 0.18);
}

export function vignette(c: Ctx, w: number, h: number, strength: number) {
  const v = c.createRadialGradient(w * 0.42, h * 0.38, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(30, 18, 8, ${strength})`);
  c.fillStyle = v;
  c.fillRect(0, 0, w, h);
}

/** Window light from the upper left: lifts highlights and cools the far side. */
function keyLight(c: Ctx, x: number, y: number, w: number, h: number, sheen: number) {
  c.save();
  c.globalCompositeOperation = 'soft-light';
  const g = c.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(128,128,128,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  c.restore();
  if (sheen > 0) {
    // Silk sheen: a broad soft highlight band.
    c.save();
    c.globalCompositeOperation = 'screen';
    const s = c.createLinearGradient(x, y + h * 0.1, x + w * 0.9, y + h * 0.9);
    s.addColorStop(0.18, 'rgba(255,250,240,0)');
    s.addColorStop(0.36, `rgba(255,250,240,${0.22 * sheen})`);
    s.addColorStop(0.5, 'rgba(255,250,240,0)');
    c.fillStyle = s;
    c.fillRect(x, y, w, h);
    c.restore();
  }
}

function softShadow(c: Ctx, path: Path2D | (() => void), blur: number, alpha: number, dx: number, dy: number) {
  c.save();
  c.filter = `blur(${blur}px)`;
  c.fillStyle = `rgba(35, 22, 12, ${alpha})`;
  c.translate(dx, dy);
  if (typeof path === 'function') path();
  else c.fill(path);
  c.restore();
}

const SHEEN: Record<string, number> = {
  silk: 1, 'soft-silk': 0.8, katan: 0.9, tanchoi: 1.1, tissue: 1.2, organza: 0.6, chanderi: 0.45, maheshwari: 0.35, cotton: 0, linen: 0, kota: 0.1,
};

// ----------------------------------------------------------------------------- saris

export interface SariSubject {
  key: string;
  design: SariDesign;
  colors: SariColors;
}

function clothColors(s: SariSubject) {
  const { colors } = s;
  return {
    body: colors.body,
    motif: colors.motif ?? shade(colors.body, 0.35),
    border: colors.border,
    pallu: colors.pallu,
    zari: colors.zari,
    accent: colors.accent ?? colors.border,
  };
}

/** Woven cloth for a sari: `widthPx` across the sari, `lengthPx` along it. */
export function sariCloth(s: SariSubject, lengthPx: number, widthPx: number, opts: { pallu?: number; edges?: ('top' | 'bottom')[]; scale: number; motifScale?: number }) {
  const d = s.design;
  const spec: ClothSpec = {
    weave: d.weave,
    field: d.field,
    spacing: widthPx * (d.motifScale ?? 0.12) * (opts.motifScale ?? 1),
    colors: clothColors(s),
    border: { style: d.border, width: widthPx * d.borderWidth, edges: opts.edges ?? ['top', 'bottom'] },
    pallu: opts.pallu !== undefined ? { style: d.pallu, from: opts.pallu } : undefined,
    scale: opts.scale,
    seed: hashString(s.key),
  };
  return weaveCloth(lengthPx, widthPx, spec);
}

/** Folded sari, flat-lay: the front border runs along the bottom, a corner of the pallu turned back. */
export interface SceneOpts {
  /** Skip the backdrop (and rod): for compositing several pieces into one scene. */
  bare?: boolean;
}

export function sariFold(c: Ctx, W: number, H: number, s: SariSubject, bd: Backdrop = STUDIO, o: SceneOpts = {}) {
  const seed = hashString(s.key);
  if (!o.bare) paintBackdrop(c, W, H, bd, seed);
  const k = W / 1200;
  const bw = W * 0.8;
  const fh = W * 0.66;
  const th = W * 0.055;
  const x0 = (W - bw) / 2;
  const y0 = H * 0.5 - (fh + th) / 2;
  c.save();
  c.translate(W / 2, H / 2);
  c.rotate(-0.035);
  c.translate(-W / 2, -H / 2);

  // Shadows: broad ambient + tight contact.
  softShadow(c, () => c.fillRect(x0, y0, bw, fh + th), 46 * k, 0.32, 18 * k, 34 * k);
  softShadow(c, () => c.fillRect(x0 + 6 * k, y0 + fh, bw - 12 * k, th), 8 * k, 0.5, 2 * k, 6 * k);

  // Top face: body with the border along the front edge.
  const cloth = sariCloth(s, bw * 1.4, fh * 1.25, { edges: ['bottom'], scale: k });
  c.drawImage(cloth, 0, cloth.height - fh, bw, fh, x0, y0, bw, fh);

  // Stacked folds on the front edge: layers of border, darker toward the base.
  const layers = 7;
  const strip = sariCloth(s, bw + 80 * k, fh * 1.25, { edges: ['bottom'], scale: k * 0.55 });
  for (let i = 0; i < layers; i++) {
    const ly = y0 + fh + (i * th) / layers;
    const lh = th / layers;
    c.drawImage(strip, (i * 37) % 60, strip.height - fh * 1.25 * s.design.borderWidth * 0.9, bw, fh * 1.25 * s.design.borderWidth * 0.9, x0, ly, bw, lh + 0.5);
    c.fillStyle = `rgba(20, 10, 4, ${0.18 + i * 0.05})`;
    c.fillRect(x0, ly, bw, lh + 0.5);
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(x0, ly, bw, Math.max(1, lh * 0.18));
  }
  // Rounded fold at the front edge.
  const roll = c.createLinearGradient(0, y0 + fh - th * 0.9, 0, y0 + fh + th * 0.2);
  roll.addColorStop(0, 'rgba(0,0,0,0)');
  roll.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  roll.addColorStop(1, 'rgba(0,0,0,0.25)');
  c.fillStyle = roll;
  c.fillRect(x0, y0 + fh - th, bw, th * 1.2);
  // Fold at the back edge.
  const back = c.createLinearGradient(0, y0, 0, y0 + fh * 0.12);
  back.addColorStop(0, 'rgba(255,255,255,0.18)');
  back.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = back;
  c.fillRect(x0, y0, bw, fh * 0.12);

  // Pallu corner turned back over the top right.
  const fx = x0 + bw * 0.5;
  const fy = y0 + fh * 0.72;
  const flap = new Path2D();
  flap.moveTo(fx, y0);
  flap.lineTo(x0 + bw, y0);
  flap.lineTo(x0 + bw, fy);
  flap.closePath();
  softShadow(c, flap, 16 * k, 0.45, -10 * k, 14 * k);
  c.save();
  c.clip(flap);
  const pallu = sariCloth(s, fh * 1.6, fh * 1.25, { pallu: fh * 0.25, edges: ['top', 'bottom'], scale: k });
  c.translate(x0 + bw, y0);
  c.rotate(Math.PI * 0.25 + Math.atan2(fy - y0, x0 + bw - fx) - Math.PI / 4);
  c.drawImage(pallu, -pallu.width * 0.55, -pallu.height * 0.15);
  c.restore();
  // Crease along the diagonal.
  c.save();
  c.clip(flap);
  const dx = x0 + bw - fx;
  const dy = fy - y0;
  const len = Math.hypot(dx, dy);
  const nx = dy / len;
  const ny = -dx / len;
  const mx = (fx + x0 + bw) / 2;
  const my = (y0 + fy) / 2;
  const crease = c.createLinearGradient(mx - nx * 2, my - ny * 2, mx + nx * 60 * k, my + ny * 60 * k);
  crease.addColorStop(0, 'rgba(255,255,255,0.35)');
  crease.addColorStop(0.25, 'rgba(255,255,255,0.08)');
  crease.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = crease;
  c.fill(flap);
  c.restore();

  keyLight(c, x0, y0, bw, fh + th, SHEEN[s.design.weave] ?? 0.5);
  c.restore();
  if (!o.bare) vignette(c, W, H, 0.08);
}

/** Fringe of twisted tassels hanging from the pallu end. */
function fringe(c: Ctx, xs: number[], ys: number[], length: number, color: string, k: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const y = ys[i];
    const l = length * (0.85 + r() * 0.3);
    const sway = (r() - 0.5) * 6 * k;
    c.strokeStyle = shade(color, -0.15 + r() * 0.2);
    c.lineWidth = 2.2 * k;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + sway, y + l * 0.5, x + sway * 1.5, y + l);
    c.stroke();
    // Knot.
    c.fillStyle = shade(color, -0.2);
    c.beginPath();
    c.ellipse(x + sway * 0.3, y + l * 0.18, 2.6 * k, 4 * k, 0, 0, Math.PI * 2);
    c.fill();
  }
}

/** Sari hanging from a rod in soft pleats, showing the pallu and both borders. */
export function sariDrape(c: Ctx, W: number, H: number, s: SariSubject, bd: Backdrop = STUDIO, o: SceneOpts = {}) {
  const seed = hashString(s.key) + 3;
  if (!o.bare) paintBackdrop(c, W, H, bd, seed);
  const k = W / 1200;
  const cw = W * 0.6;
  const top = H * 0.12;
  const bottom = H * 0.86;
  const ch = bottom - top;
  const left = (W - cw) / 2;

  // Cloth in hanging orientation: rotate so the length runs downwards.
  const widthPx = Math.round(cw * 1.18);
  const lengthPx = Math.round(ch * 1.05);
  const flat = sariCloth(s, lengthPx, widthPx, { pallu: lengthPx * 0.52, scale: k });
  const hang = canvas(widthPx, lengthPx);
  const hc = ctx2d(hang);
  hc.translate(widthPx, 0);
  hc.rotate(Math.PI / 2);
  hc.drawImage(flat, 0, 0);

  // Pleat profile across the width.
  const pleats = 4.5;
  const amp = 0.055;
  const N = Math.round(cw);
  const xs: number[] = []; // source column for each output column
  const light: number[] = [];
  // Arc-length mapping: steep parts of each pleat are foreshortened.
  const samples = 2000;
  const cum = [0];
  for (let i = 1; i <= samples; i++) {
    const u = i / samples;
    const slope = amp * Math.PI * 2 * pleats * Math.cos(u * Math.PI * 2 * pleats);
    cum.push(cum[i - 1] + Math.cos(Math.atan(slope)));
  }
  const total = cum[samples];
  let j = 0;
  for (let x = 0; x < N; x++) {
    const target = (x / N) * total;
    while (j < samples && cum[j + 1] < target) j++;
    const u = j / samples;
    xs.push(u * widthPx);
    const slope = amp * Math.PI * 2 * pleats * Math.cos(u * Math.PI * 2 * pleats);
    const nx = -slope / Math.hypot(slope, 1);
    light.push(nx * 0.9);
  }

  // Shadow on the wall.
  softShadow(c, () => c.fillRect(left, top, cw, ch), 40 * k, 0.28, 34 * k, 26 * k);

  // Rod.
  const rodY = top - 8 * k;
  const rod = c.createLinearGradient(0, rodY - 12 * k, 0, rodY + 12 * k);
  rod.addColorStop(0, '#d8b77a');
  rod.addColorStop(0.45, '#8a6328');
  rod.addColorStop(1, '#4a3212');
  if (!o.bare) drawRod(c, W * 0.1, W * 0.9, rodY, k);

  // Hem follows the pleats.
  const hemY = (x: number) => bottom + Math.sin((x / N) * Math.PI * 2 * pleats + 0.6) * 10 * k;
  for (let x = 0; x < N; x++) {
    const sx = xs[x];
    const hy = hemY(x);
    c.drawImage(hang, sx, 0, Math.max(1, widthPx / N), lengthPx, left + x, top, 1.6, hy - top);
    const l = light[x];
    c.fillStyle = l > 0 ? `rgba(255, 248, 236, ${l * 0.32})` : `rgba(15, 8, 2, ${-l * 0.55})`;
    c.fillRect(left + x, top, 1.6, hy - top);
  }
  // Wrap over the rod and soft fall-off at the top.
  const wrap = c.createLinearGradient(0, top, 0, top + 70 * k);
  wrap.addColorStop(0, 'rgba(10,5,0,0.45)');
  wrap.addColorStop(1, 'rgba(10,5,0,0)');
  c.fillStyle = wrap;
  c.fillRect(left, top, cw, 70 * k);
  if (!o.bare) {
    c.fillStyle = rod;
    c.fillRect(W * 0.1, rodY - 9 * k, W * 0.8, 18 * k);
  }

  // Fringe at the pallu end.
  const fxs: number[] = [];
  const fys: number[] = [];
  for (let x = 6; x < N - 6; x += 7 * k) {
    fxs.push(left + x);
    fys.push(hemY(x) - 2 * k);
  }
  fringe(c, fxs, fys, 46 * k, s.colors.pallu, k, seed);
  keyLight(c, left, top, cw, ch, (SHEEN[s.design.weave] ?? 0.5) * 0.6);
  if (!o.bare) vignette(c, W, H, 0.1);
}

/** A brass rod with turned finials, at height y from x1 to x2. */
export function drawRod(c: Ctx, x1: number, x2: number, y: number, k: number) {
  const rod = c.createLinearGradient(0, y - 12 * k, 0, y + 12 * k);
  rod.addColorStop(0, '#d8b77a');
  rod.addColorStop(0.45, '#8a6328');
  rod.addColorStop(1, '#4a3212');
  softShadow(c, () => c.fillRect(x1, y - 9 * k, x2 - x1, 18 * k), 10 * k, 0.4, 6 * k, 14 * k);
  c.fillStyle = rod;
  c.fillRect(x1, y - 9 * k, x2 - x1, 18 * k);
  for (const ex of [x1, x2]) {
    const g = c.createRadialGradient(ex - 4 * k, y - 6 * k, 2 * k, ex, y, 20 * k);
    g.addColorStop(0, '#f1d9a6');
    g.addColorStop(0.5, '#a07a3a');
    g.addColorStop(1, '#3d2a10');
    c.fillStyle = g;
    c.beginPath();
    c.arc(ex, y, 18 * k, 0, Math.PI * 2);
    c.fill();
  }
}

/** Close-up across the border into the body: motifs and weave at large scale. */
export function sariDetail(c: Ctx, W: number, H: number, s: SariSubject) {
  const k = W / 1200;
  const widthPx = W * 2.2;
  const cloth = sariCloth(s, W * 2.2, widthPx, { edges: ['bottom'], scale: k * 2.2, motifScale: 0.7 });
  c.fillStyle = s.colors.body;
  c.fillRect(0, 0, W, H);
  c.save();
  c.translate(W / 2, H / 2);
  c.rotate(-0.16);
  c.drawImage(cloth, -cloth.width / 2, -cloth.height + H * 0.42);
  c.restore();
  // Gentle ripples across the cloth.
  for (let y = 0; y < H; y += 2) {
    const v = Math.sin((y / H) * Math.PI * 3.2 + 0.4) * 0.5 + Math.sin((y / H) * Math.PI * 7.1) * 0.15;
    c.fillStyle = v > 0 ? `rgba(255,250,240,${v * 0.1})` : `rgba(0,0,0,${-v * 0.16})`;
    c.fillRect(0, y, W, 2);
  }
  depthOfField(c, W, H, 9 * k);
  keyLight(c, 0, 0, W, H, (SHEEN[s.design.weave] ?? 0.5) * 0.8);
  vignette(c, W, H, 0.22);
}

/** Blurs the top and bottom of the frame like a shallow-focus macro lens. */
function depthOfField(c: Ctx, W: number, H: number, blur: number) {
  const copy = canvas(W, H);
  const cc = ctx2d(copy);
  cc.filter = `blur(${blur}px)`;
  cc.drawImage(c.canvas, 0, 0);
  const mask = canvas(W, H);
  const mc = ctx2d(mask);
  const g = mc.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.3, 'rgba(0,0,0,0)');
  g.addColorStop(0.72, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  mc.fillStyle = g;
  mc.fillRect(0, 0, W, H);
  mc.globalCompositeOperation = 'source-in';
  mc.drawImage(copy, 0, 0);
  c.drawImage(mask, 0, 0);
}

// ----------------------------------------------------------------------------- blouses

export interface BlouseSubject {
  key: string;
  design: BlouseDesign;
  colors: BlouseColors;
}

interface BlouseShape {
  outline: Path2D;
  neck: Path2D;
  /** Points along trims (neckline, sleeve hems) for embroidery. */
  trims: { a: [number, number]; b: [number, number]; ctrl?: [number, number] }[];
  bust: [number, number][];
  hem: [number, number][];
  /** Back view only: bottom corners of the back opening (dori anchors). */
  doriAnchors?: [number, number][];
  neckCurve: (t: number) => [number, number];
}

/** A blouse laid flat. Coordinates in px; `s` is half the bodice width. */
function blouseShape(cx: number, y0: number, s: number, d: BlouseDesign, view: 'front' | 'back'): BlouseShape {
  const shoulderNeck = d.neck === 'boat' && view === 'front' ? 0.4 : 0.27;
  const sleeveLen = { sleeveless: 0, short: 0.46, elbow: 0.95, 'three-quarter': 1.25 }[d.sleeve] * s;
  const angle = (52 * Math.PI) / 180;
  const tip: [number, number] = [cx + 0.64 * s, y0 + 0.17 * s];
  const under: [number, number] = [cx + 0.9 * s, y0 + 0.6 * s];
  const dir: [number, number] = [Math.cos(angle), Math.sin(angle)];
  const hemW = (d.sleeve === 'short' ? 0.44 : d.sleeve === 'elbow' ? 0.34 : 0.3) * s;
  const outer: [number, number] = [tip[0] + dir[0] * sleeveLen, tip[1] + dir[1] * sleeveLen];
  const inner: [number, number] = [outer[0] - dir[1] * hemW, outer[1] + dir[0] * hemW];
  const waist: [number, number] = [cx + 0.8 * s, y0 + 1.22 * s];
  const front: [number, number] = [cx, y0 + 1.32 * s];

  // Neckline depth/shape.
  const depth = view === 'back'
    ? { round: 0.4, 'deep-u': 0.86, keyhole: 0.3, 'deep-v': 0.9 }[d.back] * s
    : { round: 0.34, sweetheart: 0.5, v: 0.56, boat: 0.12, high: 0.1 }[d.neck] * s;
  const nx = cx + shoulderNeck * s;
  const neckCurve = (t: number): [number, number] => {
    // t: 0 at the right shoulder, 1 at centre. Falls first, then turns toward the centre.
    const style = view === 'back' ? d.back : d.neck;
    if (style === 'v' || style === 'deep-v') return [nx + (cx - nx) * t, y0 + depth * t];
    const a = (t * Math.PI) / 2;
    const ex = nx + (cx - nx) * (1 - Math.cos(a));
    let ey = y0 + depth * Math.sin(a);
    if (style === 'sweetheart') ey -= s * 0.1 * Math.exp(-Math.pow((1 - t) / 0.16, 2));
    if (style === 'deep-u') return [nx + (cx - nx) * (1 - Math.cos(a)) * 0.95 + (cx - nx) * 0.05 * t, y0 + depth * Math.sin(a)];
    return [ex, ey];
  };

  const mirror = (p: [number, number]): [number, number] => [2 * cx - p[0], p[1]];
  const outline = new Path2D();
  const neck = new Path2D();
  const nPts: [number, number][] = [];
  for (let i = 0; i <= 24; i++) nPts.push(neckCurve(i / 24));
  // Right half from centre neck going clockwise.
  outline.moveTo(nPts[24][0], nPts[24][1]);
  for (let i = 23; i >= 0; i--) outline.lineTo(...nPts[i]);
  outline.quadraticCurveTo((nPts[0][0] + tip[0]) / 2, y0 - 0.01 * s, tip[0], tip[1]);
  if (d.sleeve === 'sleeveless') {
    outline.quadraticCurveTo(cx + 0.74 * s, y0 + 0.5 * s, under[0], under[1]);
  } else {
    outline.lineTo(...outer);
    outline.lineTo(...inner);
    outline.quadraticCurveTo(under[0] + 0.02 * s, under[1] - 0.04 * s, under[0], under[1]);
  }
  outline.quadraticCurveTo(cx + 0.84 * s, y0 + 0.92 * s, waist[0], waist[1]);
  outline.quadraticCurveTo(cx + 0.5 * s, y0 + 1.28 * s, front[0], front[1]);
  const lw = mirror(waist);
  outline.quadraticCurveTo(cx - 0.5 * s, y0 + 1.28 * s, lw[0], lw[1]);
  outline.quadraticCurveTo(cx - 0.84 * s, y0 + 0.92 * s, ...mirror(under));
  if (d.sleeve === 'sleeveless') {
    outline.quadraticCurveTo(cx - 0.74 * s, y0 + 0.5 * s, ...mirror(tip));
  } else {
    const li = mirror(inner);
    outline.quadraticCurveTo(2 * cx - (under[0] + 0.02 * s), under[1] - 0.04 * s, li[0], li[1]);
    outline.lineTo(...mirror(outer));
    outline.lineTo(...mirror(tip));
  }
  outline.quadraticCurveTo(2 * cx - (nPts[0][0] + tip[0]) / 2, y0 - 0.01 * s, ...mirror(nPts[0]));
  for (let i = 1; i <= 24; i++) outline.lineTo(...mirror(nPts[i]));
  outline.closePath();

  neck.moveTo(...nPts[0]);
  for (let i = 1; i <= 24; i++) neck.lineTo(...nPts[i]);
  for (let i = 23; i >= 0; i--) neck.lineTo(...mirror(nPts[i]));

  const trims: BlouseShape['trims'] = [];
  if (d.sleeve !== 'sleeveless') {
    trims.push({ a: outer, b: inner });
    trims.push({ a: mirror(outer), b: mirror(inner) });
  }
  return {
    outline,
    neck,
    trims,
    bust: [[cx + 0.42 * s, y0 + 0.66 * s], [cx - 0.42 * s, y0 + 0.66 * s]],
    hem: [lw, front, waist],
    doriAnchors: view === 'back' && d.back !== 'round' ? [mirror(nPts[22]), nPts[22]] : undefined,
    neckCurve,
  };
}

function blouseCloth(b: BlouseSubject, w: number, h: number, k: number) {
  return weaveCloth(w, h, {
    weave: b.design.weave,
    field: b.design.field,
    spacing: w * (b.design.motifScale ?? 0.07),
    colors: { body: b.colors.body, motif: b.colors.motif ?? shade(b.colors.body, 0.35), border: b.colors.trim, pallu: b.colors.body, zari: b.colors.zari, accent: b.colors.accent ?? b.colors.trim },
    scale: k,
    seed: hashString(b.key),
  });
}

function blouseScene(c: Ctx, W: number, H: number, b: BlouseSubject, view: 'front' | 'back', bd: Backdrop, zoom = 1, focus: [number, number] = [0.5, 0.5], o: SceneOpts = {}) {
  const k = (W / 1200) * zoom;
  const seed = hashString(b.key) + (view === 'back' ? 11 : 0);
  if (!o.bare) paintBackdrop(c, W, H, bd, seed);
  c.save();
  if (zoom !== 1) {
    c.translate(W / 2, H / 2);
    c.scale(zoom, zoom);
    c.translate(-W * focus[0], -H * focus[1]);
  }
  const s = W * 0.34;
  const cx = W / 2;
  // Centre the garment (with its hanging dori, from the back) in the frame.
  const y0 = H / 2 - (view === 'back' && b.design.dori && b.design.back !== 'round' ? 0.92 : 0.64) * s;
  const shape = blouseShape(cx, y0, s, b.design, view);
  const d = b.design;
  const pal = palette(c, b.colors.zari, k, seed);

  softShadow(c, shape.outline, 30 * (W / 1200), 0.3, 14 * (W / 1200), 24 * (W / 1200));
  softShadow(c, shape.outline, 6 * (W / 1200), 0.35, 2, 5);

  c.save();
  c.clip(shape.outline);
  const cloth = blouseCloth(b, W, H, W / 1200);
  c.drawImage(cloth, 0, 0);

  // Lining visible through the neckline is handled by the backdrop; draw a facing edge.
  // Darts and princess seams (front) or centre-back seam.
  c.strokeStyle = rgba('#000000', 0.22);
  c.lineWidth = 2.2 * (W / 1200);
  const [bR, bL] = shape.bust;
  if (view === 'front') {
    for (const [bx, by] of [bR, bL]) {
      const side = bx > cx ? 1 : -1;
      c.beginPath();
      c.moveTo(bx + side * 0.05 * s, by + 0.08 * s);
      c.lineTo(bx + side * 0.06 * s, y0 + 1.26 * s);
      c.stroke();
      c.beginPath();
      c.moveTo(bx + side * 0.12 * s, by);
      c.lineTo(cx + side * 0.97 * s, y0 + 0.74 * s);
      c.stroke();
    }
    // Front opening with hooks.
    c.beginPath();
    c.moveTo(cx, shape.neckCurve(1)[1]);
    c.lineTo(cx, y0 + 1.34 * s);
    c.stroke();
    c.fillStyle = rgba('#000000', 0.25);
    for (let y = shape.neckCurve(1)[1] + 0.08 * s; y < y0 + 1.3 * s; y += 0.11 * s) {
      c.beginPath();
      c.arc(cx + 0.015 * s, y, 1.8 * (W / 1200), 0, Math.PI * 2);
      c.fill();
    }
  } else {
    c.beginPath();
    c.moveTo(cx, shape.neckCurve(1)[1]);
    c.lineTo(cx, y0 + 1.34 * s);
    c.stroke();
    for (const [bx] of [bR, bL]) {
      c.beginPath();
      c.moveTo(bx, y0 + 0.9 * s);
      c.lineTo(bx + (bx > cx ? 0.03 : -0.03) * s, y0 + 1.27 * s);
      c.stroke();
    }
  }

  // Form: soft volume at the bust, shade toward the sides and sleeves.
  for (const [bx, by] of [bR, bL]) {
    const g = c.createRadialGradient(bx - 0.08 * s, by - 0.1 * s, 0, bx, by, 0.55 * s);
    g.addColorStop(0, view === 'front' ? 'rgba(255,250,240,0.26)' : 'rgba(255,250,240,0.12)');
    g.addColorStop(1, 'rgba(255,250,240,0)');
    c.fillStyle = g;
    c.fillRect(cx - 2 * s, y0 - s, 4 * s, 3 * s);
  }
  const sides = c.createLinearGradient(cx - 1.9 * s, 0, cx + 1.9 * s, 0);
  sides.addColorStop(0, 'rgba(0,0,0,0.2)');
  sides.addColorStop(0.3, 'rgba(0,0,0,0)');
  sides.addColorStop(0.7, 'rgba(0,0,0,0)');
  sides.addColorStop(1, 'rgba(0,0,0,0.24)');
  c.fillStyle = sides;
  c.fillRect(cx - 2 * s, y0 - s, 4 * s, 3 * s);
  // Hem shadow.
  const hem = c.createLinearGradient(0, y0 + 1.12 * s, 0, y0 + 1.34 * s);
  hem.addColorStop(0, 'rgba(0,0,0,0)');
  hem.addColorStop(1, 'rgba(0,0,0,0.28)');
  c.fillStyle = hem;
  c.fillRect(cx - 2 * s, y0 + 1.1 * s, 4 * s, 0.3 * s);
  c.restore();

  // Trims: neckline facing and sleeve bands.
  const trimW = (d.trim === 'zari' ? 0.05 : 0.03) * s;
  const zfill = d.trim === 'zari' ? pal.zari : pal.thread(b.colors.trim);
  if (d.trim !== 'none') {
    c.save();
    c.clip(shape.outline);
    c.strokeStyle = zfill;
    c.lineWidth = trimW * 2;
    c.lineJoin = 'round';
    c.stroke(shape.neck);
    for (const t of shape.trims) {
      c.beginPath();
      c.moveTo(...t.a);
      c.lineTo(...t.b);
      c.lineWidth = trimW * 2.6;
      c.stroke();
      // Piping line inside the band.
      c.strokeStyle = pal.thread(b.colors.trim);
      c.lineWidth = trimW * 0.4;
      c.stroke();
      c.strokeStyle = zfill;
    }
    c.restore();
  }

  // Embroidery along the neckline (and sleeve bands).
  if (d.embroidery !== 'none') {
    const r = rng(seed + 5);
    const along: [number, number][] = [];
    const mirror = d.embroidery === 'mirror';
    const count = mirror ? 9 : 40;
    const offset = (mirror ? 0.12 : 0.075) * s;
    for (let i = 0; i <= count; i++) {
      const t = (i / count) * (mirror ? 0.94 : 1);
      const [x, y] = shape.neckCurve(t);
      // Step off the neckline into the cloth, along the curve's normal.
      const [x2, y2] = shape.neckCurve(Math.min(1, t + 0.02));
      const [x1, y1] = shape.neckCurve(Math.max(0, t - 0.02));
      const tx = x2 - x1;
      const ty = y2 - y1;
      const l = Math.hypot(tx, ty) || 1;
      const ox = (ty / l) * offset;
      const oy = (-tx / l) * offset;
      along.push([x + ox, y + oy], [2 * cx - x - ox, y + oy]);
    }
    for (const t of shape.trims) {
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        const x = t.a[0] + (t.b[0] - t.a[0]) * u;
        const y = t.a[1] + (t.b[1] - t.a[1]) * u;
        const dx = t.b[1] - t.a[1];
        const dy = -(t.b[0] - t.a[0]);
        const l = Math.hypot(dx, dy);
        along.push([x - (dx / l) * 0.09 * s, y - (dy / l) * 0.09 * s]);
      }
    }
    c.save();
    c.clip(shape.outline);
    for (const [x, y] of along) {
      if (d.embroidery === 'mirror') {
        const rr = 0.036 * s;
        c.fillStyle = pal.thread(b.colors.accent ?? b.colors.trim);
        c.beginPath();
        c.arc(x, y, rr * 1.45, 0, Math.PI * 2);
        c.fill();
        const g = c.createRadialGradient(x - rr * 0.3, y - rr * 0.3, 0, x, y, rr);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.45, '#c9ccd2');
        g.addColorStop(1, '#5c6068');
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, rr, 0, Math.PI * 2);
        c.fill();
      } else if (d.embroidery === 'zardozi') {
        c.fillStyle = pal.zari;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + r();
          c.beginPath();
          c.ellipse(x + Math.cos(a) * 0.026 * s, y + Math.sin(a) * 0.026 * s, 0.016 * s, 0.008 * s, a, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = shade(b.colors.zari, 0.4);
        c.beginPath();
        c.arc(x, y, 0.01 * s, 0, Math.PI * 2);
        c.fill();
      } else {
        c.fillStyle = pal.thread(b.colors.accent ?? b.colors.trim);
        stamp(c, paisleyPath(), x, y, 0.06 * s, c.fillStyle, r() * 6);
      }
    }
    c.restore();
  }

  // Neckline edge: the opening shows a soft inner shadow.
  c.save();
  c.clip(shape.outline);
  c.strokeStyle = 'rgba(0,0,0,0.25)';
  c.lineWidth = 3 * (W / 1200);
  c.stroke(shape.neck);
  c.restore();

  // Dori: twisted cords with tassels from the back opening.
  if (view === 'back' && d.dori && shape.doriAnchors) {
    const cord = pal.thread(b.colors.trim);
    const [a1, a2] = shape.doriAnchors;
    const cords: [number, number, number][] = [
      [a1[0], a1[1], -1],
      [a2[0], a2[1], 1],
    ];
    for (const [ax, ay, side] of cords) {
      const ex = cx + side * 0.18 * s;
      const ey = y0 + 1.66 * s;
      c.strokeStyle = cord;
      c.lineWidth = 0.022 * s;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(ax, ay);
      c.bezierCurveTo(ax + side * 0.1 * s, ay + 0.3 * s, ex - side * 0.15 * s, ey - 0.3 * s, ex, ey);
      c.stroke();
      // Latkan: beaded cap and tassel.
      c.fillStyle = pal.zari;
      c.beginPath();
      c.arc(ex, ey + 0.03 * s, 0.045 * s, 0, Math.PI * 2);
      c.fill();
      for (let i = 0; i < 14; i++) {
        const t = (i / 13 - 0.5) * 0.09 * s;
        c.strokeStyle = shade(b.colors.trim, (i % 3) * 0.08 - 0.08);
        c.lineWidth = 0.008 * s;
        c.beginPath();
        c.moveTo(ex + t * 0.6, ey + 0.06 * s);
        c.lineTo(ex + t, ey + 0.26 * s);
        c.stroke();
      }
    }
  }
  c.restore();
  if (!o.bare) {
    keyLight(c, 0, 0, W, H, 0);
    vignette(c, W, H, 0.08);
  }
}

export function blouseFront(c: Ctx, W: number, H: number, b: BlouseSubject, bd: Backdrop = STUDIO, o: SceneOpts = {}) {
  blouseScene(c, W, H, b, 'front', bd, 1, [0.5, 0.5], o);
}

export function blouseBack(c: Ctx, W: number, H: number, b: BlouseSubject, bd: Backdrop = STUDIO) {
  blouseScene(c, W, H, b, 'back', bd);
}

export function blouseDetail(c: Ctx, W: number, H: number, b: BlouseSubject, bd: Backdrop = STUDIO) {
  // Close on the neckline and right sleeve.
  blouseScene(c, W, H, b, 'front', bd, 1.9, [0.6, 0.4]);
  depthOfField(c, W, H, 6 * (W / 1200));
}

export { mix };
