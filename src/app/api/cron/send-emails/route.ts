import { NextResponse } from 'next/server';
import { integrations } from '@/lib/env.server';
import { isCronRequest } from '@/lib/security';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { deliverQueuedEmails } from '@/lib/email/outbox';

export const maxDuration = 60;

/**
 * Sweeper for the email outbox: queues consented cart reminders, then sends
 * whatever is waiting (new messages and retries). Most emails are already sent
 * right after the action that created them; this catches the rest.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ ok: false }, { status: 401 });
  if (!integrations.serviceRole) return NextResponse.json({ ok: false, error: 'Service role key missing.' }, { status: 503 });
  let reminders = 0;
  if (integrations.email) {
    const { data, error } = await createSupabaseServiceClient().rpc('enqueue_cart_reminders', { p_limit: 100 });
    if (error) console.error('cart reminders failed', error.message);
    reminders = data ?? 0;
  }
  try {
    const emails = await deliverQueuedEmails(80);
    return NextResponse.json({ ok: true, reminders, emails }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('email delivery error', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, reminders, error: 'Delivery failed.' }, { status: 500 });
  }
}
