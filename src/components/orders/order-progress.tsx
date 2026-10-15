import { Check, CircleX } from 'lucide-react';
import type { CustomerOrder } from '@/lib/orders/customer';
import { cn, formatDateTime } from '@/lib/utils';

const STEPS = [
  { key: 'placed', label: 'Order placed' },
  { key: 'payment', label: 'Payment verified' },
  { key: 'processing', label: 'Packed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
] as const;

function reached(o: CustomerOrder): number {
  switch (o.orderStatus) {
    case 'delivered':
      return 4;
    case 'shipped':
      return 3;
    case 'processing':
      return 2;
    case 'confirmed':
      return 1;
    default:
      return 0;
  }
}

export function OrderProgress({ order }: { order: CustomerOrder }) {
  if (order.orderStatus === 'cancelled') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
        <CircleX className="size-5 text-danger" />
        <span>{order.expired ? 'This order expired because payment was not received in time.' : 'This order was cancelled.'}</span>
      </div>
    );
  }
  const step = reached(order);
  const timeFor = (key: string) => {
    const map: Record<string, string> = { placed: 'placed', payment: 'payment_verified', processing: 'processing', shipped: 'shipped', delivered: 'delivered' };
    return order.events.findLast((e) => e.type === map[key] || e.toStatus === key)?.createdAt;
  };
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="Order progress">
      {STEPS.map((s, i) => {
        const done = i <= step;
        const current = i === step + 1 && order.orderStatus !== 'delivered';
        const at = done ? (i === 0 ? order.createdAt : timeFor(s.key)) : undefined;
        return (
          <li key={s.key} className="flex flex-col gap-2" aria-current={current ? 'step' : undefined}>
            <span className={cn('h-1 rounded-full', done ? 'bg-ink' : current ? 'bg-ink/30' : 'bg-line')} />
            <span className="flex items-center gap-1.5 text-xs font-medium">
              {done ? <Check className="size-3.5" /> : null}
              <span className={done ? 'text-ink' : 'text-muted'}>{s.label}</span>
            </span>
            {at ? <span className="hidden text-[11px] text-muted sm:block">{formatDateTime(at)}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
