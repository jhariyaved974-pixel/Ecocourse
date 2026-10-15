import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { sniffFileType, type SniffedType } from '@/lib/uploads/sniff';
import { MAX_IMAGE_PIXELS, MAX_UPLOAD_BYTES, formatBytes, type MediaKind, type UploadFormat } from '@/lib/admin/media';

export type Inspection =
  | {
      ok: true;
      kind: MediaKind;
      mime: string;
      sizeBytes: number;
      width: number | null;
      height: number | null;
      durationSeconds: number | null;
      sha256: string;
    }
  | { ok: false; error: string };

const SNIFF_LABEL: Record<SniffedType, string> = {
  jpeg: 'a JPEG image',
  png: 'a PNG image',
  webp: 'a WebP image',
  gif: 'a GIF image',
  avif: 'an AVIF image',
  pdf: 'a PDF document',
  mp4: 'an MP4 video',
  webm: 'a WebM video',
  glb: 'a GLB 3D model',
};

// sharp reports AVIF as part of the HEIF family.
const SHARP_FORMAT: Partial<Record<SniffedType, string[]>> = {
  jpeg: ['jpeg'],
  png: ['png'],
  webp: ['webp'],
  gif: ['gif'],
  avif: ['heif', 'avif'],
};

/**
 * Verifies an uploaded object by its bytes. The file name and the browser's
 * MIME type only decide which format we *expect*; the content must match it.
 */
export async function inspectUpload(bytes: Buffer, expected: UploadFormat): Promise<Inspection> {
  if (bytes.length === 0) return { ok: false, error: 'The file is empty.' };
  const limit = MAX_UPLOAD_BYTES[expected.kind];
  if (bytes.length > limit) return { ok: false, error: `The file is ${formatBytes(bytes.length)}; the limit for this type is ${formatBytes(limit)}.` };

  const sniffed = sniffFileType(bytes);
  if (!sniffed) {
    return { ok: false, error: `This is not a real ${expected.label} file: its contents do not match any supported image, video or 3D format.` };
  }
  if (sniffed !== expected.sniff) {
    return { ok: false, error: `The file is named .${expected.ext} but its contents are ${SNIFF_LABEL[sniffed]}. Rename it with the correct extension and try again.` };
  }

  let width: number | null = null;
  let height: number | null = null;
  let durationSeconds: number | null = null;

  if (expected.kind === 'image') {
    try {
      // Header/metadata only: no pixels are decoded here.
      const meta = await sharp(bytes, { limitInputPixels: false }).metadata();
      if (!SHARP_FORMAT[sniffed]?.includes(meta.format ?? '')) {
        return { ok: false, error: `We could not read this ${expected.label} image. It may be damaged.` };
      }
      const w = meta.width ?? 0;
      const h = (meta.pages && meta.pages > 1 && meta.pageHeight ? meta.pageHeight : meta.height) ?? 0;
      if (!w || !h) return { ok: false, error: `We could not read the size of this ${expected.label} image. It may be damaged.` };
      if (w * h > MAX_IMAGE_PIXELS) return { ok: false, error: `This image is ${w}×${h} pixels; please upload one under 100 megapixels.` };
      // EXIF orientations 5–8 rotate by 90°, so the displayed size is swapped.
      const rotated = (meta.orientation ?? 1) >= 5;
      width = rotated ? h : w;
      height = rotated ? w : h;
    } catch {
      return { ok: false, error: `We could not read this ${expected.label} image. It may be damaged.` };
    }
  } else if (expected.kind === 'video') {
    if (sniffed === 'mp4') {
      const info = readMp4Info(bytes);
      if (!info.hasMoov) return { ok: false, error: 'This MP4 file is incomplete (no movie header). Export it again and retry.' };
      width = info.width;
      height = info.height;
      durationSeconds = info.durationSeconds;
    }
  } else if (expected.kind === 'model') {
    const problem = validateGlb(bytes);
    if (problem) return { ok: false, error: problem };
  }

  return {
    ok: true,
    kind: expected.kind,
    mime: expected.mime,
    sizeBytes: bytes.length,
    width,
    height,
    durationSeconds,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

// ---------------------------------------------------------------------------
// GLB (binary glTF 2.0): 12-byte header + JSON chunk first.
// ---------------------------------------------------------------------------
function validateGlb(bytes: Buffer): string | null {
  if (bytes.length < 20) return 'This GLB file is too small to be valid.';
  const version = bytes.readUInt32LE(4);
  const declaredLength = bytes.readUInt32LE(8);
  if (version !== 2) return `This is a glTF ${version} file; only glTF 2.0 (.glb) models are supported.`;
  if (declaredLength !== bytes.length) return 'This GLB file is truncated or has extra data appended. Export it again and retry.';
  const firstChunkType = bytes.readUInt32LE(16);
  if (firstChunkType !== 0x4e4f534a) return 'This GLB file is malformed (missing JSON chunk).';
  return null;
}

// ---------------------------------------------------------------------------
// MP4: read duration (mvhd) and the first visual track size (tkhd).
// ---------------------------------------------------------------------------
interface Box {
  type: string;
  start: number; // payload start
  end: number;
}

function* boxes(buf: Buffer, start: number, end: number): Generator<Box> {
  let offset = start;
  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) return;
      const big = buf.readBigUInt64BE(offset + 8);
      if (big > BigInt(end - offset)) return;
      size = Number(big);
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) return;
    yield { type, start: offset + header, end: offset + size };
    offset += size;
  }
}

function readMp4Info(buf: Buffer): { hasMoov: boolean; width: number | null; height: number | null; durationSeconds: number | null } {
  const result = { hasMoov: false, width: null as number | null, height: null as number | null, durationSeconds: null as number | null };
  try {
    for (const box of boxes(buf, 0, buf.length)) {
      if (box.type !== 'moov') continue;
      result.hasMoov = true;
      for (const child of boxes(buf, box.start, box.end)) {
        if (child.type === 'mvhd' && child.end - child.start >= 20) {
          const version = buf[child.start];
          const timescale = version === 1 ? buf.readUInt32BE(child.start + 20) : buf.readUInt32BE(child.start + 12);
          const duration = version === 1 ? Number(buf.readBigUInt64BE(child.start + 24)) : buf.readUInt32BE(child.start + 16);
          if (timescale > 0 && Number.isFinite(duration)) {
            result.durationSeconds = Math.min(999_999, Math.round((duration / timescale) * 100) / 100);
          }
        }
        if (child.type === 'trak' && result.width === null) {
          for (const t of boxes(buf, child.start, child.end)) {
            if (t.type !== 'tkhd') continue;
            const version = buf[t.start];
            // version/flags(4) + times/ids/duration + reserved(8) + layer/group/volume/reserved(8) + matrix(36)
            const sizeOffset = t.start + 4 + (version === 1 ? 32 : 20) + 8 + 8 + 36;
            if (sizeOffset + 8 > t.end) continue;
            const w = Math.round(buf.readUInt32BE(sizeOffset) / 65536);
            const h = Math.round(buf.readUInt32BE(sizeOffset + 4) / 65536);
            if (w > 0 && h > 0) {
              result.width = w;
              result.height = h;
            }
          }
        }
      }
    }
  } catch {
    // Malformed boxes: keep whatever was read; the content type already matched.
  }
  return result;
}
