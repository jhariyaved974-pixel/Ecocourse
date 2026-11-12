-- =====================================================================================================
-- WeberAct client portal
--
-- Who can do what is decided here, in the database, not in the interface:
--   * staff (profiles.role admin or manager, plus every email in public.admins) see every client
--   * a client sees only rows of its own organization (my_org()), and only what is meant for clients
--   * money (invoices, payments), the team and the portal settings change only for admins
--   * login accounts exist only for emails WeberAct has added (admins, team members, client contacts)
-- Every table has row level security; a changed URL or a hand-made API request reaches nothing else.
-- =====================================================================================================

-- ------------------------------------------------------------------ 1. organizations and people
create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 160),
  legal_name       text check (char_length(legal_name) <= 200),
  website          text check (char_length(website) <= 300),
  country          text check (char_length(country) <= 80),
  industry         text check (char_length(industry) <= 120),
  tax_id           text check (char_length(tax_id) <= 40),
  billing_address  text check (char_length(billing_address) <= 500),
  currency         text not null default 'USD' check (currency in ('USD','INR','EUR','GBP','AED','CAD','AUD')),
  status           text not null default 'active' check (status in ('active','inactive')),
  gsc_site_url     text check (char_length(gsc_site_url) <= 300),
  ga4_property_id  text check (ga4_property_id ~ '^[0-9]{4,20}$'),
  notes            text check (char_length(notes) <= 4000),
  is_demo          boolean not null default false,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text not null,
  full_name        text check (char_length(full_name) <= 120),
  phone            text check (char_length(phone) <= 40),
  avatar_url       text check (char_length(avatar_url) <= 500),
  role             text not null default 'client' check (role in ('admin','manager','client')),
  organization_id  uuid references public.organizations(id) on delete set null,
  is_active        boolean not null default true,
  email_notifications boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index profiles_org_idx on public.profiles(organization_id);

create table public.clients (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  full_name        text not null check (char_length(full_name) between 1 and 120),
  email            text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone            text check (char_length(phone) <= 40),
  job_title        text check (char_length(job_title) <= 120),
  is_primary       boolean not null default false,
  status           text not null default 'invited' check (status in ('invited','active','inactive')),
  user_id          uuid unique references auth.users(id) on delete set null,
  invited_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index clients_org_idx on public.clients(organization_id);

create table public.team_members (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null check (char_length(full_name) between 1 and 120),
  email            text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  title            text check (char_length(title) <= 120),
  role             text not null default 'manager' check (role in ('admin','manager')),
  user_id          uuid unique references auth.users(id) on delete set null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ------------------------------------------------------------------ 2. access helpers
-- security definer so policies can call them without recursion; search_path '' so nothing can be shadowed
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role in ('admin','manager'));
$$;

create or replace function public.is_portal_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role = 'admin');
$$;

-- the organization of the signed-in client; null for staff, inactive people and inactive organizations
create or replace function public.my_org() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.organization_id from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = auth.uid() and p.is_active and p.role = 'client' and o.status = 'active';
$$;

create or replace function public.can_see_org(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff() or (org is not null and org = public.my_org());
$$;

revoke all on function public.is_staff(), public.is_portal_admin(), public.my_org(), public.can_see_org(uuid) from public;
grant execute on function public.is_staff(), public.is_portal_admin(), public.my_org(), public.can_see_org(uuid) to authenticated;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- ------------------------------------------------------------------ 3. catalogue and settings
create table public.services (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name        text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 600),
  is_active   boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
insert into public.services (slug, name, description, sort) values
  ('website-development', 'Premium Website Development', 'Design and build of fast, premium websites and web systems.', 1),
  ('technical-seo', 'Technical SEO', 'Crawling, indexing, speed, structured data and site architecture.', 2),
  ('seo-aeo', 'Advanced SEO & AEO', 'Search and answer-engine visibility: content, entities and authority.', 3),
  ('ai-automation', 'AI Automation', 'AI-assisted workflows for enquiries, qualification and follow-up.', 4),
  ('process-automation', 'Business Process Automation', 'CRM, invoicing, reporting and operations automated end to end.', 5)
on conflict (slug) do nothing;

create table public.portal_settings (
  id                   smallint primary key default 1 check (id = 1),
  agency_name          text not null default 'WeberAct',
  legal_name           text default '[WeberAct legal name]',
  address              text default '[registered address]',
  email                text,
  phone                text,
  website              text default 'https://weberact.co',
  tax_id               text,
  pan                  text,
  invoice_prefix       text not null default 'WA' check (invoice_prefix ~ '^[A-Z0-9]{1,8}$'),
  default_currency     text not null default 'USD' check (default_currency in ('USD','INR','EUR','GBP','AED','CAD','AUD')),
  default_tax_rate     numeric(5,2) not null default 0 check (default_tax_rate between 0 and 100),
  payment_terms_days   int not null default 7 check (payment_terms_days between 0 and 120),
  payment_instructions text check (char_length(payment_instructions) <= 2000),
  invoice_footer       text check (char_length(invoice_footer) <= 1000),
  updated_at           timestamptz not null default now()
);
insert into public.portal_settings (id) values (1) on conflict do nothing;

-- ------------------------------------------------------------------ 4. projects
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 160),
  description     text check (char_length(description) <= 4000),
  scope           text check (char_length(scope) <= 8000),
  deliverables    text[] not null default '{}',
  manager_id      uuid references public.team_members(id) on delete set null,
  stage           smallint not null default 1 check (stage between 1 and 8),
  status          text not null default 'active' check (status in ('active','on_hold','completed','cancelled')),
  progress        smallint not null default 0 check (progress between 0 and 100),
  start_date      date,
  due_date        date,
  completed_at    timestamptz,
  value           numeric(12,2) check (value >= 0),
  currency        text not null default 'USD' check (currency in ('USD','INR','EUR','GBP','AED','CAD','AUD')),
  is_demo         boolean not null default false,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date)
);
create index projects_org_idx on public.projects(organization_id);
create index projects_due_idx on public.projects(due_date) where status = 'active';

create table public.project_services (
  project_id uuid not null references public.projects(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  primary key (project_id, service_id)
);
create index project_services_service_idx on public.project_services(service_id);

create table public.project_stages (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  position     smallint not null check (position between 1 and 8),
  name         text not null,
  status       text not null default 'pending' check (status in ('pending','in_progress','done')),
  notes        text check (char_length(notes) <= 2000),
  started_at   timestamptz,
  completed_at timestamptz,
  unique (project_id, position)
);

create or replace function public.stage_name(p smallint) returns text
language sql immutable set search_path = '' as $$
  select (array['Discovery','Strategy','Design','Development','Review','Revisions','Final Delivery','Completed'])[p];
$$;

-- ------------------------------------------------------------------ 5. onboarding
create table public.onboarding_submissions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete set null,
  status          text not null default 'draft' check (status in ('draft','submitted','in_review','approved')),
  current_step    smallint not null default 1 check (current_step between 1 and 5),
  data            jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 200000),
  submitted_by    uuid references auth.users(id) on delete set null,
  submitted_at    timestamptz,
  reviewed_by     uuid references auth.users(id) on delete set null,
  reviewed_at     timestamptz,
  admin_notes     text check (char_length(admin_notes) <= 4000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index onboarding_org_idx on public.onboarding_submissions(organization_id);
create unique index onboarding_one_draft on public.onboarding_submissions(organization_id) where status = 'draft';

-- ------------------------------------------------------------------ 6. contracts
create table public.contracts (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  project_id               uuid references public.projects(id) on delete set null,
  title                    text not null check (char_length(title) between 1 and 200),
  scope                    text check (char_length(scope) <= 20000),
  payment_terms            text check (char_length(payment_terms) <= 4000),
  start_date               date,
  end_date                 date,
  value                    numeric(12,2) check (value >= 0),
  currency                 text not null default 'USD' check (currency in ('USD','INR','EUR','GBP','AED','CAD','AUD')),
  status                   text not null default 'draft' check (status in ('draft','sent','accepted','expired','void')),
  file_path                text,
  file_name                text,
  file_sha256              text check (file_sha256 ~ '^[0-9a-f]{64}$'),
  sent_at                  timestamptz,
  accepted_at              timestamptz,
  accepted_by              uuid references auth.users(id) on delete set null,
  accepted_name            text,
  accepted_email           text,
  accepted_ip              text,
  accepted_user_agent      text,
  accepted_document_sha256 text,
  created_by               uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (file_path is null or split_part(file_path, '/', 1) = organization_id::text)
);
create index contracts_org_idx on public.contracts(organization_id);

-- ------------------------------------------------------------------ 7. invoices and payments
create table public.invoice_counters (
  year       int primary key,
  last_value int not null default 0
);

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  number          text unique,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id      uuid references public.projects(id) on delete set null,
  status          text not null default 'draft' check (status in ('draft','issued','void')),
  issue_date      date not null default current_date,
  due_date        date not null default (current_date + 7),
  currency        text not null default 'USD' check (currency in ('USD','INR','EUR','GBP','AED','CAD','AUD')),
  notes           text check (char_length(notes) <= 2000),
  subtotal        numeric(12,2) not null default 0,
  tax_total       numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  amount_paid     numeric(12,2) not null default 0,
  issued_at       timestamptz,
  is_demo         boolean not null default false,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (due_date >= issue_date)
);
create index invoices_org_idx on public.invoices(organization_id);
create index invoices_due_idx on public.invoices(due_date) where status = 'issued';

create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  position    smallint not null default 1,
  description text not null check (char_length(description) between 1 and 500),
  quantity    numeric(10,2) not null default 1 check (quantity > 0),
  unit_price  numeric(12,2) not null default 0 check (unit_price >= 0),
  tax_rate    numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  amount      numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored
);
create index invoice_items_invoice_idx on public.invoice_items(invoice_id);

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null references public.invoices(id) on delete restrict,
  organization_id     uuid not null references public.organizations(id) on delete restrict,
  amount              numeric(12,2) not null check (amount > 0),
  paid_at             date not null default current_date,
  method              text not null default 'bank_transfer' check (method in ('bank_transfer','upi','card','razorpay','stripe','cash','other')),
  reference           text check (char_length(reference) <= 200),
  provider            text check (provider in ('razorpay','stripe')),
  provider_payment_id text unique,
  notes               text check (char_length(notes) <= 1000),
  recorded_by         uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index payments_invoice_idx on public.payments(invoice_id);
create index payments_org_idx on public.payments(organization_id);

-- payment status is worked out, never typed: Paid, Partially Paid, Pending or Overdue
create view public.invoice_summaries with (security_invoker = true) as
select i.*,
       greatest(i.total - i.amount_paid, 0)::numeric(12,2) as balance,
       case
         when i.status = 'void' then 'void'
         when i.status = 'draft' then 'draft'
         when i.total > 0 and i.amount_paid >= i.total then 'paid'
         when i.due_date < current_date then 'overdue'
         when i.amount_paid > 0 then 'partially_paid'
         else 'pending'
       end as payment_status,
       o.name as organization_name
from public.invoices i
join public.organizations o on o.id = i.organization_id;

-- ------------------------------------------------------------------ 8. files, conversations, messages
create table public.project_files (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete cascade,
  folder          text not null default 'General' check (char_length(folder) between 1 and 60),
  kind            text not null default 'deliverable' check (kind in ('deliverable','document','client_upload','contract')),
  name            text not null check (char_length(name) between 1 and 255),
  description     text check (char_length(description) <= 1000),
  storage_path    text not null unique check (split_part(storage_path, '/', 1) = organization_id::text),
  size_bytes      bigint check (size_bytes >= 0),
  mime_type       text check (char_length(mime_type) <= 120),
  uploaded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index project_files_org_idx on public.project_files(organization_id, created_at desc);
create index project_files_project_idx on public.project_files(project_id);

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete cascade,
  subject         text not null check (char_length(subject) between 1 and 160),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index conversations_org_idx on public.conversations(organization_id, last_message_at desc);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_id       uuid references auth.users(id) on delete set null,
  body            text not null check (char_length(body) between 1 and 10000),
  attachments     jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10),
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on public.messages(conversation_id, created_at);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ------------------------------------------------------------------ 9. notifications, activity, requests
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  type            text not null,
  title           text not null,
  body            text,
  link            text,
  entity_id       uuid,
  read_at         timestamptz,
  emailed_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_unread_idx on public.notifications(user_id) where read_at is null;
create index notifications_email_idx on public.notifications(created_at) where emailed_at is null;

create table public.activity_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete cascade,
  actor_id        uuid references auth.users(id) on delete set null,
  action          text not null,
  summary         text not null,
  visibility      text not null default 'client' check (visibility in ('client','internal')),
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index activity_org_idx on public.activity_logs(organization_id, created_at desc);
create index activity_project_idx on public.activity_logs(project_id, created_at desc);

create table public.support_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete set null,
  type            text not null default 'support' check (type in ('revision','support','feedback','question')),
  title           text not null check (char_length(title) between 1 and 160),
  details         text check (char_length(details) <= 6000),
  rating          smallint check (rating between 1 and 5),
  priority        text not null default 'normal' check (priority in ('low','normal','high')),
  status          text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  assigned_to     uuid references public.team_members(id) on delete set null,
  resolution      text check (char_length(resolution) <= 4000),
  created_by      uuid references auth.users(id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index support_requests_org_idx on public.support_requests(organization_id, created_at desc);

create table public.announcements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,  -- null = every client
  title           text not null check (char_length(title) between 1 and 160),
  body            text not null check (char_length(body) between 1 and 4000),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------------ 10. SEO and performance (real data only)
-- Every metric is nullable: null means "not available", never zero. Rows come from Search Console,
-- Analytics or PageSpeed Insights, or are typed in by WeberAct from those tools.
create table public.seo_reports (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  project_id        uuid references public.projects(id) on delete set null,
  period            date not null check (extract(day from period) = 1),
  clicks            int check (clicks >= 0),
  impressions       int check (impressions >= 0),
  ctr               numeric(6,4) check (ctr between 0 and 1),
  avg_position      numeric(6,2) check (avg_position > 0),
  organic_sessions  int check (organic_sessions >= 0),
  indexed_pages     int check (indexed_pages >= 0),
  health_score      smallint check (health_score between 0 and 100),
  backlinks         int check (backlinks >= 0),
  referring_domains int check (referring_domains >= 0),
  keywords          jsonb not null default '[]'::jsonb check (jsonb_typeof(keywords) = 'array'),
  issues            jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),
  summary           text check (char_length(summary) <= 4000),
  source            text not null default 'manual' check (source in ('manual','search_console','analytics','mixed')),
  status            text not null default 'draft' check (status in ('draft','published')),
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, period)
);

create table public.performance_snapshots (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  url             text not null,
  strategy        text not null check (strategy in ('mobile','desktop')),
  performance     smallint check (performance between 0 and 100),
  accessibility   smallint check (accessibility between 0 and 100),
  best_practices  smallint check (best_practices between 0 and 100),
  seo             smallint check (seo between 0 and 100),
  lcp_ms          int, fcp_ms int, tbt_ms int, cls numeric(6,3), inp_ms int,
  field_data      boolean not null default false,
  fetched_at      timestamptz not null default now()
);
create index performance_org_idx on public.performance_snapshots(organization_id, fetched_at desc);

-- ------------------------------------------------------------------ 11. notifications and activity helpers
create or replace function public.log_activity(p_org uuid, p_project uuid, p_action text, p_summary text,
                                               p_visibility text default 'client', p_meta jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.activity_logs (organization_id, project_id, actor_id, action, summary, visibility, meta)
  values (p_org, p_project, auth.uid(), p_action, p_summary, p_visibility, coalesce(p_meta, '{}'::jsonb));
$$;

create or replace function public.notify_org_clients(p_org uuid, p_type text, p_title text, p_body text,
                                                     p_link text, p_entity uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, organization_id, type, title, body, link, entity_id)
  select p.id, p_org, p_type, p_title, p_body, p_link, p_entity
  from public.profiles p join public.organizations o on o.id = p.organization_id
  where p.organization_id = p_org and p.role = 'client' and p.is_active and o.status = 'active'
    and p.id is distinct from auth.uid();
$$;

create or replace function public.notify_staff(p_org uuid, p_type text, p_title text, p_body text,
                                               p_link text, p_entity uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, organization_id, type, title, body, link, entity_id)
  select p.id, p_org, p_type, p_title, p_body, p_link, p_entity
  from public.profiles p
  where p.role in ('admin','manager') and p.is_active and p.id is distinct from auth.uid();
$$;
revoke all on function public.log_activity(uuid,uuid,text,text,text,jsonb), public.notify_org_clients(uuid,text,text,text,text,uuid),
  public.notify_staff(uuid,text,text,text,text,uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ 12. accounts: invite-only
-- Replaces "only_admin_accounts": a login account can exist only for an admin email, an active team
-- member or a client contact WeberAct has added, whatever the sign-up setting in Supabase says.
create or replace function public.only_known_accounts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare e text := lower(new.email);
begin
  if exists (select 1 from public.admins a where a.email = e)
     or exists (select 1 from public.team_members t where t.email = e and t.is_active)
     or exists (select 1 from public.clients c join public.organizations o on o.id = c.organization_id
                where c.email = e and c.status <> 'inactive' and o.status = 'active') then
    return new;
  end if;
  raise exception 'New accounts are not allowed';
end $$;
revoke all on function public.only_known_accounts() from public, anon, authenticated;
drop trigger if exists only_admin_accounts on auth.users;
drop trigger if exists only_known_accounts on auth.users;
create trigger only_known_accounts before insert on auth.users for each row execute function public.only_known_accounts();

-- every new account gets a profile with the role WeberAct gave its email
create or replace function public.create_profile_for_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare e text := lower(new.email); t public.team_members; c public.clients;
begin
  if exists (select 1 from public.admins a where a.email = e) then
    insert into public.profiles (id, email, role, full_name) values (new.id, e, 'admin', new.raw_user_meta_data ->> 'full_name')
    on conflict (id) do nothing;
    update public.team_members set user_id = new.id where email = e;
    return new;
  end if;
  select * into t from public.team_members where email = e and is_active;
  if found then
    insert into public.profiles (id, email, role, full_name) values (new.id, e, t.role, t.full_name) on conflict (id) do nothing;
    update public.team_members set user_id = new.id where id = t.id;
    return new;
  end if;
  select * into c from public.clients where email = e and status <> 'inactive';
  if found then
    insert into public.profiles (id, email, role, full_name, phone, organization_id)
    values (new.id, e, 'client', c.full_name, c.phone, c.organization_id) on conflict (id) do nothing;
    update public.clients set user_id = new.id, status = 'active' where id = c.id;
  end if;
  return new;
end $$;
revoke all on function public.create_profile_for_user() from public, anon, authenticated;
drop trigger if exists create_profile_for_user on auth.users;
create trigger create_profile_for_user after insert on auth.users for each row execute function public.create_profile_for_user();

-- accounts that existed before the portal (the admin) get their profile now
insert into public.profiles (id, email, role)
select u.id, lower(u.email), 'admin' from auth.users u join public.admins a on a.email = lower(u.email)
on conflict (id) do nothing;

-- people's access follows their record: a deactivated contact or team member is signed out of everything
create or replace function public.sync_client_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null then
    update public.profiles set is_active = (new.status <> 'inactive'), organization_id = new.organization_id,
      full_name = coalesce(full_name, new.full_name)
    where id = new.user_id;
  end if;
  return new;
end $$;
create trigger clients_sync_profile after update of status, organization_id on public.clients
  for each row execute function public.sync_client_profile();

create or replace function public.sync_team_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null then
    update public.profiles set is_active = new.is_active, role = new.role where id = new.user_id
      and not exists (select 1 from public.admins a where a.email = profiles.email);
  end if;
  return new;
end $$;
create trigger team_sync_profile after update of is_active, role on public.team_members
  for each row execute function public.sync_team_profile();

create or replace function public.team_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.user_id is not null then
    update public.profiles set is_active = false where id = old.user_id
      and not exists (select 1 from public.admins a where a.email = profiles.email);
  end if;
  return old;
end $$;
create trigger team_removed after delete on public.team_members for each row execute function public.team_removed();

-- a deleted contact loses access too
create or replace function public.client_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.user_id is not null then update public.profiles set is_active = false, organization_id = null where id = old.user_id; end if;
  return old;
end $$;
create trigger clients_removed after delete on public.clients for each row execute function public.client_removed();

-- ------------------------------------------------------------------ 13. project triggers
create or replace function public.project_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.stage = 8 and new.stage < 8 and new.status = 'completed' then new.status := 'active'; end if;
  new.progress := case when new.stage = 8 then 100 else round((new.stage - 1) * 100.0 / 7) end;
  if new.stage = 8 and new.status = 'active' then new.status := 'completed'; end if;
  if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
  if new.status <> 'completed' then new.completed_at := null; end if;
  if tg_op = 'UPDATE' and new.status = 'completed' and old.status <> 'completed' and new.stage < 8 then new.stage := 8; new.progress := 100; end if;
  return new;
end $$;
create trigger projects_before_write before insert or update on public.projects
  for each row execute function public.project_before_write();
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

create or replace function public.project_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_stages (project_id, position, name, status, started_at, completed_at)
  select new.id, g, public.stage_name(g::smallint),
         case when g < new.stage then 'done' when g = new.stage then 'in_progress' else 'pending' end,
         case when g <= new.stage then now() end,
         case when g < new.stage then now() end
  from generate_series(1, 8) g;
  perform public.log_activity(new.organization_id, new.id, 'project.created', 'Project created: ' || new.name);
  perform public.notify_org_clients(new.organization_id, 'project', 'New project: ' || new.name,
    'Your project has been set up in the portal.', '/projects/' || new.id, new.id);
  return new;
end $$;
create trigger projects_after_insert after insert on public.projects for each row execute function public.project_after_insert();

create or replace function public.project_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.stage <> old.stage then
    update public.project_stages s set
      status = case when s.position < new.stage or new.stage = 8 then 'done' when s.position = new.stage then 'in_progress' else 'pending' end,
      started_at = case when s.position <= new.stage then coalesce(s.started_at, now()) end,
      completed_at = case when s.position < new.stage or new.stage = 8 then coalesce(s.completed_at, now()) end
    where s.project_id = new.id;
    perform public.log_activity(new.organization_id, new.id, 'project.stage',
      new.name || ' moved to ' || lpad(new.stage::text, 2, '0') || ' ' || public.stage_name(new.stage),
      'client', jsonb_build_object('from', old.stage, 'to', new.stage));
    perform public.notify_org_clients(new.organization_id, 'stage', new.name || ': ' || public.stage_name(new.stage),
      'Your project moved to stage ' || lpad(new.stage::text, 2, '0') || ', ' || public.stage_name(new.stage) || '.',
      '/projects/' || new.id, new.id);
  end if;
  if new.due_date is distinct from old.due_date then
    perform public.log_activity(new.organization_id, new.id, 'project.due_date',
      'Expected delivery for ' || new.name || ' set to ' || coalesce(to_char(new.due_date, 'DD Mon YYYY'), 'not set'));
  end if;
  if new.status <> old.status and new.status in ('on_hold','cancelled') then
    perform public.log_activity(new.organization_id, new.id, 'project.status', new.name || ' is ' || replace(new.status, '_', ' '));
  end if;
  return new;
end $$;
create trigger projects_after_update after update on public.projects for each row execute function public.project_after_update();

-- ------------------------------------------------------------------ 14. onboarding triggers
create or replace function public.onboarding_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and not public.is_staff() then
    -- clients may only fill in their draft and submit it
    if old.status <> 'draft' then raise exception 'This onboarding has already been submitted'; end if;
    if new.status not in ('draft','submitted') then raise exception 'Not allowed'; end if;
    new.organization_id := old.organization_id; new.admin_notes := old.admin_notes;
    new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at; new.project_id := old.project_id;
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status = 'draft') then
    new.submitted_at := now(); new.submitted_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' and new.status in ('in_review','approved') and new.status <> old.status then
    new.reviewed_by := auth.uid(); new.reviewed_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger onboarding_before_write before insert or update on public.onboarding_submissions
  for each row execute function public.onboarding_before_write();

create or replace function public.onboarding_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then
    perform public.log_activity(new.organization_id, new.project_id, 'onboarding.submitted', 'Onboarding submitted');
    perform public.notify_staff(new.organization_id, 'onboarding', 'Onboarding submitted',
      (select name from public.organizations where id = new.organization_id) || ' completed onboarding.', '/admin/onboarding/' || new.id, new.id);
  elsif tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
    perform public.notify_org_clients(new.organization_id, 'onboarding', 'Onboarding approved',
      'WeberAct reviewed your onboarding details.', '/onboarding', new.id);
  end if;
  return new;
end $$;
create trigger onboarding_after_write after insert or update on public.onboarding_submissions
  for each row execute function public.onboarding_after_write();

-- ------------------------------------------------------------------ 15. contract triggers and acceptance
create or replace function public.contract_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'accepted' and (new.title, new.scope, new.payment_terms, new.start_date, new.end_date, new.value, new.currency,
      new.file_path, new.file_sha256, new.organization_id, new.accepted_at, new.accepted_by, new.accepted_name, new.accepted_email,
      new.accepted_ip, new.accepted_user_agent, new.accepted_document_sha256)
      is distinct from (old.title, old.scope, old.payment_terms, old.start_date, old.end_date, old.value, old.currency,
      old.file_path, old.file_sha256, old.organization_id, old.accepted_at, old.accepted_by, old.accepted_name, old.accepted_email,
      old.accepted_ip, old.accepted_user_agent, old.accepted_document_sha256) then
    raise exception 'An accepted contract cannot be changed. Void it and issue a new one.';
  end if;
  if old.status = 'accepted' and new.status not in ('accepted','void','expired') then
    raise exception 'An accepted contract can only be voided or expired';
  end if;
  if new.status = 'accepted' and old.status <> 'accepted' and current_setting('weberact.accepting', true) is distinct from 'on' then
    raise exception 'Contracts are accepted by the client in the portal';
  end if;
  if new.status = 'sent' and old.status = 'draft' then new.sent_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;
create trigger contracts_before_update before update on public.contracts for each row execute function public.contract_before_update();

create or replace function public.contract_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'accepted' then raise exception 'Contracts are accepted by the client in the portal'; end if;
  if new.status = 'sent' then new.sent_at := now(); end if;
  return new;
end $$;
create trigger contracts_before_insert before insert on public.contracts for each row execute function public.contract_before_insert();

create or replace function public.contract_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status <> 'sent') then
    perform public.log_activity(new.organization_id, new.project_id, 'contract.sent', 'Contract shared: ' || new.title);
    perform public.notify_org_clients(new.organization_id, 'contract', 'Contract ready to review',
      new.title || ' is ready for your review and acceptance.', '/contracts/' || new.id, new.id);
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    perform public.log_activity(new.organization_id, new.project_id, 'contract.accepted',
      'Contract accepted: ' || new.title || ' by ' || new.accepted_name);
    perform public.notify_staff(new.organization_id, 'contract', 'Contract accepted',
      new.title || ' was accepted by ' || new.accepted_name || '.', '/admin/contracts/' || new.id, new.id);
  end if;
  return new;
end $$;
create trigger contracts_after_write after insert or update on public.contracts for each row execute function public.contract_after_write();

-- Electronic acceptance. Records who accepted (account, email, typed name), when, from which address
-- and browser, and a SHA-256 fingerprint of the exact document accepted. This is a record of consent,
-- not a certified digital signature.
create or replace function public.accept_contract(p_contract uuid, p_full_name text, p_user_agent text default null)
returns public.contracts language plpgsql security definer set search_path = '' as $$
declare c public.contracts; h json := nullif(current_setting('request.headers', true), '')::json; ip text; doc_hash text;
begin
  select * into c from public.contracts where id = p_contract for update;
  if not found or c.organization_id is distinct from public.my_org() then raise exception 'Contract not found'; end if;
  if c.status <> 'sent' then raise exception 'This contract is not open for acceptance'; end if;
  if c.end_date is not null and c.end_date < current_date then raise exception 'This contract has expired'; end if;
  if char_length(trim(coalesce(p_full_name, ''))) < 2 then raise exception 'Type your full name to accept'; end if;
  ip := coalesce(h ->> 'cf-connecting-ip', split_part(h ->> 'x-forwarded-for', ',', 1), h ->> 'x-real-ip');
  doc_hash := coalesce(c.file_sha256, encode(extensions.digest(convert_to(
    coalesce(c.title, '') || E'\n' || coalesce(c.scope, '') || E'\n' || coalesce(c.payment_terms, '') || E'\n' ||
    coalesce(c.start_date::text, '') || E'\n' || coalesce(c.end_date::text, '') || E'\n' || coalesce(c.value::text, '') || ' ' || c.currency,
    'UTF8'), 'sha256'), 'hex'));
  perform set_config('weberact.accepting', 'on', true);
  update public.contracts set status = 'accepted', accepted_at = now(), accepted_by = auth.uid(),
    accepted_name = left(trim(p_full_name), 120), accepted_email = lower(auth.jwt() ->> 'email'),
    accepted_ip = left(trim(ip), 64), accepted_user_agent = left(coalesce(p_user_agent, h ->> 'user-agent'), 400),
    accepted_document_sha256 = doc_hash
  where id = p_contract returning * into c;
  perform set_config('weberact.accepting', 'off', true);
  return c;
end $$;
revoke all on function public.accept_contract(uuid, text, text) from public, anon;
grant execute on function public.accept_contract(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------ 16. invoice numbering, totals, payments
create or replace function public.next_invoice_number() returns text
language plpgsql security definer set search_path = '' as $$
declare y int := extract(year from current_date); n int; prefix text;
begin
  insert into public.invoice_counters (year, last_value) values (y, 1)
  on conflict (year) do update set last_value = public.invoice_counters.last_value + 1
  returning last_value into n;
  select invoice_prefix into prefix from public.portal_settings where id = 1;
  return coalesce(prefix, 'WA') || '-' || y || '-' || lpad(n::text, 4, '0');
end $$;
revoke all on function public.next_invoice_number() from public, anon, authenticated;

create or replace function public.recalc_invoice(p_invoice uuid) returns void
language sql security definer set search_path = '' as $$
  update public.invoices i set
    subtotal  = coalesce((select sum(amount) from public.invoice_items where invoice_id = p_invoice), 0),
    tax_total = coalesce((select sum(round(amount * tax_rate / 100, 2)) from public.invoice_items where invoice_id = p_invoice), 0),
    total     = coalesce((select sum(amount + round(amount * tax_rate / 100, 2)) from public.invoice_items where invoice_id = p_invoice), 0),
    amount_paid = coalesce((select sum(amount) from public.payments where invoice_id = p_invoice), 0)
  where i.id = p_invoice;
$$;
revoke all on function public.recalc_invoice(uuid) from public, anon, authenticated;

create or replace function public.invoice_items_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare inv uuid := coalesce(new.invoice_id, old.invoice_id); st text;
begin
  select status into st from public.invoices where id = inv;
  if st is not null and st <> 'draft' then raise exception 'Items can only change while the invoice is a draft'; end if;
  return coalesce(new, old);
end $$;
create trigger invoice_items_guard before insert or update or delete on public.invoice_items
  for each row execute function public.invoice_items_guard();

create or replace function public.invoice_items_total() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then perform public.recalc_invoice(old.invoice_id); end if;
  return null;
end $$;
create trigger invoice_items_total after insert or update or delete on public.invoice_items
  for each row execute function public.invoice_items_total();

create or replace function public.invoice_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.subtotal := 0; new.tax_total := 0; new.total := 0; new.amount_paid := 0;
    if new.status <> 'draft' then raise exception 'Create the invoice as a draft, then issue it'; end if;
    new.number := null;
    return new;
  end if;
  if pg_trigger_depth() = 1 then  -- direct edits (not the totals recalculation)
    if (new.subtotal, new.tax_total, new.total, new.amount_paid) is distinct from (old.subtotal, old.tax_total, old.total, old.amount_paid)
       or new.number is distinct from old.number then
      raise exception 'Totals and numbers are calculated by the system';
    end if;
    if old.status <> 'draft' and (new.organization_id, new.currency, new.issue_date) is distinct from (old.organization_id, old.currency, old.issue_date) then
      raise exception 'An issued invoice cannot change client, currency or issue date';
    end if;
    if old.status = 'void' and new.status <> 'void' then raise exception 'A void invoice stays void'; end if;
    if old.status = 'issued' and new.status = 'draft' then raise exception 'An issued invoice cannot go back to draft'; end if;
    if new.status = 'void' and old.status <> 'void' and old.amount_paid > 0 then raise exception 'Remove its payments before voiding a paid invoice'; end if;
  end if;
  if new.status = 'issued' and old.status = 'draft' then
    if new.total <= 0 then raise exception 'Add at least one item before issuing'; end if;
    new.number := public.next_invoice_number(); new.issued_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger invoices_before_write before insert or update on public.invoices for each row execute function public.invoice_before_write();

create or replace function public.invoice_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'issued' and old.status = 'draft' then
    perform public.log_activity(new.organization_id, new.project_id, 'invoice.issued',
      'Invoice ' || new.number || ' issued for ' || new.currency || ' ' || to_char(new.total, 'FM999,999,990.00'));
    perform public.notify_org_clients(new.organization_id, 'invoice', 'New invoice ' || new.number,
      new.currency || ' ' || to_char(new.total, 'FM999,999,990.00') || ', due ' || to_char(new.due_date, 'DD Mon YYYY') || '.',
      '/billing/' || new.id, new.id);
  elsif new.status = 'void' and old.status <> 'void' and old.status <> 'draft' then
    perform public.log_activity(new.organization_id, new.project_id, 'invoice.void', 'Invoice ' || new.number || ' voided');
  end if;
  return new;
end $$;
create trigger invoices_after_update after update on public.invoices for each row execute function public.invoice_after_update();

-- issued invoices are never deleted (their numbers must stay consecutive); void them instead
create or replace function public.invoice_before_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' then raise exception 'Only draft invoices can be deleted. Void an issued invoice instead.'; end if;
  return old;
end $$;
create trigger invoices_before_delete before delete on public.invoices for each row execute function public.invoice_before_delete();

create or replace function public.payment_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  select * into i from public.invoices where id = new.invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if i.status <> 'issued' then raise exception 'Payments can only be recorded against an issued invoice'; end if;
  if i.amount_paid + new.amount > i.total + 0.005 then
    raise exception 'This payment is more than the balance due (% %)', i.currency, to_char(i.total - i.amount_paid, 'FM999,999,990.00');
  end if;
  new.organization_id := i.organization_id;
  new.recorded_by := coalesce(new.recorded_by, auth.uid());
  return new;
end $$;
create trigger payments_before_insert before insert on public.payments for each row execute function public.payment_before_insert();

create or replace function public.payment_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  if tg_op = 'INSERT' then
    select * into i from public.invoices where id = new.invoice_id;
    perform public.log_activity(i.organization_id, i.project_id, 'payment.received',
      'Payment of ' || i.currency || ' ' || to_char(new.amount, 'FM999,999,990.00') || ' received for ' || i.number);
    perform public.notify_org_clients(i.organization_id, 'payment', 'Payment received',
      'Thank you. ' || i.currency || ' ' || to_char(new.amount, 'FM999,999,990.00') || ' was recorded against invoice ' || i.number || '.',
      '/billing/' || i.id, i.id);
    perform public.notify_staff(i.organization_id, 'payment', 'Payment received',
      i.currency || ' ' || to_char(new.amount, 'FM999,999,990.00') || ' for ' || i.number || '.', '/admin/invoices/' || i.id, i.id);
  end if;
  return null;
end $$;
create trigger payments_after_write after insert or delete on public.payments for each row execute function public.payment_after_write();

-- ------------------------------------------------------------------ 17. files, messages, requests, announcements, SEO
create or replace function public.file_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'client_upload' then
    perform public.log_activity(new.organization_id, new.project_id, 'file.uploaded', 'Client uploaded ' || new.name);
    perform public.notify_staff(new.organization_id, 'file', 'New client upload', new.name, '/admin/files', new.id);
  else
    perform public.log_activity(new.organization_id, new.project_id, 'file.shared', 'New file shared: ' || new.name);
    perform public.notify_org_clients(new.organization_id, 'file',
      case when new.kind = 'deliverable' then 'New deliverable' else 'New document' end, new.name, '/files', new.id);
  end if;
  return new;
end $$;
create trigger files_after_insert after insert on public.project_files for each row execute function public.file_after_insert();

create or replace function public.message_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select organization_id into new.organization_id from public.conversations where id = new.conversation_id;
  new.sender_id := auth.uid();
  -- attachments must live in this organization's own folder
  if exists (select 1 from jsonb_array_elements(new.attachments) a
             where split_part(coalesce(a ->> 'path', ''), '/', 1) <> new.organization_id::text) then
    raise exception 'Attachment outside this conversation''s files';
  end if;
  new.created_at := now();
  return new;
end $$;
create trigger messages_before_insert before insert on public.messages for each row execute function public.message_before_insert();

create or replace function public.message_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare conv public.conversations; sender_name text;
begin
  select * into conv from public.conversations where id = new.conversation_id;
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at) values (new.conversation_id, new.sender_id, new.created_at)
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  select coalesce(full_name, email) into sender_name from public.profiles where id = new.sender_id;
  if public.is_staff() then
    perform public.notify_org_clients(conv.organization_id, 'message', 'New message: ' || conv.subject,
      coalesce(sender_name, 'WeberAct') || ': ' || left(new.body, 140), '/messages?c=' || conv.id, conv.id);
  else
    perform public.notify_staff(conv.organization_id, 'message', 'New message: ' || conv.subject,
      coalesce(sender_name, 'Client') || ': ' || left(new.body, 140), '/admin/messages?c=' || conv.id, conv.id);
  end if;
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages for each row execute function public.message_after_insert();

create or replace function public.request_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.organization_id, new.project_id, 'request.' || new.type,
      initcap(new.type) || ' request: ' || new.title);
    perform public.notify_staff(new.organization_id, 'request', 'New ' || new.type || ' request', new.title, '/admin/requests', new.id);
  elsif new.status <> old.status then
    if new.created_by is not null and new.created_by is distinct from auth.uid() then
      insert into public.notifications (user_id, organization_id, type, title, body, link, entity_id)
      values (new.created_by, new.organization_id, 'request', 'Request ' || replace(new.status, '_', ' '), new.title, '/requests', new.id);
    end if;
    perform public.log_activity(new.organization_id, new.project_id, 'request.status',
      'Request "' || new.title || '" is ' || replace(new.status, '_', ' '));
  end if;
  return new;
end $$;
create trigger requests_after_write after insert or update on public.support_requests for each row execute function public.request_after_write();

create or replace function public.request_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if not public.is_staff() then new.status := 'open'; new.assigned_to := null; new.resolution := null; end if;
  elsif not public.is_staff() then
    raise exception 'Only WeberAct can update a request';
  end if;
  if new.status in ('resolved','closed') and new.resolved_at is null then new.resolved_at := now(); end if;
  if new.status in ('open','in_progress') then new.resolved_at := null; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger requests_before_write before insert or update on public.support_requests for each row execute function public.request_before_write();

create or replace function public.announcement_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, organization_id, type, title, body, link, entity_id)
  select p.id, p.organization_id, 'announcement', new.title, left(new.body, 300), '/notifications', new.id
  from public.profiles p join public.organizations o on o.id = p.organization_id
  where p.role = 'client' and p.is_active and o.status = 'active'
    and (new.organization_id is null or p.organization_id = new.organization_id);
  return new;
end $$;
create trigger announcements_after_insert after insert on public.announcements for each row execute function public.announcement_after_insert();

create or replace function public.seo_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    perform public.notify_org_clients(new.organization_id, 'seo', 'SEO report: ' || to_char(new.period, 'FMMonth YYYY'),
      'Your monthly search report is ready.', '/seo', new.id);
    perform public.log_activity(new.organization_id, new.project_id, 'seo.published', 'SEO report published for ' || to_char(new.period, 'FMMonth YYYY'));
  end if;
  return new;
end $$;
create trigger seo_after_write after insert or update on public.seo_reports for each row execute function public.seo_after_write();

-- deadlines: called daily by the portal's scheduled job, or by staff from the admin panel; one reminder per project per day
create or replace function public.notify_upcoming_deadlines(p_days int default 3) returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  if not (public.is_staff() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then raise exception 'Not allowed'; end if;
  for r in select p.* from public.projects p join public.organizations o on o.id = p.organization_id
           where p.status = 'active' and o.status = 'active' and p.due_date between current_date and current_date + p_days loop
    if not exists (select 1 from public.notifications where type = 'deadline' and entity_id = r.id and created_at > now() - interval '20 hours') then
      perform public.notify_org_clients(r.organization_id, 'deadline', 'Delivery date approaching',
        r.name || ' is due ' || to_char(r.due_date, 'DD Mon YYYY') || '.', '/projects/' || r.id, r.id);
      insert into public.notifications (user_id, organization_id, type, title, body, link, entity_id)
      select pr.id, r.organization_id, 'deadline', 'Deadline: ' || r.name, 'Due ' || to_char(r.due_date, 'DD Mon YYYY') || '.', '/admin/projects/' || r.id, r.id
      from public.profiles pr where pr.role in ('admin','manager') and pr.is_active;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.notify_upcoming_deadlines(int) from public, anon;
grant execute on function public.notify_upcoming_deadlines(int) to authenticated, service_role;

-- unread messages per conversation for the signed-in person (row level security still applies)
create or replace function public.unread_counts() returns table (conversation_id uuid, unread bigint)
language sql stable security invoker set search_path = '' as $$
  select m.conversation_id, count(*)
  from public.messages m
  left join public.conversation_reads r on r.conversation_id = m.conversation_id and r.user_id = auth.uid()
  where m.sender_id is distinct from auth.uid() and (r.last_read_at is null or m.created_at > r.last_read_at)
  group by m.conversation_id;
$$;
grant execute on function public.unread_counts() to authenticated;

-- updated_at on the remaining tables
create trigger organizations_touch before update on public.organizations for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger clients_touch before update on public.clients for each row execute function public.touch_updated_at();
create trigger team_touch before update on public.team_members for each row execute function public.touch_updated_at();
create trigger seo_touch before update on public.seo_reports for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.portal_settings for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ 18. row level security
alter table public.organizations          enable row level security;
alter table public.profiles               enable row level security;
alter table public.clients                enable row level security;
alter table public.team_members           enable row level security;
alter table public.services               enable row level security;
alter table public.portal_settings        enable row level security;
alter table public.projects               enable row level security;
alter table public.project_services       enable row level security;
alter table public.project_stages         enable row level security;
alter table public.onboarding_submissions enable row level security;
alter table public.contracts              enable row level security;
alter table public.invoice_counters       enable row level security;
alter table public.invoices               enable row level security;
alter table public.invoice_items          enable row level security;
alter table public.payments               enable row level security;
alter table public.project_files          enable row level security;
alter table public.conversations          enable row level security;
alter table public.messages               enable row level security;
alter table public.conversation_reads     enable row level security;
alter table public.notifications          enable row level security;
alter table public.activity_logs          enable row level security;
alter table public.support_requests       enable row level security;
alter table public.announcements          enable row level security;
alter table public.seo_reports            enable row level security;
alter table public.performance_snapshots  enable row level security;

-- visitors who are not signed in reach nothing in the portal
revoke all on public.organizations, public.profiles, public.clients, public.team_members, public.services, public.portal_settings,
  public.projects, public.project_services, public.project_stages, public.onboarding_submissions, public.contracts, public.invoice_counters,
  public.invoices, public.invoice_items, public.payments, public.project_files, public.conversations, public.messages,
  public.conversation_reads, public.notifications, public.activity_logs, public.support_requests, public.announcements,
  public.seo_reports, public.performance_snapshots, public.invoice_summaries from anon;
revoke all on public.invoice_counters from authenticated;
grant select on public.invoice_summaries to authenticated;

-- organizations
create policy "org read" on public.organizations for select to authenticated using (public.can_see_org(id));
create policy "org insert staff" on public.organizations for insert to authenticated with check (public.is_staff());
create policy "org update staff" on public.organizations for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "org delete admin" on public.organizations for delete to authenticated using (public.is_portal_admin());

-- profiles: your own, staff profiles (names in messages), people of your organization; staff see everyone
create policy "profiles read" on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_staff() or role in ('admin','manager')
  or (organization_id is not null and organization_id = public.my_org()));
revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url, email_notifications) on public.profiles to authenticated;
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, delete on public.profiles from authenticated;

-- client contacts
create policy "clients read" on public.clients for select to authenticated using (public.can_see_org(organization_id));
create policy "clients write staff" on public.clients for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- team: everyone signed in sees names and titles; only admins change it
create policy "team read" on public.team_members for select to authenticated using (true);
create policy "team write admin" on public.team_members for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy "services read" on public.services for select to authenticated using (true);
create policy "services write admin" on public.services for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy "settings read" on public.portal_settings for select to authenticated using (true);
create policy "settings update admin" on public.portal_settings for update to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());
revoke insert, delete on public.portal_settings from authenticated;

-- projects and their parts
create policy "projects read" on public.projects for select to authenticated using (public.can_see_org(organization_id));
create policy "projects write staff" on public.projects for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "project services read" on public.project_services for select to authenticated using (
  exists (select 1 from public.projects p where p.id = project_id and public.can_see_org(p.organization_id)));
create policy "project services write staff" on public.project_services for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "stages read" on public.project_stages for select to authenticated using (
  exists (select 1 from public.projects p where p.id = project_id and public.can_see_org(p.organization_id)));
create policy "stages write staff" on public.project_stages for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- onboarding: clients fill in and submit their own; staff review and edit
create policy "onboarding read" on public.onboarding_submissions for select to authenticated using (public.can_see_org(organization_id));
create policy "onboarding client insert" on public.onboarding_submissions for insert to authenticated with check (
  (organization_id = public.my_org() and status in ('draft','submitted')) or public.is_staff());
create policy "onboarding client update" on public.onboarding_submissions for update to authenticated using (
  (organization_id = public.my_org() and status = 'draft') or public.is_staff())
  with check ((organization_id = public.my_org() and status in ('draft','submitted')) or public.is_staff());
create policy "onboarding delete staff" on public.onboarding_submissions for delete to authenticated using (public.is_staff());

-- contracts: clients see what was sent to them; acceptance only through accept_contract()
create policy "contracts read" on public.contracts for select to authenticated using (
  public.is_staff() or (organization_id = public.my_org() and status <> 'draft'));
create policy "contracts write staff" on public.contracts for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- money: clients read their issued invoices and payments; only admins write
create policy "invoices read" on public.invoices for select to authenticated using (
  public.is_staff() or (organization_id = public.my_org() and status <> 'draft'));
create policy "invoices write admin" on public.invoices for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy "invoice items read" on public.invoice_items for select to authenticated using (
  exists (select 1 from public.invoices i where i.id = invoice_id and (public.is_staff() or (i.organization_id = public.my_org() and i.status <> 'draft'))));
create policy "invoice items write admin" on public.invoice_items for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy "payments read" on public.payments for select to authenticated using (public.can_see_org(organization_id));
create policy "payments insert admin" on public.payments for insert to authenticated with check (public.is_portal_admin());
create policy "payments delete admin" on public.payments for delete to authenticated using (public.is_portal_admin());
revoke update on public.payments from authenticated;

-- files: clients read their organization's files and add their own uploads
create policy "files read" on public.project_files for select to authenticated using (public.can_see_org(organization_id));
create policy "files client upload" on public.project_files for insert to authenticated with check (
  public.is_staff() or (organization_id = public.my_org() and kind = 'client_upload' and uploaded_by = auth.uid()
    and split_part(storage_path, '/', 2) = 'uploads'
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.organization_id = public.my_org()))));
create policy "files update staff" on public.project_files for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "files delete staff" on public.project_files for delete to authenticated using (public.is_staff());

-- conversations and messages: clients only ever see their own organization's
create policy "conversations read" on public.conversations for select to authenticated using (public.can_see_org(organization_id));
create policy "conversations create" on public.conversations for insert to authenticated with check (
  public.is_staff() or (organization_id = public.my_org() and created_by = auth.uid()
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.organization_id = public.my_org()))));
create policy "conversations delete staff" on public.conversations for delete to authenticated using (public.is_staff());
create policy "messages read" on public.messages for select to authenticated using (public.can_see_org(organization_id));
create policy "messages send" on public.messages for insert to authenticated with check (
  exists (select 1 from public.conversations c where c.id = conversation_id and public.can_see_org(c.organization_id)));
create policy "messages delete staff" on public.messages for delete to authenticated using (public.is_staff());
create policy "reads own" on public.conversation_reads for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.conversations c where c.id = conversation_id and public.can_see_org(c.organization_id)));

-- notifications: your own only
create policy "notifications own read" on public.notifications for select to authenticated using (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "notifications own update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications own delete" on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke insert on public.notifications from authenticated;

-- activity: clients see their organization's client-facing activity; staff see everything
create policy "activity read" on public.activity_logs for select to authenticated using (
  public.is_staff() or (organization_id = public.my_org() and visibility = 'client'));
revoke insert, update, delete on public.activity_logs from authenticated;

-- requests: clients raise and read their own organization's; staff manage
create policy "requests read" on public.support_requests for select to authenticated using (public.can_see_org(organization_id));
create policy "requests create" on public.support_requests for insert to authenticated with check (
  public.is_staff() or (organization_id = public.my_org()
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.organization_id = public.my_org()))));
create policy "requests update staff" on public.support_requests for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "requests delete staff" on public.support_requests for delete to authenticated using (public.is_staff());

create policy "announcements read" on public.announcements for select to authenticated using (
  public.is_staff() or organization_id is null or organization_id = public.my_org());
create policy "announcements write admin" on public.announcements for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy "seo read" on public.seo_reports for select to authenticated using (
  public.is_staff() or (organization_id = public.my_org() and status = 'published'));
create policy "seo write staff" on public.seo_reports for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "performance read" on public.performance_snapshots for select to authenticated using (public.can_see_org(organization_id));
create policy "performance write staff" on public.performance_snapshots for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ------------------------------------------------------------------ 19. private file storage
insert into storage.buckets (id, name, public, file_size_limit)
values ('portal', 'portal', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

-- paths: <organization>/projects|contracts|... for WeberAct; <organization>/uploads|messages/... for clients
drop policy if exists "portal read" on storage.objects;
create policy "portal read" on storage.objects for select to authenticated using (
  bucket_id = 'portal' and (public.is_staff() or (storage.foldername(name))[1] = public.my_org()::text));
drop policy if exists "portal upload" on storage.objects;
create policy "portal upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'portal' and (public.is_staff()
    or ((storage.foldername(name))[1] = public.my_org()::text and (storage.foldername(name))[2] in ('uploads','messages'))));
drop policy if exists "portal update staff" on storage.objects;
create policy "portal update staff" on storage.objects for update to authenticated using (bucket_id = 'portal' and public.is_staff())
  with check (bucket_id = 'portal' and public.is_staff());
drop policy if exists "portal delete staff" on storage.objects;
create policy "portal delete staff" on storage.objects for delete to authenticated using (bucket_id = 'portal' and public.is_staff());

-- ------------------------------------------------------------------ 20. realtime: the portal updates while it is open
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['projects','project_stages','messages','conversations','notifications','activity_logs','project_files','invoices','support_requests'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
