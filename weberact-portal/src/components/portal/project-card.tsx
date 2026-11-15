import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import type { Project } from '@/lib/types';
import { stageLabel } from '@/lib/constants';
import { date, daysUntil } from '@/lib/format';
import { Avatar, StatusBadge } from '@/components/ui/primitives';
import { ProgressBar } from '@/components/ui/progress';

export function ProjectCard({ p, href }: { p: Project; href: string }) {
  const d = daysUntil(p.due_date);
  const services = (p.project_services ?? []).map(s => s.service?.name).filter(Boolean) as string[];
  return (
    <Link href={href} className="card card-hover group block p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow mb-2 truncate">{services.length ? services.join(' · ') : 'Project'}</p>
          <h3 className="truncate text-[17px] font-semibold tracking-tight text-fg transition group-hover:text-coral-300">{p.name}</h3>
        </div>
        <StatusBadge status={p.status} />
      </div>
      <p className="mt-4 text-[12.5px] font-medium text-coral-400">{stageLabel(p.stage)}</p>
      <ProgressBar value={p.progress} className="mt-2.5" />
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4 text-[12.5px]">
        <span className="flex min-w-0 items-center gap-2 text-fg-muted">
          <Avatar name={p.manager?.full_name ?? 'WeberAct'} size={22} />
          <span className="truncate">{p.manager?.full_name ?? 'WeberAct team'}</span>
        </span>
        <span className={`flex shrink-0 items-center gap-1.5 ${d != null && d >= 0 && d <= 7 && p.status === 'active' ? 'text-warn' : 'text-fg-muted'}`}>
          <CalendarClock className="h-3.5 w-3.5" />{p.due_date ? date(p.due_date) : 'Date to be agreed'}
        </span>
      </div>
    </Link>
  );
}
