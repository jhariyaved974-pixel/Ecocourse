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
import { amountDue, asPurpose, duePurpose, PAYMENT_PLAN_TEXT, PURPOSE_TEXT, PURPOSE_TONE, type PaymentPurpose } from '@/lib/admin/payment-plans';
import { cn, formatDate, formatDateTime, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'UPI payments' };

const TAB_LABEL: Record<PaymentTab, string> = {
  review: 'Needs verification',
  attention: 'Late / attention',
  balance: 'Balance due',
  rejected: 'Rejected',
  verified: 'Verified',
  all: 'All UPI orders',
};

function QueueTabs({ tab, q, counts }: { tab: PaymentTab; q: string; counts: { review: number; attention: number; balance: number } }) {
  const tabs: PaymentTab[] = ['review', 'attention', 'balance', 'rejected', 'verified', 'all'];
  return (
    <nav aria-label="Payment queue" className="relative -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => {
          const sp = new URLSearchParams();
          if (t !== 'review') sp.set('tab', t);
          if (q) sp.set('q', q);
          const qs = sp.toString();
          const count = t === 'review' ? counts.review : t === 'attention' ? counts.attention : t === 'balance' ? counts.balance : null;
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
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                      t === 'attention' ? 'bg-danger/10 text-danger' : t === 'balance' ? 'bg-warning/10 text-warning' : 'bg-info/10 text-info',
                    )}
                  >
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

/** Review deadline while a proof waits; balance due date while a half-prepaid balance is outstanding. */
function DueCell({ row, nowMs }: { row: PaymentQueueRow; nowMs: number }) {
  const inReview = row.paymentStatus === 'proof_submitted' || row.paymentStatus === 'verification_pending';
  if (inReview && row.reviewDueAt) {
    const overdue = new Date(row.reviewDueAt).getTime() < nowMs;
    return (
      <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', overdue ? 'font-semibold text-danger' : 'text-ink-2')}>
        {overdue ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
        <span className="sr-only">Review due </span>
        {formatDateTime(row.reviewDueAt)}
        {overdue ? <span className="sr-only">(overdue)</span> : null}
      </span>
    );
  }
  if (row.paymentStatus === 'partially_paid' && row.balanceDueAt) {
    const overdue = new Date(row.balanceDueAt).getTime() <= nowMs;
    return (
      <span className={cn('inline-flex flex-col whitespace-nowrap', overdue ? 'font-semibold text-danger' : 'text-ink-2')}>
        <span className="text-[11px] font-normal text-muted">Balance due</span>
        <span className="inline-flex items-center gap-1">
          {overdue ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
          {formatDate(row.balanceDueAt)}
          {overdue ? ' (overdue)' : ''}
        </span>
      </span>
    );
  }
  return <span className="text-muted">—</span>;
}

/** The amount staff must find in the bank records: the open proof's expected amount, else what is due now. */
function rowAmount(row: PaymentQueueRow): { amount: number; purpose: PaymentPurpose; open: boolean } | null {
  const proof = row.latestProof;
  const open = proof && (proof.status === 'submitted' || proof.status === 'under_review');
  if (proof && open) {
    const purpose = asPurpose(proof.purpose) ?? 'full';
    const fallback = purpose === 'balance' ? row.total - row.amountPaid : row.advanceAmount;
    return { amount: proof.expected_amount ?? fallback, purpose, open: true };
  }
  const o = {
    order_status: row.orderStatus,
    payment_status: row.paymentStatus,
    payment_plan: row.paymentPlan,
    total: row.total,
    advance_amount: row.advanceAmount,
    amount_paid: row.amountPaid,
  };
  const due = amountDue(o);
  const purpose = duePurpose(o);
  return due > 0 && purpose ? { amount: due, purpose, open: false } : null;
}

function AmountCell({ row }: { row: PaymentQueueRow }) {
  const a = rowAmount(row);
  if (!a) return <span className="text-muted">—</span>;
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={cn('font-medium whitespace-nowrap tabular-nums', !a.open && 'text-ink-2')}>{formatMoney(a.amount)}</span>
      <Badge tone={PURPOSE_TONE[a.purpose]}>{a.open ? PURPOSE_TEXT[a.purpose] : `${PURPOSE_TEXT[a.purpose]} due`}</Badge>
    </div>
  );
}

/** The UTR to check: the open proof's, with the reference that already verified money underneath. */
function UtrCell({ row }: { row: PaymentQueueRow }) {
  const proof = row.latestProof;
  const open = proof && (proof.status === 'submitted' || proof.status === 'under_review');
  const confirmed = row.paymentReference;
  const main = open ? (proof.utr ?? null) : (confirmed ?? proof?.utr ?? null);
  const secondary = open && confirmed && confirmed !== proof.utr ? confirmed : !open && confirmed && proof?.utr && proof.utr !== confirmed ? proof.utr : null;
  const secondaryLabel = open ? (row.amountPaid > 0 ? 'advance' : 'confirmed') : 'proof';
  return (
    <>
      {main ?? <span className="text-muted">—</span>}
      {secondary ? (
        <span className="block font-sans text-[11px] text-muted">
          {secondaryLabel}: <span className="font-mono">{secondary}</span>
        </span>
      ) : null}
    </>
  );
}

function PlanCell({ row }: { row: PaymentQueueRow }) {
  return (
    <div className="text-xs whitespace-nowrap">
      <p className="font-medium text-ink">{PAYMENT_PLAN_TEXT[row.paymentPlan]}</p>
      <p className="text-muted tabular-nums">
        Paid {formatMoney(row.amountPaid)} of {formatMoney(row.total)}
      </p>
    </div>
  );
}

function QueueTable({ rows, nowMs }: { rows: PaymentQueueRow[]; nowMs: number }) {
  return (
    <TableWrap>
      <Table className="min-w-[1100px]">
        <thead>
          <tr>
            <Th>Order</Th>
            <Th>Customer</Th>
            <Th>Plan</Th>
            <Th className="text-right">Amount to verify</Th>
            <Th>UTR</Th>
            <Th>Proof submitted</Th>
            <Th>Status</Th>
            <Th>Due</Th>
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
                <span className="mt-0.5 block text-[11px] text-muted">Placed {formatDate(row.createdAt)}</span>
              </Td>
              <Td className="min-w-[200px]">
                <p className="font-medium">{row.customerName}</p>
                <p className="text-xs break-words text-muted">{row.email}</p>
              </Td>
              <Td>
                <PlanCell row={row} />
              </Td>
              <Td className="text-right">
                <AmountCell row={row} />
              </Td>
              <Td className="font-mono text-xs">
                <UtrCell row={row} />
              </Td>
              <Td className="text-xs whitespace-nowrap">
                {row.latestProof ? formatDateTime(row.latestProof.submitted_at) : <span className="text-muted">No proof</span>}
                {row.proofCount > 1 ? <span className="block text-muted">{row.proofCount} proofs</span> : null}
              </Td>
              <Td>
                <PaymentStatusBadge status={row.paymentStatus} />
              </Td>
              <Td className="text-xs">
                <DueCell row={row} nowMs={nowMs} />
              </Td>
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
        description="Verify manual UPI payments against your bank or UPI merchant records: full payments and advances confirm orders, balances must be verified before dispatch. Customer screenshots are evidence, never proof that money arrived."
        actions={
          counts.overdue || counts.balanceOverdue ? (
            <>
              {counts.overdue ? (
                <Badge tone="danger" className="px-3 py-1 text-xs">
                  <AlertTriangle className="size-3.5" aria-hidden /> {counts.overdue} review{counts.overdue === 1 ? '' : 's'} overdue
                </Badge>
              ) : null}
              {counts.balanceOverdue ? (
                <Badge tone="warning" className="px-3 py-1 text-xs">
                  <AlertTriangle className="size-3.5" aria-hidden /> {counts.balanceOverdue} balance{counts.balanceOverdue === 1 ? '' : 's'} overdue
                </Badge>
              ) : null}
            </>
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
          title={q ? 'No matching orders' : tab === 'review' ? 'Nothing to verify' : tab === 'balance' ? 'No balances due' : 'No orders here'}
          description={
            q
              ? 'Try a different order number, UTR or email.'
              : tab === 'review'
                ? 'New payment proofs appear here as soon as customers submit them.'
                : tab === 'balance'
                  ? 'Half-prepaid orders whose advance is verified and whose balance is still unpaid appear here.'
                  : 'Orders matching this view will appear here.'
          }
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            {queue.total} order{queue.total === 1 ? '' : 's'}
            {tab === 'review' ? ' · most urgent first' : tab === 'balance' ? ' · earliest due date first' : ' · newest first'}
          </p>
          <QueueTable rows={queue.rows} nowMs={nowMs} />
          <Pagination page={page} pageCount={queue.pageCount} basePath="/admin/payments" params={{ tab: tab === 'review' ? undefined : tab, q: q || undefined }} />
        </>
      )}
    </>
  );
}
