'use client';

import * as React from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteTaxRule, saveShippingMethod, saveTaxRule, saveTaxSettings, type ShippingMethodInput, type TaxRuleInput } from '@/app/admin/(panel)/settings/shipping/actions';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Switch } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';

type FieldDef<T> = { key: keyof T & string; label: string; hint?: string; inputMode?: 'numeric' | 'decimal'; mono?: boolean };

function EditDialog<T extends Record<string, unknown>>({
  title,
  trigger,
  initial,
  fields,
  toggles,
  save,
}: {
  title: string;
  trigger: React.ReactNode;
  initial: T;
  fields: FieldDef<T>[];
  toggles: { key: keyof T & string; label: string }[];
  save: (v: T) => Promise<{ ok: boolean; fieldErrors?: Record<string, string> } & ({ ok: true } | { ok: false; error: string })>;
}) {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<T>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { run, pending } = useActionRunner();
  return (
    <>
      <span onClick={() => { setV(initial); setErrors({}); setOpen(true); }}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await run(() => save(v) as never);
              if ((res as { ok: boolean }).ok) setOpen(false);
              else setErrors((res as { fieldErrors?: Record<string, string> }).fieldErrors ?? {});
            }}
          >
            {fields.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`f-${f.key}`} hint={f.hint} error={errors[f.key]}>
                <Input id={`f-${f.key}`} inputMode={f.inputMode} className={f.mono ? 'font-mono' : undefined} value={String(v[f.key] ?? '')} onChange={(e) => setV((s) => ({ ...s, [f.key]: e.target.value }))} />
              </Field>
            ))}
            {toggles.map((t) => (
              <label key={t.key} className="flex items-center gap-3 text-sm sm:col-span-2">
                <Switch checked={Boolean(v[t.key])} onCheckedChange={(c) => setV((s) => ({ ...s, [t.key]: c }))} aria-label={t.label} />
                {t.label}
              </label>
            ))}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" loading={pending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

const METHOD_FIELDS: FieldDef<ShippingMethodInput>[] = [
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'Code', hint: 'Internal id, e.g. standard', mono: true },
  { key: 'description', label: 'Description' },
  { key: 'fee', label: 'Fee (₹)', inputMode: 'decimal' },
  { key: 'freeOver', label: 'Free over (₹, optional)', inputMode: 'decimal', hint: 'Order value after discounts' },
  { key: 'minDays', label: 'Min business days', inputMode: 'numeric' },
  { key: 'maxDays', label: 'Max business days', inputMode: 'numeric' },
  { key: 'sortOrder', label: 'Sort order', inputMode: 'numeric', hint: 'Lowest active is the default' },
];

export function ShippingMethodDialog({ method }: { method: ShippingMethodInput | null }) {
  const initial: ShippingMethodInput = method ?? { code: '', name: '', description: '', fee: '0', freeOver: '', minDays: '3', maxDays: '7', isActive: true, sortOrder: '10' };
  return (
    <EditDialog
      title={method ? `Edit ${method.name}` : 'New delivery method'}
      trigger={method ? <Button size="sm" variant="ghost" aria-label={`Edit ${method.name}`}><Pencil /> Edit</Button> : <Button size="sm"><Plus /> Add method</Button>}
      initial={initial}
      fields={METHOD_FIELDS}
      toggles={[{ key: 'isActive', label: 'Offered at checkout' }]}
      save={(v) => saveShippingMethod(v) as never}
    />
  );
}

const RULE_FIELDS: FieldDef<TaxRuleInput>[] = [
  { key: 'name', label: 'Name', hint: 'e.g. GST 5%' },
  { key: 'ratePercent', label: 'Rate (%)', inputMode: 'decimal' },
  { key: 'minUnitPrice', label: 'From unit price (₹)', inputMode: 'decimal' },
  { key: 'maxUnitPrice', label: 'Up to unit price (₹, optional)', inputMode: 'decimal' },
  { key: 'priority', label: 'Priority', inputMode: 'numeric', hint: 'Higher wins when bands overlap' },
];

export function TaxRuleDialog({ rule }: { rule: TaxRuleInput | null }) {
  const initial: TaxRuleInput = rule ?? { name: '', ratePercent: '', minUnitPrice: '0', maxUnitPrice: '', priority: '0', isActive: true };
  return (
    <EditDialog
      title={rule ? `Edit ${rule.name}` : 'New tax rule'}
      trigger={rule ? <Button size="sm" variant="ghost" aria-label={`Edit ${rule.name}`}><Pencil /> Edit</Button> : <Button size="sm" variant="outline"><Plus /> Add rule</Button>}
      initial={initial}
      fields={RULE_FIELDS}
      toggles={[{ key: 'isActive', label: 'Active' }]}
      save={(v) => saveTaxRule(v) as never}
    />
  );
}

export function DeleteTaxRule({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmActionButton title={`Delete ${name}?`} confirmLabel="Delete" danger variant="ghost" action={() => deleteTaxRule(id)} success="Tax rule deleted">
      <Trash2 /> Delete
    </ConfirmActionButton>
  );
}

export function TaxSettingsForm({ initial }: { initial: { enabled: boolean; pricesIncludeTax: boolean; taxLabel: string; businessTaxId: string } }) {
  const [v, setV] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { run, pending } = useActionRunner();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(() => saveTaxSettings(v));
        if (!res.ok) setErrors(res.fieldErrors ?? {});
      }}
    >
      <label className="flex items-center gap-3 text-sm"><Switch checked={v.enabled} onCheckedChange={(c) => setV((s) => ({ ...s, enabled: c }))} aria-label="Charge tax" /> Calculate tax on orders</label>
      <label className="flex items-center gap-3 text-sm"><Switch checked={v.pricesIncludeTax} onCheckedChange={(c) => setV((s) => ({ ...s, pricesIncludeTax: c }))} aria-label="Prices include tax" /> Product prices already include tax</label>
      {!v.pricesIncludeTax ? <Notice tone="warning">Tax will be added on top of product prices at checkout.</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tax label" htmlFor="t-label" error={errors.taxLabel}><Input id="t-label" value={v.taxLabel} maxLength={20} onChange={(e) => setV((s) => ({ ...s, taxLabel: e.target.value }))} /></Field>
        <Field label="GSTIN (optional)" htmlFor="t-gstin" error={errors.businessTaxId}><Input id="t-gstin" value={v.businessTaxId} maxLength={15} className="font-mono uppercase" onChange={(e) => setV((s) => ({ ...s, businessTaxId: e.target.value.toUpperCase() }))} /></Field>
      </div>
      <Button type="submit" loading={pending}>Save tax settings</Button>
    </form>
  );
}
