import type { Enums } from '@/lib/database.types';

/** A media library asset as passed between admin screens (picker ↔ editors). */
export interface MediaAssetSummary {
  id: string;
  kind: Enums<'media_kind'>;
  url: string | null; // resolved public URL (null for private or missing files)
  altText: string;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  label: string | null;
}
