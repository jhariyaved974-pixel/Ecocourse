'use server';

import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok } from '@/lib/errors';

const schema = z.object({
  id: z.uuid(),
  status: z.enum(['open', 'in_progress', 'resolved', 'rejected']),
  note: z.string().trim().max(1000).optional(),
});

export async function updateRequest(input: z.input<typeof schema>) {
  return staffAction(ROLE_GROUPS.orders, async ({ staff, supabase }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail('Invalid request.');
    const { id, status, note } = parsed.data;
    if ((status === 'resolved' || status === 'rejected') && (!note || note.length < 5)) return fail('Add a reply for the customer (at least 5 characters).');
    const closed = status === 'resolved' || status === 'rejected';
    const { error } = await supabase
      .from('customer_requests')
      .update({ status, resolution_note: note || null, resolved_by: closed ? staff.user.id : null, resolved_at: closed ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) return dbFail(error);
    return ok(null, 'Request updated');
  });
}
