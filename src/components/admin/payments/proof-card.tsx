// Server component: one customer-submitted payment proof with its evidence.
import Link from 'next/link';
import { AlertTriangle, ExternalLink, FileText, ImageOff } from 'lucide-react';
import type { AdminProof } from '@/lib/admin/orders';
import { PROOF_URL_TTL_SECONDS } from '@/lib/admin/orders';
import { Badge } from '@/components/ui/misc';
import { PROOF_STATUS_TEXT, PROOF_STATUS_TONE, formatBytes } from '@/components/admin/orders/constants';
import { FactList } from '@/components/admin/orders/order-summary';
import { asPurpose, PURPOSE_TEXT, PURPOSE_TONE } from '@/lib/admin/payment-plans';
import { cn, formatDateTime, formatMoney } from '@/lib/utils';

/** Admin-only route that mints a fresh short-lived signed URL and redirects to it. */
export function proofHref(proofId: string) {
  return `/admin/payments/proofs/${proofId}`;
}

export function ProofCard({ proof, isCurrent }: { proof: AdminProof; isCurrent: boolean }) {
  const isPdf = proof.file_mime === 'application/pdf';
  const purpose = asPurpose(proof.purpose) ?? 'full';
  return (
    <article className={cn('rounded-xl border bg-surface', isCurrent ? 'border-info/50 ring-1 ring-info/20' : 'border-line')} aria-label={`Payment proof submitted ${formatDateTime(proof.submitted_at)}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={PURPOSE_TONE[purpose]}>{PURPOSE_TEXT[purpose]}</Badge>
          <Badge tone={PROOF_STATUS_TONE[proof.status]}>{PROOF_STATUS_TEXT[proof.status]}</Badge>
          {isCurrent ? <Badge tone="info">Awaiting decision</Badge> : null}
          <span className="text-xs text-muted">Submitted {formatDateTime(proof.submitted_at)}</span>
        </div>
        {proof.file_path ? (
          <Link
            href={proofHref(proof.id)}
            target="_blank"
            rel="noopener noreferrer"
            prefetch={false}
            className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
          >
            Open original <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </header>
      <div className="grid gap-5 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          {proof.file_path ? (
            proof.previewUrl ? (
              <a href={proofHref(proof.id)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-line bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL; must not go through the image optimiser */}
                <img
                  src={proof.previewUrl}
                  alt={`Payment screenshot uploaded by the customer${proof.utr ? ` for UTR ${proof.utr}` : ''}`}
                  referrerPolicy="no-referrer"
                  className="max-h-[420px] w-full object-contain"
                />
              </a>
            ) : isPdf ? (
              <a
                href={proofHref(proof.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-4 text-sm hover:border-ink"
              >
                <FileText className="size-8 text-muted" aria-hidden />
                <span>
                  <span className="block font-medium">PDF receipt</span>
                  <span className="text-xs text-muted">Opens in a new tab via a link valid for {PROOF_URL_TTL_SECONDS / 60} minutes</span>
                </span>
              </a>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-line-strong p-4 text-sm text-muted">
                <ImageOff className="size-6" aria-hidden /> {proof.fileMissing ? 'The uploaded file could not be found in storage.' : 'Preview unavailable.'}
              </div>
            )
          ) : (
            <div className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-muted">No file uploaded — UTR only.</div>
          )}
          {proof.file_path ? (
            <p className="mt-2 text-[11px] text-muted">
              {proof.file_mime ?? 'unknown type'} · {formatBytes(proof.file_size)}
              {proof.file_sha256 ? <> · SHA-256 <span className="font-mono">{proof.file_sha256.slice(0, 12)}…</span></> : null}
            </p>
          ) : null}
        </div>
        <div className="space-y-4">
          <FactList
            items={[
              ['Pays for', PURPOSE_TEXT[purpose]],
              ['Expected amount', proof.expected_amount !== null ? <span className="font-semibold tabular-nums">{formatMoney(proof.expected_amount)}</span> : <span className="text-muted">—</span>],
              ['UTR', proof.utr ? <span className="font-mono font-semibold tracking-wide">{proof.utr}</span> : <span className="text-muted">Not provided</span>],
              ['Paid at (customer)', formatDateTime(proof.paid_at)],
              ['Payer UPI ID', proof.payer_upi_id ? <span className="font-mono">{proof.payer_upi_id}</span> : '—'],
              ['Reviewed', proof.reviewed_at ? `${formatDateTime(proof.reviewed_at)}${proof.reviewedByEmail ? ` · ${proof.reviewedByEmail}` : ''}` : '—'],
            ]}
          />
          {proof.duplicateOrders.length ? (
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm" role="alert">
              <p className="flex items-center gap-1.5 font-medium text-danger">
                <AlertTriangle className="size-4" aria-hidden /> This UTR also appears on another order
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {proof.duplicateOrders.map((d) => (
                  <li key={d.id}>
                    <Link href={`/admin/payments/${d.id}`} className="font-mono font-medium hover:underline">
                      {d.orderNumber}
                    </Link>{' '}
                    <span className="text-muted">({d.how})</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted">One bank credit can confirm only one order. Check the amount and timing in the bank statement.</p>
            </div>
          ) : null}
          {proof.customer_note ? (
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Customer note</p>
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm whitespace-pre-line">{proof.customer_note}</p>
            </div>
          ) : null}
          {proof.review_reason ? (
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Review reason / note</p>
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm whitespace-pre-line">{proof.review_reason}</p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
