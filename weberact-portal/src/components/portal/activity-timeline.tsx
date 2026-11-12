import { ArrowUpRight, CheckCircle2, CircleDollarSign, FileSignature, FileUp, FolderKanban, LifeBuoy, MessageSquare, Sparkles, BarChart3 } from 'lucide-react';
import { ago, dateTime } from '@/lib/format';
import type { Activity } from '@/lib/types';
import { EmptyState } from '@/components/ui/primitives';

const icon = (a: string) => a.startsWith('payment') || a.startsWith('invoice') ? CircleDollarSign : a.startsWith('contract') ? FileSignature
  : a.startsWith('file') ? FileUp : a.startsWith('request') ? LifeBuoy : a.startsWith('message') ? MessageSquare : a.startsWith('onboarding') ? CheckCircle2
  : a.startsWith('seo') ? BarChart3 : a === 'project.stage' ? ArrowUpRight : a.startsWith('project') ? FolderKanban : Sparkles;

export function ActivityTimeline({ items, showOrg }: { items: Activity[]; showOrg?: boolean }) {
  if (!items.length) return <EmptyState title="No activity yet" body="Updates to projects, files, invoices and contracts appear here as they happen." />;
  return (
    <ol className="relative px-6 pb-6">
      <span className="absolute bottom-8 left-[39px] top-2 w-px bg-gradient-to-b from-line-strong via-line to-transparent" aria-hidden />
      {items.map(a => {
        const Icon = icon(a.action);
        return (
          <li key={a.id} className="relative flex gap-4 py-3">
            <span className="relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-line-strong bg-ink-800 text-fg-muted">
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-[13.5px] leading-snug text-fg-soft">{a.summary}</p>
              <p className="mt-1 text-[11.5px] text-fg-faint" title={dateTime(a.created_at)}>
                {showOrg && a.organization?.name ? `${a.organization.name} · ` : ''}{ago(a.created_at)}{a.visibility === 'internal' ? ' · internal' : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
