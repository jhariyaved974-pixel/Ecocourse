import localFont from 'next/font/local';

// Self-hosted (SIL Open Font License) so builds never depend on a font CDN.
// Latin and Latin-Extended are separate families chained in the font stack so
// glyphs such as ₹ (U+20B9) fall back per-character to the extended subset.

export const interTight = localFont({
  src: './fonts/inter-tight-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
});

export const interTightExt = localFont({
  src: './fonts/inter-tight-latin-ext-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-inter-ext',
  display: 'swap',
  preload: false,
});

export const instrumentSerif = localFont({
  src: [
    { path: './fonts/instrument-serif-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/instrument-serif-latin-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument',
  display: 'swap',
});

export const instrumentSerifExt = localFont({
  src: './fonts/instrument-serif-latin-ext-400-normal.woff2',
  weight: '400',
  variable: '--font-instrument-ext',
  display: 'swap',
  preload: false,
});

export const fraunces = localFont({
  src: './fonts/fraunces-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-fraunces',
  display: 'swap',
  preload: false,
});

// Display face of the Save The Money look (headings in capitals).
export const archivo = localFont({
  src: './fonts/archivo-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-archivo',
  display: 'swap',
});

export const archivoExt = localFont({
  src: './fonts/archivo-latin-ext-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-archivo-ext',
  display: 'swap',
  preload: false,
});

export const fontVariables = [interTight, interTightExt, instrumentSerif, instrumentSerifExt, fraunces, archivo, archivoExt]
  .map((f) => f.variable)
  .join(' ');
