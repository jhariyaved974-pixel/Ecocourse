-- The first-owner bootstrap works only while the store has no active owner.
-- After that, owners are added from Admin → Staff & security. (Recovering a
-- locked-out store is a deliberate manual step in the SQL editor; see
-- docs/ADMIN.md.)
create or replace function public.bootstrap_owner(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if exists (select 1 from public.staff_members where role = 'owner' and is_active) then
    raise exception 'This store already has an owner. Add more staff from Admin → Staff & security.'
      using errcode = 'P0001', hint = 'owner_exists';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No account with email %. Sign up on the store (or create the user in Supabase Auth) first.', p_email
      using errcode = 'P0002', hint = 'user_not_found';
  end if;
  insert into public.staff_members (user_id, role, is_active)
  values (v_user, 'owner', true)
  on conflict (user_id) do update set role = 'owner', is_active = true;
  insert into public.audit_logs (actor_role, action, entity_type, entity_id, summary)
  values ('system', 'staff.bootstrap_owner', 'staff_members', v_user::text, lower(trim(p_email)));
  return v_user;
end $$;
