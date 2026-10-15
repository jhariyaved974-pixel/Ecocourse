import { NextResponse } from 'next/server';
import { getStaff, roleAllowed, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/admin/operations';

// Active (consenting) newsletter subscribers only, for owners/admins.
export async function GET() {
  const staff = await getStaff();
  if (!staff || !roleAllowed(staff.role, ROLE_GROUPS.admin)) return new NextResponse('Forbidden', { status: 403 });
  const supabase = await createSupabaseServerClient();
  const rows: unknown[][] = [['email', 'source', 'subscribed_at', 'consent_text']];
  for (let from = 0; from < 100000; from += 1000) {
    const { data, error } = await supabase.from('newsletter_subscribers').select('email, source, created_at, consent_text').eq('status', 'subscribed').order('created_at').range(from, from + 999);
    if (error) return new NextResponse('Export failed', { status: 500 });
    for (const s of data ?? []) rows.push([s.email, s.source, s.created_at, s.consent_text]);
    if (!data || data.length < 1000) break;
  }
  return new NextResponse(toCsv(rows), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="subscribers.csv"', 'Cache-Control': 'private, no-store' },
  });
}
