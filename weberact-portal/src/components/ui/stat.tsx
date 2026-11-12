import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function StatCard({ label, value, hint, icon, href, accent, className }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; href?: string; accent?: boolean; className?: string }) {
  const body = (
    <div className={cn('card group h-full overflow-hidden p-5 card-hover', accent && 'border-coral-500/25', className)}>
      {accent && <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-coral-500/15 blur-3xl" aria-hidden />}
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-fg-muted">{label}</p>
        {icon && <span className="text-fg-faint transition group-hover:text-coral-400">{icon}</span>}
      </div>
      <p className="num relative mt-4 text-[28px] font-semibold leading-none tracking-[-0.02em] text-fg">{value}</p>
      {hint && <p className="relative mt-2.5 text-[12.5px] text-fg-faint">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full rounded-[18px]">{body}</Link> : body;
}
