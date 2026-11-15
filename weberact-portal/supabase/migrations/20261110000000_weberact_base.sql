-- WeberAct base: the admin list shared by the website dashboard and the client portal.
-- Identical to the definitions in tools/supabase/weberact.sql, which is already applied to the
-- hosted project; this file exists so a fresh local database has them too. Safe to run again.

create table if not exists public.admins (
  email    text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admins a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "admins see admins" on public.admins;
create policy "admins see admins" on public.admins for select to authenticated using (public.is_admin());
revoke all on public.admins from anon;
revoke insert, update, delete on public.admins from authenticated;
