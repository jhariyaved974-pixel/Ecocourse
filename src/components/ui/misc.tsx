import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-surface-2 text-ink-2',
      dark: 'bg-ink text-paper',
      accent: 'bg-accent text-accent-ink',
      success: 'bg-success/10 text-success',
      warning: 'bg-warning/10 text-warning',
      danger: 'bg-danger/10 text-danger',
      info: 'bg-info/10 text-info',
      outline: 'border border-line-strong text-ink-2',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-line bg-surface', className)} {...props} />;
}

export function CardHeader({ className, title, description, action }: { className?: string; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-line px-5 py-4', className)}>
      <div className="min-w-0 space-y-0.5">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden {...props} />;
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-line', className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center', className)}>
      {icon ? <div className="mb-4 grid size-12 place-items-center rounded-full bg-surface-2 text-muted">{icon}</div> : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success' | 'neutral';
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'border-info/25 bg-info/5 text-ink',
    warning: 'border-warning/30 bg-warning/5 text-ink',
    danger: 'border-danger/30 bg-danger/5 text-ink',
    success: 'border-success/30 bg-success/5 text-ink',
    neutral: 'border-line bg-surface-2 text-ink',
  } as const;
  const bar = { info: 'bg-info', warning: 'bg-warning', danger: 'bg-danger', success: 'bg-success', neutral: 'bg-muted' } as const;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('relative overflow-hidden rounded-xl border px-4 py-3 pl-5 text-sm', tones[tone], className)}>
      <span className={cn('absolute inset-y-0 left-0 w-1', bar[tone])} aria-hidden />
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn('text-ink-2', title && 'mt-0.5')}>{children}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>;
}
