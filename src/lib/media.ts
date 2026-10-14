import { publicEnv } from '@/lib/env';

/**
 * Media references are stored either as a root-relative path (bundled assets),
 * an https URL, or `storage://<bucket>/<path>` for Supabase Storage objects.
 */
export function resolveMediaUrl(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (ref.startsWith('storage://')) {
    const rest = ref.slice('storage://'.length);
    return `${publicEnv.supabaseUrl}/storage/v1/object/public/${rest.split('/').map(encodeURIComponent).join('/')}`;
  }
  if (ref.startsWith('/') || ref.startsWith('https://')) return ref;
  return null;
}

export interface MediaAssetLike {
  bucket: string;
  storage_path: string | null;
  external_url: string | null;
}

export function assetUrl(asset: MediaAssetLike | null | undefined): string | null {
  if (!asset) return null;
  if (asset.external_url) return resolveMediaUrl(asset.external_url);
  if (asset.storage_path) return resolveMediaUrl(`storage://${asset.bucket}/${asset.storage_path}`);
  return null;
}

export function absoluteUrl(path: string) {
  if (path.startsWith('http')) return path;
  return `${publicEnv.siteUrl}${path.startsWith('/') ? path : `/${path}`}`;
}
