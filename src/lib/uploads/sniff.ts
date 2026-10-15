// Identifies a file from its first bytes. The browser-supplied MIME type and
// file name are never trusted.

export type SniffedType = 'jpeg' | 'png' | 'webp' | 'gif' | 'avif' | 'pdf' | 'mp4' | 'webm' | 'glb';

export const SNIFFED_MIME: Record<SniffedType, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  glb: 'model/gltf-binary',
};

export const SNIFFED_EXT: Record<SniffedType, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  avif: 'avif',
  pdf: 'pdf',
  mp4: 'mp4',
  webm: 'webm',
  glb: 'glb',
};

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

export function sniffFileType(input: ArrayBuffer | Uint8Array): SniffedType | null {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return 'gif';
  if (ascii(b, 0, 5) === '%PDF-') return 'pdf';
  if (ascii(b, 0, 4) === 'glTF') return 'glb';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash'].includes(brand)) return 'mp4';
  }
  return null;
}
