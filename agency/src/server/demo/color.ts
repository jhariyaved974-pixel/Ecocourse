import type { Palette } from "./schema";

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

export function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Best readable text colour (near-black or near-white) on a background. */
export const readableOn = (bg: string) => (contrastRatio(bg, "#111111") >= contrastRatio(bg, "#ffffff") ? "#111111" : "#ffffff");

/**
 * Applies a client's brand colours to a template palette while keeping WCAG AA contrast:
 * the first brand colour becomes `primary`, the second `accent`; text colours are corrected if needed.
 */
export function brandPalette(base: Palette, brand: string[]): Palette {
  const p: Palette = { ...base };
  if (brand[0]) p.primary = brand[0];
  if (brand[1]) p.accent = brand[1];
  p.onPrimary = contrastRatio(p.primary, p.onPrimary) >= 4.5 ? p.onPrimary : readableOn(p.primary);
  if (contrastRatio(p.bg, p.text) < 7) p.text = readableOn(p.bg);
  if (contrastRatio(p.bg, p.muted) < 4.5) p.muted = mix(p.text, p.bg, 0.3);
  // Accent is used for eyebrows/focus rings on the page background: keep it legible.
  for (let i = 1; i <= 6 && contrastRatio(p.bg, p.accent) < 3; i++) p.accent = mix(p.accent, p.text, 0.15 * i);
  return p;
}

/** Maps common colour words (English/Hinglish) to hex values, for briefs that say "maroon and gold". */
const NAMED: Record<string, string> = {
  red: "#c62828", maroon: "#7b1e2b", pink: "#d6336c", orange: "#ef6c00", saffron: "#f08c00", yellow: "#f2b705", gold: "#c9a227",
  green: "#2e7d32", olive: "#6b7d2a", teal: "#0f766e", blue: "#1e5bd8", navy: "#1b2a4a", purple: "#6d3fd1", violet: "#7c4dff",
  brown: "#7a4e2d", beige: "#d8c3a5", black: "#111111", white: "#ffffff", grey: "#6b7280", gray: "#6b7280",
  lal: "#c62828", hara: "#2e7d32", neela: "#1e5bd8", peela: "#f2b705", kala: "#111111", safed: "#ffffff",
};
export function colorsFromText(text: string | undefined | null): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.toLowerCase().matchAll(/#[0-9a-f]{6}\b|[a-z]+/g)) {
    const hex = m[0].startsWith("#") ? m[0] : NAMED[m[0]];
    if (hex && !out.includes(hex) && hex !== "#ffffff") out.push(hex);
  }
  return out.slice(0, 2);
}
