-- International interest: shoppers outside India (or anyone who wants delivery
-- abroad) leave their details; staff are alerted by email and follow up.
-- Written only by the server (service role) after validation and rate limiting.

create table public.international_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text not null check (char_length(email) <= 254 and email ~* '^[^\s@]+@[^\s@]+\.[a-z]{2,}$'),
  phone text check (phone is null or char_length(phone) <= 30),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  -- Country detected from the visitor's connection (Vercel geo header), for comparison.
  detected_country text check (detected_country is null or detected_country ~ '^[A-Z]{2}$'),
  buyer_type text not null default 'personal' check (buyer_type in ('personal', 'reseller', 'wholesale')),
  interest text not null default '' check (char_length(interest) <= 300),
  message text not null default '' check (char_length(message) <= 2000),
  source_path text not null default '' check (char_length(source_path) <= 200),
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'closed')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  ip_hash text not null default '' check (char_length(ip_hash) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.international_leads is 'Interest from shoppers who want delivery outside India.';
create index international_leads_status_idx on public.international_leads (status, created_at desc);
create index international_leads_email_idx on public.international_leads (lower(email));

alter table public.international_leads enable row level security;

create policy international_leads_staff_read on public.international_leads for select to authenticated
  using (public.is_order_staff());
create policy international_leads_staff_update on public.international_leads for update to authenticated
  using (public.is_order_staff()) with check (public.is_order_staff());

revoke insert, delete, truncate on public.international_leads from anon, authenticated;
revoke all on public.international_leads from anon;
revoke update on public.international_leads from authenticated;
grant update (status, admin_note, updated_at) on public.international_leads to authenticated;

create trigger international_leads_audit after update on public.international_leads
  for each row execute function public.audit_row_change();

insert into public.navigation_links (menu, group_title, label, href, sort_order)
select 'footer', 'Company', 'International orders', '/international', 26
where not exists (select 1 from public.navigation_links where href = '/international');
