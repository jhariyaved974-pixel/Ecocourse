import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient, serviceConfigured } from '@/lib/supabase/admin';
import { digestEmail, emailConfigured, sendEmail } from '@/lib/email';

// Called once a day by Vercel Cron (vercel.json) with "Authorization: Bearer $CRON_SECRET":
// 1. deadline reminders for projects due within 3 days, 2. one email digest per person for
// notifications not yet emailed (for people who have email notifications switched on).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!serviceConfigured) return NextResponse.json({ error: 'SUPABASE_SECRET_KEY is not set' }, { status: 503 });
  const sb = createServiceClient();
  const { data: reminders, error } = await sb.rpc('notify_upcoming_deadlines', { p_days: 3 });
  const out: Record<string, unknown> = { reminders: error ? `failed: ${error.message}` : reminders };
  if (!emailConfigured()) return NextResponse.json({ ...out, emails: 'not configured' });

  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const { data: pending } = await sb.from('notifications').select('id,user_id,title,body,link').is('emailed_at', null).gte('created_at', since).order('created_at').limit(2000);
  const byUser = new Map<string, { id: string; title: string; body: string | null; link: string | null }[]>();
  for (const n of (pending ?? []) as { id: string; user_id: string; title: string; body: string | null; link: string | null }[]) byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);
  const { data: people } = await sb.from('profiles').select('id,email,full_name,email_notifications,is_active').in('id', [...byUser.keys()]);
  let sent = 0, failed = 0;
  for (const p of (people ?? []) as { id: string; email: string; full_name: string | null; email_notifications: boolean; is_active: boolean }[]) {
    const items = byUser.get(p.id) ?? [];
    if (p.email_notifications && p.is_active && items.length) {
      try { const m = digestEmail(p.full_name?.split(' ')[0] || 'there', items.slice(0, 20)); await sendEmail({ to: p.email, ...m }); sent++; } catch { failed++; continue; }
    }
    await sb.from('notifications').update({ emailed_at: new Date().toISOString() }).in('id', items.map(i => i.id));
  }
  return NextResponse.json({ ...out, emailsSent: sent, emailsFailed: failed });
}
