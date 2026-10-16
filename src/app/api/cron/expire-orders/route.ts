import { NextResponse } from 'next/server';
import { integrations } from '@/lib/env.server';
import { isCronRequest } from '@/lib/security';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { deliverQueuedEmails } from '@/lib/email/outbox';

export const maxDuration = 60;

/**
 * Cancels unpaid orders whose payment window has lapsed and releases their
 * stock. Orders with a submitted proof are never expired here (they wait for
 * staff); overdue reviews are only flagged. Also runs in the database via
 * pg_cron when available, and opportunistically during checkout.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ ok: false }, { status: 401 });
  if (!integrations.serviceRole) return NextResponse.json({ ok: false, error: 'Service role key missing.' }, { status: 503 });
  const { data, error } = await createSupabaseServiceClient().rpc('expire_stale_orders', { p_limit: 500 });
  if (error) {
    console.error('expire-orders failed', error.message);
    return NextResponse.json({ ok: false, error: 'Expiry failed.' }, { status: 500 });
  }
  const emails = await deliverQueuedEmails(25).catch((err) => {
    console.error('email delivery error', err instanceof Error ? err.message : err);
    return null;
  });
  return NextResponse.json({ ok: true, expired: data ?? 0, emails }, { headers: { 'Cache-Control': 'no-store' } });
}
