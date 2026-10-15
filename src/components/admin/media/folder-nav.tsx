import Link from 'next/link';
import { Folder, FolderOpen, Images, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FolderNavEntry {
  key: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
  icon: 'all' | 'unfiled' | 'folder';
}

/** Folder list: a vertical rail on desktop, a horizontally scrolling chip row on small screens. */
export function FolderNav({ entries, actions }: { entries: FolderNavEntry[]; actions?: React.ReactNode }) {
  return (
    <nav aria-label="Media folders" className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Folders</h2>
        {actions}
      </div>
      <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {entries.map((entry) => {
          const Icon = entry.icon === 'all' ? Images : entry.icon === 'unfiled' ? Inbox : entry.active ? FolderOpen : Folder;
          return (
            <li key={entry.key} className="shrink-0">
              <Link
                href={entry.href}
                aria-current={entry.active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors lg:rounded-lg',
                  entry.active ? 'border-ink bg-ink text-paper' : 'border-line text-ink-2 hover:bg-surface-2 hover:text-ink lg:border-transparent',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 truncate lg:flex-1" title={entry.label}>
                  {entry.label}
                </span>
                <span className={cn('text-xs tabular-nums', entry.active ? 'text-paper/70' : 'text-muted')}>
                  <span className="sr-only">, </span>
                  {entry.count}
                  <span className="sr-only"> files</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
