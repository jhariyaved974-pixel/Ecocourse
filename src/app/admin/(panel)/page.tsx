import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BadgeIndianRupee, Clock3 } from 'lucide-react';
import { requireStaffPage, roleAllowed, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { OrderStatusBadge, PageHeader, Panel, PaymentStatusBadge, StatCard } from '@/components/admin/ui';
import { RevenueChart, type DayPoint } from '@/components/admin/dashboard/revenue-chart';
import { EmptyState, Notice } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import type { Enums } from '@/lib/database.types';
import { formatDateTime, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };

interface Metrics {
  orders_total: number;
  orders_today: number;
  orders_awaiting_verification: number;
  orders_pending_payment: number;
  orders_to_fulfil: number;
  orders_cancelled: number;
  orders_needing_attention: number;
  products_published: number;
  products_draft: number;
  low_stock_variants: number;
  customers_total: number;
  pending_reviews: number;
  revenue: null | { paid_gross: number; paid_net: number; refunded: number; refund_pending: number; awaiting_payment: number; paid_last_30_days: number; by_day: DayPoint[] };
  top_products: { product_id: string; name: string; units: number; revenue: number }[];
  recent_orders: { id: string; order_number: string; customer_name: string; total: number; payment_status: Enums<'payment_status'>; order_status: Enums<'order_status'>; created_at: string }[];
  recent_activity: { action: string; entity_type: string; summary: string | null; actor_email: string | null; created_at: string }[];
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaffPage(ROLE_GROUPS.any);
  const sp = await searchParams;
  const isAdmin = roleAllowed(staff.role, ROLE_GROUPS.admin);
  const canOrders = roleAllowed(staff.role, ROLE_GROUPS.orders);
  const canCatalog = roleAllowed(staff.role, ROLE_GROUPS.catalog);
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, overdue, openRequests] = await Promise.all([
    supabase.rpc('admin_dashboard_metrics'),
    canOrders ? supabase.from('orders').select('id', { count: 'exact', head: true }).eq('order_status', 'payment_review').lt('review_due_at', new Date().toISOString()) : Promise.resolve({ count: 0 }),
    canOrders ? supabase.from('customer_requests').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']) : Promise.resolve({ count: 0 }),
  ]);
  const m = data as unknown as Metrics | null;

  return (
    <>
      <PageHeader title="Dashboard" description={`Signed in as ${staff.email} (${staff.role}).`} />
      {sp.denied ? <Notice tone="warning" className="mb-6">Your role does not have access to that page.</Notice> : null}
      {error || !m ? (
        <Notice tone="danger">The dashboard could not be loaded. Please refresh.</Notice>
      ) : (
        <div className="space-y-6">
          {isAdmin && m.orders_awaiting_verification > 0 ? (
            <Notice tone="info" title={`${m.orders_awaiting_verification} UPI payment${m.orders_awaiting_verification === 1 ? '' : 's'} waiting for verification`}>
              Check each one against your bank/UPI records before confirming.{' '}
              <Link href="/admin/payments" className="font-medium underline">Review payments</Link>
            </Notice>
          ) : null}
          {canOrders && (m.orders_needing_attention > 0 || (overdue.count ?? 0) > 0) ? (
            <Notice tone="warning" title="Needs attention">
              {m.orders_needing_attention} order{m.orders_needing_attention === 1 ? '' : 's'} flagged (late payments, duplicate UTRs or overdue reviews)
              {(overdue.count ?? 0) > 0 ? `, ${overdue.count} past the review deadline` : ''}.{' '}
              <Link href="/admin/orders?attention=1" className="font-medium underline">Open</Link>
            </Notice>
          ) : null}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {isAdmin && m.revenue ? <StatCard label="Revenue, last 30 days" value={formatMoney(m.revenue.paid_last_30_days)} hint="Verified payments, net of refunds" /> : null}
            {canOrders ? <StatCard label="Orders today" value={m.orders_today} hint={`${m.orders_total} in total`} /> : null}
            {canOrders ? <StatCard label="Awaiting verification" value={m.orders_awaiting_verification} tone={m.orders_awaiting_verification ? 'warning' : undefined} hint="UPI proofs submitted" /> : null}
            {canOrders ? <StatCard label="To fulfil" value={m.orders_to_fulfil} hint="Confirmed or processing" /> : null}
            {canOrders ? <StatCard label="Awaiting payment" value={m.orders_pending_payment} hint={isAdmin && m.revenue ? formatMoney(m.revenue.awaiting_payment) : 'Reserved stock'} /> : null}
            {canCatalog ? <StatCard label="Low-stock variants" value={m.low_stock_variants} tone={m.low_stock_variants ? 'warning' : undefined} hint="At or below threshold" /> : null}
            {canCatalog ? <StatCard label="Products live" value={m.products_published} hint={`${m.products_draft} draft`} /> : null}
            {canOrders ? <StatCard label="Pending reviews" value={m.pending_reviews} hint={`${openRequests.count ?? 0} open customer request(s)`} /> : null}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              {isAdmin && m.revenue ? (
                <Panel title="Verified revenue per day" description="Last 30 days, India time. Only payments confirmed against bank records or a verified gateway event.">
                  <RevenueChart points={m.revenue.by_day.slice(-30)} />
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm sm:grid-cols-4">
                    <div><dt className="text-xs text-muted">Paid (gross)</dt><dd className="tabular-nums">{formatMoney(m.revenue.paid_gross)}</dd></div>
                    <div><dt className="text-xs text-muted">Refunded</dt><dd className="tabular-nums">{formatMoney(m.revenue.refunded)}</dd></div>
                    <div><dt className="text-xs text-muted">Refunds pending</dt><dd className="tabular-nums">{formatMoney(m.revenue.refund_pending)}</dd></div>
                    <div><dt className="text-xs text-muted">Paid (net)</dt><dd className="tabular-nums">{formatMoney(m.revenue.paid_net)}</dd></div>
                  </dl>
                </Panel>
              ) : null}
              {canOrders ? (
                <Panel title="Recent orders" actions={<Button asChild variant="ghost" size="sm"><Link href="/admin/orders">All orders <ArrowRight /></Link></Button>}>
                  {m.recent_orders.length ? (
                    <ul className="-my-2 divide-y divide-line text-sm">
                      {m.recent_orders.map((o) => (
                        <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                          <span className="min-w-40">
                            <Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold hover:underline">{o.order_number}</Link>
                            <span className="block text-xs text-muted">{o.customer_name} · {formatDateTime(o.created_at)}</span>
                          </span>
                          <span className="flex flex-wrap gap-1.5"><OrderStatusBadge status={o.order_status} /><PaymentStatusBadge status={o.payment_status} /></span>
                          <span className="w-24 text-right tabular-nums">{formatMoney(o.total)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState title="No orders yet" description="Orders appear here as soon as customers check out." />
                  )}
                </Panel>
              ) : null}
            </div>
            <div className="space-y-6">
              {canOrders ? (
                <Panel title="Quick links">
                  <ul className="space-y-2 text-sm">
                    {isAdmin ? <li><Link href="/admin/payments" className="flex items-center gap-2 hover:underline"><BadgeIndianRupee className="size-4" /> UPI payments to verify ({m.orders_awaiting_verification})</Link></li> : null}
                    <li><Link href="/admin/orders?order_status=confirmed" className="flex items-center gap-2 hover:underline"><Clock3 className="size-4" /> Orders to fulfil ({m.orders_to_fulfil})</Link></li>
                    {canCatalog ? <li><Link href="/admin/inventory?filter=low" className="flex items-center gap-2 hover:underline"><AlertTriangle className="size-4" /> Low stock ({m.low_stock_variants})</Link></li> : null}
                  </ul>
                </Panel>
              ) : null}
              <Panel title="Top products" description="By units sold (paid orders)">
                {m.top_products.length ? (
                  <ol className="space-y-2 text-sm">
                    {m.top_products.map((p, i) => (
                      <li key={p.product_id ?? i} className="flex justify-between gap-2">
                        <span className="truncate">{i + 1}. {p.name}</span>
                        <span className="shrink-0 tabular-nums text-muted">{p.units} sold{isAdmin ? ` · ${formatMoney(p.revenue)}` : ''}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted">No paid orders yet.</p>
                )}
              </Panel>
              {isAdmin ? (
                <Panel title="Recent activity" actions={<Button asChild variant="ghost" size="sm"><Link href="/admin/audit">Audit log</Link></Button>}>
                  {m.recent_activity.length ? (
                    <ul className="space-y-2.5 text-xs">
                      {m.recent_activity.map((a, i) => (
                        <li key={i}>
                          <p className="font-medium text-ink">{a.summary || `${a.action} · ${a.entity_type}`}</p>
                          <p className="text-muted">{a.actor_email ?? 'System'} · {formatDateTime(a.created_at)}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">No activity yet.</p>
                  )}
                </Panel>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
