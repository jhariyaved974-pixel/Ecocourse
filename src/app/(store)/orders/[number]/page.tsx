import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Clock3, PackageCheck, Truck } from 'lucide-react';
import { canSubmitProof, getCustomerOrder, PAYMENT_STATUS_LABEL, ORDER_STATUS_LABEL, type CustomerOrder } from '@/lib/orders/customer';
import { getPublicPaymentSettings, type PublicPaymentSettings } from '@/lib/payments/settings';
import { buildUpiUri } from '@/lib/payments/upi';
import { getStoreSettings } from '@/lib/content/queries';
import { UpiPaymentPanel } from '@/components/orders/upi-payment-panel';
import { RazorpayPayButton } from '@/components/orders/razorpay-pay-button';
import { ProofForm } from '@/components/orders/proof-form';
import { OrderProgress } from '@/components/orders/order-progress';
import { Badge, Notice, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { cn, formatDateTime, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Your order', robots: { index: false, follow: false } };

async function upiDetails(order: CustomerOrder, settings: PublicPaymentSettings, payeeName: string) {
  const uri = buildUpiUri({
    payeeVpa: settings.upiId,
    payeeName,
    amountPaise: order.total,
    orderNumber: order.orderNumber,
    includeTransactionRef: settings.includeTransactionRef,
  });
  const qr = settings.showQr
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await QRCode.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#111111', light: '#ffffff' } }))}`
    : null;
  return { uri, qr };
}

function StatusHeader({ order }: { order: CustomerOrder }) {
  const awaiting = order.paymentStatus === 'proof_submitted' || order.paymentStatus === 'verification_pending';
  const tone =
    order.orderStatus === 'cancelled' ? 'danger' : order.paymentStatus === 'verified_paid' ? 'success' : awaiting ? 'info' : 'warning';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={tone}>{ORDER_STATUS_LABEL[order.orderStatus]}</Badge>
      <Badge tone="neutral">{PAYMENT_STATUS_LABEL[order.paymentStatus]}</Badge>
    </div>
  );
}

function AwaitingVerification({ order, settings }: { order: CustomerOrder; settings: PublicPaymentSettings | null }) {
  return (
    <section className="rounded-[var(--radius)] border border-info/30 bg-info/5 p-6" aria-labelledby="verify-heading">
      <div className="flex items-start gap-4">
        <Clock3 className="mt-0.5 size-6 shrink-0 text-info" />
        <div className="space-y-2 text-sm">
          <h2 id="verify-heading" className="text-lg font-semibold">Awaiting Payment Verification</h2>
          <p className="text-ink-2">
            We received your payment details{order.latestProof?.submittedAt ? ` on ${formatDateTime(order.latestProof.submittedAt)}` : ''}. Our team is checking
            our bank/UPI records for a credit of <strong>{formatMoney(order.total)}</strong>
            {order.latestProof?.utr ? <> with reference <span className="font-mono">{order.latestProof.utr}</span></> : null}.
          </p>
          <p className="text-ink-2">
            Your order will be confirmed as soon as the payment is verified{settings ? ` — usually within ${settings.reviewDeadlineHours} hours` : ''}. We&apos;ll email you at {order.email}.
            No further action is needed.
          </p>
        </div>
      </div>
    </section>
  );
}

function Fulfilment({ order }: { order: CustomerOrder }) {
  const icon = order.orderStatus === 'shipped' || order.orderStatus === 'delivered' ? <Truck className="size-6 text-success" /> : <PackageCheck className="size-6 text-success" />;
  return (
    <section className="rounded-[var(--radius)] border border-success/30 bg-success/5 p-6" aria-label="Order confirmed">
      <div className="flex items-start gap-4">
        {icon}
        <div className="space-y-1 text-sm">
          <h2 className="text-lg font-semibold">
            {order.orderStatus === 'delivered' ? 'Delivered' : order.orderStatus === 'shipped' ? 'On its way' : 'Payment verified — order confirmed'}
          </h2>
          {order.paidAt ? <p className="text-ink-2">Payment of {formatMoney(order.total)} verified on {formatDateTime(order.paidAt)}.</p> : null}
          {order.tracking.number ? (
            <p className="text-ink-2">
              {order.tracking.carrier ? `${order.tracking.carrier} · ` : ''}Tracking number <span className="font-mono">{order.tracking.number}</span>
              {order.tracking.url ? (
                <>
                  {' '}·{' '}
                  <a href={order.tracking.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4">Track shipment</a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

async function OrderContent({ params }: { params: PageProps<'/orders/[number]'>['params'] }) {
  const { number } = await params;
  const [order, settings, store] = await Promise.all([getCustomerOrder(decodeURIComponent(number)), getPublicPaymentSettings(), getStoreSettings()]);
  if (!order) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <h1 className="font-display text-5xl">Order not found</h1>
        <p className="mt-4 text-muted">
          For your privacy, orders open only from the link in your order email, on the device you ordered from, or when you&apos;re signed in to the account
          that placed it.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/orders/track">Find my order</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/login?next=${encodeURIComponent(`/orders/${number}`)}`}>Sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  const showPay = canSubmitProof(order) && settings !== null;
  const payOnline = order.paymentMethod === 'razorpay' && order.paymentStatus === 'unpaid' && order.orderStatus === 'pending_payment';
  const late = order.orderStatus === 'cancelled' && order.expired;
  const awaiting = order.paymentStatus === 'proof_submitted' || order.paymentStatus === 'verification_pending';
  const fulfilled = ['confirmed', 'processing', 'shipped', 'delivered'].includes(order.orderStatus);
  const payeeName = settings?.payeeName || store.store_name;
  const upi = showPay && settings ? await upiDetails(order, settings, payeeName) : null;
  const rejected = order.paymentStatus === 'rejected' && order.latestProof && ['resubmission_requested', 'rejected'].includes(order.latestProof.status);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
      <div className="space-y-8">
        <div>
          <p className="eyebrow text-muted">Order</p>
          <h1 className="mt-2 font-mono text-3xl font-semibold tracking-tight md:text-4xl">{order.orderNumber}</h1>
          <p className="mt-2 text-sm text-muted">Placed {formatDateTime(order.createdAt)}</p>
          <div className="mt-4">
            <StatusHeader order={order} />
          </div>
        </div>
        <OrderProgress order={order} />

        {order.paymentStatus === 'unpaid' && order.orderStatus === 'pending_payment' ? (
          <Notice tone="success" title="Order received — complete your payment">
            {order.paymentMethod === 'razorpay'
              ? 'Your items are reserved. Complete the payment below to confirm your order.'
              : 'Your items are reserved. Pay the exact amount below, then submit the payment details so we can verify it.'}
          </Notice>
        ) : null}
        {rejected ? (
          <Notice tone="danger" title={order.latestProof?.status === 'resubmission_requested' ? 'Action needed: we could not verify your payment yet' : 'Payment could not be verified'}>
            {order.latestProof?.reviewReason ?? 'Please check the payment details and try again.'}
            {order.orderStatus === 'pending_payment' ? ' You can submit updated details below.' : ' Please contact us if money was debited from your account.'}
          </Notice>
        ) : null}
        {late && showPay ? (
          <Notice tone="warning" title="Reservation expired">
            We didn&apos;t receive payment details in time, so the reserved stock was released. Please don&apos;t pay now unless you already have — instead,
            place a new order. If you already paid, submit the details below and we&apos;ll sort it out.
          </Notice>
        ) : null}

        {showPay && upi && settings && !late ? (
          <UpiPaymentPanel
            upiId={settings.upiId}
            payeeName={payeeName}
            amount={order.total}
            orderNumber={order.orderNumber}
            uri={upi.uri}
            qrDataUrl={upi.qr}
            instructions={settings.customerInstructions}
            expiresAt={order.reservationExpiresAt}
            late={late}
          />
        ) : null}
        {payOnline ? (
          settings?.razorpayEnabled ? (
            <RazorpayPayButton orderNumber={order.orderNumber} amount={order.total} />
          ) : (
            <Notice tone="warning" title="Online payment is unavailable right now">
              Please try again later or contact us. Your order stays reserved until {order.reservationExpiresAt ? formatDateTime(order.reservationExpiresAt) : 'the payment window ends'}.
            </Notice>
          )
        ) : null}
        {showPay && settings ? <ProofForm orderNumber={order.orderNumber} amount={order.total} upiId={settings.upiId} requireProof={settings.requireProof} late={late} /> : null}
        {awaiting ? <AwaitingVerification order={order} settings={settings} /> : null}
        {fulfilled ? <Fulfilment order={order} /> : null}
        {order.paymentStatus === 'refund_pending' || order.paymentStatus === 'refunded' ? (
          <Notice tone="info" title={order.paymentStatus === 'refunded' ? 'Refunded' : 'Refund in progress'}>
            {order.paymentStatus === 'refunded'
              ? `We refunded ${formatMoney(order.refundedTotal)} to your original payment method.`
              : 'Your refund is being processed. UPI refunds usually reach your account within 5–7 business days.'}
          </Notice>
        ) : null}

        <section aria-labelledby="updates-heading">
          <h2 id="updates-heading" className="text-lg font-semibold">Updates</h2>
          <ol className="mt-4 space-y-4 border-l border-line pl-5">
            {[...order.events].reverse().map((e, i) => (
              <li key={`${e.createdAt}-${i}`} className="relative text-sm">
                <span className={cn('absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-paper', i === 0 ? 'bg-ink' : 'bg-line-strong')} />
                <p className="text-ink-2">{e.message ?? e.type.replace(/_/g, ' ')}</p>
                <p className="text-xs text-muted">{formatDateTime(e.createdAt)}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="h-fit space-y-6 rounded-[var(--radius)] border border-line bg-surface p-6 lg:sticky lg:top-24" aria-label="Order details">
        <ul className="space-y-4">
          {order.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                {item.image ? <Image src={item.image} alt="" fill sizes="64px" className="object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                {item.productSlug ? (
                  <Link href={`/products/${item.productSlug}`} className="font-medium hover:underline">{item.productName}</Link>
                ) : (
                  <p className="font-medium">{item.productName}</p>
                )}
                <p className="text-xs text-muted">{[item.colorName, `UK ${item.sizeLabel.replace(/^UK\s*/i, '')}`, `Qty ${item.quantity}`].filter(Boolean).join(' · ')}</p>
              </div>
              <p className="text-sm tabular-nums">{formatMoney(item.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <dl className="space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatMoney(order.subtotal)}</dd></div>
          {order.discountTotal > 0 ? (
            <div className="flex justify-between text-success"><dt>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</dt><dd className="tabular-nums">−{formatMoney(order.discountTotal)}</dd></div>
          ) : null}
          <div className="flex justify-between"><dt className="text-muted">Shipping · {order.shippingMethodName}</dt><dd className="tabular-nums">{order.shippingTotal ? formatMoney(order.shippingTotal) : 'Free'}</dd></div>
          {!order.taxInclusive && order.taxTotal ? (
            <div className="flex justify-between"><dt className="text-muted">GST</dt><dd className="tabular-nums">{formatMoney(order.taxTotal)}</dd></div>
          ) : null}
          <div className="flex justify-between border-t border-line pt-3 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(order.total)}</dd></div>
          {order.taxInclusive && order.taxTotal ? <p className="text-right text-xs text-muted">Includes {formatMoney(order.taxTotal)} GST</p> : null}
        </dl>
        <div className="space-y-1 border-t border-line pt-4 text-sm">
          <p className="font-medium">Delivering to</p>
          <p className="text-muted">
            {order.customerName}
            <br />
            {[order.address.line1, order.address.line2, order.address.landmark].filter(Boolean).join(', ')}
            <br />
            {order.address.city}, {order.address.state} {order.address.postal_code}
            <br />
            {order.phone}
          </p>
        </div>
        <p className="flex items-center gap-2 border-t border-line pt-4 text-xs text-muted">
          <CheckCircle2 className="size-4" /> Questions? Reply to your order email and mention {order.orderNumber}.
        </p>
      </aside>
    </div>
  );
}

export default function OrderPage(props: PageProps<'/orders/[number]'>) {
  return (
    <div className="container-x py-10 md:py-14">
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-80" />
            <Skeleton className="mt-6 h-80 w-full" />
          </div>
        }
      >
        <OrderContent params={props.params} />
      </Suspense>
    </div>
  );
}
