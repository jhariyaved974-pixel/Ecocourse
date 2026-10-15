'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, CloudUpload, Copy, Loader2, RotateCw, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { acceptAttribute, acceptedSummary, formatBytes, MAX_FILES_PER_BATCH, type MediaKind } from '@/lib/admin/media';
import { cn } from '@/lib/utils';
import type { UploadItem } from './use-media-uploader';

/** Drag-and-drop target with a keyboard-accessible "browse" button. */
export function UploadDropzone({
  onFiles,
  kinds,
  disabled,
  compact,
  className,
}: {
  onFiles: (files: File[]) => void;
  kinds?: readonly MediaKind[];
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const depth = React.useRef(0);
  const inputId = React.useId();

  return (
    <div
      onDragEnter={(e) => {
        if (disabled || !Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (disabled || !Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-surface-2/40 text-center transition-colors',
        compact ? 'px-4 py-5 sm:flex-row sm:gap-4 sm:text-left' : 'px-6 py-10',
        dragging && 'border-ink bg-surface-2',
        disabled && 'opacity-60',
        className,
      )}
    >
      <CloudUpload className={cn('shrink-0 text-muted', compact ? 'size-6' : 'size-8')} aria-hidden />
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={acceptAttribute(kinds)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
        disabled={disabled}
      />
      {compact ? (
        <>
          <div className="min-w-0 sm:flex-1">
            <p className="text-sm font-medium">{dragging ? 'Drop to upload' : 'Drag files here to upload'}</p>
            <p className="mt-0.5 text-xs text-muted">
              {acceptedSummary(kinds)}. Up to {MAX_FILES_PER_BATCH} files at a time; every file is verified on the server.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
            Browse files
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">{dragging ? 'Drop to upload' : 'Drag files here or'}</p>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
            Browse files
          </Button>
          <p className="max-w-md text-xs text-muted">
            {acceptedSummary(kinds)}. Up to {MAX_FILES_PER_BATCH} files at a time; every file is checked on the server before it is added.
          </p>
        </>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<UploadItem['status'], string> = {
  queued: 'Waiting…',
  uploading: 'Uploading',
  verifying: 'Verifying file…',
  done: 'Added to library',
  duplicate: 'Already in library',
  error: 'Failed',
};

/** Per-file progress list. */
export function UploadQueueList({
  items,
  onRetry,
  onRemove,
  onClear,
  className,
}: {
  items: UploadItem[];
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onClear?: () => void;
  className?: string;
}) {
  if (!items.length) return null;
  const finished = items.filter((i) => i.status === 'done' || i.status === 'duplicate' || i.status === 'error').length;
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted" aria-live="polite">
          {finished} of {items.length} processed
        </p>
        {onClear && finished > 0 ? (
          <Button type="button" variant="link" size="sm" className="text-xs" onClick={onClear}>
            Clear finished
          </Button>
        ) : null}
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {items.map((item) => (
          <UploadRow key={item.id} item={item} onRetry={onRetry} onRemove={onRemove} />
        ))}
      </ul>
    </div>
  );
}

function UploadRow({ item, onRetry, onRemove }: { item: UploadItem; onRetry: (id: string) => void; onRemove: (id: string) => void }) {
  const pct = Math.round(item.progress * 100);
  const Icon =
    item.status === 'done'
      ? CheckCircle2
      : item.status === 'duplicate'
        ? Copy
        : item.status === 'error'
          ? AlertCircle
          : item.status === 'verifying'
            ? ShieldCheck
            : Loader2;
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          item.status === 'done' && 'text-success',
          item.status === 'duplicate' && 'text-info',
          item.status === 'error' && 'text-danger',
          (item.status === 'queued' || item.status === 'uploading') && 'animate-spin text-muted',
          item.status === 'verifying' && 'text-info',
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium" title={item.name}>
            {item.name}
          </p>
          <span className="shrink-0 text-xs text-muted tabular-nums">{formatBytes(item.size)}</span>
        </div>
        {item.status === 'uploading' ? (
          <div className="mt-1.5 flex items-center gap-2">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-label={`Uploading ${item.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div className="h-full rounded-full bg-ink transition-[width] duration-150" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-9 text-right text-xs text-muted tabular-nums">{pct}%</span>
          </div>
        ) : (
          <p className={cn('mt-0.5 text-xs', item.status === 'error' ? 'text-danger' : 'text-muted')} role={item.status === 'error' ? 'alert' : undefined}>
            {item.status === 'error' ? item.error : item.status === 'duplicate' ? (item.message ?? STATUS_TEXT.duplicate) : STATUS_TEXT[item.status]}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.status === 'error' && item.retryable ? (
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => onRetry(item.id)} aria-label={`Retry ${item.name}`} title="Retry">
            <RotateCw />
          </Button>
        ) : null}
        {item.status !== 'verifying' ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => onRemove(item.id)}
            aria-label={item.status === 'uploading' || item.status === 'queued' ? `Cancel ${item.name}` : `Dismiss ${item.name}`}
            title={item.status === 'uploading' || item.status === 'queued' ? 'Cancel' : 'Dismiss'}
          >
            <X />
          </Button>
        ) : null}
      </div>
    </li>
  );
}
