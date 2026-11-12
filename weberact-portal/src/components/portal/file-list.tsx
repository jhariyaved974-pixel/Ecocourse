import { FileArchive, FileImage, FileSpreadsheet, FileText, FileVideo, File as FileIcon } from 'lucide-react';
import type { ProjectFile } from '@/lib/types';
import { bytes, date } from '@/lib/format';
import { Badge, EmptyState } from '@/components/ui/primitives';
import { FileButtons } from './files';

export const fileIcon = (mime?: string | null, name = '') => {
  const m = mime ?? '', n = name.toLowerCase();
  if (m.startsWith('image/')) return FileImage;
  if (m.startsWith('video/')) return FileVideo;
  if (/zip|rar|7z|tar/.test(m) || /\.(zip|rar|7z)$/.test(n)) return FileArchive;
  if (/sheet|excel|csv/.test(m) || /\.(xlsx?|csv)$/.test(n)) return FileSpreadsheet;
  if (/pdf|word|text|document/.test(m)) return FileText;
  return FileIcon;
};
const KIND: Record<string, string> = { deliverable: 'Deliverable', document: 'Document', contract: 'Contract', client_upload: 'Your upload' };

export function FileList({ files, empty = 'No files yet', showProject, staffView, actions }: { files: ProjectFile[]; empty?: string; showProject?: boolean; staffView?: boolean; actions?: (f: ProjectFile) => React.ReactNode }) {
  if (!files.length) return <EmptyState title={empty} body="Deliverables and documents shared with you appear here, with the date they were added." />;
  return (
    <ul className="divide-y divide-line">
      {files.map(f => {
        const Icon = fileIcon(f.mime_type, f.name);
        return (
          <li key={f.id} className="flex items-center gap-4 px-6 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-white/[0.03] text-fg-muted"><Icon className="h-[18px] w-[18px]" strokeWidth={1.6} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-fg">{f.name}</p>
              <p className="mt-0.5 truncate text-[12px] text-fg-faint">
                {[showProject && f.project?.name, staffView && f.organization?.name, f.folder, bytes(f.size_bytes), date(f.created_at)].filter(Boolean).join(' · ')}
              </p>
              {f.description && <p className="mt-1 line-clamp-2 text-[12.5px] text-fg-muted">{f.description}</p>}
            </div>
            <Badge tone={f.kind === 'deliverable' ? 'coral' : f.kind === 'client_upload' ? 'info' : 'neutral'} className="hidden sm:inline-flex">{staffView && f.kind === 'client_upload' ? 'Client upload' : KIND[f.kind]}</Badge>
            <FileButtons path={f.storage_path} name={f.name} />
            {actions?.(f)}
          </li>
        );
      })}
    </ul>
  );
}
