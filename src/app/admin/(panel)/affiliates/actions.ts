'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { CONTENT_TAGS } from '@/lib/content/queries';
import { fail, ok } from '@/lib/errors';

const reviewSchema = z.object({
  id: z.uuid(),
  status: z.enum(['pending', 'approved', 'rejected', 'suspended']),
  ratePercent: z.number().min(0).max(50).nullable(),
  note: z.string().trim().max(500).optional(),
});

export async function reviewAffiliate(input: z.input<typeof reviewSchema>) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) return fail('Check the status and commission rate (0–50%).');
    const { id, status, ratePercent, note } = parsed.data;
    const { error } = await supabase.rpc('admin_review_affiliate', {
      p_affiliate_id: id,
      p_status: status,
      p_commission_bps: ratePercent === null ? undefined : Math.round(ratePercent * 100),
      p_note: note || undefined,
    });
    if (error) return dbFail(error);
    revalidatePath('/admin/affiliates');
    return ok(null, 'Affiliate updated');
  });
}

const payoutSchema = z.object({ id: z.uuid(), reference: z.string().trim().min(4).max(80), note: z.string().trim().max(300).optional() });

export async function recordAffiliatePayout(input: z.input<typeof payoutSchema>) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = payoutSchema.safeParse(input);
    if (!parsed.success) return fail('Enter the UTR / UPI reference of the payout (4–80 characters).');
    const { data, error } = await supabase.rpc('admin_record_affiliate_payout', {
      p_affiliate_id: parsed.data.id,
      p_reference: parsed.data.reference,
      p_note: parsed.data.note || undefined,
    });
    if (error) return dbFail(error);
    revalidatePath('/admin/affiliates');
    const paid = data as { amount: number; commissions: number };
    return ok(null, `Payout recorded for ${paid.commissions} commission(s)`);
  });
}

export async function cancelAffiliateCommission(id: string, reason: string) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    if (!z.uuid().safeParse(id).success) return fail('Invalid commission.');
    const { error } = await supabase.rpc('admin_cancel_affiliate_commission', { p_commission_id: id, p_reason: reason });
    if (error) return dbFail(error);
    revalidatePath('/admin/affiliates');
    return ok(null, 'Commission cancelled');
  });
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  ratePercent: z.number().min(0).max(50),
  cookieDays: z.number().int().min(1).max(90),
  minPayoutRupees: z.number().min(0).max(1_000_000),
});

export async function saveAffiliateSettings(input: z.input<typeof settingsSchema>) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) return fail('Commission 0–50%, cookie 1–90 days, minimum payout 0 or more.');
    const v = parsed.data;
    const { error } = await supabase
      .from('store_settings')
      .update({
        affiliate_enabled: v.enabled,
        affiliate_commission_bps: Math.round(v.ratePercent * 100),
        affiliate_cookie_days: v.cookieDays,
        affiliate_min_payout: Math.round(v.minPayoutRupees * 100),
      })
      .eq('id', true);
    if (error) return dbFail(error);
    updateTag(CONTENT_TAGS.settings);
    revalidatePath('/admin/affiliates');
    return ok(null, 'Affiliate settings saved');
  });
}
