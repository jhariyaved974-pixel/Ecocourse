-- -----------------------------------------------------------------------------
-- Storage buckets and policies, scheduled expiry, final privilege lockdown.
-- -----------------------------------------------------------------------------

-- Public catalogue media (product images, videos, 3D models, site imagery).
-- Uploads go straight from the admin's browser to Storage using signed upload
-- URLs; these policies decide who may create them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-media', 'catalog-media', true, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
        'video/mp4', 'video/webm', 'video/quicktime', 'model/gltf-binary', 'model/gltf+json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Private payment evidence. Written only by the server (service role) after
-- validation; readable only by owners/admins through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "catalog-media: staff can list"
  on storage.objects for select to authenticated
  using (bucket_id = 'catalog-media' and public.is_catalog_staff());

create policy "catalog-media: staff can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'catalog-media'
    and public.is_catalog_staff()
    and (storage.foldername(name))[1] in ('products', 'content', 'brand', 'models', 'library')
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'mp4', 'webm', 'mov', 'glb', 'gltf')
  );

create policy "catalog-media: staff can update"
  on storage.objects for update to authenticated
  using (bucket_id = 'catalog-media' and public.is_catalog_staff())
  with check (bucket_id = 'catalog-media' and public.is_catalog_staff());

create policy "catalog-media: staff can delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'catalog-media' and public.is_catalog_staff());

create policy "payment-proofs: admins can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin());
-- Intentionally no insert/update/delete policies for payment-proofs: customers
-- cannot write there directly and evidence cannot be deleted through the API.

-- ---------------------------------------------------------------------------
-- Scheduled expiry of unpaid orders (in addition to the app's cron endpoint
-- and the opportunistic expiry performed during checkout).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('expire-unpaid-orders', '*/5 * * * *', 'select public.expire_stale_orders_internal(500)');
  else
    raise notice 'pg_cron is not available; rely on the /api/cron/expire-orders endpoint.';
  end if;
exception when others then
  raise notice 'Skipping pg_cron schedule: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Final lockdown: anonymous users can never write through the Data API, and
-- internal helpers are not callable as RPCs.
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on all tables in schema public from anon;
revoke execute on function public.homepage_snapshot(public.content_version) from authenticated;
revoke all on public.rate_limits from authenticated, anon;
