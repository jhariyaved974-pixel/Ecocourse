-- WeberAct: enquiries and privacy requests from the website.
-- Visitors can only ADD rows (never read them). Only people listed in public.admins,
-- signed in to the dashboard, can read, update or delete them.

-- 1. Who can use the dashboard -------------------------------------------------
create table if not exists public.admins (
  email    text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admins a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 2. Enquiries from the "Request a proposal" form ------------------------------
create table if not exists public.enquiries (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  contacted_at  timestamptz,
  status        text not null default 'new' check (status in ('new', 'contacted', 'proposal_sent', 'won', 'lost')),
  notes         text check (char_length(notes) <= 4000),
  services      text[] not null default '{}' check (cardinality(services) <= 10),
  business      text check (char_length(business) <= 160),
  business_type text check (char_length(business_type) <= 80),
  city          text check (char_length(city) <= 120),
  website       text check (char_length(website) <= 300),
  result        text check (char_length(result) <= 120),
  detail        text check (char_length(detail) <= 4000),
  currency      text check (currency in ('USD', 'INR')),
  budget        text check (char_length(budget) <= 60),
  timing        text check (char_length(timing) <= 60),
  name          text not null check (char_length(name) between 1 and 120),
  whatsapp      text check (char_length(whatsapp) <= 40),
  email         text check (char_length(email) <= 200),
  contact_via   text check (contact_via in ('WhatsApp', 'Call', 'Email')),
  source        jsonb not null default '{}'::jsonb check (pg_column_size(source) < 4000)
);
create index if not exists enquiries_created_idx on public.enquiries (created_at desc);
create index if not exists enquiries_status_idx on public.enquiries (status);

-- 3. Requests from the privacy policy form -------------------------------------
create table if not exists public.privacy_requests (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  status       text not null default 'open' check (status in ('open', 'done')),
  request_type text not null check (char_length(request_type) between 1 and 60),
  name         text not null check (char_length(name) between 1 and 120),
  contact      text not null check (char_length(contact) between 3 and 200),
  details      text check (char_length(details) <= 4000),
  notes        text check (char_length(notes) <= 4000)
);
create index if not exists privacy_created_idx on public.privacy_requests (created_at desc);

-- 4. Timestamps: updated_at on every change; contacted_at when an enquiry first leaves "new"
create or replace function public.touch_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name = 'enquiries' and old.status = 'new' and new.status <> 'new' and new.contacted_at is null then
    new.contacted_at := now();
  end if;
  return new;
end $$;
drop trigger if exists enquiries_touch on public.enquiries;
create trigger enquiries_touch before update on public.enquiries for each row execute function public.touch_row();
drop trigger if exists privacy_touch on public.privacy_requests;
create trigger privacy_touch before update on public.privacy_requests for each row execute function public.touch_row();

-- 5. Row-level security ----------------------------------------------------------
alter table public.admins           enable row level security;
alter table public.enquiries        enable row level security;
alter table public.privacy_requests enable row level security;

drop policy if exists "website submits enquiries" on public.enquiries;
create policy "website submits enquiries" on public.enquiries for insert to anon, authenticated
  with check (status = 'new' and notes is null and contacted_at is null);
drop policy if exists "admins read enquiries" on public.enquiries;
create policy "admins read enquiries" on public.enquiries for select to authenticated using (public.is_admin());
drop policy if exists "admins update enquiries" on public.enquiries;
create policy "admins update enquiries" on public.enquiries for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete enquiries" on public.enquiries;
create policy "admins delete enquiries" on public.enquiries for delete to authenticated using (public.is_admin());

drop policy if exists "website submits privacy requests" on public.privacy_requests;
create policy "website submits privacy requests" on public.privacy_requests for insert to anon, authenticated
  with check (status = 'open' and notes is null);
drop policy if exists "admins read privacy requests" on public.privacy_requests;
create policy "admins read privacy requests" on public.privacy_requests for select to authenticated using (public.is_admin());
drop policy if exists "admins update privacy requests" on public.privacy_requests;
create policy "admins update privacy requests" on public.privacy_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete privacy requests" on public.privacy_requests;
create policy "admins delete privacy requests" on public.privacy_requests for delete to authenticated using (public.is_admin());

drop policy if exists "admins see admins" on public.admins;
create policy "admins see admins" on public.admins for select to authenticated using (public.is_admin());

-- 6. Column privileges: visitors may only fill the form fields -----------------
revoke all on public.enquiries from anon;
grant insert (services, business, business_type, city, website, result, detail, currency, budget, timing,
              name, whatsapp, email, contact_via, source) on public.enquiries to anon;
revoke all on public.privacy_requests from anon;
grant insert (request_type, name, contact, details) on public.privacy_requests to anon;
revoke all on public.admins from anon;

-- 7. Give dashboard access (run once per person, with their sign-in email):
-- insert into public.admins (email) values ('founder@weberact.co');
