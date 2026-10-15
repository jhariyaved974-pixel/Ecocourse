'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus } from 'lucide-react';
import { EmptyState } from '@/components/ui/misc';
import { NativeSelect } from '@/components/ui/form-controls';
import { STORAGE_FOLDERS, STORAGE_FOLDER_LABEL, type MediaFolderOption, type MediaListItem, type StorageFolder } from '@/lib/admin/media';
import { MediaTile } from './media-tile';
import { UploadDropzone, UploadQueueList } from './upload-queue';
import { useMediaUploader } from './use-media-uploader';
import { AssetDetailSheet } from './asset-detail-sheet';
import { MediaFilters } from './media-filters';

export function MediaLibrary({
  items,
  folders,
  activeFolderId,
  initialAssetId,
  filtered,
  total,
  countLabel,
}: {
  items: MediaListItem[];
  folders: MediaFolderOption[];
  /** Library folder being viewed: new uploads are filed there. */
  activeFolderId: string | null;
  /** Asset to open on arrival (?asset=…), e.g. from a "where used" link. */
  initialAssetId: string | null;
  filtered: boolean;
  /** Number of files matching the current view (null when it could not be loaded). */
  total: number | null;
  /** Singular noun for the count, e.g. "file" or "matching file". */
  countLabel: string;
}) {
  const router = useRouter();
  const [storageFolder, setStorageFolder] = React.useState<StorageFolder>('library');
  const [openId, setOpenId] = React.useState<string | null>(initialAssetId);
  const [sheetOpen, setSheetOpen] = React.useState(Boolean(initialAssetId));
  const lastUploaded = React.useRef<MediaListItem[]>([]);
  const storageSelectId = React.useId();

  // Following a link to another ?asset= on this page opens that asset.
  const [seenInitial, setSeenInitial] = React.useState(initialAssetId);
  if (initialAssetId !== seenInitial) {
    setSeenInitial(initialAssetId);
    if (initialAssetId) {
      setOpenId(initialAssetId);
      setSheetOpen(true);
    }
  }

  // A modal marks the rest of the page aria-hidden. Doing that while streamed
  // parts of the page are still hydrating (e.g. a ?asset= deep link on a full
  // page load) causes a hydration mismatch, so the sheet only opens once the
  // browser is idle after mount.
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setSettled(true), { timeout: 1000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setSettled(true), 200);
    return () => window.clearTimeout(id);
  }, []);

  const openAsset = (id: string) => {
    setOpenId(id);
    setSheetOpen(true);
  };

  const uploader = useMediaUploader({
    folder: storageFolder,
    mediaFolderId: activeFolderId,
    onUploaded: (asset, duplicate) => {
      if (!duplicate) lastUploaded.current.push(asset);
    },
    onSettled: () => {
      const fresh = lastUploaded.current;
      lastUploaded.current = [];
      router.refresh();
      // A single new image: open it straight away so alt text can be added.
      if (fresh.length === 1 && fresh[0].kind === 'image') openAsset(fresh[0].id);
    },
  });

  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const initial = items.find((i) => i.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <section aria-labelledby="media-upload-heading" className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="media-upload-heading" className="text-sm font-semibold">
              Upload files
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {activeFolder ? (
                <>
                  New files are filed in <span className="font-medium text-ink">{activeFolder.name}</span>.
                </>
              ) : (
                'New files are added without a folder. Open a folder first to file uploads there.'
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={storageSelectId} className="text-xs whitespace-nowrap text-muted">
              Storage area
            </label>
            <NativeSelect id={storageSelectId} value={storageFolder} onChange={(e) => setStorageFolder(e.target.value as StorageFolder)} className="h-8 rounded-full pr-8 text-xs">
              {STORAGE_FOLDERS.map((f) => (
                <option key={f} value={f}>
                  {STORAGE_FOLDER_LABEL[f]}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <UploadDropzone onFiles={uploader.addFiles} compact />
        <UploadQueueList className="mt-3" items={uploader.items} onRetry={uploader.retry} onRemove={uploader.remove} onClear={uploader.clearFinished} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <React.Suspense fallback={<div className="h-9 w-full max-w-xl" aria-hidden />}>
          <MediaFilters />
        </React.Suspense>
        {total !== null ? (
          <p className="text-xs text-muted" aria-live="polite">
            {`${total} ${countLabel}${total === 1 ? '' : 's'}`}
          </p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<ImagePlus className="size-5" />}
          title={filtered ? 'No files match these filters' : activeFolder ? 'This folder is empty' : 'The media library is empty'}
          description={
            filtered
              ? 'Clear the search or choose another folder or type.'
              : activeFolder
                ? 'Upload files while this folder is open, or move files here from their details panel.'
                : 'Upload product photos, banners, videos and 3D models to use them across the store.'
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6" aria-label="Media files">
          {items.map((item) => (
            <li key={item.id} className="min-w-0">
              <MediaTile item={item} showUsage onClick={() => openAsset(item.id)} selected={sheetOpen && openId === item.id} />
            </li>
          ))}
        </ul>
      )}

      <AssetDetailSheet
        assetId={openId}
        initial={initial}
        folders={folders}
        open={sheetOpen && settled}
        onOpenChange={setSheetOpen}
        onDeleted={() => {
          setSheetOpen(false);
          setOpenId(null);
          router.refresh();
        }}
      />
    </div>
  );
}
