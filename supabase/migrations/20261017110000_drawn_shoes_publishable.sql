-- Shoes in the original Save The Money catalogue have no photos: the store
-- draws them (src/components/store/shoe-art.tsx) from the shoe type tag and
-- colourways. Such products may be published without an image; every other
-- product still needs at least one photo.

create or replace function public.assert_product_publishable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
begin
  select status, name, tags into v_product from public.products where id = new.id;
  if v_product.status is distinct from 'published' then
    return null;
  end if;
  if not exists (
    select 1 from public.product_media pm
    join public.media_assets m on m.id = pm.asset_id
    where pm.product_id = new.id and m.kind = 'image'
  ) and not (
    coalesce(v_product.tags, '{}') && array['runner', 'court', 'high', 'formal', 'loafer', 'slide', 'boot']
    and exists (select 1 from public.product_colors c where c.product_id = new.id)
  ) then
    raise exception 'Add at least one image to "%" before publishing.', v_product.name
      using errcode = '23514', hint = 'publish_requires_image';
  end if;
  if not exists (select 1 from public.product_variants v where v.product_id = new.id and v.is_active) then
    raise exception 'Add at least one active variant (size or option) to "%" before publishing.', v_product.name
      using errcode = '23514', hint = 'publish_requires_variant';
  end if;
  return null;
end $$;

revoke execute on function public.assert_product_publishable() from public, anon, authenticated;
