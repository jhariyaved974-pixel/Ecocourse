'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok } from '@/lib/errors';
import { TAGS } from '@/lib/catalog/queries';

const moderateSchema = z.object({
  id: z.uuid(),
  action: z.enum(['approve', 'reject', 'feature', 'unfeature']),
  note: z.string().trim().max(500).optional(),
});

async function invalidate(supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createSupabaseServerClient>>, reviewId: string) {
  const { data } = await supabase.from('reviews').select('product:products(slug)').eq('id', reviewId).maybeSingle();
  updateTag(TAGS.reviews);
  updateTag(TAGS.catalog);
  if (data?.product?.slug) updateTag(TAGS.product(data.product.slug));
}

export async function moderateReview(input: z.input<typeof moderateSchema>) {
  return staffAction(ROLE_GROUPS.orders, async ({ supabase }) => {
    const parsed = moderateSchema.safeParse(input);
    if (!parsed.success) return fail('Invalid request.');
    const { id, action, note } = parsed.data;
    const patch =
      action === 'approve' ? { status: 'approved' as const, moderation_note: note || null }
      : action === 'reject' ? { status: 'rejected' as const, is_featured: false, moderation_note: note || null }
      : { is_featured: action === 'feature' };
    const { data, error } = await supabase.from('reviews').update(patch).eq('id', id).select('status, is_featured').maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail('Review not found.');
    if (action === 'feature' && !data.is_featured) return fail('Only approved reviews can be featured.');
    await invalidate(supabase, id);
    const messages = { approve: 'Review approved and published', reject: 'Review rejected', feature: 'Review featured on the homepage', unfeature: 'Review no longer featured' };
    return ok(null, messages[action]);
  });
}

export async function deleteReview(id: string) {
  return staffAction(ROLE_GROUPS.orders, async ({ supabase }) => {
    if (!z.uuid().safeParse(id).success) return fail('Invalid review.');
    await invalidate(supabase, id);
    const { error } = await supabase.from('reviews').delete().eq('id', id);
    if (error) return dbFail(error);
    return ok(null, 'Review deleted');
  });
}
