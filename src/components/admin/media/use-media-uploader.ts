'use client';

import * as React from 'react';
import { createUpload, discardUpload, finalizeUpload } from '@/app/admin/(panel)/media/actions';
import {
  MAX_FILES_PER_BATCH,
  MAX_UPLOAD_BYTES,
  formatBytes,
  formatForFilename,
  type MediaKind,
  type MediaListItem,
  type StorageFolder,
  type UploadTicket,
} from '@/lib/admin/media';

export type UploadStatus = 'queued' | 'uploading' | 'verifying' | 'done' | 'duplicate' | 'error';

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  status: UploadStatus;
  /** 0–1 while uploading. */
  progress: number;
  error?: string;
  /** False when retrying cannot help (the content itself was rejected). */
  retryable?: boolean;
  asset?: MediaListItem;
  message?: string;
}

interface Options {
  folder: StorageFolder;
  /** Library folder (media_folders) new assets are filed under. */
  mediaFolderId?: string | null;
  /** Restricts what can be queued (the server re-checks everything). */
  kinds?: readonly MediaKind[];
  onUploaded?: (asset: MediaListItem, duplicate: boolean) => void;
  /** Called once every queued file has finished (successfully or not). */
  onSettled?: (uploaded: number) => void;
}

const PARALLEL_UPLOADS = 3;

function isPending(item: UploadItem) {
  return item.status === 'queued' || item.status === 'uploading' || item.status === 'verifying';
}

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function storageErrorMessage(xhr: XMLHttpRequest): string {
  try {
    const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
    if (xhr.status === 413) return 'The file is larger than storage allows.';
    if (xhr.status === 415) return 'Storage does not accept this file type.';
    if (xhr.status === 400 && /signature|jwt/i.test(body.message ?? '')) return 'The upload link expired. Retry to get a new one.';
    if (xhr.status === 409) return 'A file already exists at this location. Retry to upload again.';
    if (body.message) return `Storage rejected the upload (${xhr.status}).`;
  } catch {
    // fall through
  }
  return `Upload failed (HTTP ${xhr.status || 'error'}).`;
}

/**
 * PUTs the file to a signed upload URL, mirroring what supabase-js
 * `uploadToSignedUrl` sends for a raw body (content-type, cache-control,
 * x-upsert), but via XHR so real upload progress can be shown.
 */
function putToSignedUrl(ticket: UploadTicket, file: File, onProgress: (fraction: number) => void, register: (xhr: XMLHttpRequest) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open('PUT', ticket.signedUrl);
    xhr.setRequestHeader('content-type', ticket.contentType);
    // Object paths are random and never reused, so the file can be cached for a year.
    xhr.setRequestHeader('cache-control', 'max-age=31536000');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(storageErrorMessage(xhr)));
    };
    xhr.onerror = () => reject(new Error('Network error while uploading. Check your connection and retry.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.send(file);
  });
}

/** Client-side pre-check for instant feedback; the server validates again. */
function precheck(file: File, kinds?: readonly MediaKind[]): string | null {
  const format = formatForFilename(file.name);
  if (!format) return 'Unsupported file type.';
  if (kinds && kinds.length && !kinds.includes(format.kind)) return `This picker does not accept ${format.kind === 'model' ? '3D models' : `${format.kind}s`}.`;
  if (file.size === 0) return 'The file is empty.';
  if (file.size > MAX_UPLOAD_BYTES[format.kind]) return `The file is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_UPLOAD_BYTES[format.kind])}.`;
  return null;
}

export function useMediaUploader({ folder, mediaFolderId = null, kinds, onUploaded, onSettled }: Options) {
  const [items, setItems] = React.useState<UploadItem[]>([]);
  const files = React.useRef(new Map<string, File>());
  const requests = React.useRef(new Map<string, XMLHttpRequest>());
  const orphanPaths = React.useRef(new Map<string, string>());
  const active = React.useRef(0);
  const uploadedInRun = React.useRef(0);
  const callbacks = React.useRef({ onUploaded, onSettled, folder, mediaFolderId });
  React.useEffect(() => {
    callbacks.current = { onUploaded, onSettled, folder, mediaFolderId };
  });

  const patch = React.useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...next } : item)));
  }, []);

  const settleOne = React.useCallback(() => {
    active.current -= 1;
    if (active.current === 0) {
      const count = uploadedInRun.current;
      uploadedInRun.current = 0;
      callbacks.current.onSettled?.(count);
    }
  }, []);

  /** Uploads + finalises one file that already has a ticket. */
  const transfer = React.useCallback(
    async (id: string, ticket: UploadTicket, settle: (id: string) => void) => {
      const file = files.current.get(id);
      if (!file) {
        // Removed from the queue before its turn came.
        settle(id);
        return;
      }
      try {
        patch(id, { status: 'uploading', progress: 0, error: undefined });
        let lastPaint = 0;
        await putToSignedUrl(
          ticket,
          file,
          (fraction) => {
            const now = Date.now();
            if (fraction < 1 && now - lastPaint < 80) return;
            lastPaint = now;
            patch(id, { progress: fraction });
          },
          (xhr) => requests.current.set(id, xhr),
        );
        requests.current.delete(id);
        orphanPaths.current.set(id, ticket.path);
        patch(id, { status: 'verifying', progress: 1 });
        const res = await finalizeUpload({ path: ticket.path, filename: file.name, folderId: callbacks.current.mediaFolderId });
        if (res.ok) {
          orphanPaths.current.delete(id);
          files.current.delete(id);
          uploadedInRun.current += 1;
          patch(id, { status: res.data.duplicate ? 'duplicate' : 'done', asset: res.data.asset, message: res.message });
          callbacks.current.onUploaded?.(res.data.asset, res.data.duplicate);
        } else {
          // A rejected file has already been deleted on the server.
          if (res.code === 'rejected') orphanPaths.current.delete(id);
          patch(id, { status: 'error', error: res.error, retryable: res.code !== 'rejected' });
        }
      } catch (err) {
        requests.current.delete(id);
        patch(id, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed.', retryable: true });
      } finally {
        settle(id);
      }
    },
    [patch],
  );

  /** Requests tickets for the given queued ids, then runs transfers with limited parallelism. */
  const start = React.useCallback(
    async (ids: string[]) => {
      const payload = ids
        .map((id) => {
          const file = files.current.get(id);
          return file ? { clientId: id, name: file.name, type: file.type, size: file.size } : null;
        })
        .filter((f): f is NonNullable<typeof f> => f !== null);
      if (!payload.length) return;
      // Every id counted here is settled exactly once below.
      const pending = new Set(payload.map((f) => f.clientId));
      active.current += pending.size;
      const settle = (id: string) => {
        if (pending.delete(id)) settleOne();
      };

      const queue: UploadTicket[] = [];
      try {
        const res = await createUpload({ folder: callbacks.current.folder, files: payload });
        if (!res.ok) {
          for (const id of [...pending]) {
            patch(id, { status: 'error', error: res.error, retryable: true });
            settle(id);
          }
          return;
        }
        for (const result of res.data) {
          if (!pending.has(result.clientId)) continue;
          if (result.ok) queue.push(result.ticket);
          else {
            patch(result.clientId, { status: 'error', error: result.error, retryable: false });
            settle(result.clientId);
          }
        }
        // Defensive: anything the server did not answer for.
        const answered = new Set(res.data.map((r) => r.clientId));
        for (const id of [...pending]) {
          if (answered.has(id)) continue;
          patch(id, { status: 'error', error: 'The server did not accept this file. Retry.', retryable: true });
          settle(id);
        }
      } catch {
        for (const id of [...pending]) {
          patch(id, { status: 'error', error: 'Could not reach the server. Retry when you are back online.', retryable: true });
          settle(id);
        }
        return;
      }

      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) await transfer(next.clientId, next, settle);
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, queue.length) }, worker));
    },
    [patch, settleOne, transfer],
  );

  const addFiles = React.useCallback(
    (list: FileList | File[]) => {
      const incoming = Array.from(list).slice(0, MAX_FILES_PER_BATCH);
      if (!incoming.length) return;
      const added: UploadItem[] = [];
      const ready: string[] = [];
      for (const file of incoming) {
        const id = newId();
        const problem = precheck(file, kinds);
        added.push({ id, name: file.name, size: file.size, status: problem ? 'error' : 'queued', progress: 0, error: problem ?? undefined, retryable: false });
        if (!problem) {
          files.current.set(id, file);
          ready.push(id);
        }
      }
      setItems((current) => [...added.reverse(), ...current]);
      void start(ready);
    },
    [kinds, start],
  );

  const discardOrphan = React.useCallback((id: string) => {
    const path = orphanPaths.current.get(id);
    if (path) {
      orphanPaths.current.delete(id);
      void discardUpload({ path });
    }
  }, []);

  const retry = React.useCallback(
    (id: string) => {
      if (!files.current.has(id)) return;
      discardOrphan(id);
      patch(id, { status: 'queued', progress: 0, error: undefined });
      void start([id]);
    },
    [discardOrphan, patch, start],
  );

  const remove = React.useCallback(
    (id: string) => {
      requests.current.get(id)?.abort();
      requests.current.delete(id);
      discardOrphan(id);
      files.current.delete(id);
      setItems((list) => list.filter((item) => item.id !== id));
    },
    [discardOrphan],
  );

  const clearFinished = React.useCallback(() => {
    for (const item of items) {
      if (isPending(item)) continue;
      discardOrphan(item.id);
      files.current.delete(item.id);
    }
    setItems((list) => list.filter(isPending));
  }, [items, discardOrphan]);

  const busy = items.some(isPending);

  // Leaving the page mid-upload would orphan the transfer: ask first.
  React.useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  return { items, addFiles, retry, remove, clearFinished, busy };
}
