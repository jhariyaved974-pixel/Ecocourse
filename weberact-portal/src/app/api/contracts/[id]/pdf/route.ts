import { NextResponse, type NextRequest } from 'next/server';
import { apiViewer, isUuid, json, pdfResponse } from '@/lib/api';
import { contractPdf } from '@/lib/pdf';
import type { Contract, PortalSettings } from '@/lib/types';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await apiViewer();
  if (!v) return json({ error: 'Not signed in' }, 401);
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const { data: c } = await v.supabase.from('contracts').select('*, organization:organizations(id,name,legal_name,billing_address,country), project:projects(id,name)').eq('id', id).maybeSingle<Contract>();
  if (!c) return json({ error: 'Not found' }, 404);
  const download = req.nextUrl.searchParams.has('download');
  if (c.file_path && !req.nextUrl.searchParams.has('summary')) {
    // the uploaded document, through a short-lived link that storage rules allow for this person only
    const { data, error } = await v.supabase.storage.from('portal').createSignedUrl(c.file_path, 120, download ? { download: c.file_name ?? 'contract.pdf' } : undefined);
    if (error || !data) return json({ error: 'File not available' }, 404);
    return NextResponse.redirect(data.signedUrl, 302);
  }
  const { data: settings } = await v.supabase.from('portal_settings').select('*').eq('id', 1).single<PortalSettings>();
  const bytes = await contractPdf(c, c.organization!, settings!);
  return pdfResponse(bytes, `${c.title}.pdf`, download);
}
