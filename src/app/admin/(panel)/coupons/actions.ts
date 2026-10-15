'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors } from '@/lib/errors';
import { CONTENT_TAGS } from '@/lib/content/queries';
import { istInputToIso } from '@/lib/admin/products';

const rupees = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{1,7}(\.\d{1,2})?$/.test(v), `${label} must be an amount in rupees.`)
    .transform((v) => (v === '' ? null : Math.round(Number(v) * 100)));
const count = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{1,6}$/.test(v), `${label} must be a whole number.`)
    .transform((v) => (v === '' ? null : Number(v)))
    .refine((v) => v === null || v > 0, `${label} must be at least 1.`);

const couponSchema = z
  .object({
    id: z.uuid().optional(),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, 'Use 3–32 letters, numbers, - or _.'),
    description: z.string().trim().max(200),
    discountType: z.enum(['percentage', 'fixed']),
    value: z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, 'Enter the discount.'),
    maxDiscount: rupees('Maximum discount'),
    minSubtotal: rupees('Minimum order'),
    startsAt: z.string().trim().max(20),
    endsAt: z.string().trim().max(20),
    usageLimit: count('Total uses'),
    perCustomerLimit: count('Uses per customer'),
    firstOrderOnly: z.boolean(),
    scope: z.enum(['all', 'products', 'categories']),
    productIds: z.array(z.uuid()).max(500),
    categoryIds: z.array(z.uuid()).max(200),
    isActive: z.boolean(),
    isPublic: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const n = Number(v.value);
    if (v.discountType === 'percentage' && (!Number.isInteger(n) || n < 1 || n > 90)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Percentage must be a whole number from 1 to 90.' });
    if (v.discountType === 'fixed' && n <= 0) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter an amount above ₹0.' });
    const s = istInputToIso(v.startsAt);
    const e = istInputToIso(v.endsAt);
    if (v.startsAt && !s) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'Invalid start date.' });
    if (v.endsAt && !e) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Invalid end date.' });
    if (s && e && e <= s) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The end must be after the start.' });
    if (v.scope === 'products' && v.productIds.length === 0) ctx.addIssue({ code: 'custom', path: ['scope'], message: 'Choose at least one product.' });
    if (v.scope === 'categories' && v.categoryIds.length === 0) ctx.addIssue({ code: 'custom', path: ['scope'], message: 'Choose at least one category.' });
  });

export type CouponInput = z.input<typeof couponSchema>;

export async function saveCoupon(input: CouponInput) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = couponSchema.safeParse(input);
    if (!parsed.success) return fail('Please check the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const c = parsed.data;
    const row = {
      code: c.code,
      description: c.description,
      discount_type: c.discountType,
      value: c.discountType === 'percentage' ? Number(c.value) : Math.round(Number(c.value) * 100),
      max_discount: c.discountType === 'percentage' ? c.maxDiscount : null,
      min_subtotal: c.minSubtotal ?? 0,
      starts_at: istInputToIso(c.startsAt),
      ends_at: istInputToIso(c.endsAt),
      usage_limit: c.usageLimit,
      per_customer_limit: c.perCustomerLimit,
      first_order_only: c.firstOrderOnly,
      scope: c.scope,
      is_active: c.isActive,
      is_public: c.isPublic,
    };
    const { data, error } = c.id
      ? await supabase.from('coupons').update(row).eq('id', c.id).select('id').single()
      : await supabase.from('coupons').insert(row).select('id').single();
    if (error) return error.code === '23505' ? fail('A coupon with this code already exists.', 'duplicate', { code: 'This code is already used.' }) : dbFail(error);
    const id = data.id;
    // Replace the scope lists.
    const delP = await supabase.from('coupon_products').delete().eq('coupon_id', id);
    const delC = await supabase.from('coupon_categories').delete().eq('coupon_id', id);
    if (delP.error || delC.error) return dbFail((delP.error ?? delC.error)!);
    if (c.scope === 'products') {
      const { error: e } = await supabase.from('coupon_products').insert(c.productIds.map((product_id) => ({ coupon_id: id, product_id })));
      if (e) return dbFail(e);
    }
    if (c.scope === 'categories') {
      const { error: e } = await supabase.from('coupon_categories').insert(c.categoryIds.map((category_id) => ({ coupon_id: id, category_id })));
      if (e) return dbFail(e);
    }
    updateTag(CONTENT_TAGS.content);
    return ok({ id }, c.id ? 'Coupon saved' : 'Coupon created');
  });
}

export async function setCouponActive(id: string, active: boolean) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    if (!z.uuid().safeParse(id).success) return fail('Invalid coupon.');
    const { error } = await supabase.from('coupons').update({ is_active: active }).eq('id', id);
    if (error) return dbFail(error);
    updateTag(CONTENT_TAGS.content);
    return ok(null, active ? 'Coupon activated' : 'Coupon deactivated');
  });
}

/** Deleting is only allowed for unused coupons; used ones keep their redemption history and are deactivated instead. */
export async function deleteCoupon(id: string) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    if (!z.uuid().safeParse(id).success) return fail('Invalid coupon.');
    const { count, error: countError } = await supabase.from('coupon_redemptions').select('id', { count: 'exact', head: true }).eq('coupon_id', id);
    if (countError) return dbFail(countError);
    const { count: orders } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('coupon_id', id);
    if ((count ?? 0) > 0 || (orders ?? 0) > 0) return fail('This coupon has been used on orders. Deactivate it instead so the order history stays intact.', 'in_use');
    const { error } = await supabase.from('coupons').delete().eq('id', id);
    if (error) return dbFail(error);
    updateTag(CONTENT_TAGS.content);
    return ok(null, 'Coupon deleted');
  });
}
