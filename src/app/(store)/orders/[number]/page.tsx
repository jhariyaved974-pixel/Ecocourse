import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Clock3, HandCoins, PackageCheck, Truck } from 'lucide-react';
import { canPayOnline, canSubmitProof, getCustomerOrder, PAYMENT_STATUS_LABEL, ORDER_STATUS_LABEL, type CustomerOrder } from '@/lib/orders/customer';
import { PAYMENT_PLAN_LABEL, paymentDue, pendingVerification, type PaymentDue } from '@/lib/orders/payment-plan';
import { getPublicPaymentSettings, type PublicPaymentSettings } from '@/lib/payments/settings';
import { buildUpiUri, upiReference } from '@/lib/payments/upi';
import { getStoreSettings } from '@/lib/content/queries';
import { UpiPaymentPanel } from '@/components/orders/upi-payment-panel';
import { RazorpayPayButton } from '@/components/orders/razorpay-pay-button';
import { ProofForm } from '@/components/orders/proof-form';
import { OrderProgress } from '@/components/orders/order-progress';
import { PaymentSummary } from '@/components/orders/payment-summary';
import { Badge, Notice, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { cn, formatDate, formatDateTime, formatMoney } from '@/lib/utils';
import { lineDetails } from '@/lib/catalog/variants';

export const metadata: Metadata = { title: 'Your order', robots: { index: false, follow: false } };

/** UPI deep link + QR for the amount due now (advance, full or balance), from the database amounts. */
async function upiDetails(order: CustomerOrder, due: PaymentDue, settings: PublicPaymentSettings, payeeName: string) {
  const reference = upiReference(order.orderNumber, due.purpose);
  const uri = buildUpiUri({
    payeeVpa: settings.upiId,
    payeeName,
    amountPaise: due.amount,
    orderNumber: reference,
    includeTransactionRef: settings.includeTransactionRef,
  });
  const qr = settings.showQr
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await QRCode.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#111111', light: '#ffffff' } }))}`
    : null;
  return { uri, qr, reference };
}

/** The balance due date has passed (the database also records a 'balance_overdue' event). */
function isBalanceOverdue(order: CustomerOrder): boolean {
  if (order.paymentPlan !== 'half_prepaid' || order.amountPaid <= 0 || order.amountPaid >= order.total || order.orderStatus === 'cancelled') return false;
  if (order.events.some((e) => e.type === 'balance_overdue')) return true;
  return order.balanceDueAt !== null && new Date(order.balanceDueAt).getTime() < Date.now();
}

function StatusHeader({ order }: { order: CustomerOrder }) {
  const awaiting = order.paymentStatus === 'proof_submitted' || order.paymentStatus === 'verification_pending';
  const tone =
    order.orderStatus === 'cancelled'
      ? 'danger'
      : order.paymentStatus === 'verified_paid'
        ? 'success'
        : awaiting || order.paymentStatus === 'partially_paid'
          ? 'info'
          : 'warning';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={tone}>{ORDER_STATUS_LABEL[order.orderStatus]}</Badge>
      <Badge tone="neutral">{PAYMENT_STATUS_LABEL[order.paymentStatus]}</Badge>
      {order.paymentPlan === 'half_prepaid' ? <Badge tone="neutral">{PAYMENT_PLAN_LABEL.half_prepaid}</Badge> : null}
    </div>
  );
}

function AwaitingVerification({ order, settings }: { order: CustomerOrder; settings: PublicPaymentSettings | null }) {
  const pending = pendingVerification(order);
  if (!pending) return null;
  const balance = pending.purpose === 'balance';
  const within = settings ? ` — usually within ${settings.reviewDeadlineHours} hours` : '';
  return (
    <section className="rounded-[var(--radius)] border border-info/30 bg-info/5 p-6" aria-labelledby="verify-heading">
      <div className="flex items-start gap-4">
        <Clock3 className="mt-0.5 size-6 shrink-0 text-info" />
        <div className="space-y-2 text-sm">
          <h2 id="verify-heading" className="text-lg font-semibold">Awaiting Payment Verification</h2>
          <p className="text-ink-2">
            We received your {balance ? 'balance ' : pending.purpose === 'advance' ? 'advance ' : ''}payment details
            {order.latestProof?.submittedAt ? ` on ${formatDateTime(order.latestProof.submittedAt)}` : ''}. Our team is checking our bank/UPI records for a
            credit of <strong>{formatMoney(pending.amount)}</strong>
            {balance ? (
              <>
                {' '}(payment note <span className="font-mono">{upiReference(order.orderNumber, 'balance')}</span>)
              </>
            ) : null}
            {order.latestProof?.utr ? <> with reference <span className="font-mono">{order.latestProof.utr}</span></> : null}.
          </p>
          {balance ? (
            <p className="text-ink-2">
              Your order stays confirmed. We dispatch it once the balance is verified{within}. We&apos;ll email you at {order.email}. No further action is needed.
            </p>
          ) : pending.purpose === 'advance' ? (
            <p className="text-ink-2">
              Your order will be confirmed as soon as the advance is verified{within}. After that, the balance of{' '}
              <strong>{formatMoney(order.balanceAmount)}</strong> is paid online before dispatch. We&apos;ll email you at {order.email}.
            </p>
          ) : (
            <p className="text-ink-2">
              Your order will be confirmed as soon as the payment is verified{within}. We&apos;ll email you at {order.email}. No further action is needed.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Half prepaid: the advance is verified and the balance is due before dispatch. */
function BalanceDue({ order, amount, overdue }: { order: CustomerOrder; amount: number; overdue: boolean }) {
  return (
    <section className="rounded-[var(--radius)] border border-success/30 bg-success/5 p-6" aria-labelledby="balance-heading">
      <div className="flex items-start gap-4">
        <HandCoins className="mt-0.5 size-6 shrink-0 text-success" />
        <div className="space-y-2 text-sm">
          <h2 id="balance-heading" className="text-lg font-semibold">Pay balance</h2>
          <p className="text-ink-2">
            Your advance of <strong>{formatMoney(order.amountPaid)}</strong> was verified{order.paidAt ? ` on ${formatDate(order.paidAt)}` : ''} and your order is
            confirmed. Pay the balance of <strong>{formatMoney(amount)}</strong> online
            {order.balanceDueAt ? (
              <>
                {' '}by <strong>{formatDate(order.balanceDueAt)}</strong>
              </>
            ) : null}
            . We dispatch your order once the balance is verified.
          </p>
          {overdue ? (
            <p className="font-medium text-danger">
              The due date has passed. Please pay the balance below, or reply to your order email if you have a question or no longer want the order.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Fulfilment({ order }: { order: CustomerOrder }) {
  const icon = order.orderStatus === 'shipped' || order.orderStatus === 'delivered' ? <Truck className="size-6 text-success" /> : <PackageCheck className="size-6 text-success" />;
  const half = order.paymentPlan === 'half_prepaid';
  return (
    <section className="rounded-[var(--radius)] border border-success/30 bg-success/5 p-6" aria-label="Order confirmed">
      <div className="flex items-start gap-4">
        {icon}
        <div className="space-y-1 text-sm">
          <h2 className="text-lg font-semibold">
            {order.orderStatus === 'delivered'
              ? 'Delivered'
              : order.orderStatus === 'shipped'
                ? 'On its way'
                : half
                  ? 'Balance verified — order fully paid'
                  : 'Payment verified — order confirmed'}
          </h2>
          {half ? (
            <>
              {order.paidAt ? <p className="text-ink-2">Advance of {formatMoney(order.advanceAmount)} verified on {formatDateTime(order.paidAt)}.</p> : null}
              {order.balancePaidAt ? <p className="text-ink-2">Balance of {formatMoney(order.balanceAmount)} verified on {formatDateTime(order.balancePaidAt)}.</p> : null}
            </>
          ) : order.paidAt ? (
            <p className="text-ink-2">Payment of {formatMoney(order.total)} verified on {formatDateTime(order.paidAt)}.</p>
          ) : null}
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

function Row({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex justify-between gap-4', className)}>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
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

  // What can be paid now (the full amount, the advance or the balance): amounts come from the database.
  const due = paymentDue(order);
  const half = order.paymentPlan === 'half_prepaid';
  const showPay = due !== null && canSubmitProof(order) && settings !== null;
  const payOnline = due !== null && canPayOnline(order);
  const late = due?.late === true;
  const balanceDue = due?.purpose === 'balance';
  const awaiting = order.paymentStatus === 'proof_submitted' || order.paymentStatus === 'verification_pending';
  const fulfilled = ['confirmed', 'processing', 'shipped', 'delivered'].includes(order.orderStatus);
  // Half prepaid orders are only "fully confirmed" once the balance is verified; until then the balance cards explain the state.
  const showFulfilment = fulfilled && (!half || order.paymentStatus === 'verified_paid');
  const overdue = isBalanceOverdue(order);
  const payeeName = settings?.payeeName || store.store_name;
  const upi = showPay && settings && due && !late ? await upiDetails(order, due, settings, payeeName) : null;
  const proofPurpose = order.latestProof?.purpose ?? null;
  const rejected =
    order.paymentStatus === 'rejected' && order.latestProof && proofPurpose !== 'balance' && ['resubmission_requested', 'rejected'].includes(order.latestProof.status);
  const balanceRejected =
    order.paymentStatus === 'partially_paid' && order.latestProof && proofPurpose === 'balance' && ['resubmission_requested', 'rejected'].includes(order.latestProof.status);

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
        <PaymentSummary order={order} overdue={overdue} />

        {order.paymentStatus === 'unpaid' && order.orderStatus === 'pending_payment' ? (
          <Notice tone="success" title="Order received — complete your payment">
            {half ? (
              <>
                Your items are reserved. Pay the advance of <strong>{formatMoney(order.advanceAmount)}</strong> below
                {order.paymentMethod === 'razorpay' ? ' to confirm your order.' : ', then submit the payment details so we can verify it.'} The balance of{' '}
                <strong>{formatMoney(order.balanceAmount)}</strong> is paid online after your order is confirmed, before dispatch.
              </>
            ) : order.paymentMethod === 'razorpay' ? (
              'Your items are reserved. Complete the payment below to confirm your order.'
            ) : (
              'Your items are reserved. Pay the exact amount below, then submit the payment details so we can verify it.'
            )}
          </Notice>
        ) : null}
        {rejected ? (
          <Notice tone="danger" title={order.latestProof?.status === 'resubmission_requested' ? 'Action needed: we could not verify your payment yet' : 'Payment could not be verified'}>
            {order.latestProof?.reviewReason ?? 'Please check the payment details and try again.'}
            {order.orderStatus === 'pending_payment' ? ' You can submit updated details below.' : ' Please contact us if money was debited from your account.'}
          </Notice>
        ) : null}
        {balanceRejected ? (
          <Notice
            tone="danger"
            title={order.latestProof?.status === 'resubmission_requested' ? 'Action needed: we could not verify your balance payment yet' : 'Balance payment could not be verified'}
          >
            {order.latestProof?.reviewReason ?? 'Please check the payment details and try again.'} Your advance remains valid and your order is still confirmed.
            You can submit updated details below, or contact us if money was debited from your account.
          </Notice>
        ) : null}
        {late && showPay ? (
          <Notice tone="warning" title="Reservation expired">
            We didn&apos;t receive payment details in time, so the reserved stock was released. Please don&apos;t pay now unless you already have — instead,
            place a new order. If you already paid, submit the details below and we&apos;ll sort it out.
          </Notice>
        ) : null}

        {balanceDue && due ? <BalanceDue order={order} amount={due.amount} overdue={overdue} /> : null}
        {showPay && upi && settings && due ? (
          <UpiPaymentPanel
            upiId={settings.upiId}
            payeeName={payeeName}
            amount={due.amount}
            purpose={due.purpose}
            orderNumber={order.orderNumber}
            reference={upi.reference}
            uri={upi.uri}
            qrDataUrl={upi.qr}
            instructions={settings.customerInstructions}
            expiresAt={balanceDue ? null : order.reservationExpiresAt}
            late={late}
          />
        ) : null}
        {payOnline && due ? (
          settings?.razorpayEnabled ? (
            <RazorpayPayButton key={due.purpose} orderNumber={order.orderNumber} amount={due.amount} purpose={due.purpose} />
          ) : (
            <Notice tone="warning" title="Online payment is unavailable right now">
              Please try again later or contact us.
              {balanceDue
                ? ' Your order stays confirmed; we dispatch it once the balance is paid.'
                : ` Your order stays reserved until ${order.reservationExpiresAt ? formatDateTime(order.reservationExpiresAt) : 'the payment window ends'}.`}
            </Notice>
          )
        ) : null}
        {showPay && settings && due ? (
          <ProofForm
            key={due.purpose}
            orderNumber={order.orderNumber}
            amount={due.amount}
            purpose={due.purpose}
            reference={upiReference(order.orderNumber, due.purpose)}
            upiId={settings.upiId}
            requireProof={settings.requireProof}
            late={late}
          />
        ) : null}
        {awaiting ? <AwaitingVerification order={order} settings={settings} /> : null}
        {showFulfilment ? <Fulfilment order={order} /> : null}
        {order.paymentStatus === 'refund_pending' || order.paymentStatus === 'refunded' ? (
          <Notice tone="info" title={order.paymentStatus === 'refunded' ? 'Refunded' : 'Refund in progress'}>
            {order.paymentStatus === 'refunded'
              ? `We refunded ${formatMoney(order.refundedTotal)} to your original payment method.`
              : `Your refund${order.amountPaid > 0 ? ` of ${formatMoney(order.amountPaid - order.refundedTotal)}` : ''} is being processed. UPI refunds usually reach your account within 5–7 business days.`}
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
                <p className="text-xs text-muted">
                  {[lineDetails({ colorName: item.colorName, variantLabel: item.variantLabel, sizeLabel: item.sizeLabel }), `Qty ${item.quantity}`].filter(Boolean).join(' · ')}
                </p>
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
        <dl className="space-y-2 border-t border-line pt-4 text-sm" aria-label="Payment">
          <Row label="Payment plan" value={half ? `${PAYMENT_PLAN_LABEL.half_prepaid} (${order.advancePercent}% advance)` : PAYMENT_PLAN_LABEL.prepaid} />
          {half ? (
            <>
              <Row label="Advance" value={formatMoney(order.advanceAmount)} />
              <Row label="Balance" value={formatMoney(order.balanceAmount)} />
            </>
          ) : null}
          <Row label="Paid so far (verified)" value={formatMoney(order.amountPaid)} />
          {due && !due.late ? <Row label={half ? (due.purpose === 'balance' ? 'Balance due now' : 'Advance due now') : 'Due now'} value={formatMoney(due.amount)} className="font-semibold" /> : null}
          {half && order.balanceDueAt && order.amountPaid > 0 && order.amountPaid < order.total && order.orderStatus !== 'cancelled' ? (
            <Row label="Balance due by" value={formatDate(order.balanceDueAt)} className={overdue ? 'text-danger' : undefined} />
          ) : null}
          {order.refundedTotal > 0 ? <Row label="Refunded" value={formatMoney(order.refundedTotal)} /> : null}
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
