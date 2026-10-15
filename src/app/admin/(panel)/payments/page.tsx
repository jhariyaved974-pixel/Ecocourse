import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AlertTriangle, ExternalLink, Inbox } from 'lucide-react';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { asPaymentTab, listPaymentQueue, paymentQueueCounts, sanitizeSearch, type PaymentQueueRow, type PaymentTab } from '@/lib/admin/orders';
import { firstParam, PageHeader, Pagination, parsePage, PaymentStatusBadge, Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { SearchParamInput } from '@/components/admin/client-ui';
import { Badge, EmptyState, Notice } from '@/components/ui/misc';
import { proofHref } from '@/components/admin/payments/proof-card';
import { cn, formatDate, formatDateTime, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'UPI payments' };

const TAB_LABEL: Record<PaymentTab, string> = {
  review: 'Needs verification',
  attention: 'Late / attention',
  rejected: 'Rejected',
  verified: 'Verified',
  all: 'All UPI orders',
};

function QueueTabs({ tab, q, counts }: { tab: PaymentTab; q: string; counts: { review: number; attention: number } }) {
  const tabs: PaymentTab[] = ['review', 'attention', 'rejected', 'verified', 'all'];
  return (
    <nav aria-label="Payment queue" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => {
          const sp = new URLSearchParams();
          if (t !== 'review') sp.set('tab', t);
          if (q) sp.set('q', q);
          const qs = sp.toString();
          const count = t === 'review' ? counts.review : t === 'attention' ? counts.attention : null;
          const active = t === tab;
          return (
            <li key={t}>
              <Link
                href={`/admin/payments${qs ? `?${qs}` : ''}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
                  active ? 'border-ink font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
                )}
              >
                {TAB_LABEL[t]}
                {count ? (
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', t === 'attention' ? 'bg-danger/10 text-danger' : 'bg-info/10 text-info')}>
                    {count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ReviewDue({ row, nowMs }: { row: PaymentQueueRow; nowMs: number }) {
  if (!row.reviewDueAt || !(row.paymentStatus === 'proof_submitted' || row.paymentStatus === 'verification_pending')) return <span className="text-muted">—</span>;
  const overdue = new Date(row.reviewDueAt).getTime() < nowMs;
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', overdue ? 'font-semibold text-danger' : 'text-ink-2')}>
      {overdue ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
      {formatDateTime(row.reviewDueAt)}
      {overdue ? <span className="sr-only">(overdue)</span> : null}
    </span>
  );
}

function QueueTable({ rows, nowMs }: { rows: PaymentQueueRow[]; nowMs: number }) {
  return (
    <TableWrap>
      <Table className="min-w-[1080px]">
        <thead>
          <tr>
            <Th>Order</Th>
            <Th>Customer</Th>
            <Th className="text-right">Total</Th>
            <Th>UTR</Th>
            <Th>Proof submitted</Th>
            <Th>Status</Th>
            <Th>Review due</Th>
            <Th>Created</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={cn('hover:bg-surface-2/50', row.requiresAttention && 'bg-danger/[0.03]')}>
              <Td className="whitespace-nowrap">
                <Link href={`/admin/payments/${row.id}`} className="font-mono text-xs font-semibold hover:underline">
                  {row.orderNumber}
                </Link>
                {row.requiresAttention ? (
                  <span className="mt-1 flex max-w-[220px] items-start gap-1 text-[11px] whitespace-normal text-danger">
                    <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden /> {row.attentionReason ?? 'Needs attention'}
                  </span>
                ) : null}
                {row.expired ? <Badge tone="warning" className="mt-1">Late payment</Badge> : null}
              </Td>
              <Td className="min-w-[200px]">
                <p className="font-medium">{row.customerName}</p>
                <p className="text-xs break-words text-muted">{row.email}</p>
              </Td>
              <Td className="text-right font-medium whitespace-nowrap tabular-nums">{formatMoney(row.total)}</Td>
              <Td className="font-mono text-xs">
                {row.paymentReference ? (
                  <>
                    {row.paymentReference}
                    {row.latestProof?.utr && row.latestProof.utr !== row.paymentReference ? (
                      <span className="block font-sans text-[11px] text-muted">proof: {row.latestProof.utr}</span>
                    ) : null}
                  </>
                ) : (
                  (row.latestProof?.utr ?? <span className="text-muted">—</span>)
                )}
              </Td>
              <Td className="text-xs whitespace-nowrap">
                {row.latestProof ? formatDateTime(row.latestProof.submitted_at) : <span className="text-muted">No proof</span>}
                {row.proofCount > 1 ? <span className="block text-muted">{row.proofCount} proofs</span> : null}
              </Td>
              <Td>
                <PaymentStatusBadge status={row.paymentStatus} />
              </Td>
              <Td className="text-xs">
                <ReviewDue row={row} nowMs={nowMs} />
              </Td>
              <Td className="text-xs whitespace-nowrap text-muted">{formatDate(row.createdAt)}</Td>
              <Td className="whitespace-nowrap">
                <div className="flex items-center justify-end gap-3">
                  {row.latestProof?.file_path ? (
                    <a
                      href={proofHref(row.latestProof.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
                      aria-label={`Open payment proof for ${row.orderNumber} in a new tab`}
                    >
                      Proof <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ) : null}
                  <Link
                    href={`/admin/payments/${row.id}`}
                    className="inline-flex h-8 items-center rounded-full bg-ink px-3.5 text-xs font-medium text-paper hover:bg-ink-2"
                  >
                    Review
                  </Link>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

export default async function PaymentsQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage(ROLE_GROUPS.admin);
  const sp = await searchParams;
  const tab = asPaymentTab(firstParam(sp.tab));
  const q = sanitizeSearch(firstParam(sp.q));
  const page = parsePage(sp.page);
  const [queue, counts] = await Promise.all([listPaymentQueue({ tab, q, page }), paymentQueueCounts()]);
  const nowMs = queue.nowMs;

  return (
    <>
      <PageHeader
        title="UPI payments"
        description="Verify manual UPI payments against your bank or UPI merchant records before confirming orders. Customer screenshots are evidence, never proof that money arrived."
        actions={
          counts.overdue ? (
            <Badge tone="danger" className="px-3 py-1 text-xs">
              <AlertTriangle className="size-3.5" aria-hidden /> {counts.overdue} overdue
            </Badge>
          ) : null
        }
      />
      <div className="mb-4 space-y-4">
        <QueueTabs tab={tab} q={q} counts={counts} />
        <Suspense fallback={<div className="h-9 w-full max-w-xs rounded-full border border-line-strong bg-surface" />}>
          <SearchParamInput placeholder="Search order number, UTR or email" className="relative block w-full max-w-sm" />
        </Suspense>
      </div>
      {queue.failed ? (
        <Notice tone="danger" title="The payment queue could not be loaded">Refresh the page. If this keeps happening, check the database connection.</Notice>
      ) : queue.outOfRange ? (
        <EmptyState
          icon={<Inbox className="size-5" />}
          title="This page is empty"
          description="There are fewer results than this page number."
          action={<Link href="/admin/payments" className="text-sm font-medium underline">Back to the first page</Link>}
        />
      ) : queue.rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-5" />}
          title={q ? 'No matching orders' : tab === 'review' ? 'Nothing to verify' : 'No orders here'}
          description={
            q ? 'Try a different order number, UTR or email.' : tab === 'review' ? 'New payment proofs appear here as soon as customers submit them.' : 'Orders matching this view will appear here.'
          }
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            {queue.total} order{queue.total === 1 ? '' : 's'}
            {tab === 'review' ? ' · most urgent first' : ' · newest first'}
          </p>
          <QueueTable rows={queue.rows} nowMs={nowMs} />
          <Pagination page={page} pageCount={queue.pageCount} basePath="/admin/payments" params={{ tab: tab === 'review' ? undefined : tab, q: q || undefined }} />
        </>
      )}
    </>
  );
}
