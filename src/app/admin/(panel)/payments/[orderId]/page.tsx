import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ClipboardCheck, ExternalLink } from 'lucide-react';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { getAdminOrder, getOrderProofs, getReviewInstructions, isUuid } from '@/lib/admin/orders';
import { OrderStatusBadge, PageHeader, Panel, PaymentStatusBadge } from '@/components/admin/ui';
import { Badge, EmptyState, Notice } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { AuditTrail, CustomerBlock, FactList, OrderItemsTable, OrderTimeline, OrderTotals } from '@/components/admin/orders/order-summary';
import { OrderNoteForm, ResolveAttentionButton } from '@/components/admin/orders/order-actions';
import { PAYMENT_METHOD_TEXT } from '@/components/admin/orders/constants';
import { ProofCard } from '@/components/admin/payments/proof-card';
import { PaymentDecision } from '@/components/admin/payments/payment-decision';
import { cn, formatDateTime, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Verify payment' };

export default async function PaymentReviewPage({ params }: { params: Promise<{ orderId: string }> }) {
  await requireStaffPage(ROLE_GROUPS.admin);
  const { orderId } = await params;
  if (!isUuid(orderId)) notFound();

  const [detail, proofs, settings] = await Promise.all([
    getAdminOrder(orderId, { includeAdminData: true }),
    getOrderProofs(orderId),
    getReviewInstructions(),
  ]);
  if (!detail) notFound();
  const { order, items, events, audit } = detail;

  if (order.payment_method !== 'upi_manual') {
    return (
      <>
        <PageHeader title={`Payment · ${order.order_number}`} back={{ href: '/admin/payments', label: 'UPI payments' }} />
        <Notice tone="info" title={`${PAYMENT_METHOD_TEXT[order.payment_method]} order`}>
          This order was paid through the payment gateway and is confirmed by verified gateway events, not manual review.{' '}
          <Link href={`/admin/orders/${order.id}`} className="font-medium underline">
            Open the order
          </Link>
        </Notice>
      </>
    );
  }

  const openProof = proofs.find((p) => p.status === 'submitted' || p.status === 'under_review') ?? null;
  const inReview = order.payment_status === 'proof_submitted' || order.payment_status === 'verification_pending';
  const overdue = inReview && order.review_due_at ? new Date(order.review_due_at).getTime() < detail.nowMs : false;
  const cancelledByStaff = order.order_status === 'cancelled' && !order.expired;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Verify payment <span className="font-mono text-xl">{order.order_number}</span>
          </span>
        }
        description={`Placed ${formatDateTime(order.created_at)} by ${order.customer_name}`}
        back={{ href: '/admin/payments', label: 'UPI payments' }}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/orders/${order.id}`}>
              Order details <ExternalLink />
            </Link>
          </Button>
        }
      />

      <div className="mb-6 space-y-3">
        <Notice tone="warning" title="Before you approve">
          <p className="whitespace-pre-line">{settings?.instructions ?? 'Open your bank statement or UPI merchant app and confirm a credit of the exact order amount with the matching UTR before approving. A screenshot alone is never sufficient.'}</p>
        </Notice>
        {order.requires_attention ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3" role="alert">
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              <div>
                <p className="font-semibold">Needs attention</p>
                <p className="text-ink-2">{order.attention_reason ?? 'This order was flagged for review.'}</p>
              </div>
            </div>
            <ResolveAttentionButton orderId={order.id} />
          </div>
        ) : null}
        {order.expired && inReview ? (
          <Notice tone="danger" title="Late payment">
            This proof arrived after the order expired and its reserved stock was released. Approval re-reserves stock only if it is still available; otherwise record the
            payment and refund the customer.
          </Notice>
        ) : null}
      </div>

      {/* On phones the decision column follows the proofs; on desktop it sits beside everything. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr] lg:items-start">
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          <Panel title={`Payment proofs (${proofs.length})`} description="Newest first. Images are shown through links that expire after two minutes; reload the page for a fresh preview.">
            {proofs.length ? (
              <div className="space-y-4">
                {proofs.map((p) => (
                  <ProofCard key={p.id} proof={p} isCurrent={p.id === openProof?.id} />
                ))}
              </div>
            ) : (
              <EmptyState icon={<ClipboardCheck className="size-5" />} title="No payment proof yet" description="The customer has not submitted a screenshot or UTR for this order." />
            )}
          </Panel>
        </div>

        <aside className="space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Panel>
            <p className="text-xs font-medium text-muted">Credit to find in your bank records</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{formatMoney(order.total)}</p>
            {openProof?.utr ? (
              <p className="mt-1 text-sm">
                UTR <span className="font-mono font-semibold tracking-wide">{openProof.utr}</span>
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <PaymentStatusBadge status={order.payment_status} />
              <OrderStatusBadge status={order.order_status} />
              {order.expired ? <Badge tone="warning">Expired</Badge> : null}
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <FactList
                items={[
                  [
                    'Review due',
                    inReview && order.review_due_at ? (
                      <span className={cn(overdue && 'font-semibold text-danger')}>
                        {formatDateTime(order.review_due_at)}
                        {overdue ? ' (overdue)' : ''}
                      </span>
                    ) : (
                      '—'
                    ),
                  ],
                  ['Customer', order.customer_name],
                  ['Email', <span key="e" className="break-all">{order.email}</span>],
                  ['Phone', order.phone],
                  ...(order.paid_at
                    ? ([
                        ['Paid at', formatDateTime(order.paid_at)],
                        ['Reference', <span key="r" className="font-mono">{order.payment_reference ?? '—'}</span>],
                        ['Verified by', detail.verifiedByEmail ?? '—'],
                      ] as [React.ReactNode, React.ReactNode][])
                    : []),
                ]}
              />
            </div>
          </Panel>

          <Panel title="Decision">
            <PaymentDecision
              key={`${order.payment_status}-${openProof?.id ?? 'none'}`}
              orderId={order.id}
              orderNumber={order.order_number}
              total={order.total}
              paymentStatus={order.payment_status}
              cancelledByStaff={cancelledByStaff}
              expired={order.expired}
              openProof={openProof ? { id: openProof.id, utr: openProof.utr } : null}
              proofUtrConfirmedOn={openProof?.duplicateOrders.find((d) => d.approvedElsewhere)?.orderNumber ?? null}
            />
          </Panel>

          <Panel title="Notes" description="Internal notes are visible to staff only.">
            <OrderNoteForm orderId={order.id} allowCustomerVisible={false} />
          </Panel>

          <Panel title="Customer & shipping">
            <CustomerBlock order={order} registered={detail.isRegisteredCustomer} />
          </Panel>
        </aside>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
          <Panel title="Order summary">
            <OrderItemsTable items={items} />
            <div className="mt-4 border-t border-line pt-4">
              <OrderTotals order={order} />
            </div>
          </Panel>

          <Panel title="History" description="Every order event, including internal ones the customer does not see.">
            <OrderTimeline events={events} />
          </Panel>

          <Panel title="Audit trail" description="Staff actions recorded for this order.">
            <AuditTrail entries={audit} />
          </Panel>
        </div>

      </div>
    </>
  );
}
