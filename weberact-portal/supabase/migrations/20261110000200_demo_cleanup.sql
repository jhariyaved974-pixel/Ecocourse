-- Removes demo data (rows created by scripts/seed-demo.mjs, marked is_demo) in one call. Issued
-- invoices are normally never deleted; this is the single, narrow exception, for demo rows only,
-- and only the server's secret key can run it.
create or replace function public.invoice_before_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' and not (old.is_demo and current_setting('weberact.demo_cleanup', true) = 'on') then
    raise exception 'Only draft invoices can be deleted. Void an issued invoice instead.';
  end if;
  return old;
end $$;

create or replace function public.delete_demo_data() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'Not allowed'; end if;
  perform set_config('weberact.demo_cleanup', 'on', true);
  delete from public.payments where organization_id in (select id from public.organizations where is_demo);
  delete from public.invoices where organization_id in (select id from public.organizations where is_demo);
  delete from public.organizations where is_demo;
  get diagnostics n = row_count;
  delete from public.team_members where email like '%@weberact.test';
  perform set_config('weberact.demo_cleanup', 'off', true);
  return n;
end $$;
revoke all on function public.delete_demo_data() from public, anon, authenticated;
grant execute on function public.delete_demo_data() to service_role;
