'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Box, Copy, ExternalLink, ImagePlus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, SheetContent } from '@/components/ui/dialog';
import { Field, Input, Label, NativeSelect, Textarea } from '@/components/ui/form-controls';
import { Badge, Notice, Skeleton } from '@/components/ui/misc';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { MediaPicker } from '@/components/admin/media-picker';
import { deleteMediaAsset, getMediaAsset, updateMediaAsset } from '@/app/admin/(panel)/media/actions';
import type { MediaAssetSummary } from '@/lib/admin/types';
import {
  MEDIA_KIND_LABEL,
  USAGE_SOURCE_LABEL,
  formatBytes,
  formatSeconds,
  type MediaAssetDetail,
  type MediaFolderOption,
  type MediaListItem,
} from '@/lib/admin/media';
import { cn, formatDateTime } from '@/lib/utils';
import { MediaPreview } from './media-tile';

export function AssetDetailSheet({
  assetId,
  initial,
  folders,
  open,
  onOpenChange,
  onDeleted,
}: {
  assetId: string | null;
  initial: MediaListItem | null;
  folders: MediaFolderOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  return (
    <Dialog open={open && Boolean(assetId)} onOpenChange={onOpenChange}>
      <SheetContent title="File details" className="max-w-xl" aria-describedby={undefined}>
        {assetId ? <DetailLoader key={assetId} assetId={assetId} initial={initial} folders={folders} onDeleted={onDeleted} /> : null}
      </SheetContent>
    </Dialog>
  );
}

type LoadState = { status: 'loading' } | { status: 'ready'; detail: MediaAssetDetail } | { status: 'error'; error: string };

function DetailLoader({ assetId, initial, folders, onDeleted }: { assetId: string; initial: MediaListItem | null; folders: MediaFolderOption[]; onDeleted: () => void }) {
  const [state, setState] = React.useState<LoadState>({ status: 'loading' });
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    getMediaAsset({ id: assetId })
      .then((res) => {
        if (!cancelled) setState(res.ok ? { status: 'ready', detail: res.data } : { status: 'error', error: res.error });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', error: 'Could not load this file. Check your connection.' });
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, version]);

  const reload = () => setVersion((v) => v + 1);

  if (state.status === 'error') {
    return (
      <div className="p-5">
        <Notice tone="danger" title="Could not load file">
          {state.error}{' '}
          <button type="button" className="font-medium underline" onClick={reload}>
            Try again
          </button>
        </Notice>
      </div>
    );
  }
  if (state.status === 'loading') {
    return (
      <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-busy="true">
        {initial ? <MediaPreview asset={initial} posterUrl={initial.posterUrl} fit="contain" className="aspect-[4/3] rounded-xl border border-line" sizes="560px" /> : <Skeleton className="aspect-[4/3] rounded-xl" />}
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }
  return <DetailBody key={state.detail.updatedAt} detail={state.detail} folders={folders} onSaved={reload} onDeleted={onDeleted} />;
}

function absoluteUrl(url: string) {
  return url.startsWith('/') ? `${window.location.origin}${url}` : url;
}

function DetailBody({ detail, folders, onSaved, onDeleted }: { detail: MediaAssetDetail; folders: MediaFolderOption[]; onSaved: () => void; onDeleted: () => void }) {
  const [label, setLabel] = React.useState(detail.label ?? '');
  const [altText, setAltText] = React.useState(detail.altText);
  const [folderId, setFolderId] = React.useState(detail.folderId ?? '');
  const [poster, setPoster] = React.useState<MediaAssetSummary | null>(detail.poster);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { run, pending } = useActionRunner();

  const dirty = label !== (detail.label ?? '') || altText !== detail.altText || folderId !== (detail.folderId ?? '') || (poster?.id ?? null) !== (detail.poster?.id ?? null);
  const used = detail.usage.length > 0;
  const missingAlt = detail.kind === 'image' && !altText.trim();
  const posterUrl = detail.kind === 'video' ? (poster?.url ?? null) : null;

  const save = async () => {
    setErrors({});
    const res = await run(
      () =>
        updateMediaAsset({
          id: detail.id,
          label,
          altText,
          folderId: folderId || null,
          posterAssetId: detail.kind === 'video' ? (poster?.id ?? null) : null,
        }),
      { success: 'File details saved', onSuccess: onSaved },
    );
    if (!res.ok && res.fieldErrors) setErrors(res.fieldErrors);
  };

  const copyUrl = async () => {
    if (!detail.url) return;
    try {
      await navigator.clipboard.writeText(absoluteUrl(detail.url));
      toast.success('URL copied');
    } catch {
      toast.error('Could not copy. Select the URL and copy it manually.');
    }
  };

  return (
    <>
      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {/* Preview */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
          {detail.kind === 'image' && detail.url ? (
            <div className="relative aspect-[4/3] bg-[conic-gradient(var(--color-surface-2)_25%,var(--color-surface)_0_50%,var(--color-surface-2)_0_75%,var(--color-surface)_0)] bg-[length:20px_20px]">
              <Image src={detail.url} alt={altText || ''} fill sizes="560px" unoptimized className="object-contain" />
            </div>
          ) : detail.kind === 'video' && detail.url ? (
            // Captions are not applicable to library previews of silent product loops.
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video key={posterUrl ?? 'none'} src={detail.url} poster={posterUrl ?? undefined} controls preload="metadata" className="aspect-video w-full bg-black" />
          ) : (
            <div className="grid aspect-[4/3] place-items-center text-center text-muted">
              <div>
                <Box className="mx-auto size-10" aria-hidden />
                <p className="mt-2 text-sm">{detail.kind === 'model' ? '3D model (GLB)' : 'Preview unavailable'}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={copyUrl} disabled={!detail.url}>
            <Copy /> Copy URL
          </Button>
          {detail.url ? (
            <Button asChild size="sm" variant="outline">
              <a href={detail.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Open original
              </a>
            </Button>
          ) : null}
          <Badge tone="neutral" className="self-center">
            {MEDIA_KIND_LABEL[detail.kind]}
          </Badge>
          {used ? (
            <Badge tone="info" className="self-center">
              Used in {detail.usage.length} place{detail.usage.length === 1 ? '' : 's'}
            </Badge>
          ) : (
            <Badge tone="neutral" className="self-center">
              Not used yet
            </Badge>
          )}
        </div>

        {detail.url ? (
          <div className="space-y-1.5">
            <Label htmlFor="asset-url">Public URL</Label>
            <Input id="asset-url" readOnly value={absoluteUrl(detail.url)} onFocus={(e) => e.currentTarget.select()} className="h-9 font-mono text-xs" />
          </div>
        ) : null}

        {/* Edit */}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {missingAlt ? (
            <Notice tone="warning" title="Add alt text">
              Describe what the image shows for shoppers using screen readers, e.g. “Black over-ear headphones, folded, side view”.
            </Notice>
          ) : null}
          <Field
            label="Alt text"
            htmlFor="asset-alt"
            hint={detail.kind === 'image' ? `${altText.length}/300 · Used wherever the image appears unless a product overrides it.` : `${altText.length}/300 · Short description of the ${detail.kind === 'video' ? 'video' : 'model'}.`}
            error={errors.altText}
          >
            <Textarea id="asset-alt" value={altText} onChange={(e) => setAltText(e.target.value)} maxLength={300} rows={3} aria-invalid={Boolean(errors.altText) || undefined} />
          </Field>
          <Field label="Label" htmlFor="asset-label" hint="Internal name used to find the file in the library." error={errors.label}>
            <Input id="asset-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={160} aria-invalid={Boolean(errors.label) || undefined} />
          </Field>
          <Field label="Folder" htmlFor="asset-folder" error={errors.folderId}>
            <NativeSelect id="asset-folder" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {detail.kind === 'video' ? (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-ink">Poster image</legend>
              <div className="flex items-center gap-3">
                <div className="w-16 shrink-0 overflow-hidden rounded-lg border border-line">
                  {poster ? <MediaPreview asset={poster} sizes="64px" /> : <div className="grid aspect-square place-items-center bg-surface-2 text-[10px] text-muted">None</div>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                    <ImagePlus /> {poster ? 'Change poster' : 'Choose poster'}
                  </Button>
                  {poster ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPoster(null)}>
                      <X /> Remove
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className={cn('text-xs', errors.posterAssetId ? 'font-medium text-danger' : 'text-muted')}>
                {errors.posterAssetId ?? 'Shown before the video plays and while it loads.'}
              </p>
              <MediaPicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                kinds={['image']}
                uploadFolder="content"
                title="Choose a poster image"
                onSelect={(assets) => {
                  if (assets[0]) setPoster(assets[0]);
                  setPickerOpen(false);
                }}
              />
            </fieldset>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" loading={pending} disabled={!dirty}>
              Save changes
            </Button>
          </div>
        </form>

        {/* Where used */}
        <section aria-labelledby="asset-usage-heading" className="space-y-2">
          <h3 id="asset-usage-heading" className="text-sm font-semibold">
            Where it is used
          </h3>
          {used ? (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {detail.usage.map((u, i) => (
                <li key={`${u.source}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      <span className="mr-1.5 text-xs font-normal text-muted">{USAGE_SOURCE_LABEL[u.source] ?? 'Item'}</span>
                      {u.label}
                    </p>
                    <p className="truncate text-xs text-muted">{u.detail}</p>
                  </div>
                  {u.href ? (
                    <Link href={u.href} className="shrink-0 text-xs font-medium underline-offset-4 hover:underline">
                      Open
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Not used anywhere yet. It can be deleted safely.</p>
          )}
        </section>

        {/* File info */}
        <section aria-labelledby="asset-info-heading" className="space-y-2">
          <h3 id="asset-info-heading" className="text-sm font-semibold">
            File information
          </h3>
          <dl className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            <InfoRow label="Type">{detail.mimeType ?? '—'}</InfoRow>
            <InfoRow label="Size">{formatBytes(detail.sizeBytes)}</InfoRow>
            {detail.width && detail.height ? (
              <InfoRow label="Dimensions">
                {detail.width} × {detail.height} px
              </InfoRow>
            ) : null}
            {detail.kind === 'video' ? <InfoRow label="Duration">{formatSeconds(detail.durationSeconds)}</InfoRow> : null}
            <InfoRow label="Uploaded">
              {formatDateTime(detail.createdAt)}
              {detail.uploadedBy ? ` · ${detail.uploadedBy}` : ''}
            </InfoRow>
            <InfoRow label="Source">
              <span className="font-mono text-xs break-all">{detail.storagePath ? `catalog-media/${detail.storagePath}` : (detail.externalUrl ?? '—')}</span>
            </InfoRow>
            {detail.storagePath === null && detail.externalUrl ? <InfoRow label="Storage">Bundled with the site (not in storage)</InfoRow> : null}
            {detail.sha256 ? (
              <InfoRow label="SHA-256">
                <span className="font-mono text-xs" title={detail.sha256}>
                  {detail.sha256.slice(0, 16)}…
                </span>
              </InfoRow>
            ) : null}
          </dl>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
        <p className="max-w-[60%] text-xs text-muted">{used ? 'Remove this file from the places above before deleting it.' : 'Deleting removes the file from storage permanently.'}</p>
        <ConfirmActionButton
          title="Delete this file?"
          description={
            <>
              <strong>{detail.label || 'This file'}</strong> will be removed from the library{detail.storagePath ? ' and deleted from storage' : ''}. This cannot be undone.
            </>
          }
          confirmLabel="Delete file"
          danger
          variant="danger-outline"
          disabled={used}
          success="File deleted"
          action={async () => {
            const res = await deleteMediaAsset({ id: detail.id });
            if (res.ok) onDeleted();
            return res;
          }}
        >
          <Trash2 /> Delete
        </ConfirmActionButton>
      </div>
    </>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
