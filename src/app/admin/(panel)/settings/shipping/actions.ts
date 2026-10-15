'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors } from '@/lib/errors';
import { CONTENT_TAGS } from '@/lib/content/queries';

const rupees = z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, 'Enter an amount in rupees.').transform((v) => Math.round(Number(v) * 100));
const optionalRupees = z.string().trim().refine((v) => v === '' || /^\d{1,7}(\.\d{1,2})?$/.test(v), 'Enter an amount in rupees.').transform((v) => (v === '' ? null : Math.round(Number(v) * 100)));

const methodSchema = z
  .object({
    id: z.uuid().optional(),
    code: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,30}$/, '2–30 lowercase letters, numbers or _.'),
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(200),
    fee: rupees,
    freeOver: optionalRupees,
    minDays: z.coerce.number().int().min(0).max(60),
    maxDays: z.coerce.number().int().min(0).max(90),
    isActive: z.boolean(),
    sortOrder: z.coerce.number().int().min(0).max(1000),
  })
  .refine((v) => v.maxDays >= v.minDays, { path: ['maxDays'], message: 'Must be at least the minimum days.' });

export type ShippingMethodInput = z.input<typeof methodSchema>;

export async function saveShippingMethod(input: ShippingMethodInput) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = methodSchema.safeParse(input);
    if (!parsed.success) return fail('Please check the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const m = parsed.data;
    const row = { code: m.code, name: m.name, description: m.description, fee: m.fee, free_over: m.freeOver, min_days: m.minDays, max_days: m.maxDays, is_active: m.isActive, sort_order: m.sortOrder };
    if (!m.isActive) {
      const { count } = await supabase.from('shipping_methods').select('id', { count: 'exact', head: true }).eq('is_active', true).neq('id', m.id ?? '00000000-0000-0000-0000-000000000000');
      if ((count ?? 0) === 0) return fail('Keep at least one active delivery method, or customers cannot check out.');
    }
    const { error } = m.id ? await supabase.from('shipping_methods').update(row).eq('id', m.id) : await supabase.from('shipping_methods').insert(row);
    if (error) return error.code === '23505' ? fail('That code is already used.', 'duplicate', { code: 'Already used' }) : dbFail(error);
    updateTag(CONTENT_TAGS.settings);
    return ok(null, 'Delivery method saved');
  });
}

const taxSchema = z.object({
  enabled: z.boolean(),
  pricesIncludeTax: z.boolean(),
  taxLabel: z.string().trim().min(1).max(20),
  businessTaxId: z.string().trim().toUpperCase().refine((v) => v === '' || /^[0-9A-Z]{15}$/.test(v), 'A GSTIN has 15 letters and digits.'),
});

export async function saveTaxSettings(input: z.input<typeof taxSchema>) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = taxSchema.safeParse(input);
    if (!parsed.success) return fail('Please check the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const t = parsed.data;
    const { error } = await supabase
      .from('tax_settings')
      .update({ enabled: t.enabled, prices_include_tax: t.pricesIncludeTax, tax_label: t.taxLabel, business_tax_id: t.businessTaxId || null })
      .eq('id', true);
    if (error) return dbFail(error);
    updateTag(CONTENT_TAGS.settings);
    return ok(null, 'Tax settings saved');
  });
}

const ruleSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(60),
    ratePercent: z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Enter a rate like 5 or 18.'),
    minUnitPrice: z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, 'Enter an amount in rupees.'),
    maxUnitPrice: z.string().trim().refine((v) => v === '' || /^\d{1,7}(\.\d{1,2})?$/.test(v), 'Enter an amount in rupees.'),
    priority: z.coerce.number().int().min(0).max(1000),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (Number(v.ratePercent) > 100) ctx.addIssue({ code: 'custom', path: ['ratePercent'], message: 'At most 100%.' });
    if (v.maxUnitPrice !== '' && Number(v.maxUnitPrice) < Number(v.minUnitPrice)) ctx.addIssue({ code: 'custom', path: ['maxUnitPrice'], message: 'Must be at least the minimum.' });
  });

export type TaxRuleInput = z.input<typeof ruleSchema>;

export async function saveTaxRule(input: TaxRuleInput) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = ruleSchema.safeParse(input);
    if (!parsed.success) return fail('Please check the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const r = parsed.data;
    const row = {
      name: r.name,
      rate_bps: Math.round(Number(r.ratePercent) * 100),
      min_unit_price: Math.round(Number(r.minUnitPrice) * 100),
      max_unit_price: r.maxUnitPrice === '' ? null : Math.round(Number(r.maxUnitPrice) * 100),
      priority: r.priority,
      is_active: r.isActive,
    };
    const { error } = r.id ? await supabase.from('tax_rules').update(row).eq('id', r.id) : await supabase.from('tax_rules').insert(row);
    if (error) return dbFail(error);
    updateTag(CONTENT_TAGS.settings);
    return ok(null, 'Tax rule saved');
  });
}

export async function deleteTaxRule(id: string) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    if (!z.uuid().safeParse(id).success) return fail('Invalid rule.');
    const { error } = await supabase.from('tax_rules').delete().eq('id', id);
    if (error) return dbFail(error);
    updateTag(CONTENT_TAGS.settings);
    return ok(null, 'Tax rule deleted');
  });
}
