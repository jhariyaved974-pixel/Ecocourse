import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { dbErrorMessage } from '@/lib/errors';
import { PageHeader, Pagination, firstParam, parsePage } from '@/components/admin/ui';
import { Notice } from '@/components/ui/misc';
import { MediaLibrary } from '@/components/admin/media/media-library';
import { FolderNav, type FolderNavEntry } from '@/components/admin/media/folder-nav';
import { FolderToolbar, NewFolderButton } from '@/components/admin/media/folder-manager';
import { MEDIA_PAGE_SIZE } from '@/lib/admin/media';
import { getMediaStats, listMediaAssets, listMediaFolders } from './_lib/queries';

export const metadata: Metadata = { title: 'Media library' };

// Invalid values are ignored rather than failing the page.
const filtersSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  kind: z.enum(['image', 'video', 'model']).optional().catch(undefined),
  folder: z.union([z.uuid(), z.literal('none')]).optional().catch(undefined),
  alt: z.literal('missing').optional().catch(undefined),
  asset: z.uuid().optional().catch(undefined),
});

export default async function MediaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const sp = await searchParams;
  const filters = filtersSchema.parse({
    q: firstParam(sp.q) || undefined,
    kind: firstParam(sp.kind) || undefined,
    folder: firstParam(sp.folder) || undefined,
    alt: firstParam(sp.alt) || undefined,
    asset: firstParam(sp.asset) || undefined,
  });
  const page = parsePage(sp.page);
  const supabase = await createSupabaseServerClient();

  const [list, folderRes, statsRes] = await Promise.all([
    listMediaAssets(supabase, {
      q: filters.q,
      kinds: filters.kind ? [filters.kind] : undefined,
      folder: filters.folder,
      missingAlt: filters.alt === 'missing',
      page,
      pageSize: MEDIA_PAGE_SIZE,
      withUsage: true,
    }),
    listMediaFolders(supabase),
    getMediaStats(supabase),
  ]);

  const folders = folderRes.data ?? [];
  const stats = statsRes.data ?? { total: 0, unfiled: 0, missingAlt: 0 };
  const loadError = list.error ?? folderRes.error ?? statsRes.error;
  const items = list.data?.items ?? [];
  const activeFolder = filters.folder && filters.folder !== 'none' ? (folders.find((f) => f.id === filters.folder) ?? null) : null;
  const missingFolder = Boolean(filters.folder && filters.folder !== 'none' && !folderRes.error && !activeFolder);
  // "Unfiled" and stale folder links are filtered views too (the library itself may not be empty).
  const filtered = Boolean(filters.q || filters.kind || filters.alt || (filters.folder && !activeFolder));

  // Folder links keep the search and type filters but reset the page.
  const hrefFor = (folder: string | null) => {
    const params = new URLSearchParams();
    if (folder) params.set('folder', folder);
    if (filters.q) params.set('q', filters.q);
    if (filters.kind) params.set('kind', filters.kind);
    if (filters.alt) params.set('alt', filters.alt);
    const qs = params.toString();
    return `/admin/media${qs ? `?${qs}` : ''}`;
  };
  const entries: FolderNavEntry[] = [
    { key: 'all', label: 'All files', count: stats.total, href: hrefFor(null), active: !filters.folder, icon: 'all' },
    { key: 'none', label: 'Unfiled', count: stats.unfiled, href: hrefFor('none'), active: filters.folder === 'none', icon: 'unfiled' },
    ...folders.map((f) => ({ key: f.id, label: f.name, count: f.assetCount, href: hrefFor(f.id), active: f.id === filters.folder, icon: 'folder' as const })),
  ];

  const total = list.data?.total ?? 0;
  const description = (
    <>
      {stats.total} file{stats.total === 1 ? '' : 's'} in the library
      {stats.missingAlt > 0 ? (
        <>
          {' · '}
          <Link href="/admin/media?alt=missing" className="font-medium text-warning underline-offset-4 hover:underline">
            {stats.missingAlt} image{stats.missingAlt === 1 ? '' : 's'} missing alt text
          </Link>
        </>
      ) : null}
      .
    </>
  );

  return (
    <>
      <PageHeader title="Media library" description={description} actions={<NewFolderButton />} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <FolderNav entries={entries} />
        <div className="min-w-0 space-y-4">
          {loadError ? <Notice tone="danger" title="Could not load the media library">{dbErrorMessage(loadError)}</Notice> : null}
          {missingFolder ? (
            <Notice tone="warning" title="Folder not found">
              This folder was deleted or the link is out of date. <Link href="/admin/media" className="font-medium underline">Show all files</Link>
            </Notice>
          ) : null}
          {activeFolder ? <FolderToolbar folder={activeFolder} /> : null}
          <MediaLibrary
            items={items}
            folders={folders}
            activeFolderId={activeFolder?.id ?? null}
            initialAssetId={filters.asset ?? null}
            filtered={filtered}
            total={loadError ? null : total}
            countLabel={filtered || activeFolder ? 'matching file' : 'file'}
          />
          <Pagination
            page={page}
            pageCount={list.data?.pageCount ?? 1}
            basePath="/admin/media"
            params={{ q: filters.q, kind: filters.kind, folder: filters.folder, alt: filters.alt }}
          />
        </div>
      </div>
    </>
  );
}
