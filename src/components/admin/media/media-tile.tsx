'use client';

import Image from 'next/image';
import { Box, Check, ImageOff, Play, Video } from 'lucide-react';
import type { MediaAssetSummary } from '@/lib/admin/types';
import { MEDIA_KIND_LABEL, formatLabelForMime, isOptimizableImageUrl, type MediaListItem } from '@/lib/admin/media';
import { cn } from '@/lib/utils';

/** Square preview: the image itself, a video's poster, or an icon. */
export function MediaPreview({
  asset,
  posterUrl,
  sizes = '200px',
  className,
  fit = 'cover',
}: {
  asset: Pick<MediaAssetSummary, 'kind' | 'url' | 'altText' | 'label'>;
  posterUrl?: string | null;
  sizes?: string;
  className?: string;
  fit?: 'cover' | 'contain';
}) {
  const src = asset.kind === 'image' ? asset.url : asset.kind === 'video' ? (posterUrl ?? null) : null;
  return (
    <div className={cn('relative grid aspect-square place-items-center overflow-hidden bg-surface-2 text-muted', className)}>
      {src ? (
        <Image
          src={src}
          alt={asset.kind === 'image' ? asset.altText || '' : ''}
          fill
          sizes={sizes}
          quality={70}
          // Thumbnails are resized by the optimizer (originals can be 15 MB); other hosts are shown as-is.
          unoptimized={!isOptimizableImageUrl(src)}
          className={fit === 'cover' ? 'object-cover' : 'object-contain'}
        />
      ) : asset.kind === 'image' ? (
        <ImageOff className="size-6" aria-hidden />
      ) : asset.kind === 'video' ? (
        <Video className="size-7" aria-hidden />
      ) : (
        <Box className="size-7" aria-hidden />
      )}
      {asset.kind === 'video' && src ? (
        <span className="absolute grid size-9 place-items-center rounded-full bg-black/55 text-white" aria-hidden>
          <Play className="size-4 fill-current" />
        </span>
      ) : null}
    </div>
  );
}

/** Grid tile used by the library page (opens details) and the picker (toggles selection). */
export function MediaTile({
  item,
  selected,
  selectable,
  onClick,
  onDoubleClick,
  showUsage,
}: {
  item: MediaListItem;
  selected?: boolean;
  selectable?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  showUsage?: boolean;
}) {
  const name = item.label || item.altText || 'Untitled';
  const missingAlt = item.kind === 'image' && !item.altText.trim();
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-pressed={selectable ? Boolean(selected) : undefined}
      aria-label={`${name}, ${MEDIA_KIND_LABEL[item.kind]}${missingAlt ? ', missing alt text' : ''}${selectable ? '' : ', open details'}`}
      className={cn(
        'group relative flex h-full w-full flex-col overflow-hidden rounded-xl border bg-surface text-left transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
        selected ? 'border-ink shadow-[0_0_0_1px_var(--color-ink)]' : 'border-line hover:border-line-strong',
      )}
    >
      <MediaPreview asset={item} posterUrl={item.posterUrl} sizes="(min-width: 1280px) 180px, (min-width: 768px) 25vw, 50vw" />
      {selectable ? (
        <span
          className={cn(
            'absolute top-2 left-2 grid size-6 place-items-center rounded-full border text-paper shadow-sm transition-colors',
            selected ? 'border-ink bg-ink' : 'border-white/80 bg-black/20 group-hover:bg-black/35',
          )}
          aria-hidden
        >
          {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
      ) : null}
      <span className="absolute top-2 right-2 flex gap-1">
        {item.kind !== 'image' ? <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">{MEDIA_KIND_LABEL[item.kind]}</span> : null}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <span className="truncate text-xs font-medium text-ink" title={name}>
          {name}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          {item.width && item.height ? (
            <span className="tabular-nums">
              {item.width}×{item.height}
            </span>
          ) : (
            <span>{formatLabelForMime(item.mimeType) ?? MEDIA_KIND_LABEL[item.kind]}</span>
          )}
          {missingAlt ? <span className="font-medium text-warning">· No alt</span> : null}
          {showUsage && item.usageCount !== null ? (
            <span className={cn('ml-auto', item.usageCount === 0 && 'text-muted/80')}>{item.usageCount === 0 ? 'Unused' : `Used ${item.usageCount}×`}</span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
