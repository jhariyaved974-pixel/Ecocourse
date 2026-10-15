// Server components shared by the admin order detail and payment review screens.
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff, Mail, Phone, UserRound } from 'lucide-react';
import type { AdminAuditEntry, AdminOrder, AdminOrderEvent, AdminOrderItem } from '@/lib/admin/orders';
import { Badge } from '@/components/ui/misc';
import { cn, formatDateTime, formatMoney } from '@/lib/utils';
import { eventLabel } from './constants';

function safeImageSrc(src: string | null): string | null {
  if (!src) return null;
  if (src.startsWith('/') && !src.startsWith('//')) return src;
  if (/^https?:\/\/[^\s<>"]+$/i.test(src)) return src;
  return null;
}

export function OrderItemsTable({ items }: { items: AdminOrderItem[] }) {
  if (!items.length) return <p className="text-sm text-muted">No items recorded.</p>;
  return (
    <div className="relative -mx-5 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="px-5 pb-2 font-medium">Item</th>
            <th scope="col" className="px-3 pb-2 text-right font-medium">Price</th>
            <th scope="col" className="px-3 pb-2 text-right font-medium">Qty</th>
            <th scope="col" className="px-5 pb-2 text-right font-medium">Line total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const src = safeImageSrc(item.image_url);
            return (
              <tr key={item.id} className="border-t border-line align-top">
                <td className="px-5 py-3">
                  <div className="flex items-start gap-3">
                    <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element -- snapshot URL may be local or storage; thumbnails only
                        <img src={src} alt="" width={48} height={48} className="size-full object-cover" loading="lazy" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <Link href={`/products/${item.product_slug}`} className="font-medium hover:underline" target="_blank" rel="noopener noreferrer">
                        {item.product_name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        {[item.color_name, item.size_label].filter(Boolean).join(' · ')}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted">{item.sku}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                  {formatMoney(item.unit_price)}
                  {item.unit_regular_price > item.unit_price ? (
                    <span className="block text-xs text-muted line-through">{formatMoney(item.unit_regular_price)}</span>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{item.quantity}</td>
                <td className="px-5 py-3 text-right tabular-nums whitespace-nowrap">
                  {formatMoney(item.line_total)}
                  {item.discount_allocated > 0 ? <span className="block text-xs text-success">−{formatMoney(item.discount_allocated)} discount</span> : null}
                  {item.tax_amount > 0 ? (
                    <span className="block text-xs text-muted">
                      incl. {formatMoney(item.tax_amount)} tax ({(item.tax_rate_bps / 100).toFixed(item.tax_rate_bps % 100 ? 2 : 0)}%)
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; tone?: 'success' | 'danger' }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1', strong && 'border-t border-line pt-2 text-base font-semibold')}>
      <dt className={cn(!strong && 'text-muted')}>{label}</dt>
      <dd className={cn('tabular-nums', tone === 'success' && 'text-success', tone === 'danger' && 'text-danger')}>{value}</dd>
    </div>
  );
}

export function OrderTotals({ order }: { order: AdminOrder }) {
  return (
    <dl className="ml-auto max-w-sm text-sm">
      <Row label="Subtotal" value={formatMoney(order.subtotal)} />
      {order.discount_total > 0 ? (
        <Row label={<>Discount{order.coupon_code ? <span className="ml-1 font-mono text-xs">({order.coupon_code})</span> : null}</>} value={`−${formatMoney(order.discount_total)}`} tone="success" />
      ) : null}
      <Row label={`Shipping · ${order.shipping_method_name}`} value={order.shipping_total ? formatMoney(order.shipping_total) : 'Free'} />
      <Row label={order.tax_inclusive ? 'Tax (included in prices)' : 'Tax'} value={formatMoney(order.tax_total)} />
      <Row label="Order total" value={formatMoney(order.total)} strong />
      {order.refunded_total > 0 ? (
        <>
          <Row label="Refunded" value={`−${formatMoney(order.refunded_total)}`} tone="danger" />
          <Row label="Net received" value={formatMoney(order.total - order.refunded_total)} />
        </>
      ) : null}
    </dl>
  );
}

export function CustomerBlock({ order, registered }: { order: AdminOrder; registered: boolean }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 font-medium">
          <UserRound className="size-4 text-muted" aria-hidden /> {order.customer_name}
          <Badge tone={registered ? 'info' : 'neutral'}>{registered ? 'Account' : 'Guest'}</Badge>
        </p>
        <p className="flex items-center gap-2 break-all">
          <Mail className="size-4 shrink-0 text-muted" aria-hidden />
          <a href={`mailto:${order.email}`} className="hover:underline">{order.email}</a>
        </p>
        <p className="flex items-center gap-2">
          <Phone className="size-4 shrink-0 text-muted" aria-hidden />
          <a href={`tel:${order.phone.replace(/[^\d+]/g, '')}`} className="hover:underline">{order.phone}</a>
        </p>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted">Shipping address</p>
        <address className="leading-relaxed not-italic">
          {order.customer_name}
          <br />
          {order.ship_line1}
          {order.ship_line2 ? <><br />{order.ship_line2}</> : null}
          {order.ship_landmark ? <><br />Landmark: {order.ship_landmark}</> : null}
          <br />
          {order.ship_city}, {order.ship_state} {order.ship_postal_code}
          <br />
          India
        </address>
      </div>
      {order.customer_note ? (
        <div>
          <p className="mb-1 text-xs font-medium text-muted">Customer note</p>
          <p className="rounded-lg bg-surface-2 px-3 py-2 whitespace-pre-line">{order.customer_note}</p>
        </div>
      ) : null}
    </div>
  );
}

const ACTOR_TEXT: Record<string, string> = { customer: 'Customer', staff: 'Staff', system: 'System', gateway: 'Payment gateway' };

export function OrderTimeline({ events }: { events: AdminOrderEvent[] }) {
  if (!events.length) return <p className="text-sm text-muted">No events yet.</p>;
  return (
    <ol className="relative space-y-5 border-l border-line pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={cn(
              'absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-surface',
              e.event_type === 'note' ? 'bg-line-strong' : e.is_customer_visible ? 'bg-ink' : 'bg-warning',
            )}
            aria-hidden
          />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-medium">{eventLabel(e.event_type)}</span>
            {e.from_status || e.to_status ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                {e.from_status ? <span className="font-mono">{e.from_status}</span> : null}
                {e.from_status && e.to_status ? <ArrowRight className="size-3" aria-label="to" /> : null}
                {e.to_status ? <span className="font-mono">{e.to_status}</span> : null}
              </span>
            ) : null}
            <Badge tone={e.is_customer_visible ? 'outline' : 'warning'} className="gap-1">
              {e.is_customer_visible ? <Eye className="size-3" aria-hidden /> : <EyeOff className="size-3" aria-hidden />}
              {e.is_customer_visible ? 'Customer-visible' : 'Internal'}
            </Badge>
          </div>
          {e.message ? <p className="mt-1 text-sm whitespace-pre-line text-ink-2">{e.message}</p> : null}
          <p className="mt-1 text-xs text-muted">
            {formatDateTime(e.created_at)} · {ACTOR_TEXT[e.actor_type] ?? e.actor_type}
            {e.actorEmail ? ` (${e.actorEmail})` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}

function detailPairs(details: unknown): [string, string][] {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return [];
  return Object.entries(details as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')
    .map(([k, v]) => [
      k.replace(/_/g, ' '),
      typeof v === 'number' && /amount|total/.test(k) ? formatMoney(v) : String(v).slice(0, 200),
    ] as [string, string])
    .slice(0, 10);
}

export function AuditTrail({ entries }: { entries: AdminAuditEntry[] }) {
  if (!entries.length) return <p className="text-sm text-muted">No audit entries for this order yet.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {entries.map((a) => {
        const pairs = detailPairs(a.details);
        return (
          <li key={a.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-xs font-semibold">{a.action}</span>
              <span className="text-xs text-muted">{formatDateTime(a.created_at)}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {a.actor_email ?? 'system'}
              {a.actor_role ? ` · ${a.actor_role}` : ''}
            </p>
            {pairs.length ? (
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                {pairs.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted capitalize">{k}</dt>
                    <dd className="break-all">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Key/value list used in side panels. */
export function FactList({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 text-right break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
