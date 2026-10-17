'use client';

import * as React from 'react';
import { cancelAffiliateCommission, recordAffiliatePayout, reviewAffiliate, saveAffiliateSettings } from '@/app/admin/(panel)/affiliates/actions';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Switch } from '@/components/ui/form-controls';

export function AffiliateReviewForm({ id, status, ratePercent, note }: { id: string; status: string; ratePercent: number | null; note: string | null }) {
  const [s, setS] = React.useState(status);
  const [rate, setRate] = React.useState(ratePercent === null ? '' : String(ratePercent));
  const [n, setN] = React.useState(note ?? '');
  const { run, pending } = useActionRunner();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[150px_120px_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => reviewAffiliate({ id, status: s as 'approved', ratePercent: rate.trim() === '' ? null : Number(rate), note: n }));
      }}
    >
      <Field label="Status" htmlFor={`as-${id}`}>
        <NativeSelect id={`as-${id}`} value={s} onChange={(e) => setS(e.target.value)}>
          <option value="pending">Under review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </NativeSelect>
      </Field>
      <Field label="Rate %" htmlFor={`ar-${id}`} hint="Blank = default">
        <Input id={`ar-${id}`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Default" />
      </Field>
      <Field label="Note (shown to the affiliate)" htmlFor={`an-${id}`}>
        <Input id={`an-${id}`} maxLength={500} value={n} onChange={(e) => setN(e.target.value)} />
      </Field>
      <Button type="submit" size="sm" loading={pending}>Save</Button>
    </form>
  );
}

export function AffiliatePayoutButton({ id, amountText, upi }: { id: string; amountText: string; upi: string }) {
  return (
    <ConfirmActionButton
      title={`Record payout of ${amountText}`}
      description={<>Pay {amountText} to <strong>{upi}</strong> from your UPI app first, then enter its UTR / reference. All earned commissions of this affiliate are marked paid.</>}
      confirmLabel="Record payout"
      reason={{ label: 'UTR / UPI reference', required: true, minLength: 4 }}
      action={(reference) => recordAffiliatePayout({ id, reference })}
      variant="primary"
    >
      Record payout
    </ConfirmActionButton>
  );
}

export function CancelCommissionButton({ id, orderNumber }: { id: string; orderNumber: string }) {
  return (
    <ConfirmActionButton
      title={`Cancel commission for ${orderNumber}?`}
      description="Use this for fraud or rule breaks. The affiliate sees the commission as cancelled."
      confirmLabel="Cancel commission"
      reason={{ label: 'Reason', required: true, minLength: 3 }}
      action={(reason) => cancelAffiliateCommission(id, reason)}
      danger
      variant="ghost"
    >
      Cancel
    </ConfirmActionButton>
  );
}

export function AffiliateSettingsForm({ enabled, ratePercent, cookieDays, minPayoutRupees }: { enabled: boolean; ratePercent: number; cookieDays: number; minPayoutRupees: number }) {
  const [on, setOn] = React.useState(enabled);
  const [rate, setRate] = React.useState(String(ratePercent));
  const [days, setDays] = React.useState(String(cookieDays));
  const [min, setMin] = React.useState(String(minPayoutRupees));
  const { run, pending } = useActionRunner();
  return (
    <form
      className="grid gap-4 sm:grid-cols-[auto_repeat(3,minmax(0,1fr))_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveAffiliateSettings({ enabled: on, ratePercent: Number(rate), cookieDays: Number(days), minPayoutRupees: Number(min) }));
      }}
    >
      <label className="flex items-center gap-2 pb-2 text-sm">
        <Switch checked={on} onCheckedChange={setOn} aria-label="Affiliate program open" /> Program open
      </label>
      <Field label="Default commission %" htmlFor="aff-rate">
        <Input id="aff-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
      </Field>
      <Field label="Cookie days" htmlFor="aff-days">
        <Input id="aff-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <Field label="Minimum payout (₹)" htmlFor="aff-min">
        <Input id="aff-min" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} />
      </Field>
      <Button type="submit" loading={pending}>Save</Button>
    </form>
  );
}
