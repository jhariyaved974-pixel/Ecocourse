// Media library: shared constants, types and pure helpers. Imported by the
// server actions *and* by client components (uploader, picker), so nothing in
// here may touch server-only modules.

import type { Enums, Tables } from '@/lib/database.types';
import type { MediaAssetSummary } from '@/lib/admin/types';
import type { SniffedType } from '@/lib/uploads/sniff';
import { assetUrl } from '@/lib/media';
import { publicEnv } from '@/lib/env';

export type MediaKind = Enums<'media_kind'>;

export const MEDIA_BUCKET = 'catalog-media';
export const MEDIA_KINDS: readonly MediaKind[] = ['image', 'video', 'model'];
export const MEDIA_KIND_LABEL: Record<MediaKind, string> = { image: 'Image', video: 'Video', model: '3D model' };

/** Top-level storage folders the catalog-media upload policy allows staff to write to. */
export const STORAGE_FOLDERS = ['products', 'content', 'brand', 'models', 'library'] as const;
export type StorageFolder = (typeof STORAGE_FOLDERS)[number];
export const STORAGE_FOLDER_LABEL: Record<StorageFolder, string> = {
  products: 'Products',
  content: 'Content & homepage',
  brand: 'Brand',
  models: '3D models',
  library: 'General library',
};

const MB = 1024 * 1024;
/** Upper size limit per kind (the bucket itself caps everything at 50 MB). */
export const MAX_UPLOAD_BYTES: Record<MediaKind, number> = { image: 15 * MB, video: 50 * MB, model: 30 * MB };
export const MAX_FILES_PER_BATCH = 20;
/** Tiles per page in the library grid and the picker. */
export const MEDIA_PAGE_SIZE = 36;
export const PICKER_PAGE_SIZE = 24;
/** Images larger than this are refused: they cannot be optimised for the storefront. */
export const MAX_IMAGE_PIXELS = 100_000_000;

export interface UploadFormat {
  /** Canonical extension used for the stored object. */
  ext: 'jpg' | 'png' | 'webp' | 'gif' | 'avif' | 'mp4' | 'webm' | 'glb';
  mime: string;
  kind: MediaKind;
  /** What the magic-byte sniffer must report for the content to be accepted. */
  sniff: SniffedType;
  /** MIME types a browser may legitimately declare for this extension ('' = unknown). */
  declared: readonly string[];
  label: string;
}

const JPG: UploadFormat = { ext: 'jpg', mime: 'image/jpeg', kind: 'image', sniff: 'jpeg', declared: ['image/jpeg', 'image/jpg', 'image/pjpeg', ''], label: 'JPEG' };

/** Accepted file extensions → format. SVG, HEIC, MOV etc. are intentionally not accepted. */
export const UPLOAD_FORMATS: Record<string, UploadFormat> = {
  jpg: JPG,
  jpeg: JPG,
  png: { ext: 'png', mime: 'image/png', kind: 'image', sniff: 'png', declared: ['image/png', ''], label: 'PNG' },
  webp: { ext: 'webp', mime: 'image/webp', kind: 'image', sniff: 'webp', declared: ['image/webp', ''], label: 'WebP' },
  gif: { ext: 'gif', mime: 'image/gif', kind: 'image', sniff: 'gif', declared: ['image/gif', ''], label: 'GIF' },
  avif: { ext: 'avif', mime: 'image/avif', kind: 'image', sniff: 'avif', declared: ['image/avif', ''], label: 'AVIF' },
  mp4: { ext: 'mp4', mime: 'video/mp4', kind: 'video', sniff: 'mp4', declared: ['video/mp4', ''], label: 'MP4' },
  webm: { ext: 'webm', mime: 'video/webm', kind: 'video', sniff: 'webm', declared: ['video/webm', ''], label: 'WebM' },
  glb: {
    ext: 'glb',
    mime: 'model/gltf-binary',
    kind: 'model',
    sniff: 'glb',
    declared: ['model/gltf-binary', 'application/octet-stream', 'model/gltf+binary', ''],
    label: 'GLB',
  },
};

/** Format of a stored object by its canonical extension. */
export const FORMAT_BY_EXT: Record<UploadFormat['ext'], UploadFormat> = {
  jpg: JPG,
  png: UPLOAD_FORMATS.png,
  webp: UPLOAD_FORMATS.webp,
  gif: UPLOAD_FORMATS.gif,
  avif: UPLOAD_FORMATS.avif,
  mp4: UPLOAD_FORMATS.mp4,
  webm: UPLOAD_FORMATS.webm,
  glb: UPLOAD_FORMATS.glb,
};

/** Short format name for a MIME type, e.g. "model/gltf-binary" → "GLB". */
export function formatLabelForMime(mime: string | null | undefined): string | null {
  if (!mime) return null;
  const known = Object.values(FORMAT_BY_EXT).find((f) => f.mime === mime);
  return known ? known.label : (mime.split('/')[1]?.toUpperCase() ?? null);
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function formatForFilename(name: string): UploadFormat | null {
  return UPLOAD_FORMATS[fileExtension(name)] ?? null;
}

/** Value for <input type="file" accept>, limited to the given kinds. */
export function acceptAttribute(kinds?: readonly MediaKind[]): string {
  const out = new Set<string>();
  for (const [ext, f] of Object.entries(UPLOAD_FORMATS)) {
    if (kinds && kinds.length && !kinds.includes(f.kind)) continue;
    out.add(`.${ext}`);
    if (f.kind !== 'model') out.add(f.mime);
  }
  return [...out].join(',');
}

/** Human summary of what can be uploaded, e.g. "JPEG, PNG, WebP up to 15 MB". */
export function acceptedSummary(kinds?: readonly MediaKind[]): string {
  const list = kinds && kinds.length ? kinds : MEDIA_KINDS;
  return list
    .map((kind) => {
      const labels = [...new Set(Object.values(UPLOAD_FORMATS).filter((f) => f.kind === kind).map((f) => f.label))];
      return `${labels.join(', ')} up to ${formatBytes(MAX_UPLOAD_BYTES[kind])}`;
    })
    .join(' · ');
}

/** Object paths generated by createUpload: <folder>/<yyyy>/<mm>/<uuid>.<ext>. */
export const STORAGE_PATH_RE = new RegExp(
  `^(${STORAGE_FOLDERS.join('|')})/\\d{4}/(0[1-9]|1[0-2])/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${Object.keys(FORMAT_BY_EXT).join('|')})$`,
);

export function formatFromStoragePath(path: string): UploadFormat | null {
  if (!STORAGE_PATH_RE.test(path)) return null;
  return FORMAT_BY_EXT[fileExtension(path) as UploadFormat['ext']] ?? null;
}

/** "summer_drop-hero_02.JPG" → "summer drop hero 02". */
export function labelFromFilename(name: string): string {
  const base = [...name.replace(/\.[^.]*$/, '')].filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127 && ch !== '<' && ch !== '>').join('');
  const cleaned = base
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'Untitled').slice(0, 160);
}

const STORAGE_PUBLIC_PREFIX = publicEnv.supabaseUrl ? `${publicEnv.supabaseUrl}/storage/v1/object/public/` : null;

/**
 * Whether next/image may resize this URL: bundled files and our own public
 * storage objects (allowed by images.remotePatterns). Arbitrary https URLs are
 * rendered as-is, because an unconfigured host would make next/image throw.
 */
export function isOptimizableImageUrl(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  return STORAGE_PUBLIC_PREFIX !== null && url.startsWith(STORAGE_PUBLIC_PREFIX);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
}

export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Rows and DTOs
// ---------------------------------------------------------------------------
export const MEDIA_ASSET_COLUMNS =
  'id, kind, bucket, storage_path, external_url, label, alt_text, mime_type, size_bytes, width, height, duration_seconds, poster_asset_id, folder_id, sha256, created_at, updated_at, created_by';

export type MediaAssetRow = Pick<
  Tables<'media_assets'>,
  | 'id'
  | 'kind'
  | 'bucket'
  | 'storage_path'
  | 'external_url'
  | 'label'
  | 'alt_text'
  | 'mime_type'
  | 'size_bytes'
  | 'width'
  | 'height'
  | 'duration_seconds'
  | 'poster_asset_id'
  | 'folder_id'
  | 'sha256'
  | 'created_at'
  | 'updated_at'
  | 'created_by'
>;

type SummarySource = Pick<Tables<'media_assets'>, 'id' | 'kind' | 'bucket' | 'storage_path' | 'external_url' | 'label' | 'alt_text' | 'mime_type' | 'width' | 'height'>;

export function toMediaSummary(row: SummarySource): MediaAssetSummary {
  return {
    id: row.id,
    kind: row.kind,
    url: assetUrl(row),
    altText: row.alt_text,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type,
    label: row.label || null,
  };
}

/** One tile in the library grid / picker. */
export interface MediaListItem extends MediaAssetSummary {
  folderId: string | null;
  sizeBytes: number | null;
  createdAt: string;
  /** Number of places the asset is referenced (null when not computed). */
  usageCount: number | null;
  /** Resolved poster URL for videos. */
  posterUrl: string | null;
}

export interface MediaFolderOption {
  id: string;
  name: string;
  assetCount: number;
}

export interface MediaUsage {
  source: string;
  label: string;
  detail: string;
  href: string | null;
}

export interface MediaAssetDetail extends MediaListItem {
  storagePath: string | null;
  externalUrl: string | null;
  durationSeconds: number | null;
  sha256: string | null;
  updatedAt: string;
  uploadedBy: string | null;
  poster: MediaAssetSummary | null;
  usage: MediaUsage[];
}

export interface MediaListPage {
  items: MediaListItem[];
  total: number;
  page: number;
  pageCount: number;
}

/** Admin screen where a reference can be changed. */
export function usageHref(source: string, refId: string): string | null {
  switch (source) {
    case 'product_media':
    case 'product_model':
    case 'product_og':
    case 'product_description':
      return `/admin/products/${refId}`;
    case 'category_image':
    case 'brand_logo':
      return '/admin/categories';
    case 'collection_image':
      return `/admin/collections/${refId}`;
    case 'store_logo':
    case 'store_favicon':
    case 'store_og':
      return '/admin/settings';
    case 'homepage_section':
    case 'homepage_item':
      return '/admin/content/homepage';
    case 'page_content':
      return '/admin/content/pages';
    case 'video_poster':
      return `/admin/media?asset=${refId}`;
    default:
      return null;
  }
}

export const USAGE_SOURCE_LABEL: Record<string, string> = {
  product_media: 'Product',
  product_model: 'Product',
  product_og: 'Product',
  product_description: 'Product',
  category_image: 'Category',
  collection_image: 'Collection',
  brand_logo: 'Brand',
  store_logo: 'Settings',
  store_favicon: 'Settings',
  store_og: 'Settings',
  homepage_section: 'Homepage',
  homepage_item: 'Homepage',
  page_content: 'Page',
  video_poster: 'Video',
};

// ---------------------------------------------------------------------------
// Upload pipeline DTOs (createUpload → browser PUT → finalizeUpload)
// ---------------------------------------------------------------------------
export interface UploadRequestFile {
  /** Client-side id so results can be matched back to the queue entry. */
  clientId: string;
  name: string;
  type: string;
  size: number;
}

export interface UploadTicket {
  clientId: string;
  path: string;
  token: string;
  signedUrl: string;
  /** Content-Type the browser must send (decided by the server, not the browser). */
  contentType: string;
  kind: MediaKind;
}

export type UploadTicketResult =
  | { clientId: string; ok: true; ticket: UploadTicket }
  /** retryable: a transient storage problem rather than a rejected file. */
  | { clientId: string; ok: false; error: string; retryable?: boolean };

export interface FinalizedUpload {
  asset: MediaListItem;
  /** True when an identical file was already in the library and was reused. */
  duplicate: boolean;
}
