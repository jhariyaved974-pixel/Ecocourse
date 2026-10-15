'use client';

import * as React from 'react';
import { Pencil, Plus } from 'lucide-react';
import { saveCoupon, type CouponInput } from '@/app/admin/(panel)/coupons/actions';
import { useActionRunner } from '@/components/admin/client-ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';
import { isoToIstInput } from '@/lib/admin/products';
import { cn, paiseToRupeeString } from '@/lib/utils';

export interface CouponRow {
  id: string;
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  value: number;
  max_discount: number | null;
  min_subtotal: number;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  first_order_only: boolean;
  scope: 'all' | 'products' | 'categories';
  is_active: boolean;
  is_public: boolean;
  productIds: string[];
  categoryIds: string[];
}

type Option = { id: string; name: string };

function toForm(c: CouponRow | null): CouponInput {
  return {
    id: c?.id,
    code: c?.code ?? '',
    description: c?.description ?? '',
    discountType: c?.discount_type ?? 'percentage',
    value: c ? (c.discount_type === 'percentage' ? String(c.value) : paiseToRupeeString(c.value)) : '',
    maxDiscount: c?.max_discount ? paiseToRupeeString(c.max_discount) : '',
    minSubtotal: c?.min_subtotal ? paiseToRupeeString(c.min_subtotal) : '',
    startsAt: isoToIstInput(c?.starts_at),
    endsAt: isoToIstInput(c?.ends_at),
    usageLimit: c?.usage_limit ? String(c.usage_limit) : '',
    perCustomerLimit: c?.per_customer_limit ? String(c.per_customer_limit) : '',
    firstOrderOnly: c?.first_order_only ?? false,
    scope: c?.scope ?? 'all',
    productIds: c?.productIds ?? [],
    categoryIds: c?.categoryIds ?? [],
    isActive: c?.is_active ?? true,
    isPublic: c?.is_public ?? false,
  };
}

function Picker({ options, selected, onChange, label }: { options: Option[]; selected: string[]; onChange: (ids: string[]) => void; label: string }) {
  const [q, setQ] = React.useState('');
  const shown = options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  return (
    <fieldset className="rounded-xl border border-line p-3">
      <legend className="px-1 text-xs text-muted">{label} · {selected.length} selected</legend>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="mb-2 h-9" aria-label={`Filter ${label.toLowerCase()}`} />
      <ul className="max-h-44 space-y-1 overflow-y-auto text-sm">
        {shown.map((o) => (
          <li key={o.id}>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={selected.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...selected, o.id] : selected.filter((x) => x !== o.id))} />
              {o.name}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function CouponEditor({ coupon, products, categories }: { coupon: CouponRow | null; products: Option[]; categories: Option[] }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<CouponInput>(() => toForm(coupon));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { run, pending } = useActionRunner();
  const set = <K extends keyof CouponInput>(k: K, v: CouponInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: keyof CouponInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never);

  return (
    <>
      {coupon ? (
        <Button size="sm" variant="ghost" onClick={() => { setForm(toForm(coupon)); setErrors({}); setOpen(true); }} aria-label={`Edit coupon ${coupon.code}`}>
          <Pencil /> Edit
        </Button>
      ) : (
        <Button size="sm" onClick={() => { setForm(toForm(null)); setErrors({}); setOpen(true); }}>
          <Plus /> New coupon
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{coupon ? `Edit ${coupon.code}` : 'New coupon'}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await run(() => saveCoupon(form));
              if (res.ok) setOpen(false);
              else setErrors(res.fieldErrors ?? {});
            }}
          >
            {errors.scope ? <Notice tone="danger" className="sm:col-span-2">{errors.scope}</Notice> : null}
            <Field label="Code" htmlFor="c-code" required error={errors.code} hint="Customers type this at checkout.">
              <Input id="c-code" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} maxLength={32} className="font-mono uppercase" />
            </Field>
            <Field label="Discount type" htmlFor="c-type">
              <NativeSelect id="c-type" value={form.discountType} onChange={text('discountType')}>
                <option value="percentage">Percentage off</option>
                <option value="fixed">Fixed amount off (₹)</option>
              </NativeSelect>
            </Field>
            <Field label={form.discountType === 'percentage' ? 'Percent off (1–90)' : 'Amount off (₹)'} htmlFor="c-value" required error={errors.value}>
              <Input id="c-value" inputMode="decimal" value={form.value} onChange={text('value')} />
            </Field>
            {form.discountType === 'percentage' ? (
              <Field label="Maximum discount (₹, optional)" htmlFor="c-max" error={errors.maxDiscount}>
                <Input id="c-max" inputMode="decimal" value={form.maxDiscount} onChange={text('maxDiscount')} />
              </Field>
            ) : <div className="hidden sm:block" />}
            <Field label="Minimum order (₹, optional)" htmlFor="c-min" error={errors.minSubtotal}>
              <Input id="c-min" inputMode="decimal" value={form.minSubtotal} onChange={text('minSubtotal')} />
            </Field>
            <Field label="Total uses (optional)" htmlFor="c-limit" error={errors.usageLimit}>
              <Input id="c-limit" inputMode="numeric" value={form.usageLimit} onChange={text('usageLimit')} />
            </Field>
            <Field label="Uses per customer (optional)" htmlFor="c-per" error={errors.perCustomerLimit}>
              <Input id="c-per" inputMode="numeric" value={form.perCustomerLimit} onChange={text('perCustomerLimit')} />
            </Field>
            <Field label="Starts (IST, optional)" htmlFor="c-start" error={errors.startsAt}>
              <Input id="c-start" type="datetime-local" value={form.startsAt} onChange={text('startsAt')} />
            </Field>
            <Field label="Ends (IST, optional)" htmlFor="c-end" error={errors.endsAt}>
              <Input id="c-end" type="datetime-local" value={form.endsAt} onChange={text('endsAt')} />
            </Field>
            <Field label="Applies to" htmlFor="c-scope">
              <NativeSelect id="c-scope" value={form.scope} onChange={text('scope')}>
                <option value="all">Whole order</option>
                <option value="products">Selected products</option>
                <option value="categories">Selected categories</option>
              </NativeSelect>
            </Field>
            <Field label="Description" htmlFor="c-desc" className="sm:col-span-2" hint="Shown to customers when the coupon is applied or listed.">
              <Textarea id="c-desc" rows={2} maxLength={200} value={form.description} onChange={text('description')} />
            </Field>
            {form.scope === 'products' ? <div className="sm:col-span-2"><Picker label="Products" options={products} selected={form.productIds ?? []} onChange={(ids) => set('productIds', ids)} /></div> : null}
            {form.scope === 'categories' ? <div className="sm:col-span-2"><Picker label="Categories" options={categories} selected={form.categoryIds ?? []} onChange={(ids) => set('categoryIds', ids)} /></div> : null}
            <div className="space-y-2 text-sm sm:col-span-2">
              {([['firstOrderOnly', 'Only for a customer’s first order'], ['isPublic', 'Show on the storefront (promotions)'], ['isActive', 'Active']] as const).map(([k, label]) => (
                <label key={k} className={cn('flex items-center gap-2')}>
                  <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={Boolean(form[k])} onChange={(e) => set(k, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" loading={pending}>{coupon ? 'Save coupon' : 'Create coupon'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
