// Security and data-rule tests against the LOCAL stack (scripts/local-stack/stack.sh up).
// Run: node scripts/test-db.mjs
// Creates two client organizations and checks that neither can reach the other's data, plus the
// invoice, contract, onboarding, messaging and storage rules. Never point this at production.
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { SignJWT } from 'jose';

const URL = 'http://127.0.0.1:54321';
const secret = new TextEncoder().encode('super-secret-jwt-token-with-at-least-32-characters-long');
const key = role => new SignJWT({ role, iss: 'supabase-local' }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setIssuedAt().setExpirationTime('1h').sign(secret);
const ANON = await key('anon'), SERVICE = await key('service_role');
const DB = 'postgres://postgres@127.0.0.1:54322/postgres';
const sql = q => execFileSync('psql', [DB, '-tAc', q], { encoding: 'utf8' }).trim();
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const PW = 'Local-test-' + Math.random().toString(36).slice(2, 10);
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const run = Date.now().toString(36);
const mail = n => `${n}.${run}@weberact.test`;

async function signIn(email){
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(email + ': ' + error.message);
  return c;
}
const makeUser = email => svc.auth.admin.createUser({ email, password: PW, email_confirm: true });

// ---- accounts are invite-only
const stranger = await makeUser(mail('stranger'));
ok(!!stranger.error, 'an email WeberAct never added cannot get an account');

sql(`insert into public.admins (email) values ('${mail('founder')}') on conflict do nothing`);
const fa = await makeUser(mail('founder'));
ok(!fa.error, 'an admin email gets an account');
ok(sql(`select role from public.profiles where email = '${mail('founder')}'`) === 'admin', 'the admin gets the admin role');
const admin = await signIn(mail('founder'));

// ---- admin creates two client organizations with one contact each
const { data: orgA } = await admin.from('organizations').insert({ name: 'Test Org A ' + run, currency: 'USD' }).select().single();
const { data: orgB } = await admin.from('organizations').insert({ name: 'Test Org B ' + run, currency: 'INR' }).select().single();
ok(orgA && orgB, 'admin creates organizations');
await admin.from('clients').insert([{ organization_id: orgA.id, full_name: 'Alice A', email: mail('alice') }, { organization_id: orgB.id, full_name: 'Bob B', email: mail('bob') }]);
ok(!(await makeUser(mail('alice'))).error && !(await makeUser(mail('bob'))).error, 'invited client contacts get accounts');
ok(sql(`select role || ':' || (organization_id = '${orgA.id}') from public.profiles where email = '${mail('alice')}'`) === 'client:true', 'a client profile is linked to its organization');
const alice = await signIn(mail('alice')), bob = await signIn(mail('bob'));

// ---- projects, stages, isolation
const { data: proj } = await admin.from('projects').insert({ organization_id: orgA.id, name: 'Website A', currency: 'USD', due_date: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) }).select().single();
ok(sql(`select count(*) from public.project_stages where project_id = '${proj.id}'`) === '8', 'a project gets its 8 stages');
await admin.from('projects').update({ stage: 3 }).eq('id', proj.id);
ok(sql(`select progress || ':' || (select string_agg(status, ',' order by position) from public.project_stages where project_id = '${proj.id}') from public.projects where id = '${proj.id}'`)
   === '29:done,done,in_progress,pending,pending,pending,pending,pending', 'moving to stage 03 updates progress and stages');
const aliceProj = await alice.from('projects').select('id,name').eq('id', proj.id);
const bobProj = await bob.from('projects').select('id,name').eq('id', proj.id);
ok(aliceProj.data?.length === 1, 'the client sees its own project');
ok(bobProj.data?.length === 0, 'another client cannot read it by id');
const bobUpd = await bob.from('projects').update({ name: 'hacked' }).eq('id', proj.id).select();
ok((bobUpd.data || []).length === 0, 'another client cannot change it');
const aliceUpd = await alice.from('projects').update({ stage: 8 }).eq('id', proj.id).select();
ok((aliceUpd.data || []).length === 0, 'a client cannot change its own project stage');
const notes = await alice.from('notifications').select('type,title');
ok(notes.data?.some(n => n.type === 'stage'), 'the client is notified of the stage change');
ok((await bob.from('notifications').select('id')).data?.length === 0, 'the other client gets nothing');
const bobOrgs = await bob.from('organizations').select('id');
ok(bobOrgs.data?.length === 1 && bobOrgs.data[0].id === orgB.id, 'a client sees only its own organization');
const bobProfiles = await bob.from('profiles').select('email');
ok(!bobProfiles.data?.some(p => p.email === mail('alice')), 'a client cannot see another client\'s people');
const selfPromote = await alice.from('profiles').update({ role: 'admin' }).eq('email', mail('alice')).select();
ok(!!selfPromote.error, 'a client cannot make itself an admin');
ok((await alice.from('activity_logs').select('id')).data?.length > 0, 'the client sees its activity');
const dl = await admin.rpc('notify_upcoming_deadlines', { p_days: 3 });
ok(dl.data === 1, 'deadline reminders are created for projects due soon');
const dl2 = await admin.rpc('notify_upcoming_deadlines', { p_days: 3 });
ok(dl2.data === 0, 'deadline reminders are not repeated the same day');
ok(!!(await alice.rpc('notify_upcoming_deadlines', { p_days: 3 })).error, 'clients cannot run the deadline job');

// ---- invoices and payments
const { data: inv } = await admin.from('invoices').insert({ organization_id: orgA.id, project_id: proj.id, currency: 'USD', due_date: '2099-01-01' }).select().single();
await admin.from('invoice_items').insert([{ invoice_id: inv.id, description: 'Design', quantity: 2, unit_price: 500, tax_rate: 18 }, { invoice_id: inv.id, description: 'Build', quantity: 1, unit_price: 1000, tax_rate: 0 }]);
ok(sql(`select subtotal || '/' || tax_total || '/' || total from public.invoices where id = '${inv.id}'`) === '2000.00/180.00/2180.00', 'invoice totals are calculated from items and tax');
ok((await alice.from('invoices').select('id').eq('id', inv.id)).data?.length === 0, 'a draft invoice is hidden from the client');
const fake = await admin.from('invoices').update({ total: 1 }).eq('id', inv.id);
ok(!!fake.error, 'totals cannot be typed in');
await admin.from('invoices').update({ status: 'issued' }).eq('id', inv.id);
const num = sql(`select number from public.invoices where id = '${inv.id}'`);
ok(/^WA-\d{4}-\d{4}$/.test(num), 'issuing assigns a consecutive number (' + num + ')');
ok(!!(await admin.from('invoice_items').insert({ invoice_id: inv.id, description: 'Late add', unit_price: 1 })).error, 'items are locked once issued');
ok((await alice.from('invoice_summaries').select('number,payment_status').eq('id', inv.id)).data?.[0]?.payment_status === 'pending', 'the client sees the issued invoice as pending');
ok((await bob.from('invoice_summaries').select('id').eq('id', inv.id)).data?.length === 0, 'another client cannot see it');
ok(!!(await alice.from('payments').insert({ invoice_id: inv.id, amount: 2180 })).error, 'a client cannot record a payment');
await admin.from('payments').insert({ invoice_id: inv.id, amount: 1000, method: 'bank_transfer', reference: 'TEST' });
ok((await alice.from('invoice_summaries').select('payment_status,balance').eq('id', inv.id)).data?.[0]?.payment_status === 'partially_paid', 'a part payment shows Partially Paid');
ok(!!(await admin.from('payments').insert({ invoice_id: inv.id, amount: 5000 })).error, 'a payment above the balance is refused');
await admin.from('payments').insert({ invoice_id: inv.id, amount: 1180 });
ok((await alice.from('invoice_summaries').select('payment_status').eq('id', inv.id)).data?.[0]?.payment_status === 'paid', 'full payment shows Paid');
ok(!!(await admin.from('invoices').delete().eq('id', inv.id)).error, 'an issued invoice cannot be deleted');
const { data: inv2 } = await admin.from('invoices').insert({ organization_id: orgA.id, currency: 'USD', issue_date: '2020-01-01', due_date: '2020-01-10' }).select().single();
await admin.from('invoice_items').insert({ invoice_id: inv2.id, description: 'Old work', unit_price: 100 });
await admin.from('invoices').update({ status: 'issued' }).eq('id', inv2.id);
ok((await alice.from('invoice_summaries').select('payment_status').eq('id', inv2.id)).data?.[0]?.payment_status === 'overdue', 'past the due date shows Overdue');

// ---- contracts
const { data: con } = await admin.from('contracts').insert({ organization_id: orgA.id, project_id: proj.id, title: 'Website agreement', scope: 'Ten pages', payment_terms: '50/30/20', status: 'sent' }).select().single();
ok(!!(await bob.rpc('accept_contract', { p_contract: con.id, p_full_name: 'Bob B' })).error, 'another client cannot accept the contract');
ok(!!(await admin.from('contracts').update({ status: 'accepted' }).eq('id', con.id)).error, 'staff cannot mark a contract accepted for the client');
const acc = await alice.rpc('accept_contract', { p_contract: con.id, p_full_name: 'Alice A', p_user_agent: 'test-agent' });
ok(!acc.error && acc.data?.status === 'accepted' && /^[0-9a-f]{64}$/.test(acc.data?.accepted_document_sha256 || '') && acc.data?.accepted_email === mail('alice'),
   'the client accepts: time, account, email and a document fingerprint are recorded');
ok(!!(await admin.from('contracts').update({ scope: 'Changed' }).eq('id', con.id)).error, 'an accepted contract cannot be edited');
ok(!!(await alice.rpc('accept_contract', { p_contract: con.id, p_full_name: 'Alice A' })).error, 'it cannot be accepted twice');

// ---- onboarding
const { data: ob } = await alice.from('onboarding_submissions').insert({ organization_id: orgA.id, data: { step1: { full_name: 'Alice A' } } }).select().single();
ok(!!ob, 'the client starts onboarding');
await alice.from('onboarding_submissions').update({ data: { step1: { full_name: 'Alice A' }, step2: { services: ['seo'] } }, current_step: 3 }).eq('id', ob.id);
ok(sql(`select current_step from public.onboarding_submissions where id = '${ob.id}'`) === '3', 'progress is saved');
ok((await bob.from('onboarding_submissions').select('id').eq('id', ob.id)).data?.length === 0, 'another client cannot read it');
ok(!!(await bob.from('onboarding_submissions').insert({ organization_id: orgA.id, data: {} })).error, 'another client cannot add onboarding for it');
await alice.from('onboarding_submissions').update({ status: 'submitted' }).eq('id', ob.id);
const after = await alice.from('onboarding_submissions').update({ data: {} }).eq('id', ob.id).select();
ok((after.data || []).length === 0 || !!after.error, 'a submitted onboarding is locked for the client');
ok(!!(await admin.from('onboarding_submissions').update({ admin_notes: 'Looks good', status: 'approved' }).eq('id', ob.id).select()).data?.length, 'admin reviews and edits it');

// ---- messages
const { data: conv } = await alice.from('conversations').insert({ organization_id: orgA.id, subject: 'Hello', created_by: (await alice.auth.getUser()).data.user.id }).select().single();
ok(!!conv, 'the client starts a conversation');
ok(!(await alice.from('messages').insert({ conversation_id: conv.id, body: 'Hi team' })).error, 'the client sends a message');
ok(!!(await alice.from('messages').insert({ conversation_id: conv.id, body: 'x', attachments: [{ path: orgB.id + '/uploads/x.pdf', name: 'x.pdf' }] })).error, 'attachments from another organization are refused');
ok((await bob.from('messages').select('id').eq('conversation_id', conv.id)).data?.length === 0, 'another client cannot read the conversation');
ok(!!(await bob.from('messages').insert({ conversation_id: conv.id, body: 'intrusion' })).error, 'another client cannot post into it');
ok((await admin.from('notifications').select('type')).data?.some(n => n.type === 'message'), 'staff are notified of the message');
await admin.from('messages').insert({ conversation_id: conv.id, body: 'Hello Alice' });
ok((await alice.rpc('unread_counts')).data?.[0]?.unread == 1, 'the client sees one unread reply');

// ---- storage
const blob = new Blob(['hello'], { type: 'text/plain' });
ok(!(await alice.storage.from('portal').upload(`${orgA.id}/uploads/general/${run}.txt`, blob)).error, 'the client uploads into its own folder');
ok(!!(await alice.storage.from('portal').upload(`${orgB.id}/uploads/general/${run}.txt`, blob)).error, 'the client cannot upload into another organization');
ok(!!(await alice.storage.from('portal').upload(`${orgA.id}/projects/${run}.txt`, blob)).error, 'the client cannot write into deliverables');
ok(!(await admin.storage.from('portal').upload(`${orgA.id}/projects/${proj.id}/${run}.txt`, blob)).error, 'staff upload deliverables');
ok(!!(await bob.storage.from('portal').createSignedUrl(`${orgA.id}/projects/${proj.id}/${run}.txt`, 60)).error, 'another client cannot get a download link');
ok(!(await alice.storage.from('portal').createSignedUrl(`${orgA.id}/projects/${proj.id}/${run}.txt`, 60)).error, 'the client gets a download link for its deliverable');
ok(!!(await alice.from('project_files').insert({ organization_id: orgA.id, kind: 'deliverable', name: 'x', storage_path: `${orgA.id}/projects/x` })).error, 'a client cannot register a deliverable');
ok(!(await alice.from('project_files').insert({ organization_id: orgA.id, kind: 'client_upload', name: 'brief.txt', storage_path: `${orgA.id}/uploads/general/${run}.txt`, uploaded_by: (await alice.auth.getUser()).data.user.id })).error, 'a client registers its own upload');

// ---- deactivation
await admin.from('organizations').update({ status: 'inactive' }).eq('id', orgA.id);
ok((await alice.from('projects').select('id')).data?.length === 0, 'a deactivated client organization sees nothing');
await admin.from('organizations').update({ status: 'active' }).eq('id', orgA.id);
ok((await alice.from('projects').select('id')).data?.length === 1, 'reactivating restores access');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
