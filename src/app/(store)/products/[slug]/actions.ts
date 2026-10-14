'use server';

import { z } from 'zod';
import { updateTag } from 'next/cache';
import { createSupabasePublicClient } from '@/lib/supabase/public';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { rateLimit, rateLimitByIp } from '@/lib/security';
import { dbErrorMessage, fail, ok, type ActionResult } from '@/lib/errors';
import { TAGS } from '@/lib/catalog/queries';

/** Fresh (uncached) stock for a product's variants so the size picker is accurate. */
export async function getLiveAvailability(productId: string): Promise<Record<string, number>> {
  if (!z.uuid().safeParse(productId).success) return {};
  if (!(await rateLimitByIp('availability', 120, 60))) return {};
  const { data } = await createSupabasePublicClient()
    .from('product_variants')
    .select('id, available')
    .eq('product_id', productId)
    .eq('is_active', true);
  return Object.fromEntries((data ?? []).map((v) => [v.id, Math.max(v.available ?? 0, 0)]));
}

const reviewSchema = z.object({
  productId: z.uuid(),
  rating: z.coerce.number().int().min(1, 'Choose a rating.').max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(10, 'Write at least 10 characters.').max(2000),
  authorName: z.string().trim().min(2, 'Enter your name.').max(60),
});

export async function submitReview(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return fail('Please sign in to write a review.', 'auth_required');
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check your review.');
  if (!(await rateLimit('review', user.id, 5, 86_400))) return fail('You have submitted several reviews today. Please try again tomorrow.');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('reviews').upsert(
    {
      product_id: parsed.data.productId,
      user_id: user.id,
      rating: parsed.data.rating,
      title: parsed.data.title || null,
      body: parsed.data.body,
      author_name: parsed.data.authorName,
    },
    { onConflict: 'product_id,user_id' },
  );
  if (error) return fail(dbErrorMessage(error, 'We could not save your review.'));
  updateTag(TAGS.reviews);
  return ok(null, 'Thanks! Your review will appear once it has been checked by our team.');
}
