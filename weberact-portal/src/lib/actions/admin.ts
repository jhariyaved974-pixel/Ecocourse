'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { actionViewer } from '@/lib/auth';
import { createServiceClient, serviceConfigured } from '@/lib/supabase/admin';
import { SITE_URL } from '@/lib/env';
import { analyticsOrganicSessions, googleConfigured, pageSpeed, searchConsoleMonth } from '@/lib/google';
import { CURRENCIES } from '@/lib/constants';
import { fail, ok, type Result } from '@/lib/utils';

// Every action checks the caller's role on the server, validates its input, and then runs as the
// caller, so row level security applies on top. Nothing here trusts what the browser says.
const refresh = () => revalidatePath('/', 'layout');
const msg = (e: unknown) => (e instanceof z.ZodError ? e.issues.map(i => i.message).join('. ') : e);
const uuid = z.string().uuid();
const optUuid = z.string().uuid().nullable().optional().or(z.literal('').transform(() => null));
const optText = (max: number) => z.string().trim().max(max).optional().transform(v => (v ? v : null));
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('').transform(() => null));
const currency = z.enum(CURRENCIES);
const email = z.string().trim().toLowerCase().email('Enter a valid email');

async function invite(emailAddr: string, fullName: string) {
  if (!serviceConfigured) return 'Saved. To give access, ask them to open the portal and choose "Email link" with this address (needs sign-ups enabled in Supabase), or add SUPABASE_SECRET_KEY to send invites from here.';
  const { error } = await createServiceClient().auth.admin.inviteUserByEmail(emailAddr, { redirectTo: `${SITE_URL}/auth/callback?next=/set-password`, data: { full_name: fullName } });
  if (error) return /already|registered|exists/i.test(error.message) ? 'They already have an account and can sign in now.' : `Saved, but the invite email failed: ${error.message}`;
  return `Invite sent to ${emailAddr}.`;
}

// ------------------------------------------------------------------ clients
const orgFields = z.object({
  name: z.string().trim().min(2, 'Enter the company name').max(160), legal_name: optText(200), website: optText(300), country: optText(80), industry: optText(120),
  tax_id: optText(40), billing_address: optText(500), currency, gsc_site_url: optText(300),
  ga4_property_id: z.string().trim().regex(/^(\d{4,20})?$/, 'GA4 property ID is a number').optional().transform(v => v || null), notes: optText(4000),
});
const contactFields = z.object({ full_name: z.string().trim().min(2, 'Enter the contact name').max(120), email, phone: optText(40), job_title: optText(120) });

export async function createClientAccount(input: { org: z.input<typeof orgFields>; contact: z.input<typeof contactFields>; sendInvite: boolean }): Promise<Result<{ id: string }>> {
  try {
    const v = await actionViewer('staff');
    const org = orgFields.parse(input.org), c = contactFields.parse(input.contact);
    const { data, error } = await v.supabase.from('organizations').insert({ ...org, created_by: v.userId }).select('id').single();
    if (error) return fail(error);
    const ce = await v.supabase.from('clients').insert({ ...c, organization_id: data.id, is_primary: true });
    if (ce.error) { await v.supabase.from('organizations').delete().eq('id', data.id); return fail(ce.error); }
    const note = input.sendInvite ? await invite(c.email, c.full_name) : 'Client created.';
    refresh(); return ok({ id: data.id as string }, note);
  } catch (e) { return fail(msg(e)); }
}
export async function updateOrganization(id: string, input: z.input<typeof orgFields>): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const { error } = await v.supabase.from('organizations').update(orgFields.parse(input)).eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, 'Client details saved');
  } catch (e) { return fail(msg(e)); }
}
export async function setOrganizationStatus(id: string, status: 'active' | 'inactive'): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const { error } = await v.supabase.from('organizations').update({ status: z.enum(['active', 'inactive']).parse(status) }).eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, status === 'inactive' ? 'Client deactivated: their people can no longer sign in to anything' : 'Client reactivated');
  } catch (e) { return fail(msg(e)); }
}
async function removeFolder(sb: Awaited<ReturnType<typeof actionViewer>>['supabase'], prefix: string, depth = 0): Promise<void> {
  if (depth > 6) return;
  const { data } = await sb.storage.from('portal').list(prefix, { limit: 1000 });
  const files = (data ?? []).filter((x: { id: string | null }) => x.id).map((x: { name: string }) => `${prefix}/${x.name}`);
  if (files.length) await sb.storage.from('portal').remove(files);
  for (const d of (data ?? []).filter((x: { id: string | null }) => !x.id)) await removeFolder(sb, `${prefix}/${(d as { name: string }).name}`, depth + 1);
}
export async function deleteOrganization(id: string, confirmName: string): Promise<Result> {
  try {
    const v = await actionViewer('admin');
    const { data: org } = await v.supabase.from('organizations').select('id,name').eq('id', uuid.parse(id)).single();
    if (!org) return fail('Client not found');
    if (confirmName.trim() !== org.name) return fail('Type the client name exactly to confirm.');
    const { count } = await v.supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('organization_id', id).neq('status', 'draft');
    if (count) return fail('This client has issued invoices, which must be kept. Deactivate the client instead.');
    await v.supabase.from('invoices').delete().eq('organization_id', id);
    const { error } = await v.supabase.from('organizations').delete().eq('id', id);
    if (error) return fail(error);
    await removeFolder(v.supabase, id);
    refresh(); return ok(undefined, 'Client and all its data deleted');
  } catch (e) { return fail(msg(e)); }
}
export async function addContact(orgId: string, input: z.input<typeof contactFields>, sendInvite: boolean): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const c = contactFields.parse(input);
    const { error } = await v.supabase.from('clients').insert({ ...c, organization_id: uuid.parse(orgId) });
    if (error) return fail(error);
    const note = sendInvite ? await invite(c.email, c.full_name) : 'Contact added.';
    refresh(); return ok(undefined, note);
  } catch (e) { return fail(msg(e)); }
}
export async function updateContact(id: string, input: { full_name: string; phone?: string; job_title?: string; is_primary?: boolean }): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const d = z.object({ full_name: contactFields.shape.full_name, phone: optText(40), job_title: optText(120), is_primary: z.boolean().optional() }).parse(input);
    const { error } = await v.supabase.from('clients').update(d).eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, 'Contact saved');
  } catch (e) { return fail(msg(e)); }
}
export async function setContactStatus(id: string, status: 'active' | 'inactive'): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const { data: c } = await v.supabase.from('clients').select('user_id').eq('id', uuid.parse(id)).single();
    const next = status === 'inactive' ? 'inactive' : c?.user_id ? 'active' : 'invited';
    const { error } = await v.supabase.from('clients').update({ status: next }).eq('id', id);
    if (error) return fail(error); refresh(); return ok(undefined, status === 'inactive' ? 'Access removed' : 'Access restored');
  } catch (e) { return fail(msg(e)); }
}
export async function removeContact(id: string): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const { error } = await v.supabase.from('clients').delete().eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, 'Contact removed');
  } catch (e) { return fail(msg(e)); }
}
export async function resendInvite(id: string): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const { data: c } = await v.supabase.from('clients').select('email,full_name,status').eq('id', uuid.parse(id)).single();
    if (!c) return fail('Contact not found');
    if (c.status === 'inactive') return fail('Restore access first.');
    return ok(undefined, await invite(c.email, c.full_name));
  } catch (e) { return fail(msg(e)); }
}

// ------------------------------------------------------------------ projects
const projectFields = z.object({
  organization_id: uuid, name: z.string().trim().min(2, 'Enter a project name').max(160), description: optText(4000), scope: optText(8000),
  deliverables: z.array(z.string().trim().min(1).max(300)).max(40).default([]), manager_id: optUuid,
  start_date: optDate, due_date: optDate, value: z.coerce.number().min(0).nullable().optional(), currency,
  status: z.enum(['active', 'on_hold', 'completed', 'cancelled']).default('active'), service_ids: z.array(uuid).default([]),
}).refine(p => !p.start_date || !p.due_date || p.due_date >= p.start_date, { message: 'The delivery date must be after the start date', path: ['due_date'] });

export async function saveProject(id: string | null, input: z.input<typeof projectFields>): Promise<Result<{ id: string }>> {
  try {
    const v = await actionViewer('staff');
    const { service_ids, ...p } = projectFields.parse(input);
    let pid = id;
    if (id) {
      const { error } = await v.supabase.from('projects').update(p).eq('id', uuid.parse(id));
      if (error) return fail(error);
    } else {
      const { data, error } = await v.supabase.from('projects').insert({ ...p, created_by: v.userId }).select('id').single();
      if (error) return fail(error); pid = data.id;
    }
    await v.supabase.from('project_services').delete().eq('project_id', pid!);
    if (service_ids.length) { const { error } = await v.supabase.from('project_services').insert(service_ids.map(s => ({ project_id: pid, service_id: s }))); if (error) return fail(error); }
    refresh(); return ok({ id: pid! }, id ? 'Project saved' : 'Project created. The client has been notified.');
  } catch (e) { return fail(msg(e)); }
}
export async function setProjectStage(id: string, stage: number): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const s = z.number().int().min(1).max(8).parse(stage);
    const { error } = await v.supabase.from('projects').update({ stage: s, ...(s < 8 ? {} : { status: 'completed' }) }).eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, 'Stage updated. The client sees it now.');
  } catch (e) { return fail(msg(e)); }
}
export async function saveStageNote(stageId: string, notes: string): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const { error } = await v.supabase.from('project_stages').update({ notes: z.string().max(2000).parse(notes).trim() || null }).eq('id', uuid.parse(stageId));
    if (error) return fail(error); refresh(); return ok(undefined, 'Note saved');
  } catch (e) { return fail(msg(e)); }
}
export async function deleteProject(id: string): Promise<Result> {
  try {
    const v = await actionViewer('admin');
    const { data: files } = await v.supabase.from('project_files').select('storage_path').eq('project_id', uuid.parse(id));
    const { error } = await v.supabase.from('projects').delete().eq('id', id);
    if (error) return fail(error);
    const paths = ((files ?? []) as { storage_path: string }[]).map(f => f.storage_path);
    if (paths.length) await v.supabase.storage.from('portal').remove(paths);
    refresh(); return ok(undefined, 'Project deleted');
  } catch (e) { return fail(msg(e)); }
}

// ------------------------------------------------------------------ services
const serviceFields = z.object({ name: z.string().trim().min(2).max(80), description: optText(600), is_active: z.boolean(), sort: z.coerce.number().int().min(0).max(999) });
export async function saveService(id: string | null, input: z.input<typeof serviceFields>): Promise<Result> {
  try {
    const v = await actionViewer('admin');
    const d = serviceFields.parse(input);
    const slug = d.name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const { error } = id ? await v.supabase.from('services').update(d).eq('id', uuid.parse(id)) : await v.supabase.from('services').insert({ ...d, slug });
    if (error) return fail(error); refresh(); return ok(undefined, 'Service saved');
  } catch (e) { return fail(msg(e)); }
}

// ------------------------------------------------------------------ onboarding
export async function updateOnboarding(id: string, input: { status?: string; admin_notes?: string; project_id?: string | null; data?: unknown }): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const d = z.object({ status: z.enum(['draft', 'submitted', 'in_review', 'approved']).optional(), admin_notes: z.string().max(4000).optional(), project_id: optUuid, data: z.record(z.string(), z.unknown()).optional() }).parse(input);
    const { error } = await v.supabase.from('onboarding_submissions').update(d).eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, 'Onboarding updated');
  } catch (e) { return fail(msg(e)); }
}

// ------------------------------------------------------------------ contracts
const contractFields = z.object({
  organization_id: uuid, project_id: optUuid, title: z.string().trim().min(2, 'Enter a title').max(200), scope: optText(20000), payment_terms: optText(4000),
  start_date: optDate, end_date: optDate, value: z.coerce.number().min(0).nullable().optional(), currency,
  file_path: z.string().max(500).nullable().optional(), file_name: z.string().max(255).nullable().optional(), file_sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable().optional(),
});
export async function saveContract(id: string | null, input: z.input<typeof contractFields>, send: boolean): Promise<Result<{ id: string }>> {
  try {
    const v = await actionViewer('staff');
    const d = contractFields.parse(input);
    if (d.file_path && d.file_path.split('/')[0] !== d.organization_id) return fail('The file belongs to another client.');
    if (id) {
      const { error } = await v.supabase.from('contracts').update({ ...d, ...(send ? { status: 'sent' } : {}) }).eq('id', uuid.parse(id));
      if (error) return fail(error); refresh(); return ok({ id }, send ? 'Contract sent to the client' : 'Contract saved');
    }
    const { data, error } = await v.supabase.from('contracts').insert({ ...d, status: send ? 'sent' : 'draft', created_by: v.userId }).select('id').single();
    if (error) return fail(error);
    if (d.file_path) await v.supabase.from('project_files').insert({ organization_id: d.organization_id, project_id: d.project_id ?? null, kind: 'contract', folder: 'Contracts', name: d.file_name ?? 'Contract.pdf', storage_path: d.file_path, mime_type: 'application/pdf', uploaded_by: v.userId, description: d.title });
    refresh(); return ok({ id: data.id as string }, send ? 'Contract sent to the client' : 'Draft saved');
  } catch (e) { return fail(msg(e)); }
}
export async function setContractStatus(id: string, status: 'sent' | 'void' | 'expired'): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const { error } = await v.supabase.from('contracts').update({ status: z.enum(['sent', 'void', 'expired']).parse(status) }).eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, status === 'sent' ? 'Sent to the client' : `Contract marked ${status}`);
  } catch (e) { return fail(msg(e)); }
}
export async function deleteContract(id: string): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const { data: c } = await v.supabase.from('contracts').select('status').eq('id', uuid.parse(id)).single();
    if (c?.status !== 'draft') return fail('Only drafts can be deleted. Void a sent contract instead.');
    const { error } = await v.supabase.from('contracts').delete().eq('id', id);
    if (error) return fail(error); refresh(); return ok(undefined, 'Draft deleted');
  } catch (e) { return fail(msg(e)); }
}

// ------------------------------------------------------------------ invoices and payments
const item = z.object({ description: z.string().trim().min(1, 'Every item needs a description').max(500), quantity: z.coerce.number().positive('Quantity must be above 0'), unit_price: z.coerce.number().min(0), tax_rate: z.coerce.number().min(0).max(100) });
const invoiceFields = z.object({
  organization_id: uuid, project_id: optUuid, currency, issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: optText(2000), items: z.array(item).max(50),
}).refine(i => i.due_date >= i.issue_date, { message: 'The due date must be on or after the issue date', path: ['due_date'] });

export async function saveInvoice(id: string | null, input: z.input<typeof invoiceFields>, issue: boolean): Promise<Result<{ id: string }>> {
  try {
    const v = await actionViewer('admin');
    const { items, ...inv } = invoiceFields.parse(input);
    if (issue && !items.length) return fail('Add at least one item before issuing.');
    let iid = id;
    if (id) {
      const { data: cur } = await v.supabase.from('invoices').select('status').eq('id', uuid.parse(id)).single();
      if (cur?.status !== 'draft') return fail('Only draft invoices can be edited.');
      const { error } = await v.supabase.from('invoices').update(inv).eq('id', id);
      if (error) return fail(error);
      await v.supabase.from('invoice_items').delete().eq('invoice_id', id);
    } else {
      const { data, error } = await v.supabase.from('invoices').insert({ ...inv, created_by: v.userId }).select('id').single();
      if (error) return fail(error); iid = data.id;
    }
    if (items.length) {
      const { error } = await v.supabase.from('invoice_items').insert(items.map((it, i) => ({ ...it, invoice_id: iid, position: i + 1 })));
      if (error) return fail(error);
    }
    if (issue) { const { error } = await v.supabase.from('invoices').update({ status: 'issued' }).eq('id', iid!); if (error) return fail(error); }
    refresh(); return ok({ id: iid! }, issue ? 'Invoice issued. The client has been notified.' : 'Draft saved');
  } catch (e) { return fail(msg(e)); }
}
export async function setInvoiceStatus(id: string, status: 'issued' | 'void'): Promise<Result> {
  try {
    const v = await actionViewer('admin');
    const { error } = await v.supabase.from('invoices').update({ status: z.enum(['issued', 'void']).parse(status) }).eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, status === 'issued' ? 'Invoice issued' : 'Invoice voided');
  } catch (e) { return fail(msg(e)); }
}
export async function deleteInvoice(id: string): Promise<Result> {
  try {
    const v = await actionViewer('admin');
    const { error } = await v.supabase.from('invoices').delete().eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, 'Draft deleted');
  } catch (e) { return fail(msg(e)); }
}
const paymentFields = z.object({ invoice_id: uuid, amount: z.coerce.number().positive('Enter the amount received'), paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(['bank_transfer', 'upi', 'card', 'razorpay', 'stripe', 'cash', 'other']), reference: optText(200), notes: optText(1000) });
export async function recordPayment(input: z.input<typeof paymentFields>): Promise<Result> {
  try {
    const v = await actionViewer('admin');
    const d = paymentFields.parse(input);
    if (d.paid_at > new Date().toISOString().slice(0, 10)) return fail('The payment date cannot be in the future.');
    const { error } = await v.supabase.from('payments').insert({ ...d, recorded_by: v.userId });
    if (error) return fail(error); refresh(); return ok(undefined, 'Payment recorded. The client has been notified.');
  } catch (e) { return fail(msg(e)); }
}
export async function deletePayment(id: string): Promise<Result> {
  try {
    const v = await actionViewer('admin');
    const { error } = await v.supabase.from('payments').delete().eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, 'Payment removed');
  } catch (e) { return fail(msg(e)); }
}

// ------------------------------------------------------------------ files
const fileRow = z.object({ organization_id: uuid, project_id: optUuid, folder: z.string().trim().min(1).max(60), kind: z.enum(['deliverable', 'document', 'contract', 'client_upload']),
  description: optText(1000), path: z.string().min(3).max(500), name: z.string().min(1).max(255), size: z.number().int().min(0), type: z.string().max(120) });
export async function registerFiles(rows: z.input<typeof fileRow>[]): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const d = z.array(fileRow).min(1).max(50).parse(rows);
    if (d.some(r => r.path.split('/')[0] !== r.organization_id)) return fail('A file is outside this client\'s folder.');
    const { error } = await v.supabase.from('project_files').insert(d.map(r => ({ organization_id: r.organization_id, project_id: r.project_id ?? null, folder: r.folder, kind: r.kind,
      description: r.description, storage_path: r.path, name: r.name, size_bytes: r.size, mime_type: r.type, uploaded_by: v.userId })));
    if (error) return fail(error); refresh(); return ok(undefined, d.length === 1 ? 'File shared with the client' : `${d.length} files shared with the client`);
  } catch (e) { return fail(msg(e)); }
}
export async function updateFile(id: string, input: { folder: string; description?: string; name: string; project_id?: string | null }): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const d = z.object({ folder: z.string().trim().min(1).max(60), description: optText(1000), name: z.string().trim().min(1).max(255), project_id: optUuid }).parse(input);
    const { error } = await v.supabase.from('project_files').update(d).eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, 'File updated');
  } catch (e) { return fail(msg(e)); }
}
export async function deleteFile(id: string): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const { data: f } = await v.supabase.from('project_files').select('storage_path').eq('id', uuid.parse(id)).single();
    if (!f) return fail('File not found');
    const { error } = await v.supabase.from('project_files').delete().eq('id', id);
    if (error) return fail(error);
    await v.supabase.storage.from('portal').remove([f.storage_path]);
    refresh(); return ok(undefined, 'File deleted');
  } catch (e) { return fail(msg(e)); }
}

// ------------------------------------------------------------------ SEO and performance
const kw = z.object({ keyword: z.string().trim().min(1).max(200), position: z.coerce.number().positive().nullable(), previous: z.coerce.number().positive().nullable().optional(), url: z.string().max(500).optional() });
const issue = z.object({ title: z.string().trim().min(1).max(300), severity: z.enum(['high', 'medium', 'low']), status: z.enum(['open', 'fixed']) });
const n = z.union([z.coerce.number().min(0), z.null()]).optional().transform(v => (v === undefined || Number.isNaN(v) ? null : v));
const seoFields = z.object({
  organization_id: uuid, project_id: optUuid, period: z.string().regex(/^\d{4}-\d{2}-01$/, 'Choose a month'),
  clicks: n, impressions: n, ctr: z.coerce.number().min(0).max(1).nullable().optional(), avg_position: n, organic_sessions: n, indexed_pages: n,
  health_score: z.coerce.number().int().min(0).max(100).nullable().optional(), backlinks: n, referring_domains: n,
  keywords: z.array(kw).max(100).default([]), issues: z.array(issue).max(100).default([]), summary: optText(4000),
  source: z.enum(['manual', 'search_console', 'analytics', 'mixed']).default('manual'), status: z.enum(['draft', 'published']),
});
export async function saveSeoReport(id: string | null, input: z.input<typeof seoFields>): Promise<Result<{ id: string }>> {
  try {
    const v = await actionViewer('staff');
    const d = seoFields.parse(input);
    const q = id ? v.supabase.from('seo_reports').update(d).eq('id', uuid.parse(id)).select('id').single() : v.supabase.from('seo_reports').insert({ ...d, created_by: v.userId }).select('id').single();
    const { data, error } = await q;
    if (error) return fail(error); refresh(); return ok({ id: data.id as string }, d.status === 'published' ? 'Report published to the client' : 'Report saved as draft');
  } catch (e) { return fail(msg(e)); }
}
export async function deleteSeoReport(id: string): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const { error } = await v.supabase.from('seo_reports').delete().eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, 'Report deleted');
  } catch (e) { return fail(msg(e)); }
}
/** Pulls the month's real numbers from Search Console (and Analytics 4 if linked) into a draft report. */
export async function syncGoogleMonth(orgId: string, month: string): Promise<Result<{ id: string }>> {
  try {
    const v = await actionViewer('staff');
    if (!googleConfigured()) return fail('Search Console is not connected: add the Google service account variables first.');
    const m = z.string().regex(/^\d{4}-\d{2}-01$/).parse(month);
    const { data: org } = await v.supabase.from('organizations').select('gsc_site_url,ga4_property_id').eq('id', uuid.parse(orgId)).single();
    if (!org?.gsc_site_url) return fail('Add the client\'s Search Console property (for example sc-domain:example.com) on the client page first.');
    const gsc = await searchConsoleMonth(org.gsc_site_url, m);
    const sessions = org.ga4_property_id ? await analyticsOrganicSessions(org.ga4_property_id, m).catch(() => null) : null;
    const row = { organization_id: orgId, period: m, clicks: gsc.clicks, impressions: gsc.impressions, ctr: gsc.ctr, avg_position: gsc.avg_position, organic_sessions: sessions,
      keywords: gsc.keywords.map((k: { keyword: string; position: number }) => ({ keyword: k.keyword, position: k.position })), source: sessions != null ? 'mixed' : 'search_console' };
    const { data: existing } = await v.supabase.from('seo_reports').select('id').eq('organization_id', orgId).eq('period', m).maybeSingle();
    const res = existing
      ? await v.supabase.from('seo_reports').update(row).eq('id', existing.id).select('id').single()
      : await v.supabase.from('seo_reports').insert({ ...row, status: 'draft', created_by: v.userId }).select('id').single();
    if (res.error) return fail(res.error); refresh(); return ok({ id: res.data.id as string }, 'Search Console data imported. Review and publish the report.');
  } catch (e) { return fail(msg(e)); }
}
export async function runPageSpeed(orgId: string, url: string): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const u = z.string().url('Enter the full website address, starting with https://').parse(url);
    const results = await Promise.all((['mobile', 'desktop'] as const).map(async s => ({ strategy: s, ...(await pageSpeed(u, s)) })));
    const { error } = await v.supabase.from('performance_snapshots').insert(results.map(r => ({ ...r, organization_id: uuid.parse(orgId), url: u })));
    if (error) return fail(error); refresh(); return ok(undefined, `PageSpeed Insights: mobile ${results[0]!.performance ?? '—'}, desktop ${results[1]!.performance ?? '—'}`);
  } catch (e) { return fail(msg(e)); }
}

// ------------------------------------------------------------------ team
const teamFields = z.object({ full_name: z.string().trim().min(2).max(120), email, title: optText(120), role: z.enum(['admin', 'manager']) });
export async function saveTeamMember(id: string | null, input: z.input<typeof teamFields>, sendInvite: boolean): Promise<Result> {
  try {
    const v = await actionViewer('admin');
    const d = teamFields.parse(input);
    const { error } = id ? await v.supabase.from('team_members').update({ full_name: d.full_name, title: d.title, role: d.role }).eq('id', uuid.parse(id))
      : await v.supabase.from('team_members').insert(d);
    if (error) return fail(error);
    const note = !id && sendInvite ? await invite(d.email, d.full_name) : 'Team member saved';
    refresh(); return ok(undefined, note);
  } catch (e) { return fail(msg(e)); }
}
export async function setTeamActive(id: string, active: boolean): Promise<Result> {
  try {
    const v = await actionViewer('admin');
    const { error } = await v.supabase.from('team_members').update({ is_active: active }).eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, active ? 'Access restored' : 'Access removed');
  } catch (e) { return fail(msg(e)); }
}
export async function removeTeamMember(id: string): Promise<Result> {
  try {
    const v = await actionViewer('admin');
    const { error } = await v.supabase.from('team_members').delete().eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, 'Removed from the team');
  } catch (e) { return fail(msg(e)); }
}

// ------------------------------------------------------------------ requests, announcements, settings, jobs
export async function updateRequest(id: string, input: { status: string; priority: string; assigned_to?: string | null; resolution?: string }): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const d = z.object({ status: z.enum(['open', 'in_progress', 'resolved', 'closed']), priority: z.enum(['low', 'normal', 'high']), assigned_to: optUuid, resolution: optText(4000) }).parse(input);
    const { error } = await v.supabase.from('support_requests').update(d).eq('id', uuid.parse(id));
    if (error) return fail(error); refresh(); return ok(undefined, 'Request updated');
  } catch (e) { return fail(msg(e)); }
}
export async function createAnnouncement(input: { title: string; body: string; organization_id?: string | null }): Promise<Result> {
  try {
    const v = await actionViewer('admin');
    const d = z.object({ title: z.string().trim().min(3).max(160), body: z.string().trim().min(3).max(4000), organization_id: optUuid }).parse(input);
    const { error } = await v.supabase.from('announcements').insert({ ...d, created_by: v.userId });
    if (error) return fail(error); refresh(); return ok(undefined, d.organization_id ? 'Announcement sent to the client' : 'Announcement sent to every client');
  } catch (e) { return fail(msg(e)); }
}
const settingsFields = z.object({
  agency_name: z.string().trim().min(2).max(80), legal_name: optText(200), address: optText(500), email: optText(200), phone: optText(40), website: optText(300),
  tax_id: optText(40), pan: optText(20), invoice_prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,8}$/, 'Prefix: 1 to 8 letters or digits'),
  default_currency: currency, default_tax_rate: z.coerce.number().min(0).max(100), payment_terms_days: z.coerce.number().int().min(0).max(120),
  payment_instructions: optText(2000), invoice_footer: optText(1000),
});
export async function updateSettings(input: z.input<typeof settingsFields>): Promise<Result> {
  try {
    const v = await actionViewer('admin');
    const { error } = await v.supabase.from('portal_settings').update(settingsFields.parse(input)).eq('id', 1);
    if (error) return fail(error); refresh(); return ok(undefined, 'Settings saved');
  } catch (e) { return fail(msg(e)); }
}
export async function runDeadlineCheck(): Promise<Result> {
  try {
    const v = await actionViewer('staff');
    const { data, error } = await v.supabase.rpc('notify_upcoming_deadlines', { p_days: 3 });
    if (error) return fail(error); return ok(undefined, data ? `Reminders sent for ${data} ${data === 1 ? 'project' : 'projects'}` : 'No projects due in the next 3 days');
  } catch (e) { return fail(msg(e)); }
}
