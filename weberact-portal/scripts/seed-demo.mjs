// Demo data for trying the portal. Separate from real data: every row is marked is_demo or lives
// under a "(Demo)" client, and demo accounts use the reserved .test domain, which can never
// receive real email.
//
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… DEMO_PASSWORD='choose-one' node scripts/seed-demo.mjs
//   … node scripts/seed-demo.mjs --clean      # removes every demo row and demo account
//
// No passwords are stored in this file. No SEO metrics are invented: the demo client shows the
// "not connected" state until real Search Console data is imported.
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PW = process.env.DEMO_PASSWORD;
if (!URL || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY.'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const DOMAIN = 'weberact.test';
const CLIENT = `demo.client@${DOMAIN}`, CLIENT2 = `demo.other@${DOMAIN}`, MANAGER = `demo.manager@${DOMAIN}`;
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

async function clean() {
  const { data: orgs } = await sb.from('organizations').select('id').eq('is_demo', true);
  const paths = [];
  for (const o of orgs ?? []) {
    const { data: files } = await sb.from('project_files').select('storage_path').eq('organization_id', o.id);
    paths.push(...(files ?? []).map(f => f.storage_path));
  }
  must(await sb.rpc('delete_demo_data'), 'delete demo rows');
  if (paths.length) await sb.storage.from('portal').remove(paths);
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users?.users ?? []) if ([CLIENT, CLIENT2, MANAGER].includes(u.email ?? '')) await sb.auth.admin.deleteUser(u.id);  // only the demo accounts
  console.log('Demo data removed.');
}

async function seed() {
  if (!PW || PW.length < 10) { console.error('Set DEMO_PASSWORD (at least 10 characters) for the demo accounts.'); process.exit(1); }
  const services = must(await sb.from('services').select('id,slug'), 'services');
  const svc = s => services.find(x => x.slug === s)?.id;

  const org = must(await sb.from('organizations').insert({ name: 'Meridian Exports (Demo)', legal_name: 'Meridian Exports Pvt Ltd (Demo)', website: 'https://meridian-exports.example',
    country: 'India', industry: 'Industrial exports', currency: 'INR', billing_address: 'Demo address, not a real company', is_demo: true }).select().single(), 'organization');
  const org2 = must(await sb.from('organizations').insert({ name: 'Northwind Studio (Demo)', country: 'United Kingdom', currency: 'GBP', is_demo: true }).select().single(), 'organization 2');
  must(await sb.from('clients').insert([{ organization_id: org.id, full_name: 'Demo Client', email: CLIENT, job_title: 'Managing Director', is_primary: true },
    { organization_id: org2.id, full_name: 'Other Demo Client', email: CLIENT2, is_primary: true }]), 'clients');
  const mgr = must(await sb.from('team_members').insert({ full_name: 'Demo Manager', email: MANAGER, title: 'Project manager', role: 'manager' }).select().single(), 'team');
  for (const email of [CLIENT, CLIENT2, MANAGER]) must(await sb.auth.admin.createUser({ email, password: PW, email_confirm: true }), 'account ' + email);

  const web = must(await sb.from('projects').insert({ organization_id: org.id, name: 'Export website redesign', stage: 4, manager_id: mgr.id, start_date: day(-30), due_date: day(2), value: 450000, currency: 'INR', is_demo: true,
    description: 'A new bilingual website that turns overseas buyers into qualified enquiries.', scope: 'Ten-page website, product catalogue, RFQ form connected to the CRM, technical SEO set-up.',
    deliverables: ['Sitemap and wireframes', 'Visual design for desktop and mobile', 'Built website with CMS', 'RFQ form connected to CRM', 'Analytics and Search Console set-up'] }).select().single(), 'project');
  const auto = must(await sb.from('projects').insert({ organization_id: org.id, name: 'Enquiry automation', stage: 2, manager_id: mgr.id, start_date: day(-5), due_date: day(40), value: 180000, currency: 'INR', is_demo: true,
    description: 'Instant replies and CRM updates for every enquiry.', deliverables: ['Workflow map', 'n8n workflows', 'Error alerts'] }).select().single(), 'project 2');
  must(await sb.from('projects').insert({ organization_id: org2.id, name: 'Brand site', stage: 3, currency: 'GBP', is_demo: true }), 'project other');
  must(await sb.from('project_services').insert([{ project_id: web.id, service_id: svc('website-development') }, { project_id: web.id, service_id: svc('technical-seo') }, { project_id: auto.id, service_id: svc('ai-automation') }]), 'services');
  await sb.from('project_stages').update({ notes: 'The build is on the staging link. Review pages as they land.' }).eq('project_id', web.id).eq('position', 4);

  must(await sb.from('contracts').insert({ organization_id: org.id, project_id: web.id, title: 'Website development agreement (Demo)', status: 'sent', value: 450000, currency: 'INR', start_date: day(-30), end_date: day(60),
    scope: 'Design and build of a ten-page export website with product catalogue, RFQ form and technical SEO set-up.', payment_terms: '50% on signing, 30% on design and development approval, 20% before final handover. Invoices due within 7 days.' }), 'contract');

  const inv = must(await sb.from('invoices').insert({ organization_id: org.id, project_id: web.id, currency: 'INR', issue_date: day(-20), due_date: day(-13), is_demo: true, notes: 'Demo invoice' }).select().single(), 'invoice');
  must(await sb.from('invoice_items').insert({ invoice_id: inv.id, description: 'Website redesign, instalment 1 of 3 (50% on signing)', quantity: 1, unit_price: 225000, tax_rate: 18, position: 1 }), 'items');
  must(await sb.from('invoices').update({ status: 'issued' }).eq('id', inv.id), 'issue');
  must(await sb.from('payments').insert({ invoice_id: inv.id, amount: 100000, method: 'bank_transfer', reference: 'DEMO-TRANSFER', paid_at: day(-15), notes: 'Demo payment' }), 'payment');
  const inv2 = must(await sb.from('invoices').insert({ organization_id: org.id, project_id: auto.id, currency: 'INR', issue_date: day(-2), due_date: day(5), is_demo: true }).select().single(), 'invoice 2');
  must(await sb.from('invoice_items').insert({ invoice_id: inv2.id, description: 'Enquiry automation, instalment 1 of 3', quantity: 1, unit_price: 90000, tax_rate: 18, position: 1 }), 'items 2');
  must(await sb.from('invoices').update({ status: 'issued' }).eq('id', inv2.id), 'issue 2');

  // a small PDF deliverable
  const doc = await PDFDocument.create(); const page = doc.addPage([595, 842]); const font = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText('Meridian Exports: sitemap (Demo deliverable)', { x: 56, y: 760, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  const path = `${org.id}/projects/demo/sitemap-demo.pdf`;
  must(await sb.storage.from('portal').upload(path, await doc.save(), { contentType: 'application/pdf', upsert: true }), 'upload');
  must(await sb.from('project_files').insert({ organization_id: org.id, project_id: web.id, kind: 'deliverable', folder: 'Deliverables', name: 'Sitemap (demo).pdf', description: 'Approved sitemap', storage_path: path, size_bytes: 1200, mime_type: 'application/pdf' }), 'file');

  // conversation, written by the demo people themselves so names and notifications are real
  if (ANON) {
    const as = async email => { const c = createClient(URL, ANON, { auth: { persistSession: false } }); must(await c.auth.signInWithPassword({ email, password: PW }), 'sign in ' + email); return c; };
    const client = await as(CLIENT), manager = await as(MANAGER);
    const me = (await client.auth.getUser()).data.user.id;
    const conv = must(await client.from('conversations').insert({ organization_id: org.id, project_id: web.id, subject: 'Homepage copy', created_by: me }).select().single(), 'conversation');
    must(await client.from('messages').insert({ conversation_id: conv.id, body: 'Could we see the homepage copy before the design round?' }), 'message 1');
    must(await manager.from('messages').insert({ conversation_id: conv.id, body: 'Of course. It will be on the staging link by Thursday.' }), 'message 2');
    must(await client.from('support_requests').insert({ organization_id: org.id, project_id: web.id, type: 'revision', title: 'Use our new product photos on the catalogue page', details: 'The updated photos are in the shared folder.' }), 'request');
  }
  console.log(`Demo data created.\n  Client:  ${CLIENT}\n  Client (other company): ${CLIENT2}\n  Manager: ${MANAGER}\n  Password: the DEMO_PASSWORD you set.\nRemove it all with: node scripts/seed-demo.mjs --clean`);
}

(process.argv.includes('--clean') ? clean() : seed()).catch(e => { console.error(e.message); process.exit(1); });
