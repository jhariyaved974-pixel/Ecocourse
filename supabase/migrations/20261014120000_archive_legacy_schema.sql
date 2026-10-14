-- -----------------------------------------------------------------------------
-- Archive the previous single-page-app schema, if present.
--
-- Earlier versions of this Supabase project stored the catalogue in JSON-heavy
-- tables (public.products keyed by a text id with `colors`/`images` JSON
-- columns, public.site_settings key/value JSON, etc.). The new relational schema
-- needs the canonical table names, so those tables are MOVED (never dropped) to
-- the `legacy` schema. Their rows are imported into the new tables by
-- 20261014120900_import_legacy_catalog.sql.
--
-- On a fresh project none of these objects exist and this migration is a no-op.
-- The `legacy` schema is not exposed through the Data API.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  legacy_tables text[] := array['admins', 'site_settings', 'categories', 'products', 'coupons', 'deals', 'subscribers', 'activity_log'];
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'cat'
  ) then
    raise notice 'No legacy catalogue schema found; nothing to archive.';
    return;
  end if;

  create schema if not exists legacy;
  revoke all on schema legacy from public;

  foreach t in array legacy_tables loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('alter table public.%I set schema legacy', t);
      execute format('revoke all on legacy.%I from anon, authenticated', t);
    end if;
  end loop;

  -- Functions that belong to the old app move with their tables and keep working
  -- against the archived copies. public.is_admin() is intentionally NOT moved:
  -- existing storage policies reference it, and it is redefined (same signature)
  -- by the next migration to use the new staff model.
  if to_regprocedure('public.store_snapshot(boolean)') is not null then
    alter function public.store_snapshot(boolean) set schema legacy;
    alter function legacy.store_snapshot(boolean) set search_path = legacy;
    revoke all on function legacy.store_snapshot(boolean) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.get_coupon(text)') is not null then
    alter function public.get_coupon(text) set schema legacy;
    alter function legacy.get_coupon(text) set search_path = legacy;
    revoke all on function legacy.get_coupon(text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.subscribe(text)') is not null then
    alter function public.subscribe(text) set schema legacy;
    alter function legacy.subscribe(text) set search_path = legacy;
    revoke all on function legacy.subscribe(text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.log_change()') is not null then
    alter function public.log_change() set schema legacy;
    alter function legacy.log_change() set search_path = legacy;
  end if;
  if to_regprocedure('public.touch_updated_at()') is not null then
    alter function public.touch_updated_at() set schema legacy;
  end if;
  if to_regprocedure('public.is_owner()') is not null then
    alter function public.is_owner() set schema legacy;
    alter function legacy.is_owner() set search_path = legacy;
    revoke all on function legacy.is_owner() from public, anon, authenticated;
  end if;
end $$;
