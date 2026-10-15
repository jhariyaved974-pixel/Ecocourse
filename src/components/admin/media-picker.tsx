'use client';

// A dialog that lets staff choose existing assets from the media library or
// upload new ones, then returns the chosen assets. Editors (products, homepage,
// collections…) import this component; keep the props stable.

import * as React from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menus';
import { listMediaAssets } from '@/app/admin/(panel)/media/actions';
import type { MediaAssetSummary } from '@/lib/admin/types';
import { MEDIA_KIND_LABEL, type MediaListItem, type MediaListPage } from '@/lib/admin/media';
import { MediaPreview, MediaTile } from '@/components/admin/media/media-tile';
import { UploadDropzone, UploadQueueList } from '@/components/admin/media/upload-queue';
import { useMediaUploader } from '@/components/admin/media/use-media-uploader';

export interface MediaPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen assets when the user confirms. */
  onSelect: (assets: MediaAssetSummary[]) => void;
  /** Allow choosing several assets at once (default false). */
  multiple?: boolean;
  /** Restrict to these kinds (default: all). */
  kinds?: MediaAssetSummary['kind'][];
  /** Storage folder for new uploads, e.g. 'products' | 'content' | 'brand' | 'models' | 'library'. */
  uploadFolder?: 'products' | 'content' | 'brand' | 'models' | 'library';
  title?: string;
}

export function MediaPicker({ open, onOpenChange, onSelect, multiple = false, kinds, uploadFolder = 'library', title }: MediaPickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(860px,calc(100dvh-2rem))] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:h-[min(860px,calc(100dvh-4rem))]">
        {/* Content unmounts when the dialog closes, so every opening starts fresh. */}
        <PickerBody
          multiple={multiple}
          kinds={kinds}
          uploadFolder={uploadFolder}
          title={title}
          onCancel={() => onOpenChange(false)}
          onConfirm={(assets) => {
            onSelect(assets);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function toSummary(item: MediaAssetSummary): MediaAssetSummary {
  return { id: item.id, kind: item.kind, url: item.url, altText: item.altText, width: item.width, height: item.height, mimeType: item.mimeType, label: item.label };
}

type KindFilter = '' | MediaAssetSummary['kind'];

function PickerBody({
  multiple,
  kinds,
  uploadFolder,
  title,
  onCancel,
  onConfirm,
}: {
  multiple: boolean;
  kinds?: MediaAssetSummary['kind'][];
  uploadFolder: NonNullable<MediaPickerProps['uploadFolder']>;
  title?: string;
  onCancel: () => void;
  onConfirm: (assets: MediaAssetSummary[]) => void;
}) {
  const allowedKinds = kinds && kinds.length ? kinds : undefined;
  const [tab, setTab] = React.useState<'library' | 'upload'>('library');
  const [searchText, setSearchText] = React.useState('');
  const [query, setQuery] = React.useState({ q: '', kind: '' as KindFilter, page: 1 });
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [selected, setSelected] = React.useState<Map<string, MediaAssetSummary>>(() => new Map());
  const [result, setResult] = React.useState<{ key: string; data?: MediaListPage; error?: string } | null>(null);
  const searchTimer = React.useRef<number | undefined>(undefined);

  const kindsKey = allowedKinds ? allowedKinds.join(',') : '';
  const requestKey = JSON.stringify({ ...query, refreshKey, kindsKey });
  React.useEffect(() => {
    let cancelled = false;
    const kindsFilter = query.kind ? [query.kind] : kindsKey ? (kindsKey.split(',') as MediaAssetSummary['kind'][]) : undefined;
    listMediaAssets({ q: query.q || undefined, kinds: kindsFilter, page: query.page })
      .then((res) => {
        if (cancelled) return;
        setResult(res.ok ? { key: requestKey, data: res.data } : { key: requestKey, error: res.error });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, error: 'Could not load the media library. Check your connection.' });
      });
    return () => {
      cancelled = true;
    };
  }, [query.q, query.kind, query.page, kindsKey, requestKey]);
  const loading = result?.key !== requestKey;
  const page = result?.data;

  const select = React.useCallback(
    (asset: MediaAssetSummary) => {
      setSelected((current) => {
        if (!multiple) return new Map([[asset.id, toSummary(asset)]]);
        const next = new Map(current);
        next.set(asset.id, toSummary(asset));
        return next;
      });
    },
    [multiple],
  );

  const toggle = (asset: MediaListItem) => {
    setSelected((current) => {
      if (!multiple) return current.has(asset.id) && current.size === 1 ? current : new Map([[asset.id, toSummary(asset)]]);
      const next = new Map(current);
      if (next.has(asset.id)) next.delete(asset.id);
      else next.set(asset.id, toSummary(asset));
      return next;
    });
  };

  const uploader = useMediaUploader({
    folder: uploadFolder,
    kinds: allowedKinds,
    onUploaded: (asset) => {
      if (allowedKinds && !allowedKinds.includes(asset.kind)) return;
      select(asset);
    },
    onSettled: () => setRefreshKey((k) => k + 1),
  });

  const kindOptions = allowedKinds ?? (['image', 'video', 'model'] as const);
  const count = selected.size;
  const heading = title ?? (multiple ? 'Choose media' : 'Choose a file');

  return (
    <>
      <DialogHeader className="mb-0 border-b border-line px-6 pt-6 pb-4">
        <DialogTitle>{heading}</DialogTitle>
        <DialogDescription>
          {multiple ? 'Select one or more files from the library, or upload new ones.' : 'Select a file from the library, or upload a new one.'}
          {allowedKinds ? ` Showing ${allowedKinds.map((k) => (k === 'model' ? '3D models' : `${MEDIA_KIND_LABEL[k].toLowerCase()}s`)).join(' and ')} only.` : ''}
        </DialogDescription>
      </DialogHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'library' | 'upload')} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 px-6 pt-4">
          <TabsList>
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="upload">
              Upload{uploader.busy ? '…' : ''}
            </TabsTrigger>
          </TabsList>
          {tab === 'library' ? (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-1 sm:justify-end">
              <label className="relative block min-w-0 flex-1 sm:w-64 sm:flex-none">
                <span className="sr-only">Search by label or alt text</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input
                  type="search"
                  value={searchText}
                  placeholder="Search label or alt text…"
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchText(value);
                    window.clearTimeout(searchTimer.current);
                    searchTimer.current = window.setTimeout(() => setQuery((q) => ({ ...q, q: value.trim(), page: 1 })), 300);
                  }}
                  className="h-9 w-full rounded-full border border-line-strong bg-surface pr-3 pl-9 text-sm focus-visible:border-ink focus-visible:outline-none"
                />
              </label>
              {kindOptions.length > 1 ? (
                <label className="text-sm">
                  <span className="sr-only">Filter by type</span>
                  <select
                    value={query.kind}
                    onChange={(e) => setQuery((q) => ({ ...q, kind: e.target.value as KindFilter, page: 1 }))}
                    className="h-9 rounded-full border border-line-strong bg-surface px-3 pr-8 text-sm"
                  >
                    <option value="">All types</option>
                    {kindOptions.map((k) => (
                      <option key={k} value={k}>
                        {MEDIA_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>

        <TabsContent value="library" className="min-h-0 flex-1 overflow-y-auto px-6 py-4 focus-visible:outline-none">
          {result?.error && !loading ? (
            <Notice tone="danger" title="Could not load files">
              {result.error}{' '}
              <button type="button" className="font-medium underline" onClick={() => setRefreshKey((k) => k + 1)}>
                Try again
              </button>
            </Notice>
          ) : loading && !page ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" aria-busy="true" aria-label="Loading files">
              {Array.from({ length: 12 }, (_, i) => (
                <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
              ))}
            </div>
          ) : page && page.items.length === 0 ? (
            <EmptyState
              icon={<ImagePlus className="size-5" />}
              title={query.q ? 'No files match your search' : 'No files yet'}
              description={query.q ? 'Try another word, or upload a new file.' : 'Upload a file to get started.'}
              action={
                <Button type="button" size="sm" onClick={() => setTab('upload')}>
                  Upload files
                </Button>
              }
            />
          ) : page ? (
            <div className={loading ? 'opacity-60 transition-opacity' : undefined} aria-busy={loading || undefined}>
              <p className="mb-3 text-xs text-muted" aria-live="polite">
                {page.total} file{page.total === 1 ? '' : 's'}
                {multiple ? ' · click to select several' : ' · double-click to choose instantly'}
              </p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" aria-label="Library files">
                {page.items.map((item) => (
                  <li key={item.id} className="min-w-0">
                    <MediaTile
                      item={item}
                      selectable
                      selected={selected.has(item.id)}
                      onClick={() => toggle(item)}
                      onDoubleClick={multiple ? undefined : () => onConfirm([toSummary(item)])}
                    />
                  </li>
                ))}
              </ul>
              {page.pageCount > 1 ? (
                <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
                  <p className="text-muted">
                    Page {page.page} of {page.pageCount}
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={page.page <= 1 || loading} onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}>
                      <ChevronLeft /> Previous
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={page.page >= page.pageCount || loading} onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}>
                      Next <ChevronRight />
                    </Button>
                  </div>
                </nav>
              ) : null}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="upload" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 focus-visible:outline-none">
          <UploadDropzone onFiles={uploader.addFiles} kinds={allowedKinds} />
          <p className="text-xs text-muted">Uploaded files are added to the library and selected automatically. Remember to add alt text in the media library.</p>
          <UploadQueueList items={uploader.items} onRetry={uploader.retry} onRemove={uploader.remove} onClear={uploader.clearFinished} />
        </TabsContent>
      </Tabs>

      <div className="flex flex-col-reverse gap-3 border-t border-line px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 text-sm">
          {count > 0 ? (
            <ul className="flex shrink-0 -space-x-2" aria-hidden>
              {[...selected.values()].slice(-5).map((asset) => (
                <li key={asset.id} className="w-9 overflow-hidden rounded-md border-2 border-surface bg-surface-2">
                  <MediaPreview asset={asset} sizes="36px" />
                </li>
              ))}
            </ul>
          ) : null}
          <span className="text-muted" aria-live="polite">
            {count === 0 ? 'Nothing selected' : `${count} selected`}
          </span>
          {count > 0 ? (
            <Button type="button" variant="link" size="sm" className="text-xs" onClick={() => setSelected(new Map())}>
              Clear
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={count === 0} onClick={() => onConfirm([...selected.values()])}>
            {multiple ? (count ? `Use ${count} file${count === 1 ? '' : 's'}` : 'Use files') : 'Use file'}
          </Button>
        </div>
      </div>
    </>
  );
}
