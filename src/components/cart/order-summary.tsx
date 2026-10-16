import type { Quote } from '@/lib/orders/quote';
import type { PaymentPlan } from '@/lib/orders/payment-plan';
import { cn, formatMoney } from '@/lib/utils';

export function SummaryRow({ label, value, strong, tone }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; tone?: 'success' }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4', strong ? 'text-base font-semibold' : 'text-sm')}>
      <dt className={strong ? undefined : 'text-muted'}>{label}</dt>
      <dd className={cn('tabular-nums', tone === 'success' && 'text-success')}>{value}</dd>
    </div>
  );
}

/**
 * Totals exactly as computed by the server quote. With a payment plan (checkout)
 * it also shows what is due now and, for Half prepaid, the balance paid online
 * before dispatch.
 */
export function OrderTotals({ quote, loading, shippingPending, plan }: { quote: Quote | null; loading?: boolean; shippingPending?: boolean; plan?: PaymentPlan }) {
  if (!quote) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-4 w-full" />
        ))}
      </div>
    );
  }
  const shipping = quote.shipping;
  return (
    <dl className={cn('space-y-2.5 transition-opacity', loading && 'opacity-50')} aria-busy={loading}>
      <SummaryRow label={`Subtotal (${quote.itemCount} ${quote.itemCount === 1 ? 'item' : 'items'})`} value={formatMoney(quote.subtotal)} />
      {quote.discount > 0 ? <SummaryRow label={`Discount${quote.coupon ? ` (${quote.coupon.code})` : ''}`} value={`−${formatMoney(quote.discount)}`} tone="success" /> : null}
      <SummaryRow
        label={shipping ? `Shipping · ${shipping.name}` : 'Shipping'}
        value={shippingPending ? 'Calculated next' : shipping ? (shipping.fee === 0 ? 'Free' : formatMoney(shipping.fee)) : '—'}
      />
      {quote.tax.enabled && !quote.tax.inclusive ? <SummaryRow label={quote.tax.label} value={formatMoney(quote.tax.amount)} /> : null}
      <div className="border-t border-line pt-3">
        <SummaryRow label="Total" value={formatMoney(quote.total)} strong />
        {quote.tax.enabled && quote.tax.inclusive && quote.tax.amount > 0 ? (
          <p className="mt-1 text-right text-xs text-muted">Includes {formatMoney(quote.tax.amount)} {quote.tax.label}</p>
        ) : null}
      </div>
      {plan ? <DueNow quote={quote} plan={plan} /> : null}
    </dl>
  );
}

function DueNow({ quote, plan }: { quote: Quote; plan: PaymentPlan }) {
  const half = plan === 'half_prepaid' && quote.halfPrepaidAvailable;
  return (
    <div className="space-y-2 rounded-xl bg-surface-2 px-4 py-3" data-testid="due-now">
      <SummaryRow label={half ? `Due now (${quote.advancePercent}% advance)` : 'Due now'} value={formatMoney(half ? quote.halfPrepaidAdvance : quote.total)} strong />
      {half ? (
        <>
          <SummaryRow label="Balance, paid online before dispatch" value={formatMoney(quote.halfPrepaidBalance)} />
          <p className="text-xs text-muted">No cash on delivery. We dispatch once the balance is verified.</p>
        </>
      ) : null}
    </div>
  );
}
