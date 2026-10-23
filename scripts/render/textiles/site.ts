// Site imagery (hero, category tiles, banners, social image) composed from the
// same woven saris and blouses as the product photographs.

import { canvas, ctx2d, hashString, type Ctx } from './cloth';
import { blouseFront, drawRod, paintBackdrop, sariDetail, sariDrape, sariFold, STUDIO, vignette, type BlouseSubject, type SariSubject } from './scenes';

export type SiteItem = { kind: 'sari'; subject: SariSubject } | { kind: 'blouse'; subject: BlouseSubject };

export interface SiteJob {
  name: string;
  width: number;
  height: number;
  layout: 'rail' | 'stack' | 'folds' | 'blouses' | 'drape' | 'fold' | 'detail' | 'blouse';
  items: SiteItem[];
  /** Backdrop tone. */
  tone?: string;
}

function piece(w: number, h: number, draw: (c: Ctx) => void) {
  const cv = canvas(w, h);
  draw(ctx2d(cv));
  return cv;
}

export function renderSiteScene(c: Ctx, job: SiteJob) {
  const { width: W, height: H } = job;
  const bd = { tone: job.tone ?? STUDIO.tone };
  const k = W / 1200;
  const seed = hashString(job.name);
  const saris = job.items.filter((i): i is Extract<SiteItem, { kind: 'sari' }> => i.kind === 'sari').map((i) => i.subject);
  const blouses = job.items.filter((i): i is Extract<SiteItem, { kind: 'blouse' }> => i.kind === 'blouse').map((i) => i.subject);
  switch (job.layout) {
    case 'drape':
      return sariDrape(c, W, H, saris[0], bd);
    case 'fold':
      return sariFold(c, W, H, saris[0], bd);
    case 'detail':
      return sariDetail(c, W, H, saris[0]);
    case 'blouse':
      return blouseFront(c, W, H, blouses[0], bd);
    case 'rail': {
      // Saris hanging side by side from one long rod, overlapping like a shop rail.
      paintBackdrop(c, W, H, bd, seed);
      const n = saris.length;
      const cw = (W * 1.06) / (0.84 * (n - 1) + 1);
      const step = cw * 0.84;
      const pw = Math.round(cw / 0.6);
      const ph = Math.round(H * 1.12);
      const start = (W - (cw + step * (n - 1))) / 2;
      const dy = -H * 0.07;
      // Left to right so each sari overlaps the edge of the previous one.
      saris.forEach((s, i) => {
        const p = piece(pw, ph, (pc) => sariDrape(pc, pw, ph, s, bd, { bare: true }));
        c.drawImage(p, start + i * step - (pw - cw) / 2, dy + (i % 2) * H * 0.008);
      });
      drawRod(c, -20 * k, W + 20 * k, ph * 0.12 + dy - 8 * (pw / 1200), (pw / 1200) * 1.2);
      vignette(c, W, H, 0.14);
      return;
    }
    case 'stack': {
      // Folded saris piled on one another, each slightly offset.
      paintBackdrop(c, W, H, bd, seed);
      const n = saris.length;
      const pw = Math.round(Math.min(W * 0.9, H * 1.1));
      const ph = Math.round(pw * 1.0);
      const gap = Math.min(H * 0.14, (H * 0.8 - ph * 0.42) / Math.max(1, n - 1));
      saris.forEach((s, i) => {
        const p = piece(pw, ph, (pc) => sariFold(pc, pw, ph, s, bd, { bare: true }));
        const y = H * 0.94 - ph * 0.72 - (n - 1 - i) * gap;
        c.drawImage(p, (W - pw) / 2 + (i % 2 ? 1 : -1) * W * 0.02, y);
      });
      vignette(c, W, H, 0.12);
      return;
    }
    case 'folds': {
      // Flat-lay: folded saris in a loose row.
      paintBackdrop(c, W, H, bd, seed);
      const n = saris.length;
      const pw = Math.round((W / n) * 1.25);
      const ph = Math.round(pw * 1.0);
      saris.forEach((s, i) => {
        const p = piece(pw, ph, (pc) => sariFold(pc, pw, ph, s, bd, { bare: true }));
        c.save();
        const cx = (W / n) * (i + 0.5);
        const cy = H * 0.5 + (i % 2 ? -1 : 1) * H * 0.04;
        c.translate(cx, cy);
        c.rotate((i % 2 ? 1 : -1) * 0.05);
        c.drawImage(p, -pw / 2, -ph / 2);
        c.restore();
      });
      vignette(c, W, H, 0.12);
      return;
    }
    case 'blouses': {
      paintBackdrop(c, W, H, bd, seed);
      const n = blouses.length;
      const pw = Math.round((W / n) * 1.15);
      const ph = Math.round(pw * 1.25);
      blouses.forEach((b, i) => {
        const p = piece(pw, ph, (pc) => blouseFront(pc, pw, ph, b, bd, { bare: true }));
        c.drawImage(p, (W / n) * (i + 0.5) - pw / 2, H * 0.52 - ph * 0.5 + (i % 2 ? H * 0.04 : -H * 0.02));
      });
      vignette(c, W, H, 0.12);
      return;
    }
  }
}
