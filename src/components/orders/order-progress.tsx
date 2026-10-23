import { Check, CircleX } from 'lucide-react';
import type { CustomerOrder } from '@/lib/orders/customer';
import { cn, formatDateTime } from '@/lib/utils';

type Order = Pick<CustomerOrder, 'orderStatus' | 'paymentStatus' | 'paymentPlan' | 'amountPaid' | 'total' | 'expired' | 'createdAt' | 'events'>;

interface Step {
  key: string;
  label: string;
  done: boolean;
  /** Event types (or the order status an event moved to) that date this step. */
  events: string[];
}

const RANK: Record<CustomerOrder['orderStatus'], number> = {
  pending_payment: 0,
  payment_review: 0,
  cancelled: 0,
  confirmed: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
};

/**
 * Prepaid: placed → payment verified → packed → shipped → delivered.
 * Half prepaid: placed → advance verified → packed → balance verified →
 * shipped → delivered. Packing may happen before or after the balance is
 * verified, so each step is done on its own condition; shipping always needs
 * the full payment (enforced by the database).
 */
function steps(o: Order): Step[] {
  const rank = RANK[o.orderStatus];
  const fullyPaid = o.paymentStatus === 'verified_paid' || o.paymentStatus === 'refund_pending' || o.paymentStatus === 'refunded' || o.amountPaid >= o.total;
  const placed: Step = { key: 'placed', label: 'Order placed', done: true, events: ['placed'] };
  const packed: Step = { key: 'processing', label: 'Packed', done: rank >= 2, events: ['processing'] };
  const shipped: Step = { key: 'shipped', label: 'Shipped', done: rank >= 3, events: ['shipped'] };
  const delivered: Step = { key: 'delivered', label: 'Delivered', done: rank >= 4, events: ['delivered'] };
  if (o.paymentPlan === 'half_prepaid') {
    return [
      placed,
      { key: 'advance', label: 'Advance verified', done: rank >= 1 || o.amountPaid > 0, events: ['advance_verified'] },
      packed,
      { key: 'balance', label: 'Balance verified', done: fullyPaid && rank >= 1, events: ['balance_verified'] },
      shipped,
      delivered,
    ];
  }
  return [placed, { key: 'payment', label: 'Payment verified', done: rank >= 1, events: ['payment_verified'] }, packed, shipped, delivered];
}

export function OrderProgress({ order }: { order: Order }) {
  if (order.orderStatus === 'cancelled') {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius)] border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
        <CircleX className="size-5 text-danger" />
        <span>{order.expired ? 'This order expired because payment was not received in time.' : 'This order was cancelled.'}</span>
      </div>
    );
  }
  const list = steps(order);
  const currentIndex = list.findIndex((s) => !s.done);
  const timeFor = (s: Step) => (s.key === 'placed' ? order.createdAt : order.events.findLast((e) => s.events.includes(e.type) || e.toStatus === s.key)?.createdAt);
  return (
    <ol className={cn('grid gap-2', list.length === 6 ? 'grid-cols-6' : 'grid-cols-5')} aria-label="Order progress">
      {list.map((s, i) => {
        const current = i === currentIndex;
        const at = s.done ? timeFor(s) : undefined;
        return (
          <li key={s.key} className="flex min-w-0 flex-col gap-2" aria-current={current ? 'step' : undefined}>
            <span className={cn('h-1 rounded-full', s.done ? 'bg-ink' : current ? 'bg-ink/30' : 'bg-line')} />
            <span className="flex items-start gap-1 text-[11px] leading-tight font-medium sm:items-center sm:gap-1.5 sm:text-xs">
              {/* Six steps (half prepaid) leave no room for the tick on phones; the bar and the sr-only text mark done steps. */}
              {s.done ? <Check className={cn('size-3.5 shrink-0', list.length === 6 && 'max-sm:hidden')} aria-hidden /> : null}
              <span className={cn('min-w-0 [overflow-wrap:anywhere]', s.done ? 'text-ink' : 'text-muted')}>
                {s.label}
                {s.done ? <span className="sr-only"> (done)</span> : null}
              </span>
            </span>
            {at ? <span className="hidden text-[11px] text-muted sm:block">{formatDateTime(at)}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
