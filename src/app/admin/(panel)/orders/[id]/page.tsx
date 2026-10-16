import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, BadgeIndianRupee, ExternalLink } from 'lucide-react';
import { requireStaffPage, roleAllowed, ROLE_GROUPS } from '@/lib/auth';
import { getAdminOrder, isUuid, type AdminOrder } from '@/lib/admin/orders';
import { OrderStatusBadge, PageHeader, Panel, PaymentStatusBadge, Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { Badge, Notice } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { AuditTrail, CustomerBlock, FactList, OrderItemsTable, OrderTimeline, OrderTotals } from '@/components/admin/orders/order-summary';
import {
  CancelOrderButton,
  FulfilmentForm,
  OrderNoteForm,
  RefundControls,
  ResolveAttentionButton,
  SupportNotice,
} from '@/components/admin/orders/order-actions';
import { NEXT_FULFILMENT, PAYMENT_METHOD_TEXT, type OrderStatus } from '@/components/admin/orders/constants';
import { balanceOutstanding, PAYMENT_PLAN_TEXT } from '@/lib/admin/payment-plans';
import { cn, formatDate, formatDateTime, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Order' };

function FulfilmentFacts({ order }: { order: AdminOrder }) {
  const rows: [React.ReactNode, React.ReactNode][] = [];
  if (order.confirmed_at) rows.push(['Confirmed', formatDateTime(order.confirmed_at)]);
  if (order.processing_at) rows.push(['Processing', formatDateTime(order.processing_at)]);
  if (order.shipped_at) rows.push(['Shipped', formatDateTime(order.shipped_at)]);
  if (order.delivered_at) rows.push(['Delivered', formatDateTime(order.delivered_at)]);
  if (order.tracking_carrier) rows.push(['Carrier', order.tracking_carrier]);
  if (order.tracking_number) rows.push(['Tracking no.', <span key="n" className="font-mono">{order.tracking_number}</span>]);
  if (order.tracking_url && order.tracking_url.startsWith('https://')) {
    rows.push([
      'Tracking link',
      <a key="u" href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
        Open <ExternalLink className="size-3.5" aria-hidden />
      </a>,
    ]);
  }
  rows.push(['Shipping method', order.shipping_method_name]);
  return <FactList items={rows} />;
}

interface FulfilmentPlan {
  /** Steps the database allows now. */
  next: readonly OrderStatus[];
  /** Steps shown as locked, with the reason. */
  locked: readonly OrderStatus[];
  lockedReason?: string;
  /** Why fulfilment is closed altogether. */
  blocked: string | null;
}

/**
 * Mirrors update_order_fulfillment (the SQL function is the source of truth):
 * Processing is allowed once the advance is verified; Shipped and Delivered
 * need the payment status Verified & paid.
 */
function fulfilmentPlan(order: AdminOrder): FulfilmentPlan {
  const none = { next: [], locked: [] };
  if (order.order_status === 'cancelled') return { ...none, blocked: 'This order is cancelled.' };
  if (order.order_status === 'delivered') return { ...none, blocked: 'This order has been delivered.' };
  if (order.payment_status === 'verified_paid') return { next: NEXT_FULFILMENT[order.order_status] ?? [], locked: [], blocked: null };
  if (order.payment_status === 'refund_pending' || order.payment_status === 'refunded') return { ...none, blocked: 'Fulfilment is closed because the order has a refund.' };
  const advanceVerified =
    order.amount_paid > 0 &&
    ['partially_paid', 'proof_submitted', 'verification_pending'].includes(order.payment_status) &&
    (order.order_status === 'confirmed' || order.order_status === 'processing');
  if (advanceVerified) {
    const outstanding = formatMoney(order.total - order.amount_paid);
    const reason =
      order.payment_status === 'partially_paid'
        ? `Shipped and Delivered unlock once the balance of ${outstanding} is verified${order.balance_due_at ? ` (due ${formatDate(order.balance_due_at)})` : ''}. You can pack the order now; collect the balance before dispatch.`
        : `Shipped and Delivered unlock once the balance of ${outstanding} is verified. A balance payment proof is waiting for review on the payment screen.`;
    return { next: order.order_status === 'confirmed' ? ['processing'] : [], locked: ['shipped'], lockedReason: reason, blocked: null };
  }
  return { ...none, blocked: order.payment_plan === 'half_prepaid' ? 'Fulfilment unlocks once the advance is verified.' : 'Fulfilment unlocks once the payment is verified.' };
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage(ROLE_GROUPS.orders);
  const isAdmin = roleAllowed(staff.role, ROLE_GROUPS.admin);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const detail = await getAdminOrder(id, { includeAdminData: isAdmin });
  if (!detail) notFound();
  const { order, items, events, refunds, transactions, audit } = detail;

  const plan = fulfilmentPlan(order);
  const canFulfil = !plan.blocked && (plan.next.length > 0 || plan.locked.length > 0);
  // Money received (the advance counts): cancelling refunds it, refunds are capped at it.
  const paid = order.amount_paid > 0;
  const cancellable = !['cancelled', 'shipped', 'delivered'].includes(order.order_status);
  const pendingRefunds = refunds.filter((r) => r.status === 'pending');
  const pendingTotal = pendingRefunds.reduce((sum, r) => sum + r.amount, 0);
  const refundRoom = Math.max(0, order.amount_paid - order.refunded_total - pendingTotal);
  const refundable = paid && ['verified_paid', 'partially_paid', 'refund_pending'].includes(order.payment_status);
  const isUpi = order.payment_method === 'upi_manual';
  const halfPrepaid = order.payment_plan === 'half_prepaid';
  const outstanding = balanceOutstanding(order);
  const balanceOverdue = order.payment_status === 'partially_paid' && order.balance_due_at ? new Date(order.balance_due_at).getTime() <= detail.nowMs : false;

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{order.order_number}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            Placed {formatDateTime(order.created_at)}
            <PaymentStatusBadge status={order.payment_status} />
            <OrderStatusBadge status={order.order_status} />
            {order.expired ? <Badge tone="warning">Expired</Badge> : null}
            {halfPrepaid ? <Badge tone="outline">Half prepaid</Badge> : null}
            {balanceOverdue ? <Badge tone="danger">Balance overdue</Badge> : null}
          </span>
        }
        back={{ href: '/admin/orders', label: 'Orders' }}
        actions={
          isAdmin && isUpi ? (
            <Button asChild variant={order.payment_status === 'proof_submitted' || order.payment_status === 'verification_pending' ? 'primary' : 'outline'} size="sm">
              <Link href={`/admin/payments/${order.id}`}>
                <BadgeIndianRupee /> Payment review
              </Link>
            </Button>
          ) : null
        }
      />

      {order.requires_attention ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3" role="alert">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <div>
              <p className="font-semibold">Needs attention</p>
              <p className="text-ink-2">{order.attention_reason ?? 'This order was flagged for review.'}</p>
            </div>
          </div>
          {isAdmin ? <ResolveAttentionButton orderId={order.id} /> : null}
        </div>
      ) : null}
      {order.order_status === 'cancelled' ? (
        <Notice tone="danger" title={order.expired ? 'Expired — payment not received in time' : 'Cancelled'} className="mb-6">
          {order.cancel_reason ?? 'No reason recorded.'} {order.cancelled_at ? `(${formatDateTime(order.cancelled_at)})` : null}
        </Notice>
      ) : null}

      {/* On phones fulfilment follows the items; on desktop the side column sits beside everything. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr] lg:items-start">
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          <Panel title={`Items (${items.reduce((n, i) => n + i.quantity, 0)})`}>
            <OrderItemsTable items={items} />
            <div className="mt-4 border-t border-line pt-4">
              <OrderTotals order={order} />
            </div>
          </Panel>
        </div>

        <aside className="space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Panel title="Fulfilment" actions={<OrderStatusBadge status={order.order_status} />}>
            <FulfilmentFacts order={order} />
            <div className="mt-5 border-t border-line pt-5">
              {canFulfil ? (
                <FulfilmentForm
                  key={`${order.order_status}-${order.payment_status}-${order.updated_at}`}
                  orderId={order.id}
                  currentStatus={order.order_status}
                  nextStatuses={plan.next}
                  lockedStatuses={plan.locked}
                  lockedReason={plan.lockedReason}
                  tracking={{ carrier: order.tracking_carrier, number: order.tracking_number, url: order.tracking_url }}
                />
              ) : (
                <p className="text-sm text-muted">{plan.blocked ?? 'No further fulfilment steps.'}</p>
              )}
            </div>
          </Panel>

          <Panel title="Customer & shipping">
            <CustomerBlock order={order} registered={detail.isRegisteredCustomer} />
          </Panel>

          <Panel title="Add a note">
            <OrderNoteForm orderId={order.id} allowCustomerVisible />
          </Panel>

          {isAdmin && (refundable || pendingRefunds.length) ? (
            <Panel
              title="Refunds"
              description={
                order.payment_status === 'refund_pending'
                  ? 'A refund is owed to the customer. Send it, then record it here.'
                  : `Record money returned to the customer (at most the ${formatMoney(order.amount_paid)} received).`
              }
            >
              <RefundControls
                key={`${order.payment_status}-${order.refunded_total}-${pendingRefunds.length}`}
                orderId={order.id}
                pendingRefunds={pendingRefunds.map((r) => ({ id: r.id, amount: r.amount, reason: r.reason, createdAt: r.created_at }))}
                maxNewRefund={refundRoom}
                canRestock={order.order_status === 'delivered'}
              />
            </Panel>
          ) : null}

          {isAdmin && cancellable ? (
            <Panel title="Cancel order">
              <p className="mb-3 text-sm text-muted">
                Releases reserved stock and returns any deducted stock to inventory.
                {paid && refundRoom > 0 ? ` Because ${formatMoney(order.amount_paid)} was received, a refund of ${formatMoney(refundRoom)} becomes pending.` : ''}
              </p>
              <CancelOrderButton orderId={order.id} orderNumber={order.order_number} paid={paid} amountPaid={order.amount_paid} refundAmount={refundRoom} />
            </Panel>
          ) : null}

          {!isAdmin ? <SupportNotice /> : null}
        </aside>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
          <Panel
            title="Payment"
            actions={
              isAdmin && isUpi ? (
                <Link href={`/admin/payments/${order.id}`} className="text-xs font-medium hover:underline">
                  Proofs &amp; verification →
                </Link>
              ) : null
            }
          >
            <FactList
              items={[
                ['Plan', PAYMENT_PLAN_TEXT[order.payment_plan]],
                ['Method', PAYMENT_METHOD_TEXT[order.payment_method]],
                ['Status', <PaymentStatusBadge key="s" status={order.payment_status} />],
                ['Order total', <span key="a" className="font-medium tabular-nums">{formatMoney(order.total)}</span>],
                ...(halfPrepaid
                  ? ([
                      ['Advance', <span key="adv" className="tabular-nums">{formatMoney(order.advance_amount)} ({order.advance_percent}%)</span>],
                      ['Balance', <span key="bal" className="tabular-nums">{formatMoney(order.total - order.advance_amount)}</span>],
                    ] as [React.ReactNode, React.ReactNode][])
                  : []),
                ['Paid so far', <span key="paid" className="font-medium tabular-nums">{formatMoney(order.amount_paid)}</span>],
                ...(outstanding > 0
                  ? ([
                      ['Balance outstanding', <span key="out" className="font-medium tabular-nums">{formatMoney(outstanding)}</span>],
                      [
                        'Balance due',
                        order.balance_due_at ? (
                          <span key="due" className={cn('inline-flex flex-wrap items-center justify-end gap-1.5', balanceOverdue && 'font-semibold text-danger')}>
                            {formatDate(order.balance_due_at)}
                            {balanceOverdue ? <Badge tone="danger">Overdue</Badge> : null}
                          </span>
                        ) : (
                          '—'
                        ),
                      ],
                    ] as [React.ReactNode, React.ReactNode][])
                  : []),
                [halfPrepaid ? 'Advance paid at' : 'Paid at', formatDateTime(order.paid_at)],
                [halfPrepaid ? 'Advance reference' : 'Reference', order.payment_reference ? <span key="r" className="font-mono">{order.payment_reference}</span> : '—'],
                ...(halfPrepaid && (order.balance_paid_at || order.balance_reference)
                  ? ([
                      ['Balance paid at', formatDateTime(order.balance_paid_at)],
                      ['Balance reference', order.balance_reference ? <span key="br" className="font-mono">{order.balance_reference}</span> : '—'],
                    ] as [React.ReactNode, React.ReactNode][])
                  : []),
                ...(isAdmin ? ([['Verified by', detail.verifiedByEmail ?? (order.payment_verified_by ? 'Staff member' : '—')]] as [React.ReactNode, React.ReactNode][]) : []),
                ...(order.review_due_at ? ([['Review due', formatDateTime(order.review_due_at)]] as [React.ReactNode, React.ReactNode][]) : []),
                ...(order.reservation_expires_at
                  ? ([['Payment window ends', formatDateTime(order.reservation_expires_at)]] as [React.ReactNode, React.ReactNode][])
                  : []),
              ]}
            />
            {isAdmin && transactions.length ? (
              <div className="mt-5">
                <h3 className="mb-2 text-xs font-semibold text-muted">Gateway transactions</h3>
                <TableWrap>
                  <Table className="min-w-[560px]">
                    <thead>
                      <tr>
                        <Th>Provider order</Th>
                        <Th>Payment ID</Th>
                        <Th className="text-right">Amount</Th>
                        <Th>Status</Th>
                        <Th>Updated</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((t) => (
                        <tr key={t.id}>
                          <Td className="font-mono text-xs">{t.provider_order_id}</Td>
                          <Td className="font-mono text-xs">{t.provider_payment_id ?? '—'}</Td>
                          <Td className="text-right tabular-nums">{formatMoney(t.amount)}</Td>
                          <Td className="text-xs">
                            {t.status}
                            {t.error_description ? <span className="block text-danger">{t.error_description}</span> : null}
                          </Td>
                          <Td className="text-xs text-muted">{formatDateTime(t.updated_at)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </div>
            ) : null}
            {isAdmin && refunds.length ? (
              <div className="mt-5">
                <h3 className="mb-2 text-xs font-semibold text-muted">Refunds</h3>
                <TableWrap>
                  <Table className="min-w-[620px]">
                    <thead>
                      <tr>
                        <Th className="text-right">Amount</Th>
                        <Th>Status</Th>
                        <Th>Reference</Th>
                        <Th>Reason</Th>
                        <Th>Created</Th>
                        <Th>Processed</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {refunds.map((r) => (
                        <tr key={r.id}>
                          <Td className="text-right font-medium tabular-nums">{formatMoney(r.amount)}</Td>
                          <Td>
                            <Badge tone={r.status === 'processed' ? 'success' : r.status === 'failed' ? 'danger' : 'warning'}>{r.status}</Badge>
                          </Td>
                          <Td className="font-mono text-xs">{r.reference ?? '—'}</Td>
                          <Td className="min-w-[200px] max-w-[280px] text-xs">{r.reason}</Td>
                          <Td className="text-xs whitespace-nowrap text-muted">{formatDateTime(r.created_at)}</Td>
                          <Td className="text-xs whitespace-nowrap text-muted">{formatDateTime(r.processed_at)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </div>
            ) : null}
          </Panel>

          <Panel title="Timeline" description="All order events, including internal notes the customer does not see.">
            <OrderTimeline events={events} />
          </Panel>

          {isAdmin ? (
            <Panel title="Audit trail" description="Staff actions recorded for this order.">
              <AuditTrail entries={audit} />
            </Panel>
          ) : null}
        </div>

      </div>
    </>
  );
}
