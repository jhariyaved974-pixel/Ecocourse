// Shared building blocks for admin screens. Server-component friendly unless noted.
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Enums } from '@/lib/database.types';
import { Badge } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
            <ChevronLeft className="size-3.5" /> {back.label}
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({ title, description, actions, children, className }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface', className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            {title ? <h2 className="text-sm font-semibold">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'warning' | 'danger' | 'success' }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', tone === 'warning' && 'text-warning', tone === 'danger' && 'text-danger', tone === 'success' && 'text-success')}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Table primitives with consistent admin styling. Wrap in <TableWrap> for horizontal scroll on small screens. */
export function TableWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('relative overflow-x-auto rounded-xl border border-line bg-surface', className)}>{children}</div>;
}
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return <table className={cn('w-full min-w-[640px] text-left text-sm', className)}>{children}</table>;
}
export function Th({ children, className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" className={cn('border-b border-line bg-surface-2/60 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted', className)} {...props}>
      {children}
    </th>
  );
}
export function Td({ children, className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('border-b border-line px-4 py-3 align-middle', className)} {...props}>
      {children}
    </td>
  );
}

const ORDER_TONE: Record<Enums<'order_status'>, 'warning' | 'info' | 'success' | 'neutral' | 'danger'> = {
  pending_payment: 'warning',
  payment_review: 'info',
  confirmed: 'success',
  processing: 'success',
  shipped: 'success',
  delivered: 'neutral',
  cancelled: 'danger',
};
const PAYMENT_TONE: Record<Enums<'payment_status'>, 'warning' | 'info' | 'success' | 'neutral' | 'danger'> = {
  unpaid: 'warning',
  proof_submitted: 'info',
  verification_pending: 'info',
  verified_paid: 'success',
  rejected: 'danger',
  refund_pending: 'warning',
  refunded: 'neutral',
};
export const ORDER_STATUS_TEXT: Record<Enums<'order_status'>, string> = {
  pending_payment: 'Pending payment',
  payment_review: 'Payment review',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
export const PAYMENT_STATUS_TEXT: Record<Enums<'payment_status'>, string> = {
  unpaid: 'Unpaid',
  proof_submitted: 'Proof submitted',
  verification_pending: 'Verification pending',
  verified_paid: 'Verified & paid',
  rejected: 'Rejected',
  refund_pending: 'Refund pending',
  refunded: 'Refunded',
};

export function OrderStatusBadge({ status }: { status: Enums<'order_status'> }) {
  return <Badge tone={ORDER_TONE[status]}>{ORDER_STATUS_TEXT[status]}</Badge>;
}
export function PaymentStatusBadge({ status }: { status: Enums<'payment_status'> }) {
  return <Badge tone={PAYMENT_TONE[status]}>{PAYMENT_STATUS_TEXT[status]}</Badge>;
}

/** Link-based pagination that preserves the other search params. */
export function Pagination({ page, pageCount, basePath, params }: { page: number; pageCount: number; basePath: string; params: Record<string, string | undefined> }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set('page', String(p));
    else sp.delete('page');
    const qs = sp.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  };
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
      <p className="text-muted">
        Page {page} of {pageCount}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="inline-flex h-8 items-center gap-1 rounded-full border border-line-strong px-3 text-xs hover:border-ink">
            <ChevronLeft className="size-3.5" /> Previous
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link href={href(page + 1)} className="inline-flex h-8 items-center gap-1 rounded-full border border-line-strong px-3 text-xs hover:border-ink">
            Next <ChevronRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

/** Parses ?page= safely. */
export function parsePage(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
