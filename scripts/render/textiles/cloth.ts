// Flat cloth: weaves a rectangle of sari (or blouse) fabric onto a canvas.
//
// Cloth space: x runs along the length of the sari, y across its width. Borders
// sit on the top and bottom edges; the pallu, when present, is a span of x.
// Everything is drawn in the browser (Canvas 2D) by scripts/render/textiles/entry.ts.

import type { BorderStyle, FieldMotif, PalluStyle, Weave } from './types';

export type Ctx = CanvasRenderingContext2D;

// ----------------------------------------------------------------------------- utilities

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement) {
  return c.getContext('2d', { willReadFrequently: false })!;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (x) => x + x) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const f = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${f(r1, r2)}, ${f(g1, g2)}, ${f(b1, b2)})`;
}

export function shade(hex: string, amount: number) {
  return amount >= 0 ? mix(hex, '#ffffff', amount) : mix(hex, '#000000', -amount);
}

export function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// ----------------------------------------------------------------------------- thread fills

/**
 * A woven-thread fill: fine weft floats with a little irregularity, so motifs
 * read as woven rather than printed. Metallic (zari) fills get bright glints.
 */
export function threadPattern(c: Ctx, color: string, opts: { metallic?: boolean; scale: number; seed: number }) {
  const s = Math.max(24, Math.round(64 * opts.scale));
  const t = canvas(s, s);
  const g = ctx2d(t);
  const r = rng(opts.seed);
  g.fillStyle = color;
  g.fillRect(0, 0, s, s);
  const line = Math.max(1, s / 32);
  for (let y = 0; y < s; y += line) {
    const v = (r() - 0.5) * (opts.metallic ? 0.28 : 0.06);
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(0, y, s, line * 0.6);
  }
  if (opts.metallic) {
    // Metallic floats catch the light in short streaks.
    for (let i = 0; i < s * 0.9; i++) {
      const x = r() * s;
      const y = Math.floor((r() * s) / line) * line;
      const len = (0.15 + r() * 0.5) * s * 0.25;
      g.fillStyle = `rgba(255, 248, 220, ${0.15 + r() * 0.4})`;
      g.fillRect(x, y, len, line * 0.55);
      if (x + len > s) g.fillRect(x - s, y, len, line * 0.55);
    }
    for (let i = 0; i < s * 0.6; i++) {
      g.fillStyle = `rgba(40, 24, 0, ${0.15 + r() * 0.25})`;
      g.fillRect(r() * s, Math.floor((r() * s) / line) * line, r() * s * 0.1, line * 0.5);
    }
  }
  return c.createPattern(t, 'repeat')!;
}

export interface Palette {
  zari: CanvasPattern;
  zariSolid: string;
  thread: (color: string) => CanvasPattern;
}

export function palette(c: Ctx, zari: string, scale: number, seed: number): Palette {
  const cache = new Map<string, CanvasPattern>();
  return {
    zari: threadPattern(c, zari, { metallic: true, scale, seed }),
    zariSolid: zari,
    thread: (color: string) => {
      if (!cache.has(color)) cache.set(color, threadPattern(c, color, { scale, seed: seed + cache.size + 1 }));
      return cache.get(color)!;
    },
  };
}

// ----------------------------------------------------------------------------- motif shapes (unit size, centred)

export function paisleyPath(): Path2D {
  const p = new Path2D();
  p.moveTo(0.12, -0.5);
  p.bezierCurveTo(0.42, -0.42, 0.48, 0.0, 0.3, 0.26);
  p.bezierCurveTo(0.16, 0.46, -0.22, 0.52, -0.36, 0.26);
  p.bezierCurveTo(-0.48, 0.04, -0.3, -0.16, -0.08, -0.14);
  p.bezierCurveTo(0.08, -0.13, 0.16, -0.24, 0.06, -0.36);
  p.bezierCurveTo(0.02, -0.42, 0.06, -0.48, 0.12, -0.5);
  p.closePath();
  return p;
}

function paisleyInner(): Path2D {
  const p = new Path2D();
  p.moveTo(0.1, -0.22);
  p.bezierCurveTo(0.3, -0.12, 0.3, 0.12, 0.16, 0.26);
  p.bezierCurveTo(0.04, 0.38, -0.2, 0.36, -0.26, 0.2);
  p.bezierCurveTo(-0.32, 0.06, -0.18, -0.04, -0.04, -0.03);
  p.bezierCurveTo(0.08, -0.03, 0.14, -0.12, 0.1, -0.22);
  p.closePath();
  return p;
}

function flowerPath(petals: number, inner = 0.18): Path2D {
  const p = new Path2D();
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const cx = Math.cos(a) * 0.27;
    const cy = Math.sin(a) * 0.27;
    p.ellipse(cx, cy, 0.24, 0.12, a, 0, Math.PI * 2);
  }
  p.moveTo(inner, 0);
  p.arc(0, 0, inner, 0, Math.PI * 2);
  return p;
}

function coinPath(): Path2D {
  const p = new Path2D();
  p.arc(0, 0, 0.5, 0, Math.PI * 2);
  p.moveTo(0.34, 0);
  p.arc(0, 0, 0.34, 0, Math.PI * 2, true);
  p.moveTo(0.2, 0);
  p.arc(0, 0, 0.2, 0, Math.PI * 2);
  return p;
}

function starPath(points = 8, inner = 0.22): Path2D {
  const p = new Path2D();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 0.5 : inner;
    if (i === 0) p.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else p.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  p.closePath();
  return p;
}

function leafPath(): Path2D {
  const p = new Path2D();
  p.moveTo(0, -0.5);
  p.quadraticCurveTo(0.36, -0.1, 0, 0.5);
  p.quadraticCurveTo(-0.36, -0.1, 0, -0.5);
  p.closePath();
  return p;
}

const SHAPES = {
  paisley: paisleyPath(),
  paisleyInner: paisleyInner(),
  flower: flowerPath(8),
  flower6: flowerPath(6, 0.16),
  coin: coinPath(),
  star: starPath(),
  leaf: leafPath(),
};

export function stamp(c: Ctx, shape: Path2D, x: number, y: number, size: number, fill: string | CanvasPattern, rot = 0, flip = false) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(flip ? -size : size, size);
  c.fillStyle = fill;
  c.fill(shape, 'evenodd');
  c.restore();
}

/** A paisley (mankolam) with an inner outline and a dotted heart: reads as woven, not clip-art. */
export function richPaisley(c: Ctx, x: number, y: number, size: number, outer: string | CanvasPattern, inner: string | CanvasPattern, rot = 0, flip = false) {
  stamp(c, SHAPES.paisley, x, y, size, outer, rot, flip);
  stamp(c, SHAPES.paisleyInner, x, y, size, inner, rot, flip);
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(flip ? -size : size, size);
  c.fillStyle = outer;
  for (let i = 0; i < 5; i++) {
    c.beginPath();
    c.arc(-0.06 + Math.cos(i * 1.2) * 0.1, 0.12 + Math.sin(i * 1.2) * 0.1, 0.035, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

// ----------------------------------------------------------------------------- fields

export interface FieldColors {
  base: string;
  motif: string; // thread colour for motifs that are not zari
  accent: string;
}

/** Fills the rectangle with the field motif (the base colour must already be painted). */
export function drawField(c: Ctx, field: FieldMotif, x0: number, y0: number, w: number, h: number, spacing: number, col: FieldColors, pal: Palette, seed: number) {
  const r = rng(seed);
  const zari = pal.zari;
  c.save();
  c.beginPath();
  c.rect(x0, y0, w, h);
  c.clip();
  const s = spacing;
  const half = (fn: (x: number, y: number, row: number, i: number) => void) => {
    let row = 0;
    let i = 0;
    for (let y = y0 - s; y < y0 + h + s; y += s * 0.86, row++) {
      const off = row % 2 ? s / 2 : 0;
      for (let x = x0 - s + off; x < x0 + w + s; x += s) fn(x, y, row, i++);
    }
  };
  switch (field) {
    case 'plain':
      break;
    case 'coin-butta':
      half((x, y) => stamp(c, SHAPES.coin, x, y, s * 0.3, zari));
      break;
    case 'dot-butta':
      half((x, y) => stamp(c, SHAPES.coin, x, y, s * 0.12, zari));
      break;
    case 'star-butta':
      half((x, y) => stamp(c, SHAPES.star, x, y, s * 0.3, zari, Math.PI / 8));
      break;
    case 'flower-butta':
      half((x, y, row) => {
        stamp(c, SHAPES.flower6, x, y, s * 0.34, row % 2 ? zari : pal.thread(col.motif), row * 0.4);
      });
      break;
    case 'paisley-butta':
      half((x, y, row) => richPaisley(c, x, y, s * 0.42, zari, pal.thread(col.base), 0.35, row % 2 === 1));
      break;
    case 'tanchoi': {
      const t = pal.thread(col.motif);
      const small = s * 0.45;
      let row = 0;
      for (let y = y0 - small; y < y0 + h + small; y += small * 0.7, row++) {
        for (let x = x0 - small + (row % 2 ? small / 2 : 0); x < x0 + w + small; x += small) {
          if ((row + Math.round(x / small)) % 3 === 0) stamp(c, SHAPES.paisley, x, y, small * 0.5, t, 0.5, row % 2 === 0);
          else stamp(c, SHAPES.flower, x, y, small * 0.32, t, row);
        }
      }
      break;
    }
    case 'jaal':
    case 'jangla': {
      const big = field === 'jangla';
      const cell = big ? s * 1.5 : s;
      c.strokeStyle = zari;
      c.lineWidth = cell * (big ? 0.035 : 0.025);
      for (let k = -h; k < w + h; k += cell) {
        c.beginPath();
        c.moveTo(x0 + k, y0);
        c.lineTo(x0 + k + h, y0 + h);
        c.stroke();
        c.beginPath();
        c.moveTo(x0 + k, y0 + h);
        c.lineTo(x0 + k + h, y0);
        c.stroke();
      }
      // Joins and cell centres.
      for (let k = -h * 2; k < w + h * 2; k += cell) {
        for (let j = 0; j * cell / 2 < h + cell; j++) {
          const jx = x0 + k + (j % 2 ? cell / 2 : 0);
          const jy = y0 + (j * cell) / 2;
          if (jx < x0 - cell || jx > x0 + w + cell) continue;
          stamp(c, SHAPES.flower6, jx, jy, cell * 0.16, zari);
          if (big) {
            richPaisley(c, jx + cell / 2, jy, cell * 0.38, zari, pal.thread(col.base), -0.4, j % 2 === 0);
            stamp(c, SHAPES.leaf, jx + cell / 2 - cell * 0.2, jy - cell * 0.18, cell * 0.14, pal.thread(col.motif), -0.9);
          } else {
            stamp(c, SHAPES.star, jx + cell / 2, jy, cell * 0.12, pal.thread(col.motif));
          }
        }
      }
      break;
    }
    case 'checks':
    case 'kota-checks': {
      const kota = field === 'kota-checks';
      const cell = kota ? s * 0.32 : s * 0.6;
      const lw = kota ? cell * 0.14 : cell * 0.08;
      c.fillStyle = kota ? rgba(col.motif, 0.55) : pal.thread(col.motif);
      for (let x = x0; x < x0 + w; x += cell) c.fillRect(x, y0, lw, h);
      for (let y = y0; y < y0 + h; y += cell) c.fillRect(x0, y, w, lw);
      if (!kota) {
        c.fillStyle = zari;
        for (let x = x0 + cell / 2; x < x0 + w; x += cell * 2) c.fillRect(x, y0, lw * 0.5, h);
      }
      break;
    }
    case 'stripes': {
      let y = y0;
      let i = 0;
      while (y < y0 + h) {
        const gap = s * (0.25 + r() * 0.35);
        y += gap;
        const bw = s * (i % 3 === 0 ? 0.06 : 0.025);
        c.fillStyle = i % 4 === 0 ? zari : pal.thread(col.motif);
        c.fillRect(x0, y, w, bw);
        i++;
      }
      break;
    }
    case 'brocade': {
      // Dense zari ground with the base colour peeking through as motifs.
      c.fillStyle = zari;
      c.fillRect(x0, y0, w, h);
      const t = pal.thread(col.base);
      half((x, y, row) => {
        richPaisley(c, x, y, s * 0.48, t, zari, 0.3, row % 2 === 0);
      });
      half((x, y) => stamp(c, SHAPES.flower6, x + s / 2, y + s * 0.43, s * 0.14, t));
      break;
    }
    case 'embroidered-florals': {
      const t = pal.thread(col.motif);
      const a = pal.thread(col.accent);
      half((x, y, row, i) => {
        const jx = x + (r() - 0.5) * s * 0.25;
        const jy = y + (r() - 0.5) * s * 0.25;
        c.strokeStyle = a;
        c.lineWidth = s * 0.018;
        c.beginPath();
        c.moveTo(jx, jy);
        c.quadraticCurveTo(jx + s * 0.1, jy + s * 0.12, jx + s * 0.02, jy + s * 0.26);
        c.stroke();
        stamp(c, SHAPES.leaf, jx + s * 0.07, jy + s * 0.15, s * 0.1, a, 0.9);
        stamp(c, SHAPES.flower6, jx, jy, s * 0.2, t, i);
        stamp(c, SHAPES.coin, jx, jy, s * 0.05, pal.zari);
        void row;
      });
      break;
    }
  }
  c.restore();
}

// ----------------------------------------------------------------------------- borders

export interface BorderColors {
  base: string;
  body: string;
  accent: string;
}

/**
 * Draws a border band in a local frame: the outer selvedge edge at y = 0, the
 * body side at y = bw, running from x = 0 to x = len.
 */
export function drawBorder(c: Ctx, style: BorderStyle, len: number, bw: number, col: BorderColors, pal: Palette) {
  const z = pal.zari;
  const line = (y: number, t: number, fill: string | CanvasPattern = z) => {
    c.fillStyle = fill;
    c.fillRect(0, y, len, t);
  };
  c.save();
  switch (style) {
    case 'temple': {
      // Contrast korvai band; temple teeth point into the body.
      const band = bw * 0.74;
      c.fillStyle = pal.thread(col.base);
      c.fillRect(0, 0, len, band);
      line(0, bw * 0.05);
      line(bw * 0.09, bw * 0.018);
      // Rudraksha row
      const rr = bw * 0.07;
      for (let x = rr * 1.5; x < len; x += rr * 3.2) stamp(c, SHAPES.coin, x, bw * 0.19, rr * 1.7, z);
      line(bw * 0.27, bw * 0.02);
      // Wide zari stripe with small paisleys woven in the band colour
      line(bw * 0.33, bw * 0.2);
      const pt = pal.thread(col.base);
      for (let x = bw * 0.12; x < len; x += bw * 0.26) richPaisley(c, x, bw * 0.43, bw * 0.17, pt, z, Math.PI / 2, false);
      line(bw * 0.57, bw * 0.02);
      for (let x = 0; x < len; x += bw * 0.12) stamp(c, SHAPES.star, x, bw * 0.64, bw * 0.08, z);
      line(band - bw * 0.035, bw * 0.035);
      // Teeth: border colour triangles, outlined in zari, reaching into the body.
      const tooth = bw * 0.2;
      const toothH = bw * 0.26;
      for (let x = 0; x < len + tooth; x += tooth) {
        c.beginPath();
        c.moveTo(x, band);
        c.lineTo(x + tooth / 2, band + toothH);
        c.lineTo(x + tooth, band);
        c.closePath();
        c.fillStyle = z;
        c.fill();
        c.beginPath();
        c.moveTo(x + tooth * 0.12, band);
        c.lineTo(x + tooth / 2, band + toothH * 0.8);
        c.lineTo(x + tooth * 0.88, band);
        c.closePath();
        c.fillStyle = pal.thread(col.base);
        c.fill();
        stamp(c, SHAPES.coin, x + tooth / 2, band + toothH * 0.3, tooth * 0.18, z);
      }
      break;
    }
    case 'rudraksha': {
      c.fillStyle = pal.thread(col.base);
      c.fillRect(0, 0, len, bw);
      line(0, bw * 0.06);
      line(bw * 0.14, bw * 0.03);
      const rr = bw * 0.16;
      for (let x = rr; x < len; x += rr * 2.4) {
        stamp(c, SHAPES.coin, x, bw * 0.4, rr * 1.9, z);
        stamp(c, SHAPES.flower6, x + rr * 1.2, bw * 0.4, rr * 0.7, pal.thread(col.accent));
      }
      line(bw * 0.66, bw * 0.03);
      line(bw * 0.76, bw * 0.12);
      line(bw * 0.94, bw * 0.03);
      break;
    }
    case 'paisley-band': {
      c.fillStyle = pal.thread(col.base);
      c.fillRect(0, 0, len, bw);
      line(0, bw * 0.05);
      line(bw * 0.1, bw * 0.025);
      const ps = bw * 0.48;
      let i = 0;
      for (let x = ps * 0.6; x < len + ps; x += ps * 0.82, i++) {
        richPaisley(c, x, bw * 0.47, ps, z, pal.thread(col.base), i % 2 ? 0.5 : -0.5 + Math.PI, i % 2 === 0);
      }
      line(bw * 0.84, bw * 0.03);
      for (let x = 0; x < len; x += bw * 0.1) stamp(c, SHAPES.coin, x, bw * 0.93, bw * 0.06, z);
      break;
    }
    case 'vine': {
      c.fillStyle = pal.thread(col.base);
      c.fillRect(0, 0, len, bw);
      line(0, bw * 0.06);
      line(bw * 0.86, bw * 0.05);
      c.strokeStyle = z;
      c.lineWidth = bw * 0.05;
      c.beginPath();
      const wl = bw * 1.1;
      for (let x = 0; x <= len; x += 4) {
        const y = bw * 0.48 + Math.sin((x / wl) * Math.PI * 2) * bw * 0.18;
        if (x === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      for (let x = wl / 4; x < len; x += wl / 2) {
        const up = Math.round((x - wl / 4) / (wl / 2)) % 2 === 0;
        const y = bw * 0.48 + (up ? -1 : 1) * bw * 0.18;
        stamp(c, SHAPES.flower6, x, y, bw * 0.3, z);
        stamp(c, SHAPES.leaf, x + wl * 0.2, bw * 0.48 + (up ? 1 : -1) * bw * 0.06, bw * 0.22, pal.thread(col.accent), up ? 0.8 : -0.8 + Math.PI);
      }
      break;
    }
    case 'stripes': {
      c.fillStyle = pal.thread(col.base);
      c.fillRect(0, 0, len, bw * 0.78);
      const stripes: [number, number, 'z' | 'a' | 'b'][] = [
        [0, 0.08, 'z'], [0.14, 0.03, 'a'], [0.22, 0.14, 'z'], [0.42, 0.03, 'z'], [0.5, 0.06, 'a'], [0.62, 0.025, 'z'], [0.7, 0.06, 'z'],
      ];
      for (const [y, t, k] of stripes) line(bw * y, bw * t, k === 'z' ? z : k === 'a' ? pal.thread(col.accent) : pal.thread(col.body));
      // Reed-like tiny buttas along the inner edge.
      for (let x = bw * 0.2; x < len; x += bw * 0.4) stamp(c, SHAPES.star, x, bw * 0.9, bw * 0.1, z);
      break;
    }
    case 'thin': {
      line(0, bw * 0.12);
      line(bw * 0.2, bw * 0.4);
      line(bw * 0.68, bw * 0.08, pal.thread(col.accent));
      line(bw * 0.84, bw * 0.06);
      break;
    }
    case 'tope-teni': {
      c.fillStyle = pal.thread(col.base);
      c.fillRect(0, 0, len, bw);
      line(0, bw * 0.05, pal.thread(col.accent));
      line(bw * 0.12, bw * 0.04, pal.thread(col.accent));
      // Interlocking teeth (teni), a hallmark of Ilkal borders.
      const tw = bw * 0.36;
      for (let x = 0; x < len + tw; x += tw) {
        c.beginPath();
        c.moveTo(x, bw * 0.24);
        c.lineTo(x + tw / 2, bw * 0.62);
        c.lineTo(x + tw, bw * 0.24);
        c.closePath();
        c.fillStyle = pal.thread(col.accent);
        c.fill();
        c.beginPath();
        c.moveTo(x + tw / 2, bw * 0.92);
        c.lineTo(x + tw, bw * 0.58);
        c.lineTo(x + tw * 1.5, bw * 0.92);
        c.closePath();
        c.fillStyle = pal.thread(col.body);
        c.fill();
      }
      line(bw * 0.92, bw * 0.06, pal.thread(col.accent));
      break;
    }
    case 'scallop': {
      // Thread-embroidered scallops with a fine zari outline (organza).
      const sw = bw * 0.6;
      c.fillStyle = pal.thread(col.base);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(len, 0);
      c.lineTo(len, bw * 0.5);
      for (let x = len; x > -sw; x -= sw) c.arc(x - sw / 2, bw * 0.5, sw / 2, 0, Math.PI, false);
      c.closePath();
      c.fill();
      c.strokeStyle = z;
      c.lineWidth = bw * 0.035;
      c.beginPath();
      for (let x = 0; x < len + sw; x += sw) {
        c.moveTo(x + sw, bw * 0.5);
        c.arc(x + sw / 2, bw * 0.5, sw / 2, 0, Math.PI, false);
      }
      c.stroke();
      for (let x = sw / 2; x < len; x += sw) {
        stamp(c, SHAPES.flower6, x, bw * 0.4, sw * 0.42, pal.thread(col.accent));
        stamp(c, SHAPES.coin, x, bw * 0.4, sw * 0.12, z);
      }
      line(bw * 0.06, bw * 0.03);
      break;
    }
  }
  c.restore();
}

// ----------------------------------------------------------------------------- pallu

export function drawPallu(c: Ctx, style: PalluStyle, x0: number, y0: number, w: number, h: number, col: { base: string; body: string; accent: string; motif: string }, pal: Palette, spacing: number) {
  const z = pal.zari;
  c.save();
  c.beginPath();
  c.rect(x0, y0, w, h);
  c.clip();
  c.fillStyle = pal.thread(col.base);
  c.fillRect(x0, y0, w, h);
  // Bands run across the width of the sari (vertical in cloth space).
  const band = (x: number, t: number, fill: string | CanvasPattern = z) => {
    c.fillStyle = fill;
    c.fillRect(x, y0, t, h);
  };
  const u = spacing;
  switch (style) {
    case 'bands': {
      let x = x0;
      band(x, u * 0.12);
      x += u * 0.2;
      const seq = [0.5, 0.08, 0.9, 0.08, 0.3, 0.6];
      seq.forEach((t, i) => {
        if (i % 2 === 0) {
          band(x, u * t);
          if (t > 0.4) {
            for (let y = y0 + u * 0.3; y < y0 + h; y += u * 0.5) stamp(c, SHAPES.flower6, x + (u * t) / 2, y, u * 0.24, pal.thread(col.base));
          }
        } else band(x, u * t, pal.thread(col.accent));
        x += u * t + u * 0.12;
      });
      // Field of small buttas on the rest of the pallu.
      for (let bx = x + u * 0.4; bx < x0 + w; bx += u * 0.7) {
        for (let by = y0 + u * 0.35 + ((bx / u) % 2 ? u * 0.35 : 0); by < y0 + h; by += u * 0.7) stamp(c, SHAPES.coin, bx, by, u * 0.2, z);
      }
      break;
    }
    case 'paisley-field': {
      band(x0, u * 0.1);
      band(x0 + u * 0.18, u * 0.04);
      for (let bx = x0 + u * 0.9; bx < x0 + w + u; bx += u * 1.3) {
        for (let by = y0 + u * 0.5, i = 0; by < y0 + h + u; by += u * 1.05, i++) {
          richPaisley(c, bx + (i % 2 ? u * 0.65 : 0), by, u * 0.9, z, pal.thread(col.base), 0.4, i % 2 === 1);
        }
      }
      break;
    }
    case 'grand': {
      // Banarasi pallu: border of konia paisleys, then a dense jaal.
      band(x0, u * 0.08);
      band(x0 + u * 0.14, u * 0.4);
      for (let y = y0 + u * 0.2; y < y0 + h; y += u * 0.38) richPaisley(c, x0 + u * 0.34, y, u * 0.3, pal.thread(col.base), z, 0, false);
      band(x0 + u * 0.6, u * 0.04);
      drawField(c, 'jangla', x0 + u * 0.7, y0, w, h, u * 0.9, { base: col.base, motif: col.motif, accent: col.accent }, pal, 7);
      break;
    }
    case 'tope-teni': {
      // Ilkal pallu: three bands of the accent separated by white with interlocking teeth.
      let x = x0;
      for (let i = 0; i < 3; i++) {
        band(x, u * 0.7, pal.thread(col.base));
        x += u * 0.7;
        band(x, u * 0.22, pal.thread('#f4efe4'));
        const tw = u * 0.12;
        for (let y = y0; y < y0 + h; y += tw) {
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + u * 0.11, y + tw / 2);
          c.lineTo(x, y + tw);
          c.closePath();
          c.fillStyle = pal.thread(col.base);
          c.fill();
        }
        x += u * 0.22;
      }
      break;
    }
    case 'stripes': {
      let x = x0;
      const fills = [z, pal.thread(col.accent), pal.thread(col.body), z, pal.thread(col.motif)];
      let i = 0;
      while (x < x0 + w) {
        const t = u * (i % 5 === 0 ? 0.22 : 0.04 + ((i * 37) % 7) * 0.012);
        band(x, t, fills[i % fills.length]);
        x += t + u * (0.04 + ((i * 13) % 5) * 0.03);
        i++;
      }
      break;
    }
    case 'plain-zari': {
      // Kasavu / tissue: a wide gold field framed by fine lines.
      band(x0, u * 0.06);
      band(x0 + u * 0.12, u * 0.03, pal.thread(col.accent));
      band(x0 + u * 0.22, w, z);
      break;
    }
  }
  c.restore();
}

// ----------------------------------------------------------------------------- weave texture

/** A grey overlay tile per weave: blended with soft-light/overlay over the colour. */
export function weaveTile(weave: Weave, scale: number, seed: number) {
  const s = Math.round(256 * scale);
  const t = canvas(s, s);
  const g = ctx2d(t);
  const r = rng(seed);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, s, s);
  const thread = Math.max(1, Math.round(s / (weave === 'kota' || weave === 'organza' ? 64 : 110)));
  const rough = weave === 'linen' ? 0.32 : weave === 'cotton' || weave === 'maheshwari' ? 0.2 : weave === 'chanderi' || weave === 'kota' ? 0.16 : 0.09;
  // Weft (horizontal) and warp (vertical) threads.
  for (let y = 0; y < s; y += thread) {
    const v = 128 + (r() - 0.5) * 255 * rough;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(0, y, s, Math.max(1, thread * 0.5));
  }
  g.globalAlpha = 0.5;
  for (let x = 0; x < s; x += thread) {
    const v = 128 + (r() - 0.5) * 255 * rough * 0.8;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, 0, Math.max(1, thread * 0.45), s);
  }
  g.globalAlpha = 1;
  // Slubs: thicker irregular weft runs in hand-spun yarn.
  const slubs = weave === 'linen' ? 90 : weave === 'cotton' || weave === 'maheshwari' ? 45 : weave === 'chanderi' ? 18 : 6;
  for (let i = 0; i < slubs; i++) {
    const y = Math.floor(r() * s);
    const x = r() * s;
    const len = s * (0.08 + r() * 0.35);
    const v = r() > 0.5 ? 200 : 70;
    g.fillStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.35})`;
    g.fillRect(x, y, len, thread * (0.8 + r()));
    if (x + len > s) g.fillRect(x - s, y, len, thread * (0.8 + r()));
  }
  // Fine grain.
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 22;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return t;
}

export function applyWeave(c: Ctx, weave: Weave, w: number, h: number, scale: number, seed: number) {
  const tile = weaveTile(weave, scale, seed);
  c.save();
  c.globalCompositeOperation = 'overlay';
  c.globalAlpha = weave === 'linen' || weave === 'cotton' ? 0.75 : weave === 'kota' || weave === 'organza' ? 0.6 : 0.42;
  c.fillStyle = c.createPattern(tile, 'repeat')!;
  c.fillRect(0, 0, w, h);
  c.restore();
  if (weave === 'tissue') {
    // Zari in the weft: a metallic shimmer over the whole cloth.
    const r = rng(seed + 9);
    c.save();
    c.globalCompositeOperation = 'screen';
    for (let i = 0; i < (w * h) / 900; i++) {
      c.fillStyle = `rgba(255, 236, 190, ${0.06 + r() * 0.16})`;
      c.fillRect(r() * w, r() * h, 2 + r() * 10 * scale, Math.max(1, scale));
    }
    c.restore();
  }
}

// ----------------------------------------------------------------------------- whole cloth

export interface ClothSpec {
  weave: Weave;
  field: FieldMotif;
  /** Motif spacing in px. */
  spacing: number;
  colors: { body: string; motif: string; border: string; pallu: string; zari: string; accent: string };
  border?: { style: BorderStyle; width: number; edges: ('top' | 'bottom')[] };
  /** Pallu from this x to the right edge. */
  pallu?: { style: PalluStyle; from: number };
  /** Pixel scale for thread textures (1 = 1200 px wide output). */
  scale: number;
  seed: number;
}

export function weaveCloth(w: number, h: number, spec: ClothSpec) {
  const cv = canvas(w, h);
  const c = ctx2d(cv);
  const pal = palette(c, spec.colors.zari, spec.scale, spec.seed);
  const { colors } = spec;
  c.fillStyle = pal.thread(colors.body);
  c.fillRect(0, 0, w, h);
  const bw = spec.border ? spec.border.width : 0;
  const top = spec.border?.edges.includes('top') ? bw : 0;
  const bottom = spec.border?.edges.includes('bottom') ? bw : 0;
  const fieldEnd = spec.pallu ? spec.pallu.from : w;
  drawField(c, spec.field, 0, top * 0.8, fieldEnd, h - top * 0.8 - bottom * 0.8, spec.spacing, { base: colors.body, motif: colors.motif, accent: colors.accent }, pal, spec.seed);
  if (spec.pallu) {
    drawPallu(c, spec.pallu.style, spec.pallu.from, 0, w - spec.pallu.from, h, { base: colors.pallu, body: colors.body, accent: colors.accent, motif: colors.motif }, pal, spec.spacing * 1.6);
  }
  if (spec.border) {
    const bc = { base: colors.border, body: colors.body, accent: colors.accent };
    if (top) {
      c.save();
      drawBorder(c, spec.border.style, w, bw, bc, pal);
      c.restore();
    }
    if (bottom) {
      c.save();
      c.translate(0, h);
      c.scale(1, -1);
      drawBorder(c, spec.border.style, w, bw, bc, pal);
      c.restore();
    }
  }
  applyWeave(c, spec.weave, w, h, spec.scale, spec.seed);
  return cv;
}
