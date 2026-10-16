'use server';

import { applyOptOut, parseOptOut } from '@/lib/email/optout';
import { fail, ok, type ActionResult } from '@/lib/errors';
import { rateLimitByIp } from '@/lib/security';

export async function confirmOptOut(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  const optOut = parseOptOut({ kind: formData.get('kind'), u: formData.get('u'), e: formData.get('e'), t: formData.get('t') });
  if (!optOut) return fail('This link is invalid or has expired. Sign in to manage your email preferences.');
  if (!(await rateLimitByIp('unsubscribe', 30, 3600))) return fail('Too many attempts. Please try again later.');
  try {
    await applyOptOut(optOut);
  } catch (err) {
    console.error('opt-out failed', err instanceof Error ? err.message : err);
    return fail('We could not update your preferences right now. Please try again.');
  }
  return ok(
    null,
    optOut.kind === 'cart' ? 'Cart reminders are off. You can turn them on again in your account.' : 'You have been unsubscribed from our newsletter.',
  );
}
