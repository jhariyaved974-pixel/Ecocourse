'use client';
import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { runDeadlineCheck, updateSettings } from '@/lib/actions/admin';
import { CURRENCIES } from '@/lib/constants';
import type { PortalSettings } from '@/lib/types';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useAction } from './use-action';

export function SettingsForm({ s, canEdit }: { s: PortalSettings; canEdit: boolean }) {
  const { busy, run } = useAction();
  const [f, setF] = useState(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v == null ? '' : String(v)])) as Record<keyof PortalSettings, string>);
  const t = (k: keyof PortalSettings, label: string, hint?: string) => <Field label={label} htmlFor={'st-' + k} hint={hint}><Input id={'st-' + k} value={f[k]} disabled={!canEdit} onChange={e => setF({ ...f, [k]: e.target.value })} /></Field>;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {t('agency_name', 'Agency name')}{t('legal_name', 'Registered legal name', 'Printed on invoices and contracts')}
        {t('email', 'Billing email')}{t('phone', 'Phone')}{t('website', 'Website')}{t('tax_id', 'GSTIN / tax ID')}{t('pan', 'PAN')}
        {t('invoice_prefix', 'Invoice number prefix', 'Invoices are numbered PREFIX-YEAR-0001')}
        <Field label="Default currency" htmlFor="st-cur"><Select id="st-cur" value={f.default_currency} disabled={!canEdit} onChange={e => setF({ ...f, default_currency: e.target.value })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</Select></Field>
        {t('default_tax_rate', 'Default tax rate (%)', 'For example 18 for GST on Indian invoices, 0 for exports under LUT')}
        {t('payment_terms_days', 'Payment terms (days)')}
      </div>
      <Field label="Registered address" htmlFor="st-addr"><Textarea id="st-addr" rows={2} value={f.address} disabled={!canEdit} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
      <Field label="Bank transfer instructions" htmlFor="st-pay" hint="Shown on unpaid invoices and in the PDF. Account name, number, IFSC, SWIFT, UPI."><Textarea id="st-pay" rows={4} value={f.payment_instructions} disabled={!canEdit} onChange={e => setF({ ...f, payment_instructions: e.target.value })} /></Field>
      <Field label="Invoice footer" htmlFor="st-foot"><Textarea id="st-foot" rows={2} value={f.invoice_footer} disabled={!canEdit} onChange={e => setF({ ...f, invoice_footer: e.target.value })} /></Field>
      <div className="flex flex-wrap gap-2">
        {canEdit && <Button loading={busy === 'save'} onClick={() => run('save', () => updateSettings({ ...f, default_currency: f.default_currency as 'USD', default_tax_rate: Number(f.default_tax_rate || 0), payment_terms_days: Number(f.payment_terms_days || 0) }))}>Save settings</Button>}
        <Button variant="secondary" loading={busy === 'dl'} onClick={() => run('dl', () => runDeadlineCheck())}><BellRing className="h-4 w-4" /> Send deadline reminders now</Button>
      </div>
    </div>
  );
}
