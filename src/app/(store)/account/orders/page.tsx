import type { Metadata } from 'next';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { requireUserPage } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '@/lib/orders/customer';
import { Badge, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { formatDate, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Orders' };

export default async function AccountOrdersPage() {
  await requireUserPage('/account/orders');
  const supabase = await createSupabaseServerClient();
  const { data: orders } = await supabase
    .from('orders')
    .select('order_number, created_at, total, order_status, payment_status, order_items(product_name, quantity)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (!orders?.length) {
    return (
      <EmptyState
        icon={<Package className="size-6" />}
        title="No orders yet"
        description="Orders you place while signed in will appear here."
        action={
          <Button asChild>
            <Link href="/shop">Start shopping</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ul className="divide-y divide-line rounded-[var(--radius)] border border-line bg-surface">
      {orders.map((o) => (
        <li key={o.order_number}>
          <Link href={`/orders/${o.order_number}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 p-5 transition-colors hover:bg-surface-2">
            <div className="min-w-48 flex-1">
              <p className="font-mono text-sm font-semibold">{o.order_number}</p>
              <p className="mt-0.5 text-xs text-muted">
                {formatDate(o.created_at)} · {o.order_items.map((i) => `${i.product_name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={o.order_status === 'cancelled' ? 'danger' : o.payment_status === 'verified_paid' ? 'success' : 'warning'}>{ORDER_STATUS_LABEL[o.order_status]}</Badge>
              <Badge tone="neutral">{PAYMENT_STATUS_LABEL[o.payment_status]}</Badge>
            </div>
            <p className="w-24 text-right font-medium tabular-nums">{formatMoney(o.total)}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
