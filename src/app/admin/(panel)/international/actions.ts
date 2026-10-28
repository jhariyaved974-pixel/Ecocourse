'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok } from '@/lib/errors';

const schema = z.object({
  id: z.uuid(),
  status: z.enum(['new', 'contacted', 'converted', 'closed']),
  note: z.string().trim().max(1000).optional(),
});

export async function updateInternationalLead(input: z.input<typeof schema>) {
  return staffAction(ROLE_GROUPS.orders, async ({ supabase }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail('Check the status and note (up to 1000 characters).');
    const { id, status, note } = parsed.data;
    const { error } = await supabase
      .from('international_leads')
      .update({ status, admin_note: note || null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return dbFail(error);
    revalidatePath('/admin/international');
    return ok(null, 'Lead updated');
  });
}
