import type { Quote } from '@/lib/orders/quote';
import { cn, formatMoney } from '@/lib/utils';

export function SummaryRow({ label, value, strong, tone }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; tone?: 'success' }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4', strong ? 'text-base font-semibold' : 'text-sm')}>
      <dt className={strong ? undefined : 'text-muted'}>{label}</dt>
      <dd className={cn('tabular-nums', tone === 'success' && 'text-success')}>{value}</dd>
    </div>
  );
}

/** Totals exactly as computed by the server quote. */
export function OrderTotals({ quote, loading, shippingPending }: { quote: Quote | null; loading?: boolean; shippingPending?: boolean }) {
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
    </dl>
  );
}
