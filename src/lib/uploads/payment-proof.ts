import 'server-only';
import sharp from 'sharp';
import { sniffFileType, type SniffedType } from './sniff';

export const PROOF_MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED: SniffedType[] = ['jpeg', 'png', 'webp', 'pdf'];

export type ProcessedProof =
  | { ok: true; bytes: Buffer; mime: 'image/jpeg' | 'application/pdf'; ext: 'jpg' | 'pdf' }
  | { ok: false; error: string };

// PDF features that can run code or carry payloads; receipts never need them.
const RISKY_PDF = /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|OpenAction|AA|XFA)\b/;

/**
 * Validates a payment screenshot/receipt by content (not by name or the
 * browser's MIME type) and normalises it: images are decoded and re-encoded
 * as JPEG, which drops metadata (EXIF/GPS) and anything appended to the file.
 */
export async function processPaymentProof(file: File): Promise<ProcessedProof> {
  if (file.size === 0) return { ok: false, error: 'The selected file is empty.' };
  if (file.size > PROOF_MAX_BYTES) return { ok: false, error: 'The file is larger than 4 MB. Please upload a smaller screenshot.' };
  const input = Buffer.from(await file.arrayBuffer());
  const type = sniffFileType(input);
  if (!type || !ALLOWED.includes(type)) return { ok: false, error: 'Upload a JPG, PNG or WebP screenshot, or a PDF receipt.' };

  if (type === 'pdf') {
    if (RISKY_PDF.test(input.toString('latin1'))) {
      return { ok: false, error: 'This PDF contains active content and cannot be accepted. Please upload a screenshot instead.' };
    }
    return { ok: true, bytes: input, mime: 'application/pdf', ext: 'pdf' };
  }

  try {
    const bytes = await sharp(input, { limitInputPixels: 50_000_000, failOn: 'error' })
      .rotate()
      .resize({ width: 2000, height: 2600, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    return { ok: true, bytes, mime: 'image/jpeg', ext: 'jpg' };
  } catch {
    return { ok: false, error: 'We could not read this image. Please upload a different screenshot.' };
  }
}
