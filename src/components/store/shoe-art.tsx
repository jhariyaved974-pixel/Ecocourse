import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Drawn product art in the original Save The Money style: a side-on shoe in
 * the colourway's own colours. Used wherever a shoe has no photo yet, so the
 * catalogue still looks complete.
 */

export type ShoeType = 'runner' | 'court' | 'high' | 'formal' | 'loafer' | 'slide' | 'boot';

const SHOE_TYPES: ShoeType[] = ['runner', 'court', 'high', 'formal', 'loafer', 'slide', 'boot'];

/** Picks a silhouette from the product's tags, name and category; null when it is not a shoe. */
export function shoeTypeFor({ name, categorySlug, tags }: { name: string; categorySlug?: string | null; tags?: string[] }): ShoeType | null {
  const tagged = tags?.find((t): t is ShoeType => (SHOE_TYPES as string[]).includes(t));
  if (tagged) return tagged;
  const n = name.toLowerCase();
  const c = (categorySlug ?? '').toLowerCase();
  if (/loafer|moccasin/.test(n)) return 'loafer';
  if (/\bhigh\b|hi-top|high-top/.test(n)) return 'high';
  if (/slide|flip|sandal|slipper/.test(n) || /sandal|slide|slipper/.test(c)) return 'slide';
  if (/boot/.test(n) || /boot/.test(c)) return 'boot';
  if (/oxford|derby|brogue|formal/.test(n) || /formal/.test(c)) return 'formal';
  if (/court|sneaker|canvas/.test(n) || /sneaker/.test(c)) return 'court';
  if (/run|trainer|sport|walk/.test(n) || /running|sports-shoes/.test(c)) return 'runner';
  return null;
}

function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Sole and accent colours that suit an upper colour and silhouette. */
export function shoePalette(upper: string, type: ShoeType) {
  const lum = luminance(upper);
  const light = lum > 0.6;
  const yellowish = /^#?(f|e)[0-9a-f](c|d|e|b)[0-9a-f]{3}$/i.test(upper) && lum > 0.45 && lum < 0.75;
  const sole = type === 'formal' || type === 'loafer' ? '#2b1d14' : type === 'boot' ? '#2a2a2c' : light ? '#ffffff' : '#f4f2ee';
  const accent = light ? '#0b6b47' : yellowish ? '#111111' : '#f2c230';
  return { upper, sole, accent };
}

/** Soft background for the art tile, tinted by the colourway. */
export function shoeTint(upper: string) {
  // Dark colourways get a lighter wash so the tile stays warm rather than grey.
  const lum = luminance(upper);
  const share = lum < 0.03 ? 6 : lum < 0.12 ? 11 : 18;
  return `color-mix(in srgb, ${upper} ${share}%, #f4f2ee)`;
}

const OUTLINE = 'rgba(17,17,17,0.16)';
const SHADE = 'rgba(17,17,17,0.22)';
const DARK = 'rgba(17,17,17,0.55)';

function Runner({ upper, sole, accent }: Palette) {
  return (
    <>
      <path d="M22 106 Q20 124 40 125 L204 125 Q226 124 228 110 Q229 100 218 99 L30 99 Q22 99 22 106 Z" fill={sole} stroke={OUTLINE} strokeWidth="1.5" />
      <path d="M26 118 Q30 125 40 125 L204 125 Q222 124 226 116 Z" fill={SHADE} />
      <path d="M26 100 L28 62 Q30 44 48 42 L68 40 Q82 39 90 50 L104 66 Q118 77 142 79 L190 83 Q218 87 224 100 Z" fill={upper} stroke={OUTLINE} strokeWidth="1.5" />
      <path d="M40 50 Q62 38 88 50 L84 58 Q62 49 44 58 Z" fill={DARK} />
      <path d="M58 92 Q104 58 176 72 Q120 76 64 100 Z" fill={accent} />
      <path d="M26 70 L36 70 L36 96 L27 96 Z" fill={accent} opacity="0.9" />
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1={100 + i * 11} y1={62 + i * 4} x2={108 + i * 11} y2={70 + i * 4} stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
      ))}
    </>
  );
}

function Court({ upper, sole, accent }: Palette) {
  return (
    <>
      <path d="M20 104 L20 120 Q20 125 26 125 L214 125 Q226 125 228 114 L228 104 Z" fill={sole} stroke={OUTLINE} strokeWidth="1.5" />
      <path d="M20 115 L228 115" stroke={OUTLINE} strokeWidth="1.5" />
      <path d="M22 104 L24 66 Q26 52 42 52 L72 52 Q84 52 92 62 L106 76 Q120 84 146 86 L196 90 Q222 94 226 104 Z" fill={upper} stroke={OUTLINE} strokeWidth="1.5" />
      <path d="M36 58 Q58 50 86 60 L82 66 Q60 58 40 64 Z" fill={DARK} />
      <path d="M72 100 L120 70 L136 70 L88 100 Z" fill={accent} />
      <path d="M24 74 L40 74 L40 100 L23 100 Z" fill={accent} opacity="0.85" />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={176 + (i % 3) * 9} cy={95 + Math.floor(i / 3) * 5} r="1.6" fill={DARK} />
      ))}
      {[0, 1, 2].map((i) => (
        <line key={i} x1={100 + i * 12} y1={72 + i * 4} x2={108 + i * 12} y2={80 + i * 4} stroke={DARK} strokeWidth="2.5" strokeLinecap="round" />
      ))}
    </>
  );
}

function High({ upper, sole, accent }: Palette) {
  return (
    <>
      <path d="M22 104 L22 120 Q22 125 28 125 L212 125 Q226 125 228 114 L228 104 Z" fill={sole} stroke={OUTLINE} strokeWidth="1.5" />
      <path d="M22 115 L228 115" stroke={OUTLINE} strokeWidth="1.5" />
      <path d="M26 104 L30 26 Q32 16 44 16 L84 18 Q94 19 94 30 L98 62 Q112 80 146 85 L196 90 Q222 94 226 104 Z" fill={upper} stroke={OUTLINE} strokeWidth="1.5" />
      <path d="M44 22 L84 24 L82 30 L46 28 Z" fill={DARK} />
      <circle cx="58" cy="64" r="11" fill={accent} />
      <circle cx="58" cy="64" r="4" fill={upper} />
      <path d="M78 102 L128 72 L142 74 L92 102 Z" fill={accent} opacity="0.9" />
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={86 + i * 3} y1={34 + i * 9} x2={96 + i * 3} y2={38 + i * 9} stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
      ))}
    </>
  );
}

function Formal({ upper, sole, accent }: Palette) {
  return (
    <>
      <path d="M24 112 L24 122 Q24 125 28 125 L58 125 L60 116 L220 116 Q230 114 228 108 L26 108 Z" fill={sole} />
      <path d="M26 108 L28 72 Q30 58 46 58 L74 58 Q86 58 94 68 L110 82 Q130 90 160 92 L204 95 Q228 98 228 108 Z" fill={upper} stroke={OUTLINE} strokeWidth="1.5" />
      <path d="M40 64 Q62 56 88 66 L84 72 Q62 64 44 70 Z" fill={DARK} />
      <path d="M30 100 Q120 104 222 104" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
      <path d="M98 74 Q112 88 138 90" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={102 + i * 10} cy={76 + i * 4} r="2" fill={accent} />
      ))}
      <path d="M180 96 Q206 98 222 104" stroke="rgba(255,255,255,0.25)" strokeWidth="6" strokeLinecap="round" fill="none" />
    </>
  );
}

function Loafer({ upper, sole, accent }: Palette) {
  return (
    <>
      <path d="M24 112 L24 122 Q24 125 28 125 L56 125 L58 116 L220 116 Q230 114 228 108 L26 108 Z" fill={sole} />
      <path d="M26 108 L28 78 Q30 66 44 66 L92 68 Q108 70 120 82 Q140 92 166 93 L206 96 Q228 99 228 108 Z" fill={upper} stroke={OUTLINE} strokeWidth="1.5" />
      <path d="M38 72 Q70 66 104 74 L100 80 Q70 72 42 78 Z" fill={DARK} />
      <path d="M110 80 Q140 72 170 92" stroke={accent} strokeWidth="7" strokeLinecap="round" fill="none" />
      <rect x="134" y="80" width="10" height="5" rx="2" fill={upper} transform="rotate(-8 139 82)" />
      <path d="M30 100 Q120 104 222 104" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
      <path d="M186 98 Q208 100 222 105" stroke="rgba(255,255,255,0.25)" strokeWidth="6" strokeLinecap="round" fill="none" />
    </>
  );
}

function Slide({ upper, sole, accent }: Palette) {
  return (
    <>
      <path d="M20 108 Q18 124 34 125 L210 125 Q230 124 230 110 Q230 102 220 101 L30 101 Q20 101 20 108 Z" fill={sole} stroke={OUTLINE} strokeWidth="1.5" />
      <path d="M22 118 Q26 125 34 125 L210 125 Q226 124 228 117 Z" fill={SHADE} />
      <path d="M22 103 Q60 96 120 99 Q180 96 228 103" stroke={OUTLINE} strokeWidth="1.5" fill="none" />
      <path d="M96 101 Q100 58 150 56 Q196 58 204 101 Z" fill={upper} stroke={OUTLINE} strokeWidth="1.5" />
      <path d="M118 80 Q150 70 184 80" stroke={accent} strokeWidth="6" strokeLinecap="round" fill="none" />
    </>
  );
}

function Boot({ upper, sole, accent }: Palette) {
  return (
    <>
      <path d="M22 106 L22 120 Q22 125 28 125 L214 125 Q228 125 228 112 L228 106 Z" fill={sole} />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
        <rect key={i} x={30 + i * 19} y="121" width="10" height="5" rx="1.5" fill={sole} />
      ))}
      <path d="M26 106 L28 22 Q30 12 42 12 L84 12 Q94 12 96 24 L98 60 Q108 78 140 84 L192 90 Q224 94 226 106 Z" fill={upper} stroke={OUTLINE} strokeWidth="1.5" />
      <path d="M40 16 L84 16 L84 22 L40 22 Z" fill={DARK} />
      <path d="M30 18 L40 18 L40 38 L30 38 Z" fill={accent} />
      <path d="M26 98 L224 98" stroke={accent} strokeWidth="4" opacity="0.85" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i}>
          <line x1={84 + i * 3} y1={30 + i * 9} x2={98 + i * 3} y2={34 + i * 9} stroke={accent} strokeWidth="3" strokeLinecap="round" />
          <circle cx={86 + i * 3} cy={30 + i * 9} r="2" fill={DARK} />
        </g>
      ))}
    </>
  );
}

type Palette = { upper: string; sole: string; accent: string };

const DRAW: Record<ShoeType, (p: Palette) => React.JSX.Element> = {
  runner: Runner,
  court: Court,
  high: High,
  formal: Formal,
  loafer: Loafer,
  slide: Slide,
  boot: Boot,
};

export function ShoeArt({ type, color, className, title }: { type: ShoeType; color: string; className?: string; title?: string }) {
  const Draw = DRAW[type];
  const palette = shoePalette(color, type);
  return (
    <svg viewBox="0 0 250 140" className={cn('h-auto w-full', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <ellipse cx="125" cy="130" rx="104" ry="6" fill="rgba(17,17,17,0.12)" />
      <Draw {...palette} />
    </svg>
  );
}
