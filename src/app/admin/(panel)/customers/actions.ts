'use server';

import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok } from '@/lib/errors';

const blockSchema = z.object({ id: z.uuid(), blocked: z.boolean(), reason: z.string().trim().max(300).optional() });

/** Blocked customers cannot place orders (place_order refuses them). */
export async function setCustomerBlocked(input: z.input<typeof blockSchema>) {
  return staffAction(ROLE_GROUPS.orders, async ({ supabase }) => {
    const parsed = blockSchema.safeParse(input);
    if (!parsed.success) return fail('Invalid request.');
    const { id, blocked, reason } = parsed.data;
    if (blocked && (!reason || reason.length < 5)) return fail('Give a reason (at least 5 characters).');
    const { data: staff } = await supabase.from('staff_members').select('user_id').eq('user_id', id).maybeSingle();
    if (staff) return fail('Staff accounts are managed in Staff & security.');
    const { error } = await supabase.from('profiles').update({ is_blocked: blocked, blocked_reason: blocked ? reason : null }).eq('id', id);
    if (error) return dbFail(error);
    return ok(null, blocked ? 'Customer blocked' : 'Customer unblocked');
  });
}

export async function deleteSubscriber(id: string) {
  return staffAction(ROLE_GROUPS.admin, async ({ supabase }) => {
    if (!z.uuid().safeParse(id).success) return fail('Invalid subscriber.');
    const { error } = await supabase.from('newsletter_subscribers').delete().eq('id', id);
    if (error) return dbFail(error);
    return ok(null, 'Subscriber removed');
  });
}
