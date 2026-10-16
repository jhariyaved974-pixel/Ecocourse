import { HandCoins } from 'lucide-react';
import type { CustomerOrder } from '@/lib/orders/customer';
import { cn, formatDate, formatMoney } from '@/lib/utils';

type Order = Pick<
  CustomerOrder,
  | 'paymentPlan'
  | 'advancePercent'
  | 'advanceAmount'
  | 'balanceAmount'
  | 'amountPaid'
  | 'total'
  | 'paymentStatus'
  | 'orderStatus'
  | 'balanceDueAt'
  | 'balancePaidAt'
  | 'paidAt'
>;

function Figure({ label, value, note, tone, className }: { label: string; value: string; note?: React.ReactNode; tone?: 'danger' | 'success'; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="eyebrow text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      {note ? <dd className={cn('mt-0.5 text-xs', tone === 'danger' ? 'font-medium text-danger' : tone === 'success' ? 'text-success' : 'text-muted')}>{note}</dd> : null}
    </div>
  );
}

/**
 * Half prepaid orders: the plan, order total, money received so far (verified
 * only) and the balance with its due date. Every figure comes from the database.
 */
export function PaymentSummary({ order, overdue }: { order: Order; overdue: boolean }) {
  if (order.paymentPlan !== 'half_prepaid') return null;
  const cancelled = order.orderStatus === 'cancelled';
  const fullyPaid = order.amountPaid >= order.total;
  const advancePaid = order.amountPaid > 0;
  const balanceUnderReview = advancePaid && !fullyPaid && (order.paymentStatus === 'proof_submitted' || order.paymentStatus === 'verification_pending');

  let balanceNote: string;
  let balanceTone: 'danger' | 'success' | undefined;
  if (fullyPaid) {
    balanceNote = order.balancePaidAt ? `Verified on ${formatDate(order.balancePaidAt)}` : 'Verified';
    balanceTone = 'success';
  } else if (cancelled) {
    balanceNote = 'Not due — the order was cancelled';
  } else if (!advancePaid) {
    balanceNote = 'Paid online after the advance is verified, before dispatch';
  } else if (balanceUnderReview) {
    balanceNote = 'Payment details received — being verified';
  } else if (overdue) {
    balanceNote = order.balanceDueAt ? `Was due on ${formatDate(order.balanceDueAt)}` : 'Overdue';
    balanceTone = 'danger';
  } else {
    balanceNote = order.balanceDueAt ? `Due by ${formatDate(order.balanceDueAt)}, before dispatch` : 'Due before dispatch';
  }

  return (
    <section className="rounded-[var(--radius)] border border-line bg-surface p-5" aria-labelledby="payment-plan-heading">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <HandCoins className="size-5 shrink-0 text-muted" aria-hidden />
        <h2 id="payment-plan-heading" className="text-base font-semibold">
          Half prepaid · {order.advancePercent}% advance
        </h2>
        <p className="w-full text-xs text-muted sm:ml-auto sm:w-auto">No cash on delivery: the balance is paid online before dispatch.</p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
        <Figure label="Order total" value={formatMoney(order.total)} note={`Advance ${formatMoney(order.advanceAmount)} + balance ${formatMoney(order.balanceAmount)}`} />
        <Figure
          label="Paid so far"
          value={formatMoney(order.amountPaid)}
          note={advancePaid ? (fullyPaid ? 'Fully paid (verified)' : `Advance verified${order.paidAt ? ` on ${formatDate(order.paidAt)}` : ''}`) : 'Nothing verified yet'}
          tone={advancePaid ? 'success' : undefined}
        />
        <Figure
          className="col-span-2 sm:col-span-1"
          label={fullyPaid || cancelled ? 'Balance' : 'Balance due'}
          value={formatMoney(fullyPaid || !advancePaid ? order.balanceAmount : Math.max(order.total - order.amountPaid, 0))}
          note={balanceNote}
          tone={balanceTone}
        />
      </dl>
    </section>
  );
}
