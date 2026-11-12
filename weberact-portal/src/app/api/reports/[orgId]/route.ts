import type { NextRequest } from 'next/server';
import { apiViewer, isUuid, json, pdfResponse } from '@/lib/api';
import { clientReportPdf } from '@/lib/pdf';
import type { Invoice, Organization, PortalSettings, Project, SeoReport } from '@/lib/types';

// Staff only: a one-file summary of a client's projects, billing and search results.
export async function GET(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const v = await apiViewer();
  if (!v) return json({ error: 'Not signed in' }, 401);
  if (!v.isStaff) return json({ error: 'Forbidden' }, 403);
  if (!isUuid(orgId)) return json({ error: 'Not found' }, 404);
  const sb = v.supabase;
  const { data: org } = await sb.from('organizations').select('*').eq('id', orgId).maybeSingle<Organization>();
  if (!org) return json({ error: 'Not found' }, 404);
  const [{ data: projects }, { data: invoices }, { data: reports }, { data: settings }] = await Promise.all([
    sb.from('projects').select('*').eq('organization_id', orgId).order('created_at'),
    sb.from('invoice_summaries').select('*').eq('organization_id', orgId).order('issue_date'),
    sb.from('seo_reports').select('*').eq('organization_id', orgId).order('period', { ascending: false }),
    sb.from('portal_settings').select('*').eq('id', 1).single<PortalSettings>(),
  ]);
  const bytes = await clientReportPdf(org, (projects ?? []) as Project[], (invoices ?? []) as Invoice[], (reports ?? []) as SeoReport[], settings!);
  return pdfResponse(bytes, `${org.name} report.pdf`, req.nextUrl.searchParams.has('download'));
}
