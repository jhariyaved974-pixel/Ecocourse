'use server';

import { randomUUID } from 'node:crypto';
import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors, type ActionResult } from '@/lib/errors';
import { TAGS } from '@/lib/catalog/queries';
import { CONTENT_TAGS } from '@/lib/content/queries';
import {
  MAX_FILES_PER_BATCH,
  MAX_UPLOAD_BYTES,
  MEDIA_BUCKET,
  PICKER_PAGE_SIZE,
  STORAGE_FOLDERS,
  STORAGE_PATH_RE,
  formatBytes,
  formatForFilename,
  formatFromStoragePath,
  labelFromFilename,
  type FinalizedUpload,
  type MediaAssetDetail,
  type MediaListPage,
  type UploadTicketResult,
} from '@/lib/admin/media';
import type { createSupabaseServerClient } from '@/lib/supabase/server';
import { inspectUpload } from './_lib/inspect';
import { LIST_COLUMNS, getMediaAssetDetail, getUsage, listMediaAssets as queryMediaAssets, toListItem } from './_lib/queries';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const kindSchema = z.enum(['image', 'video', 'model']);
const folderNameSchema = z
  .string()
  .trim()
  .min(1, 'Folder name is required.')
  .max(80, 'Folder names are limited to 80 characters.')
  .refine((v) => !/[<>\\]/.test(v), 'Folder names cannot contain < > or \\.');

// ---------------------------------------------------------------------------
// Upload pipeline
// ---------------------------------------------------------------------------
const createUploadSchema = z.object({
  folder: z.enum(STORAGE_FOLDERS),
  files: z
    .array(
      z.object({
        clientId: z.string().min(1).max(64),
        name: z.string().trim().min(1, 'The file has no name.').max(255, 'The file name is too long.'),
        type: z.string().max(100),
        size: z.number().int().nonnegative(),
      }),
    )
    .min(1, 'Choose at least one file.')
    .max(MAX_FILES_PER_BATCH, `Upload at most ${MAX_FILES_PER_BATCH} files at a time.`),
});

/**
 * Step 1 of an upload: validates what the browser intends to send and returns
 * a signed, single-object upload URL at a server-chosen random path. The
 * signed URL is created with the staff member's own session, so the storage
 * policies (catalogue staff, allowed folder and extension) apply.
 */
export async function createUpload(input: unknown): Promise<ActionResult<UploadTicketResult[]>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = createUploadSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid upload request.', 'validation');
    const { folder, files } = parsed.data;
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const storage = supabase.storage.from(MEDIA_BUCKET);

    const results: UploadTicketResult[] = [];
    for (const file of files) {
      const format = formatForFilename(file.name);
      if (!format) {
        results.push({ clientId: file.clientId, ok: false, error: 'Unsupported file type. Upload JPEG, PNG, WebP, GIF or AVIF images, MP4/WebM videos or GLB models.' });
        continue;
      }
      const declared = file.type.trim().toLowerCase();
      if (!format.declared.includes(declared)) {
        results.push({ clientId: file.clientId, ok: false, error: `The file is named .${format.ext} but your browser reports it as “${declared}”.` });
        continue;
      }
      if (file.size === 0) {
        results.push({ clientId: file.clientId, ok: false, error: 'The file is empty.' });
        continue;
      }
      const limit = MAX_UPLOAD_BYTES[format.kind];
      if (file.size > limit) {
        results.push({ clientId: file.clientId, ok: false, error: `The file is ${formatBytes(file.size)}; ${format.kind === 'model' ? '3D models' : `${format.kind}s`} are limited to ${formatBytes(limit)}.` });
        continue;
      }
      const path = `${folder}/${yyyy}/${mm}/${randomUUID()}.${format.ext}`;
      const { data, error } = await storage.createSignedUploadUrl(path);
      if (error || !data) {
        console.error('media: signed upload URL failed', { path, message: error?.message });
        results.push({ clientId: file.clientId, ok: false, error: 'Storage refused the upload. Check that you have catalogue permissions and try again.' });
        continue;
      }
      results.push({
        clientId: file.clientId,
        ok: true,
        ticket: { clientId: file.clientId, path, token: data.token, signedUrl: data.signedUrl, contentType: format.mime, kind: format.kind },
      });
    }
    return ok(results);
  });
}

const finalizeSchema = z.object({
  path: z.string().max(200).regex(STORAGE_PATH_RE, 'Invalid upload path.'),
  filename: z.string().trim().min(1).max(255),
  folderId: z.uuid().nullable().optional(),
});

/**
 * Step 3: the browser has PUT the bytes. Download the object with the staff
 * session, verify the real content (magic bytes, dimensions, GLB header…),
 * de-duplicate by SHA-256 and register it in media_assets. Anything that
 * fails verification is deleted from storage.
 */
export async function finalizeUpload(input: unknown): Promise<ActionResult<FinalizedUpload>> {
  return staffAction<FinalizedUpload>(ROLE_GROUPS.catalog, async ({ staff, supabase }) => {
    const parsed = finalizeSchema.safeParse(input);
    if (!parsed.success) return fail('Invalid upload.', 'validation');
    const { path, filename, folderId } = parsed.data;
    const format = formatFromStoragePath(path);
    if (!format) return fail('Invalid upload path.', 'validation');

    // Finalising the same upload twice (e.g. a retried request) returns the existing row.
    const { data: registered, error: lookupError } = await supabase
      .from('media_assets')
      .select(LIST_COLUMNS)
      .eq('bucket', MEDIA_BUCKET)
      .eq('storage_path', path)
      .maybeSingle();
    if (lookupError) return dbFail(lookupError);
    if (registered) return ok({ asset: toListItem(registered, null), duplicate: false });

    const storage = supabase.storage.from(MEDIA_BUCKET);
    const removeObject = async () => {
      const { error } = await storage.remove([path]);
      if (error) console.error('media: could not remove rejected upload', { path, message: error.message });
    };

    const { data: blob, error: downloadError } = await storage.download(path);
    if (downloadError || !blob) return fail('The file did not reach storage. Please retry the upload.', 'not_uploaded');

    // The stored Content-Type is what the public URL will be served with; it must be the one we chose.
    const storedType = (blob.type || '').split(';')[0].trim().toLowerCase();
    if (storedType && storedType !== format.mime) {
      await removeObject();
      return fail(`The file was uploaded as “${storedType}” instead of ${format.mime}. Please retry.`, 'rejected');
    }

    const bytes = Buffer.from(await blob.arrayBuffer());
    const result = await inspectUpload(bytes, format);
    if (!result.ok) {
      await removeObject();
      return fail(result.error, 'rejected');
    }

    const { data: duplicate, error: dupError } = await supabase
      .from('media_assets')
      .select(LIST_COLUMNS)
      .eq('sha256', result.sha256)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (dupError) {
      await removeObject();
      return dbFail(dupError);
    }
    if (duplicate) {
      await removeObject();
      return ok({ asset: toListItem(duplicate, null), duplicate: true }, `“${duplicate.label || filename}” is already in the library, so the existing file was used.`);
    }

    let targetFolder: string | null = folderId ?? null;
    if (targetFolder) {
      const { data: folder } = await supabase.from('media_folders').select('id').eq('id', targetFolder).maybeSingle();
      if (!folder) targetFolder = null;
    }

    const { data: row, error: insertError } = await supabase
      .from('media_assets')
      .insert({
        kind: result.kind,
        bucket: MEDIA_BUCKET,
        storage_path: path,
        label: labelFromFilename(filename),
        alt_text: '',
        mime_type: result.mime,
        size_bytes: result.sizeBytes,
        width: result.width,
        height: result.height,
        duration_seconds: result.durationSeconds,
        folder_id: targetFolder,
        sha256: result.sha256,
        created_by: staff.user.id,
      })
      .select(LIST_COLUMNS)
      .single();
    if (insertError || !row) {
      // A concurrent finalize of the same upload won the race: the object is
      // now registered, so it must not be removed. Return that row instead.
      if (insertError?.code === '23505') {
        const { data: winner } = await supabase.from('media_assets').select(LIST_COLUMNS).eq('bucket', MEDIA_BUCKET).eq('storage_path', path).maybeSingle();
        if (winner) return ok({ asset: toListItem(winner, null), duplicate: false });
      }
      await removeObject();
      return insertError ? dbFail(insertError, 'The file could not be saved to the library.') : fail('The file could not be saved to the library.');
    }
    return ok({ asset: toListItem(row, 0), duplicate: false }, 'Uploaded');
  });
}

const discardSchema = z.object({ path: z.string().max(200).regex(STORAGE_PATH_RE) });

/** Removes an object whose upload was abandoned (never registered in the library). */
export async function discardUpload(input: unknown): Promise<ActionResult<null>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = discardSchema.safeParse(input);
    if (!parsed.success) return fail('Invalid upload path.', 'validation');
    const { data: registered, error } = await supabase.from('media_assets').select('id').eq('bucket', MEDIA_BUCKET).eq('storage_path', parsed.data.path).maybeSingle();
    if (error) return dbFail(error);
    if (registered) return ok(null);
    const { error: removeError } = await supabase.storage.from(MEDIA_BUCKET).remove([parsed.data.path]);
    if (removeError) console.error('media: could not discard upload', { path: parsed.data.path, message: removeError.message });
    return ok(null);
  });
}

// ---------------------------------------------------------------------------
// Reads used by client components (picker, detail drawer)
// ---------------------------------------------------------------------------
const listSchema = z.object({
  q: z.string().max(120).optional(),
  kinds: z.array(kindSchema).max(3).optional(),
  folder: z.union([z.uuid(), z.literal('none')]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export async function listMediaAssets(input: unknown): Promise<ActionResult<MediaListPage>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = listSchema.safeParse(input ?? {});
    if (!parsed.success) return fail('Invalid filters.', 'validation');
    const res = await queryMediaAssets(supabase, { ...parsed.data, pageSize: PICKER_PAGE_SIZE });
    if (res.error) return dbFail(res.error);
    return ok(res.data);
  });
}

export async function getMediaAsset(input: unknown): Promise<ActionResult<MediaAssetDetail>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ staff, supabase }) => {
    const parsed = z.object({ id: z.uuid() }).safeParse(input);
    if (!parsed.success) return fail('Invalid file.', 'validation');
    const res = await getMediaAssetDetail(supabase, parsed.data.id, staff.user.id);
    if (res.error) return dbFail(res.error);
    if (!res.data) return fail('This file no longer exists.', 'not_found');
    return ok(res.data);
  });
}

// ---------------------------------------------------------------------------
// Edit / delete
// ---------------------------------------------------------------------------
const updateSchema = z.object({
  id: z.uuid(),
  label: z.string().trim().max(160, 'Labels are limited to 160 characters.'),
  altText: z.string().trim().max(300, 'Alt text is limited to 300 characters.'),
  folderId: z.uuid().nullable(),
  posterAssetId: z.uuid().nullable(),
});

/** Invalidates storefront caches for the places that display this asset. */
async function invalidateUsage(supabase: ServerClient, id: string) {
  const usage = await getUsage(supabase, id);
  if (usage.error) {
    // Fall back to invalidating everything that can show media.
    updateTag(TAGS.catalog);
    updateTag(CONTENT_TAGS.homepage);
    updateTag(CONTENT_TAGS.settings);
    return;
  }
  const sources = new Set(usage.data.map((u) => u.source));
  if ([...sources].some((s) => s.startsWith('product_') || s === 'category_image' || s === 'collection_image' || s === 'brand_logo' || s === 'video_poster')) {
    updateTag(TAGS.catalog);
  }
  // The homepage also shows category/collection tiles and video posters.
  if ([...sources].some((s) => s.startsWith('homepage_') || s === 'category_image' || s === 'collection_image' || s === 'video_poster')) {
    updateTag(CONTENT_TAGS.homepage);
  }
  if (sources.has('store_logo') || sources.has('store_favicon') || sources.has('store_og')) updateTag(CONTENT_TAGS.settings);
  if (sources.has('page_content')) updateTag(CONTENT_TAGS.pages);
}

export async function updateMediaAsset(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return fail('Please fix the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const v = parsed.data;

    const { data: asset, error } = await supabase.from('media_assets').select('id, kind, alt_text, poster_asset_id').eq('id', v.id).maybeSingle();
    if (error) return dbFail(error);
    if (!asset) return fail('This file no longer exists.', 'not_found');

    if (v.posterAssetId) {
      if (asset.kind !== 'video') return fail('Only videos can have a poster image.', 'validation', { posterAssetId: 'Only videos can have a poster image.' });
      if (v.posterAssetId === v.id) return fail('A video cannot be its own poster.', 'validation', { posterAssetId: 'Choose an image.' });
      const { data: poster, error: posterError } = await supabase.from('media_assets').select('id, kind').eq('id', v.posterAssetId).maybeSingle();
      if (posterError) return dbFail(posterError);
      if (!poster || poster.kind !== 'image') return fail('The poster must be an image from the library.', 'validation', { posterAssetId: 'Choose an image.' });
    }
    if (v.folderId) {
      const { data: folder, error: folderError } = await supabase.from('media_folders').select('id').eq('id', v.folderId).maybeSingle();
      if (folderError) return dbFail(folderError);
      if (!folder) return fail('That folder no longer exists.', 'validation', { folderId: 'Choose another folder.' });
    }

    const { error: updateError } = await supabase
      .from('media_assets')
      .update({
        label: v.label,
        alt_text: v.altText,
        folder_id: v.folderId,
        poster_asset_id: asset.kind === 'video' ? v.posterAssetId : null,
      })
      .eq('id', v.id);
    if (updateError) return dbFail(updateError, 'The file details could not be saved.');

    // Alt text and posters are rendered on the storefront; labels and folders are admin-only.
    if (asset.alt_text !== v.altText || (asset.kind === 'video' && asset.poster_asset_id !== v.posterAssetId)) {
      await invalidateUsage(supabase, v.id);
    }
    return ok({ id: v.id }, 'File details saved');
  });
}

export async function deleteMediaAsset(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.object({ id: z.uuid() }).safeParse(input);
    if (!parsed.success) return fail('Invalid file.', 'validation');
    const { data, error } = await supabase.rpc('admin_delete_media_asset', { p_asset_id: parsed.data.id });
    if (error) return dbFail(error, 'The file could not be deleted.');

    const deleted = (data ?? {}) as { bucket?: string; storage_path?: string | null };
    if (deleted.storage_path) {
      const { error: removeError } = await supabase.storage.from(deleted.bucket || MEDIA_BUCKET).remove([deleted.storage_path]);
      if (removeError) {
        console.error('media: row deleted but object removal failed', { path: deleted.storage_path, message: removeError.message });
        return ok({ id: parsed.data.id }, 'The file was removed from the library, but the stored copy could not be deleted.');
      }
    }
    return ok({ id: parsed.data.id }, 'File deleted');
  });
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------
function folderFail(error: { code?: string; message?: string; hint?: string | null }) {
  if (error.code === '23505') return fail('A folder with this name already exists.', 'unique', { name: 'A folder with this name already exists.' });
  return dbFail(error, 'The folder could not be saved.');
}

export async function createMediaFolder(input: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.object({ name: folderNameSchema }).safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid folder name.', 'validation', zodFieldErrors(parsed.error.issues));
    const { data, error } = await supabase.from('media_folders').insert({ name: parsed.data.name, parent_id: null }).select('id, name').single();
    if (error) return folderFail(error);
    return ok(data, 'Folder created');
  });
}

export async function renameMediaFolder(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.object({ id: z.uuid(), name: folderNameSchema }).safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid folder name.', 'validation', zodFieldErrors(parsed.error.issues));
    const { data, error } = await supabase.from('media_folders').update({ name: parsed.data.name }).eq('id', parsed.data.id).select('id');
    if (error) return folderFail(error);
    if (!data?.length) return fail('This folder no longer exists.', 'not_found');
    return ok({ id: parsed.data.id }, 'Folder renamed');
  });
}

export async function deleteMediaFolder(input: unknown): Promise<ActionResult<{ id: string }>> {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = z.object({ id: z.uuid() }).safeParse(input);
    if (!parsed.success) return fail('Invalid folder.', 'validation');
    const id = parsed.data.id;
    const [assets, children] = await Promise.all([
      supabase.from('media_assets').select('id', { count: 'exact', head: true }).eq('folder_id', id),
      supabase.from('media_folders').select('id', { count: 'exact', head: true }).eq('parent_id', id),
    ]);
    if (assets.error) return dbFail(assets.error);
    if (children.error) return dbFail(children.error);
    if ((assets.count ?? 0) > 0) return fail(`This folder still contains ${assets.count} file${assets.count === 1 ? '' : 's'}. Move them to another folder first.`, 'not_empty');
    if ((children.count ?? 0) > 0) return fail('This folder contains other folders. Remove them first.', 'not_empty');
    const { data, error } = await supabase.from('media_folders').delete().eq('id', id).select('id');
    if (error) return dbFail(error, 'The folder could not be deleted.');
    if (!data?.length) return fail('This folder no longer exists.', 'not_found');
    return ok({ id }, 'Folder deleted');
  });
}
