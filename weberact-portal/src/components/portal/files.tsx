'use client';
import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, Eye, Loader2, UploadCloud } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { cn, safeFileName, uid } from '@/lib/utils';
import { bytes } from '@/lib/format';

const MAX = 50 * 1024 * 1024;

/** Opens a short-lived signed link. Storage rules decide whether this person may read the file. */
export async function openStorageFile(path: string, download?: string) {
  const { data, error } = await supabaseBrowser().storage.from('portal').createSignedUrl(path, 120, download ? { download } : undefined);
  if (error || !data) { toast.error('This file could not be opened.'); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

export function FileButtons({ path, name }: { path: string; name: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (mode: 'view' | 'download') => { setBusy(mode); await openStorageFile(path, mode === 'download' ? name : undefined); setBusy(null); };
  return (
    <span className="inline-flex items-center gap-1">
      <button onClick={() => go('view')} className="rounded-lg p-2 text-fg-muted transition hover:bg-white/5 hover:text-fg" aria-label={`Open ${name}`} title="Open">
        {busy === 'view' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
      </button>
      <button onClick={() => go('download')} className="rounded-lg p-2 text-fg-muted transition hover:bg-white/5 hover:text-coral-400" aria-label={`Download ${name}`} title="Download">
        {busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
    </span>
  );
}

export type Uploaded = { path: string; name: string; size: number; type: string };

/** Uploads to the private bucket under `prefix` (which must start with the organization id). */
export function Dropzone({ prefix, onUploaded, multiple = true, label = 'Drop files here, or', hint, compact, accept }: {
  prefix: string; onUploaded: (files: Uploaded[]) => Promise<void> | void; multiple?: boolean; label?: string; hint?: string; compact?: boolean; accept?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function handle(list: FileList | null) {
    if (!list?.length) return;
    const sb = supabaseBrowser(); const done: Uploaded[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX) { toast.error(`${f.name} is larger than 50 MB.`); continue; }
      setBusy(f.name);
      const path = `${prefix.replace(/\/$/, '')}/${uid().slice(0, 8)}-${safeFileName(f.name)}`;
      const { error } = await sb.storage.from('portal').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
      if (error) { toast.error(`${f.name}: ${/row-level|policy|Unauthorized/i.test(error.message) ? 'you do not have permission to upload here' : error.message}`); continue; }
      done.push({ path, name: f.name, size: f.size, type: f.type || 'application/octet-stream' });
    }
    setBusy(null);
    if (done.length) {
      try { await onUploaded(done); router.refresh(); }
      catch (e) { toast.error((e as Error).message); await sb.storage.from('portal').remove(done.map(d => d.path)); }
    }
    if (input.current) input.current.value = '';
  }
  return (
    <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
      className={cn('relative flex flex-col items-center justify-center rounded-2xl border border-dashed text-center transition',
        compact ? 'px-4 py-5' : 'px-6 py-10', over ? 'border-coral-500/70 bg-coral-500/[0.06]' : 'border-line-strong bg-white/[0.015] hover:border-white/20')}>
      <input ref={input} type="file" multiple={multiple} accept={accept} className="sr-only" id={id} onChange={e => handle(e.target.files)} />
      {busy ? <Loader2 className="h-6 w-6 animate-spin text-coral-400" /> : <UploadCloud className="h-6 w-6 text-coral-400" strokeWidth={1.5} />}
      <p className="mt-3 text-[13.5px] text-fg-soft">
        {busy ? `Uploading ${busy}…` : <>{label} <label htmlFor={id} className="cursor-pointer text-coral-400 underline-offset-4 hover:underline">browse</label></>}
      </p>
      <p className="mt-1.5 text-[12px] text-fg-faint">{hint ?? `Up to ${bytes(MAX)} per file`}</p>
    </div>
  );
}
