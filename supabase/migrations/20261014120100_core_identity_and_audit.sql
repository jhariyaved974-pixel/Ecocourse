-- -----------------------------------------------------------------------------
-- Core: extensions, shared helpers, customer profiles, staff roles, audit log.
--
-- Conventions used across all migrations:
--   * Money is stored as integer minor units (paise for INR). Never floats.
--   * Every table has RLS enabled. Policies are deny-by-default; access is
--     granted explicitly per role.
--   * Privileged state changes (orders, payments, stock) happen only inside
--     SECURITY DEFINER functions with `set search_path = ''`, which validate
--     the caller's role themselves.
-- -----------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- True for root-relative paths (no protocol-relative //), http(s), mailto and tel.
-- Used by CHECK constraints so the CMS can never store javascript: or data: links.
create or replace function public.is_safe_href(p_href text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_href is null
      or p_href = ''
      or (p_href ~ '^/([^/\\]|$)' and p_href !~ '[\s<>"]')
      or p_href ~ '^#[A-Za-z0-9_-]*$'
      or p_href ~* '^https?://[^\s<>"]+$'
      or p_href ~* '^mailto:[^\s<>"]+$'
      or p_href ~* '^tel:\+?[0-9 ()-]{3,20}$';
$$;

create or replace function public.is_slug(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(p_value) between 1 and 120;
$$;

create or replace function public.is_hex_color(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value ~ '^#[0-9A-Fa-f]{6}$';
$$;

-- Immutable text join for text[] so it can feed a generated tsvector column.
create or replace function public.text_array_to_string(p_values text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(array_to_string(p_values, ' '), '');
$$;

-- ---------------------------------------------------------------------------
-- Customer profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text check (full_name is null or char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9][0-9 -]{6,18}$'),
  marketing_opt_in boolean not null default false,
  marketing_opt_in_at timestamptz,
  is_blocked boolean not null default false,
  blocked_reason text check (blocked_reason is null or char_length(blocked_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Customer profile for every auth user. Staff permissions live in staff_members, never here.';
create index profiles_email_idx on public.profiles (lower(email));
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Staff (role-based access control)
-- ---------------------------------------------------------------------------
create type public.staff_role as enum ('owner', 'admin', 'editor', 'support');
comment on type public.staff_role is
  'owner: everything incl. staff & payment settings; admin: everything except managing owners; '
  'editor: catalogue, media, content, inventory; support: orders, customers, reviews (no payment approval).';

create table public.staff_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.staff_role not null,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger staff_members_set_updated_at before update on public.staff_members
  for each row execute function public.set_updated_at();

-- Security settings are kept apart from public store settings.
create table public.security_settings (
  id boolean primary key default true check (id),
  require_staff_mfa boolean not null default false,
  staff_session_hours integer not null default 12 check (staff_session_hours between 1 and 168),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.security_settings (id) values (true) on conflict do nothing;
create trigger security_settings_set_updated_at before update on public.security_settings
  for each row execute function public.set_updated_at();

-- Role of the calling user, or NULL. When staff MFA is required the session
-- must carry an aal2 (multi-factor) assurance level, enforced here so that RLS
-- and every privileged function inherit the rule.
create or replace function public.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select s.role
  from public.staff_members s
  where s.user_id = (select auth.uid())
    and s.is_active
    and (
      not coalesce((select ss.require_staff_mfa from public.security_settings ss where ss.id), false)
      or coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
    );
$$;

create or replace function public.staff_has_role(p_roles public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_staff_role() = any (p_roles), false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_staff_role() is not null;
$$;

-- Same signature as the legacy helper so existing storage policies keep working.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_staff_role() in ('owner', 'admin'), false);
$$;

create or replace function public.is_catalog_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_staff_role() in ('owner', 'admin', 'editor'), false);
$$;

create or replace function public.is_order_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_staff_role() in ('owner', 'admin', 'support'), false);
$$;

create or replace function public.require_role(p_roles public.staff_role[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.staff_has_role(p_roles) then
    raise exception 'You do not have permission to perform this action.'
      using errcode = '42501', hint = 'forbidden';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Profile lifecycle
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only harmless data is copied from user-controlled metadata: the display
  -- name and the shopper's own marketing consent. Never roles or flags.
  insert into public.profiles (id, email, full_name, marketing_opt_in)
  values (
    new.id,
    new.email,
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), ''),
    coalesce(new.raw_user_meta_data ->> 'marketing_opt_in', '') = 'true'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_auth_user_email_change();

insert into public.profiles (id, email)
select u.id, u.email from auth.users u
on conflict (id) do nothing;

-- Customers may edit their own profile, but never their blocked status.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) in ('anon', 'authenticated') and not public.is_order_staff() then
    if new.is_blocked is distinct from old.is_blocked
       or new.blocked_reason is distinct from old.blocked_reason
       or new.email is distinct from old.email
       or new.id is distinct from old.id then
      raise exception 'Not allowed to change these profile fields.' using errcode = '42501';
    end if;
  end if;
  if new.marketing_opt_in and not old.marketing_opt_in then
    new.marketing_opt_in_at := now();
  elsif not new.marketing_opt_in then
    new.marketing_opt_in_at := null;
  end if;
  return new;
end $$;
create trigger profiles_protect_columns before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text not null check (char_length(action) between 2 and 80),
  entity_type text not null check (char_length(entity_type) between 2 and 60),
  entity_id text,
  summary text check (summary is null or char_length(summary) <= 500),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
comment on table public.audit_logs is 'Append-only record of sensitive actions. No role may update or delete rows.';
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

create or replace function public.write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_summary text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' and not public.is_staff() then
    raise exception 'Only staff can write audit entries.' using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, summary, details)
  values (
    (select auth.uid()),
    (select auth.jwt()) ->> 'email',
    coalesce(public.current_staff_role()::text, (select auth.role())),
    p_action,
    p_entity_type,
    p_entity_id,
    left(p_summary, 500),
    coalesce(p_details, '{}'::jsonb)
  );
end $$;

-- Row-change auditing for configuration and catalogue tables. Records which
-- columns changed (not their values) to keep personal data out of the log.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_changed text[];
  v_label text;
begin
  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into v_changed
    from jsonb_each(to_jsonb(new)) n
    where n.key not in ('updated_at', 'search_vector', 'rating_avg', 'rating_count', 'units_sold')
      and n.value is distinct from (to_jsonb(old) -> n.key);
    if v_changed is null then
      return new;
    end if;
  end if;
  v_label := coalesce(v_row ->> 'name', v_row ->> 'title', v_row ->> 'code', v_row ->> 'label', v_row ->> 'slug', v_row ->> 'heading');
  insert into public.audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, summary, details)
  values (
    (select auth.uid()),
    (select auth.jwt()) ->> 'email',
    coalesce(public.current_staff_role()::text, (select auth.role()), 'system'),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id', v_row ->> 'code'),
    v_label,
    case when v_changed is null then '{}'::jsonb else jsonb_build_object('changed', to_jsonb(v_changed)) end
  );
  return coalesce(new, old);
end $$;

create trigger staff_members_audit after insert or update or delete on public.staff_members
  for each row execute function public.audit_row_change();
create trigger security_settings_audit after update on public.security_settings
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window, shared across serverless instances)
-- ---------------------------------------------------------------------------
create unlogged table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

create or replace function public.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits (bucket, window_start, hits)
  values (left(p_bucket, 200), v_window, 1)
  on conflict (bucket, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup of old windows.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.staff_members enable row level security;
alter table public.security_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limits enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.is_order_staff());
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_order_staff())
  with check (id = (select auth.uid()) or public.is_order_staff());

create policy staff_select on public.staff_members
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

create policy security_settings_select on public.security_settings
  for select to authenticated using (public.is_staff());
create policy security_settings_update on public.security_settings
  for update to authenticated using (public.staff_has_role('{owner}')) with check (public.staff_has_role('{owner}'));

create policy audit_logs_select on public.audit_logs
  for select to authenticated using (public.is_admin());

-- Defence in depth on top of RLS.
revoke all on public.audit_logs, public.rate_limits from anon, authenticated;
grant select on public.audit_logs to authenticated;
revoke insert, update, delete, truncate on public.staff_members from anon, authenticated;
grant select on public.staff_members to authenticated;
revoke all on public.security_settings from anon;
revoke insert, delete, truncate on public.security_settings from authenticated;
revoke all on public.profiles from anon;
revoke insert, delete, truncate on public.profiles from authenticated;

revoke execute on function public.write_audit(text, text, text, text, jsonb) from public, anon;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.handle_auth_user_email_change() from public, anon, authenticated;
revoke execute on function public.protect_profile_columns() from public, anon, authenticated;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
revoke execute on function public.require_role(public.staff_role[]) from public, anon;
