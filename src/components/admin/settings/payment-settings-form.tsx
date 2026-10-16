'use client';

import * as React from 'react';
import QRCode from 'qrcode';
import { savePaymentSettings, type PaymentSettingsInput } from '@/app/admin/(panel)/settings/payments/actions';
import { useActionRunner } from '@/components/admin/client-ui';
import { Panel } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch, Textarea } from '@/components/ui/form-controls';
import { Badge, Notice } from '@/components/ui/misc';
import { buildUpiUri, isValidUpiId } from '@/lib/payments/upi';
import { ADVANCE_PERCENT_MAX, ADVANCE_PERCENT_MIN, BALANCE_DUE_DAYS_MAX, BALANCE_DUE_DAYS_MIN, planExample } from '@/lib/admin/payment-plans';
import { formatMoney } from '@/lib/utils';

type Values = Omit<PaymentSettingsInput, 'reviewDeadlineHours' | 'reservationMinutes' | 'resubmissionHours' | 'advancePercent' | 'balanceDueDays'> & {
  reviewDeadlineHours: string;
  reservationMinutes: string;
  resubmissionHours: string;
  advancePercent: string;
  balanceDueDays: string;
};

const SAMPLE_AMOUNT = 149_900;

/** Whole number within [min, max], or null. */
function intIn(value: string, min: number, max: number): number | null {
  const t = value.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} disabled={disabled} className="mt-0.5" />
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export function PaymentSettingsForm({
  initial,
  storeName,
  orderPrefix,
  razorpayConfigured,
}: {
  initial: Values;
  storeName: string;
  /** Store order number prefix (default STM), so the preview reference looks like a real order. */
  orderPrefix: string;
  razorpayConfigured: boolean;
}) {
  const sampleOrder = `${/^[A-Z]{2,4}$/.test(orderPrefix) ? orderPrefix : 'STM'}-000000-SAMPL`;
  const [v, setV] = React.useState<Values>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [qr, setQr] = React.useState<{ key: string; url: string } | null>(null);
  const { run, pending } = useActionRunner();
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((s) => ({ ...s, [k]: val }));
  const text = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never);
  const changingId = v.upiId.trim() !== initial.currentUpiId;

  const preview = React.useMemo(() => {
    if (!isValidUpiId(v.upiId)) return null;
    try {
      return buildUpiUri({ payeeVpa: v.upiId.trim(), payeeName: v.payeeName || storeName, amountPaise: SAMPLE_AMOUNT, orderNumber: sampleOrder, includeTransactionRef: v.includeTransactionRef });
    } catch {
      return null;
    }
  }, [v.upiId, v.payeeName, v.includeTransactionRef, storeName, sampleOrder]);

  React.useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    QRCode.toDataURL(preview, { errorCorrectionLevel: 'M', margin: 1, width: 360 }).then((url) => !cancelled && setQr({ key: preview, url }));
    return () => {
      cancelled = true;
    };
  }, [preview]);

  const err = (k: string) => errors[k];
  const percent = intIn(v.advancePercent, ADVANCE_PERCENT_MIN, ADVANCE_PERCENT_MAX);
  const dueDays = intIn(v.balanceDueDays, BALANCE_DUE_DAYS_MIN, BALANCE_DUE_DAYS_MAX);
  // Same rounding as the database: the exact percentage rounded up to a whole rupee, capped at the total.
  const example = percent !== null ? planExample(SAMPLE_AMOUNT, percent) : null;

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setErrors({});
        const res = await run(() => savePaymentSettings(v));
        if (!res.ok) setErrors(res.fieldErrors ?? {});
      }}
    >
      {Object.keys(errors).length ? <Notice tone="danger">Please fix the highlighted fields.</Notice> : null}
      <Panel title="Manual UPI" description="Customers pay your UPI ID directly. Every payment is confirmed by a person checking the bank/UPI records.">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-4">
            <Toggle checked={v.upiEnabled} onChange={(c) => set('upiEnabled', c)} label="Accept manual UPI payments" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Merchant UPI ID" htmlFor="p-upi" required error={err('upiId')} hint="Shown to customers and encoded in the QR code.">
                <Input id="p-upi" value={v.upiId} onChange={text('upiId')} maxLength={255} autoComplete="off" spellCheck={false} className="font-mono" />
              </Field>
              <Field label="Payee name" htmlFor="p-name" error={err('payeeName')} hint={`Shown in UPI apps. Empty uses “${storeName}”.`}>
                <Input id="p-name" value={v.payeeName} onChange={text('payeeName')} maxLength={50} />
              </Field>
              {changingId ? (
                <Field label="Confirm new UPI ID" htmlFor="p-upi2" required error={err('upiIdConfirm')} className="sm:col-span-2">
                  <Input id="p-upi2" value={v.upiIdConfirm ?? ''} onChange={text('upiIdConfirm')} maxLength={255} autoComplete="off" spellCheck={false} className="font-mono" onPaste={(e) => e.preventDefault()} />
                </Field>
              ) : null}
            </div>
            {changingId ? (
              <Notice tone="warning" title="You are changing where customers send money">
                From the moment you save, every unpaid order page shows <span className="font-mono">{v.upiId || '…'}</span>. Scan the preview with your own UPI app and check the payee name before saving.
              </Notice>
            ) : null}
            <Toggle checked={v.showQr} onChange={(c) => set('showQr', c)} label="Show a QR code on the order page" />
            <Toggle checked={v.includeTransactionRef} onChange={(c) => set('includeTransactionRef', c)} label="Add the order number as a transaction reference (tr)" hint="Some personal UPI IDs reject payment links that contain tr. Turn off if customers report errors." />
            <Toggle checked={v.requireProof} onChange={(c) => set('requireProof', c)} label="Require a payment screenshot or receipt" hint="When off, a UTR reference alone is accepted (still verified by staff)." />
          </div>
          <div className="rounded-xl border border-line p-4 text-center">
            <p className="text-xs font-medium text-muted">Preview · ₹1,499 sample order</p>
            {preview && qr?.key === preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr.url} alt="Preview UPI QR code for a sample order" className="mx-auto mt-3 size-48 rounded-lg bg-white p-2" />
            ) : (
              <div className="mx-auto mt-3 grid size-48 place-items-center rounded-lg bg-surface-2 text-xs text-muted">{isValidUpiId(v.upiId) ? 'Generating…' : 'Enter a valid UPI ID'}</div>
            )}
            {preview ? <p className="mt-3 font-mono text-[10px] break-all text-muted">{preview}</p> : null}
            <p className="mt-2 text-[11px] text-muted">Scan it to check the payee — do not complete the payment.</p>
          </div>
        </div>
      </Panel>

      <Panel
        title="Payment plans"
        description="Every order is paid online before it ships; there is no cash on delivery. Shoppers choose Prepaid (the full amount at checkout) or Half prepaid (an advance at checkout, the balance before dispatch)."
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Half prepaid advance (%)"
              htmlFor="p-adv"
              required
              error={err('advancePercent')}
              hint={`${ADVANCE_PERCENT_MIN}–${ADVANCE_PERCENT_MAX}. Paid at checkout to confirm the order, rounded up to a whole rupee.`}
            >
              <Input id="p-adv" inputMode="numeric" value={v.advancePercent} onChange={text('advancePercent')} maxLength={3} autoComplete="off" />
            </Field>
            <Field
              label="Balance due within (days)"
              htmlFor="p-due"
              required
              error={err('balanceDueDays')}
              hint={`${BALANCE_DUE_DAYS_MIN}–${BALANCE_DUE_DAYS_MAX}, counted from when the advance is verified. Overdue balances are flagged for staff, never cancelled.`}
            >
              <Input id="p-due" inputMode="numeric" value={v.balanceDueDays} onChange={text('balanceDueDays')} maxLength={2} autoComplete="off" />
            </Field>
            <p className="text-xs text-muted sm:col-span-2">Changes apply to new orders only. Every order keeps the percentage it was placed with.</p>
          </div>
          <div className="rounded-xl border border-line p-4 text-sm" aria-live="polite" data-testid="plan-example">
            <p className="text-xs font-medium text-muted">Example · Half prepaid</p>
            {example ? (
              <>
                <p className="mt-2 font-medium">{example.text}</p>
                <dl className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Advance at checkout ({percent}%)</dt>
                    <dd className="tabular-nums">{formatMoney(example.advance)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Balance before dispatch</dt>
                    <dd className="tabular-nums">{formatMoney(example.balance)}</dd>
                  </div>
                </dl>
                {dueDays !== null ? (
                  <p className="mt-3 text-xs text-muted">
                    The balance is due within {dueDays} day{dueDays === 1 ? '' : 's'} of the advance being verified.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-xs text-muted">Enter a whole number from {ADVANCE_PERCENT_MIN} to {ADVANCE_PERCENT_MAX} to see an example.</p>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Timing">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Reserve stock for (minutes)" htmlFor="p-res" error={err('reservationMinutes')} hint="Unpaid orders expire after this and release their reserved stock.">
            <Input id="p-res" inputMode="numeric" value={v.reservationMinutes} onChange={text('reservationMinutes')} />
          </Field>
          <Field label="Review deadline (hours)" htmlFor="p-rev" error={err('reviewDeadlineHours')} hint="Orders under review longer than this are flagged.">
            <Input id="p-rev" inputMode="numeric" value={v.reviewDeadlineHours} onChange={text('reviewDeadlineHours')} />
          </Field>
          <Field label="Resubmission window (hours)" htmlFor="p-resub" error={err('resubmissionHours')} hint="Time a customer gets to send new proof.">
            <Input id="p-resub" inputMode="numeric" value={v.resubmissionHours} onChange={text('resubmissionHours')} />
          </Field>
        </div>
      </Panel>

      <Panel title="Instructions">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Shown to customers on the order page" htmlFor="p-cust" error={err('customerInstructions')}>
            <Textarea id="p-cust" rows={5} maxLength={2000} value={v.customerInstructions} onChange={text('customerInstructions')} />
          </Field>
          <Field label="Shown to staff on the review screen" htmlFor="p-staff" error={err('reviewInstructions')}>
            <Textarea id="p-staff" rows={5} maxLength={2000} value={v.reviewInstructions} onChange={text('reviewInstructions')} />
          </Field>
        </div>
      </Panel>

      <Panel title="Notifications">
        <div className="space-y-4">
          <Toggle checked={v.notifyCustomerEmails} onChange={(c) => set('notifyCustomerEmails', c)} label="Email customers about their order and payment status" />
          <Toggle checked={v.notifyAdminOnProof} onChange={(c) => set('notifyAdminOnProof', c)} label="Email staff when a new payment proof arrives" />
          {v.notifyAdminOnProof ? (
            <Field label="Staff alert email" htmlFor="p-admin-email" error={err('adminNotificationEmail')} className="max-w-md">
              <Input id="p-admin-email" type="email" value={v.adminNotificationEmail} onChange={text('adminNotificationEmail')} maxLength={254} />
            </Field>
          ) : null}
        </div>
      </Panel>

      <Panel title="Online payments (Razorpay)">
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm">
            Status: {razorpayConfigured ? <Badge tone="success">Keys configured</Badge> : <Badge tone="neutral">Not configured</Badge>}
          </p>
          <Toggle checked={v.razorpayEnabled} onChange={(c) => set('razorpayEnabled', c)} label="Offer Razorpay at checkout" disabled={!razorpayConfigured} hint={razorpayConfigured ? 'Payments are confirmed only by signed Razorpay events.' : 'Add RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET on the server first (see docs/PAYMENTS.md).'} />
          {err('razorpayEnabled') ? <p className="text-xs font-medium text-danger">{err('razorpayEnabled')}</p> : null}
        </div>
      </Panel>

      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" size="lg" loading={pending} className="shadow-lg">Save payment settings</Button>
      </div>
    </form>
  );
}
