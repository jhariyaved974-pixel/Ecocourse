import type { NextRequest } from 'next/server';
import { apiViewer, isUuid, json, pdfResponse } from '@/lib/api';
import { invoicePdf } from '@/lib/pdf';
import type { Invoice, InvoiceItem, Organization, Payment, PortalSettings } from '@/lib/types';

// Every read runs as the signed-in person: another client's invoice simply is not found.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await apiViewer();
  if (!v) return json({ error: 'Not signed in' }, 401);
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const sb = v.supabase;
  const { data: inv } = await sb.from('invoice_summaries').select('*').eq('id', id).maybeSingle<Invoice>();
  if (!inv) return json({ error: 'Not found' }, 404);
  const [{ data: items }, { data: payments }, { data: org }, { data: settings }] = await Promise.all([
    sb.from('invoice_items').select('*').eq('invoice_id', id).order('position'),
    sb.from('payments').select('*').eq('invoice_id', id).order('paid_at'),
    sb.from('organizations').select('*').eq('id', inv.organization_id).single<Organization>(),
    sb.from('portal_settings').select('*').eq('id', 1).single<PortalSettings>(),
  ]);
  const bytes = await invoicePdf(inv, (items ?? []) as InvoiceItem[], (payments ?? []) as Payment[], org!, settings!);
  return pdfResponse(bytes, `${inv.number ?? 'draft-invoice'}.pdf`, req.nextUrl.searchParams.has('download'));
}
