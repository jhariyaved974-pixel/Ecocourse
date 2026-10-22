'use client';

import * as React from 'react';
import Image from 'next/image';
import { ShoeArt, shoeTint } from '@/components/store/shoe-art';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HandCoins, Lock, QrCode, ShieldCheck, Truck, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { placeOrder } from '@/app/(store)/checkout/actions';
import { useServerQuote } from '@/components/store/cart-drawer';
import { CouponForm } from '@/components/cart/coupon-form';
import { OrderTotals } from '@/components/cart/order-summary';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, RadioGroup, RadioItem, Textarea } from '@/components/ui/form-controls';
import { EmptyState, Notice } from '@/components/ui/misc';
import { cartStore, useCart } from '@/lib/cart/store';
import { setCouponCode, useCouponCode } from '@/lib/cart/coupon';
import { lineStatusMessage, type Quote } from '@/lib/orders/quote';
import type { PaymentPlan } from '@/lib/orders/payment-plan';
import { lineDetails } from '@/lib/catalog/variants';
import { INDIAN_STATES } from '@/lib/india';
import { cn, formatDuration, formatMoney } from '@/lib/utils';

export interface SavedAddress {
  id: string;
  label: string;
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postal_code: string;
  is_default: boolean;
}

interface Props {
  userEmail: string | null;
  addresses: SavedAddress[];
  upi: { enabled: boolean; reservationMinutes: number; reviewDeadlineHours: number; requireProof: boolean } | null;
  razorpayEnabled: boolean;
}

type AddressForm = { fullName: string; phone: string; line1: string; line2: string; landmark: string; city: string; state: string; postalCode: string };
const EMPTY_ADDRESS: AddressForm = { fullName: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: '', postalCode: '' };
const IDEM_KEY = 'auren.checkout.idem';

function fromSaved(a: SavedAddress): AddressForm {
  return { fullName: a.full_name, phone: a.phone, line1: a.line1, line2: a.line2 ?? '', landmark: a.landmark ?? '', city: a.city, state: a.state, postalCode: a.postal_code };
}

/** One idempotency key per checkout attempt, kept across retries until an order is placed. */
function getIdempotencyKey(): string {
  try {
    const existing = window.sessionStorage.getItem(IDEM_KEY);
    if (existing) return existing;
    const key = crypto.randomUUID();
    window.sessionStorage.setItem(IDEM_KEY, key);
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

function PlanOption({ value, selected, icon, title, children }: { value: PaymentPlan; selected: boolean; icon: React.ReactNode; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-4 rounded-xl border p-4 text-sm transition-colors', selected ? 'border-ink' : 'border-line hover:border-line-strong')}>
      <RadioItem value={value} className="mt-0.5" />
      {icon}
      <span className="flex-1">
        <span className="font-medium">{title}</span>
        <span className="mt-1 block text-muted">{children}</span>
      </span>
    </label>
  );
}

/** Prepaid / Half prepaid, with the amounts from the server quote (never computed here). */
function PaymentPlanChoice({ quote, plan, onChange }: { quote: Quote | null; plan: PaymentPlan; onChange: (plan: PaymentPlan) => void }) {
  if (!quote) return <div className="skeleton h-20 w-full" aria-hidden />;
  return (
    <RadioGroup value={plan} onValueChange={(v) => onChange(v as PaymentPlan)} aria-labelledby="plan-heading">
      <PlanOption value="prepaid" selected={plan === 'prepaid'} icon={<Wallet className="size-5 shrink-0 text-muted" />} title={`Prepaid — pay ${formatMoney(quote.total)} now`}>
        Pay the full amount now. Nothing more to pay later.
      </PlanOption>
      {quote.halfPrepaidAvailable ? (
        <PlanOption
          value="half_prepaid"
          selected={plan === 'half_prepaid'}
          icon={<HandCoins className="size-5 shrink-0 text-muted" />}
          title={`Half prepaid — pay ${formatMoney(quote.halfPrepaidAdvance)} now (${quote.advancePercent}%), ${formatMoney(quote.halfPrepaidBalance)} online before dispatch`}
        >
          The advance confirms your order. Once it is confirmed, pay the balance online from your order page with the same payment method. We dispatch
          your order after the balance is verified. There is no cash on delivery.
        </PlanOption>
      ) : null}
    </RadioGroup>
  );
}

function Section({ step, title, children, aside }: { step: number; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-b border-line pb-8" aria-labelledby={`step-${step}`}>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 id={`step-${step}`} className="flex items-baseline gap-3 text-lg font-semibold">
          <span className="font-display text-2xl text-muted">{String(step).padStart(2, '0')}</span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function CheckoutForm({ userEmail, addresses, upi, razorpayEnabled }: Props) {
  const router = useRouter();
  const { lines } = useCart();
  const couponCode = useCouponCode();
  const defaultAddress = addresses.find((a) => a.is_default) ?? addresses[0];
  const [email, setEmail] = React.useState(userEmail ?? '');
  const [addressId, setAddressId] = React.useState<string>(defaultAddress?.id ?? 'new');
  const [address, setAddress] = React.useState<AddressForm>(defaultAddress ? fromSaved(defaultAddress) : EMPTY_ADDRESS);
  const [saveAddress, setSaveAddress] = React.useState(addresses.length === 0);
  const [shippingMethod, setShippingMethod] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState<'upi_manual' | 'razorpay'>(upi?.enabled ? 'upi_manual' : 'razorpay');
  const [chosenPlan, setPaymentPlan] = React.useState<PaymentPlan>('prepaid');
  const [note, setNote] = React.useState('');
  const [acceptTerms, setAcceptTerms] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [placed, setPlaced] = React.useState(false);

  const { quote, error: quoteError, loading } = useServerQuote(lines, {
    enabled: lines.length > 0,
    couponCode,
    shippingMethod: shippingMethod || undefined,
    email: email.includes('@') ? email : undefined,
  });
  const activeShipping = shippingMethod || quote?.shipping?.code || '';
  const byVariant = new Map(quote?.lines.map((l) => [l.variantId, l]));
  const lineProblems = quote?.lines.filter((l) => l.status !== 'ok') ?? [];
  const couponProblem = Boolean(quote?.coupon?.errorCode);
  const anyPayment = Boolean(upi?.enabled) || razorpayEnabled;
  // Half prepaid only when the server quote offers it (a balance of 0 would make it prepaid).
  const paymentPlan: PaymentPlan = chosenPlan === 'half_prepaid' && quote?.halfPrepaidAvailable ? 'half_prepaid' : 'prepaid';
  const half = paymentPlan === 'half_prepaid' && quote !== null;

  if (placed) {
    return <div className="grid min-h-[40vh] place-items-center text-sm text-muted">Opening your order…</div>;
  }

  if (lines.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Add something to your cart to check out."
        action={
          <Button asChild>
            <Link href="/shop">Shop all products</Link>
          </Button>
        }
      />
    );
  }

  const set = (key: keyof AddressForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setAddress((a) => ({ ...a, [key]: e.target.value }));
    if (addressId !== 'new') setAddressId('new');
  };
  const err = (key: string) => errors[key] ?? errors[`address.${key}`];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!quote || loading) return;
    if (lineProblems.length) {
      setFormError('Some items in your cart need attention before you can place the order.');
      return;
    }
    if (couponProblem) {
      setFormError('Remove the coupon that cannot be applied, then try again.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await placeOrder({
        idempotencyKey: getIdempotencyKey(),
        email,
        address,
        saveAddress: Boolean(userEmail) && addressId === 'new' && saveAddress,
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        shippingMethod: activeShipping,
        couponCode: couponCode || undefined,
        paymentMethod,
        paymentPlan,
        note: note || undefined,
        expectedTotal: quote.total,
        acceptTerms: acceptTerms as true,
      });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.error);
        if (res.code === 'total_changed' || res.code === 'quote_invalid' || res.code === 'invalid_payment_plan') {
          // Re-quote so the shopper sees the current prices and stock.
          cartStore.reconcile([]);
          router.refresh();
        }
        document.getElementById('checkout-errors')?.focus();
        return;
      }
      setPlaced(true);
      try {
        window.sessionStorage.removeItem(IDEM_KEY);
      } catch {
        /* ignore */
      }
      cartStore.clear();
      setCouponCode('');
      router.push(`/orders/${encodeURIComponent(res.data.orderNumber)}`);
    } catch {
      // Network failure: the same idempotency key makes a retry safe.
      setFormError('Connection problem. Please try again — you will not be charged twice or get a duplicate order.');
      toast.error('Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
      <div className="space-y-8">
        <div id="checkout-errors" tabIndex={-1} className="outline-none">
          {formError ? <Notice tone="danger">{formError}</Notice> : null}
        </div>

        <Section
          step={1}
          title="Contact"
          aside={userEmail ? null : <Link href="/login?next=/checkout" className="text-sm underline underline-offset-4">Sign in</Link>}
        >
          <Field label="Email" htmlFor="email" error={err('email')} hint="Order updates and your payment status are sent here.">
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={Boolean(userEmail)} required maxLength={254} aria-invalid={Boolean(err('email'))} />
          </Field>
        </Section>

        <Section step={2} title="Delivery address">
          {addresses.length ? (
            <RadioGroup
              value={addressId}
              onValueChange={(id) => {
                setAddressId(id);
                const saved = addresses.find((a) => a.id === id);
                setAddress(saved ? fromSaved(saved) : EMPTY_ADDRESS);
              }}
              className="mb-6"
              aria-label="Saved addresses"
            >
              {addresses.map((a) => (
                <label key={a.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm transition-colors', addressId === a.id ? 'border-ink' : 'border-line hover:border-line-strong')}>
                  <RadioItem value={a.id} className="mt-0.5" />
                  <span>
                    <span className="font-medium">{a.label}</span> · {a.full_name}
                    <span className="mt-0.5 block text-muted">
                      {[a.line1, a.line2, a.city, a.state, a.postal_code].filter(Boolean).join(', ')}
                    </span>
                  </span>
                </label>
              ))}
              <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm', addressId === 'new' ? 'border-ink' : 'border-line hover:border-line-strong')}>
                <RadioItem value="new" />
                Use a new address
              </label>
            </RadioGroup>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="fullName" error={err('fullName')} required>
              <Input id="fullName" autoComplete="name" value={address.fullName} onChange={set('fullName')} maxLength={120} aria-invalid={Boolean(err('fullName'))} />
            </Field>
            <Field label="Mobile number" htmlFor="phone" error={err('phone')} required hint="For delivery updates from the courier.">
              <Input id="phone" type="tel" inputMode="tel" autoComplete="tel-national" value={address.phone} onChange={set('phone')} maxLength={16} aria-invalid={Boolean(err('phone'))} />
            </Field>
            <Field label="House / flat, street" htmlFor="line1" error={err('line1')} required className="sm:col-span-2">
              <Input id="line1" autoComplete="address-line1" value={address.line1} onChange={set('line1')} maxLength={200} aria-invalid={Boolean(err('line1'))} />
            </Field>
            <Field label="Area, locality (optional)" htmlFor="line2" error={err('line2')}>
              <Input id="line2" autoComplete="address-line2" value={address.line2} onChange={set('line2')} maxLength={200} />
            </Field>
            <Field label="Landmark (optional)" htmlFor="landmark" error={err('landmark')}>
              <Input id="landmark" value={address.landmark} onChange={set('landmark')} maxLength={120} />
            </Field>
            <Field label="City" htmlFor="city" error={err('city')} required>
              <Input id="city" autoComplete="address-level2" value={address.city} onChange={set('city')} maxLength={80} aria-invalid={Boolean(err('city'))} />
            </Field>
            <Field label="PIN code" htmlFor="postalCode" error={err('postalCode')} required>
              <Input id="postalCode" inputMode="numeric" autoComplete="postal-code" value={address.postalCode} onChange={set('postalCode')} maxLength={6} aria-invalid={Boolean(err('postalCode'))} />
            </Field>
            <Field label="State" htmlFor="state" error={err('state')} required className="sm:col-span-2">
              <NativeSelect id="state" autoComplete="address-level1" value={address.state} onChange={set('state')} aria-invalid={Boolean(err('state'))}>
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          {userEmail && addressId === 'new' ? (
            <label className="mt-4 flex items-center gap-3 text-sm">
              <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="size-4 accent-[var(--ink)]" />
              Save this address to my account
            </label>
          ) : null}
        </Section>

        <Section step={3} title="Delivery method">
          {quote?.shippingOptions.length ? (
            <RadioGroup value={activeShipping} onValueChange={setShippingMethod} aria-label="Delivery method">
              {quote.shippingOptions.map((o) => (
                <label key={o.code} className={cn('flex cursor-pointer items-center gap-4 rounded-xl border p-4 text-sm transition-colors', activeShipping === o.code ? 'border-ink' : 'border-line hover:border-line-strong')}>
                  <RadioItem value={o.code} />
                  <Truck className="size-5 shrink-0 text-muted" />
                  <span className="flex-1">
                    <span className="font-medium">{o.name}</span>
                    <span className="block text-muted">{o.minDays}–{o.maxDays} business days{o.description ? ` · ${o.description}` : ''}</span>
                  </span>
                  <span className="font-medium tabular-nums">{o.fee === 0 ? 'Free' : formatMoney(o.fee)}</span>
                </label>
              ))}
            </RadioGroup>
          ) : (
            <div className="skeleton h-16 w-full" />
          )}
        </Section>

        <Section step={4} title="Payment">
          {!anyPayment ? (
            <Notice tone="warning">Payments are temporarily unavailable. Please try again later.</Notice>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 id="plan-heading" className="mb-3 text-sm font-semibold">Payment plan</h3>
                <PaymentPlanChoice quote={quote} plan={paymentPlan} onChange={setPaymentPlan} />
              </div>
              <div>
                <h3 id="method-heading" className="mb-3 text-sm font-semibold">Payment method</h3>
                <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)} aria-labelledby="method-heading">
                  {upi?.enabled ? (
                    <label className={cn('flex cursor-pointer items-start gap-4 rounded-xl border p-4 text-sm', paymentMethod === 'upi_manual' ? 'border-ink' : 'border-line')}>
                      <RadioItem value="upi_manual" className="mt-0.5" />
                      <QrCode className="size-5 shrink-0 text-muted" />
                      <span className="flex-1">
                        <span className="font-medium">UPI (any UPI app)</span>
                        <span className="mt-1 block text-muted">
                          After you place the order you&apos;ll see our UPI ID and a QR code for the exact amount{half ? ' of the advance' : ''}. Pay from GPay, PhonePe, Paytm or your bank app,
                          then {upi.requireProof ? 'upload the payment screenshot and' : ''} enter the UTR reference. We reserve your items for {formatDuration(upi.reservationMinutes)} and confirm the order once
                          the {half ? 'advance' : 'payment'} is verified in our bank records (usually within {upi.reviewDeadlineHours} hours).
                          {half ? ' You pay the balance the same way from your order page before dispatch.' : ''}
                        </span>
                      </span>
                    </label>
                  ) : null}
                  {razorpayEnabled ? (
                    <label className={cn('flex cursor-pointer items-start gap-4 rounded-xl border p-4 text-sm', paymentMethod === 'razorpay' ? 'border-ink' : 'border-line')}>
                      <RadioItem value="razorpay" className="mt-0.5" />
                      <Lock className="size-5 shrink-0 text-muted" />
                      <span className="flex-1">
                        <span className="font-medium">Cards, netbanking & wallets (Razorpay)</span>
                        <span className="mt-1 block text-muted">
                          Pay securely on Razorpay. Card details never reach our servers.{half ? ' You pay the balance on Razorpay too, from your order page before dispatch.' : ''}
                        </span>
                      </span>
                    </label>
                  ) : null}
                </RadioGroup>
              </div>
            </div>
          )}
          <Field label="Order note (optional)" htmlFor="note" className="mt-6">
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="Delivery instructions, gate code…" />
          </Field>
        </Section>
      </div>

      <aside className="h-fit space-y-6 rounded-[var(--radius)] border border-line bg-surface p-6 lg:sticky lg:top-24" aria-label="Order summary">
        <h2 className="text-lg font-semibold">Order summary</h2>
        <ul className="max-h-80 space-y-4 overflow-y-auto">
          {lines.map((l) => {
            const q = byVariant.get(l.variantId);
            const msg = q ? lineStatusMessage(q) : null;
            return (
              <li key={l.variantId} className="flex gap-3">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {l.image ? (
                    <Image src={l.image} alt="" fill sizes="64px" className="object-cover" />
                  ) : l.art ? (
                    <div className="grid h-full place-items-center px-1" style={{ background: shoeTint(l.art.color) }}>
                      <ShoeArt type={l.art.type} color={l.art.color} />
                    </div>
                  ) : null}
                  <span className="absolute -top-0 -right-0 grid min-w-5 place-items-center rounded-bl-lg bg-ink px-1 text-[10px] font-semibold text-paper">{l.quantity}</span>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{q?.productName ?? l.name}</p>
                  <p className="text-xs text-muted">
                    {lineDetails({ colorName: q?.colorName ?? l.colorName, variantLabel: q?.variantLabel ?? l.variantLabel, sizeLabel: q?.sizeLabel ?? l.sizeLabel })}
                  </p>
                  {msg ? <p className="mt-0.5 text-xs font-medium text-danger">{msg}</p> : null}
                </div>
                <p className="text-sm tabular-nums">{q ? formatMoney(q.lineTotal) : '—'}</p>
              </li>
            );
          })}
        </ul>
        {lineProblems.length ? (
          <Notice tone="danger">
            Some items changed. <Link href="/cart" className="underline">Update your cart</Link> to continue.
          </Notice>
        ) : null}
        <CouponForm code={couponCode} quote={quote} loading={loading} />
        <OrderTotals quote={quote} loading={loading} plan={paymentPlan} />
        {quoteError ? <p className="text-sm text-danger" role="alert">{quoteError}</p> : null}
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 size-4 accent-[var(--ink)]" />
          <span>
            I agree to the <Link href="/pages/terms-and-conditions" target="_blank" className="underline underline-offset-4">terms</Link>,{' '}
            <Link href="/pages/returns-and-exchanges" target="_blank" className="underline underline-offset-4">returns policy</Link> and{' '}
            <Link href="/pages/privacy-policy" target="_blank" className="underline underline-offset-4">privacy policy</Link>.
          </span>
        </label>
        {err('acceptTerms') ? <p className="-mt-3 text-xs font-medium text-danger" role="alert">{err('acceptTerms')}</p> : null}
        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!quote || loading || !anyPayment || lineProblems.length > 0}>
          {!quote ? 'Place order' : half ? `Place order · pay ${formatMoney(quote.halfPrepaidAdvance)} now` : `Place order · ${formatMoney(quote.total)}`}
        </Button>
        <p className="flex items-start gap-2 text-xs text-muted">
          <ShieldCheck className="mt-px size-4 shrink-0" />
          <span>
            {paymentMethod === 'upi_manual'
              ? `You will pay ${half ? 'the advance ' : ''}on the next screen. Never share your UPI PIN, OTP or bank password with anyone — we will never ask for them.`
              : `You will pay ${half ? 'the advance ' : ''}securely on Razorpay from the next screen.`}
            {half && quote ? ` The balance of ${formatMoney(quote.halfPrepaidBalance)} is paid online after your order is confirmed, before dispatch.` : ''}
          </span>
        </p>
      </aside>
    </form>
  );
}
