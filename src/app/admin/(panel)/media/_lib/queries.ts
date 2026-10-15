import 'server-only';
import type { createSupabaseServerClient } from '@/lib/supabase/server';
import { assetUrl } from '@/lib/media';
import {
  MEDIA_ASSET_COLUMNS,
  toMediaSummary,
  usageHref,
  type MediaAssetDetail,
  type MediaAssetRow,
  type MediaFolderOption,
  type MediaKind,
  type MediaListItem,
  type MediaListPage,
  type MediaUsage,
} from '@/lib/admin/media';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type DbError = { code?: string; message?: string; hint?: string | null };
export type QueryResult<T> = { data: T; error: null } | { data: null; error: DbError };

export const LIST_COLUMNS = `${MEDIA_ASSET_COLUMNS}, poster:poster_asset_id(bucket, storage_path, external_url)`;

export type ListRow = MediaAssetRow & { poster: { bucket: string; storage_path: string | null; external_url: string | null } | null };

/** Strips characters that have meaning in PostgREST filter syntax or LIKE patterns. */
export function sanitizeSearch(q: string | null | undefined): string {
  return (q ?? '')
    .replace(/[^\p{L}\p{N}\s.'&-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function toListItem(row: ListRow, usageCount: number | null): MediaListItem {
  return {
    ...toMediaSummary(row),
    folderId: row.folder_id,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    usageCount,
    posterUrl: row.poster ? assetUrl(row.poster) : null,
  };
}

export interface ListMediaOptions {
  q?: string;
  kinds?: readonly MediaKind[];
  /** Folder id, 'none' for unfiled, or undefined for all. */
  folder?: string;
  missingAlt?: boolean;
  page: number;
  pageSize: number;
  withUsage?: boolean;
}

export async function listMediaAssets(supabase: ServerClient, opts: ListMediaOptions): Promise<QueryResult<MediaListPage>> {
  const from = (opts.page - 1) * opts.pageSize;
  let query = supabase.from('media_assets').select(LIST_COLUMNS, { count: 'exact' });
  if (opts.kinds && opts.kinds.length) query = query.in('kind', [...opts.kinds]);
  if (opts.folder === 'none') query = query.is('folder_id', null);
  else if (opts.folder) query = query.eq('folder_id', opts.folder);
  // Alt text matters for images; videos and models are not flagged.
  if (opts.missingAlt) query = query.eq('kind', 'image').eq('alt_text', '');
  const q = sanitizeSearch(opts.q);
  if (q) query = query.or(`label.ilike.*${q}*,alt_text.ilike.*${q}*`);
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + opts.pageSize - 1);
  if (error) return { data: null, error };

  const rows = data ?? [];
  let usage = new Map<string, number>();
  if (opts.withUsage && rows.length) {
    const res = await usageCounts(supabase, rows.map((r) => r.id));
    if (res.error) return { data: null, error: res.error };
    usage = res.data;
  }
  const total = count ?? rows.length;
  return {
    data: {
      items: rows.map((r) => toListItem(r, opts.withUsage ? (usage.get(r.id) ?? 0) : null)),
      total,
      page: opts.page,
      pageCount: Math.max(1, Math.ceil(total / opts.pageSize)),
    },
    error: null,
  };
}

export async function usageCounts(supabase: ServerClient, ids: string[]): Promise<QueryResult<Map<string, number>>> {
  const { data, error } = await supabase.rpc('media_asset_usage', { p_asset_ids: ids });
  if (error) return { data: null, error };
  const out = new Map<string, number>();
  for (const row of data ?? []) out.set(row.asset_id, (out.get(row.asset_id) ?? 0) + 1);
  return { data: out, error: null };
}

export async function getUsage(supabase: ServerClient, id: string): Promise<QueryResult<MediaUsage[]>> {
  const { data, error } = await supabase.rpc('media_asset_usage', { p_asset_ids: [id] });
  if (error) return { data: null, error };
  return {
    data: (data ?? []).map((u) => ({
      source: u.source,
      label: u.ref_label ?? 'Untitled',
      detail: u.detail ?? '',
      href: usageHref(u.source, u.ref_id),
    })),
    error: null,
  };
}

export async function listMediaFolders(supabase: ServerClient): Promise<QueryResult<MediaFolderOption[]>> {
  const { data, error } = await supabase
    .from('media_folders')
    .select('id, name, media_assets(count)')
    .order('name', { ascending: true });
  if (error) return { data: null, error };
  return {
    data: (data ?? []).map((f) => ({ id: f.id, name: f.name, assetCount: f.media_assets?.[0]?.count ?? 0 })),
    error: null,
  };
}

export interface MediaStats {
  total: number;
  unfiled: number;
  missingAlt: number;
}

/** Counts for the folder navigation and the page description. */
export async function getMediaStats(supabase: ServerClient): Promise<QueryResult<MediaStats>> {
  const head = { count: 'exact' as const, head: true };
  const [total, unfiled, missingAlt] = await Promise.all([
    supabase.from('media_assets').select('id', head),
    supabase.from('media_assets').select('id', head).is('folder_id', null),
    supabase.from('media_assets').select('id', head).eq('kind', 'image').eq('alt_text', ''),
  ]);
  const error = total.error ?? unfiled.error ?? missingAlt.error;
  if (error) return { data: null, error };
  return { data: { total: total.count ?? 0, unfiled: unfiled.count ?? 0, missingAlt: missingAlt.count ?? 0 }, error: null };
}

export async function getMediaAssetDetail(supabase: ServerClient, id: string, viewerId: string): Promise<QueryResult<MediaAssetDetail | null>> {
  const { data: row, error } = await supabase.from('media_assets').select(LIST_COLUMNS).eq('id', id).maybeSingle();
  if (error) return { data: null, error };
  if (!row) return { data: null, error: null };

  const [usage, poster, uploader] = await Promise.all([
    getUsage(supabase, id),
    row.poster_asset_id
      ? supabase.from('media_assets').select('id, kind, bucket, storage_path, external_url, label, alt_text, mime_type, width, height').eq('id', row.poster_asset_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    row.created_by && row.created_by !== viewerId
      ? supabase.from('profiles').select('email, full_name').eq('id', row.created_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (usage.error) return { data: null, error: usage.error };

  let uploadedBy: string | null = null;
  if (row.created_by) {
    if (row.created_by === viewerId) uploadedBy = 'You';
    else uploadedBy = uploader.data?.full_name || uploader.data?.email || 'Another staff member';
  }

  return {
    data: {
      ...toListItem(row, usage.data.length),
      storagePath: row.storage_path,
      externalUrl: row.external_url,
      durationSeconds: row.duration_seconds,
      sha256: row.sha256,
      updatedAt: row.updated_at,
      uploadedBy,
      poster: poster.data ? toMediaSummary(poster.data) : null,
      usage: usage.data,
    },
    error: null,
  };
}
