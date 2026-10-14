-- -----------------------------------------------------------------------------
-- Catalogue: media library, brands, categories, size guides, products,
-- colours, size/colour variants with stock, product media, collections.
-- -----------------------------------------------------------------------------

create type public.media_kind as enum ('image', 'video', 'model');
create type public.product_status as enum ('draft', 'published', 'archived');
create type public.gender_target as enum ('men', 'women', 'kids', 'unisex');
create type public.color_family as enum (
  'black', 'white', 'grey', 'beige', 'brown', 'blue', 'green', 'red', 'pink', 'purple', 'yellow', 'orange', 'multi'
);

-- ---------------------------------------------------------------------------
-- Media library
-- ---------------------------------------------------------------------------
create table public.media_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  parent_id uuid references public.media_folders (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique nulls not distinct (parent_id, name)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  kind public.media_kind not null,
  bucket text not null default 'catalog-media',
  storage_path text check (storage_path is null or (storage_path !~ '\.\.' and storage_path ~ '^[A-Za-z0-9/_.-]{3,300}$')),
  external_url text check (external_url is null or external_url ~ '^/[A-Za-z0-9/_.-]+$' or external_url ~* '^https://[^\s<>"]+$'),
  label text not null default '' check (char_length(label) <= 160),
  alt_text text not null default '' check (char_length(alt_text) <= 300),
  mime_type text not null check (mime_type ~ '^(image|video|model)/[A-Za-z0-9.+-]+$'),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_seconds numeric(8, 2) check (duration_seconds is null or duration_seconds >= 0),
  poster_asset_id uuid references public.media_assets (id) on delete set null,
  folder_id uuid references public.media_folders (id) on delete set null,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_one_source check ((storage_path is not null) <> (external_url is not null)),
  constraint media_assets_kind_mime check (split_part(mime_type, '/', 1) = kind::text),
  unique (bucket, storage_path)
);
comment on column public.media_assets.external_url is 'Root-relative path for bundled assets (e.g. seed renders in /public) or an https URL.';
create index media_assets_created_idx on public.media_assets (created_at desc);
create index media_assets_folder_idx on public.media_assets (folder_id);
create index media_assets_kind_idx on public.media_assets (kind);
create index media_assets_poster_idx on public.media_assets (poster_asset_id);
create index media_assets_label_trgm on public.media_assets using gin (label extensions.gin_trgm_ops);
create trigger media_assets_set_updated_at before update on public.media_assets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Size guides
-- ---------------------------------------------------------------------------
create table public.size_guides (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  intro text not null default '' check (char_length(intro) <= 1000),
  notes text not null default '' check (char_length(notes) <= 2000),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index size_guides_single_default on public.size_guides (is_default) where is_default;
create trigger size_guides_set_updated_at before update on public.size_guides
  for each row execute function public.set_updated_at();

create table public.size_guide_rows (
  id uuid primary key default gen_random_uuid(),
  size_guide_id uuid not null references public.size_guides (id) on delete cascade,
  uk text not null check (char_length(uk) between 1 and 10),
  us text not null default '' check (char_length(us) <= 10),
  eu text not null default '' check (char_length(eu) <= 10),
  foot_length_cm numeric(4, 1) check (foot_length_cm is null or foot_length_cm between 5 and 40),
  sort_order integer not null default 0
);
create index size_guide_rows_guide_idx on public.size_guide_rows (size_guide_id, sort_order);

-- ---------------------------------------------------------------------------
-- Brands & categories
-- ---------------------------------------------------------------------------
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 80),
  slug text not null unique check (public.is_slug(slug)),
  description text not null default '' check (char_length(description) <= 1000),
  logo_asset_id uuid references public.media_assets (id) on delete set null,
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index brands_logo_idx on public.brands (logo_asset_id);
create trigger brands_set_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (public.is_slug(slug)),
  description text not null default '' check (char_length(description) <= 2000),
  image_asset_id uuid references public.media_assets (id) on delete set null,
  size_guide_id uuid references public.size_guides (id) on delete set null,
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  seo_title text check (seo_title is null or char_length(seo_title) <= 70),
  seo_description text check (seo_description is null or char_length(seo_description) <= 170),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create index categories_parent_idx on public.categories (parent_id);
create index categories_image_idx on public.categories (image_asset_id);
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 140),
  slug text not null unique check (public.is_slug(slug)),
  sku text not null unique check (sku ~ '^[A-Z0-9][A-Z0-9-]{1,39}$'),
  brand_id uuid references public.brands (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  gender public.gender_target not null default 'unisex',
  short_description text not null default '' check (char_length(short_description) <= 300),
  description text not null default '' check (char_length(description) <= 8000),
  price integer not null check (price > 0 and price <= 10000000),
  sale_price integer check (sale_price is null or (sale_price > 0 and sale_price < price)),
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  currency char(3) not null default 'INR' check (currency = 'INR'),
  status public.product_status not null default 'draft',
  published_at timestamptz,
  is_featured boolean not null default false,
  is_new_arrival boolean not null default false,
  is_bestseller boolean not null default false,
  is_trending boolean not null default false,
  tags text[] not null default '{}' check (cardinality(tags) <= 30),
  model_asset_id uuid references public.media_assets (id) on delete set null,
  size_guide_id uuid references public.size_guides (id) on delete set null,
  seo_title text check (seo_title is null or char_length(seo_title) <= 70),
  seo_description text check (seo_description is null or char_length(seo_description) <= 170),
  og_image_asset_id uuid references public.media_assets (id) on delete set null,
  low_stock_threshold integer check (low_stock_threshold is null or low_stock_threshold >= 0),
  units_sold integer not null default 0 check (units_sold >= 0),
  rating_avg numeric(3, 2) not null default 0,
  rating_count integer not null default 0,
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(sku, '')), 'A')
    || setweight(to_tsvector('simple', public.text_array_to_string(tags)), 'B')
    || setweight(to_tsvector('simple', coalesce(short_description, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_sale_window check (sale_ends_at is null or sale_starts_at is null or sale_ends_at > sale_starts_at)
);
comment on column public.products.price is 'Regular selling price (MRP) in minor units.';
comment on column public.products.sale_price is 'Optional discounted price in minor units; active inside the optional sale window.';
create index products_status_published_idx on public.products (status, published_at desc);
create index products_category_idx on public.products (category_id);
create index products_brand_idx on public.products (brand_id);
create index products_flags_idx on public.products (status, is_featured, is_new_arrival, is_bestseller, is_trending);
create index products_units_sold_idx on public.products (units_sold desc);
create index products_search_idx on public.products using gin (search_vector);
create index products_tags_idx on public.products using gin (tags);
create index products_name_trgm on public.products using gin (name extensions.gin_trgm_ops);
create index products_sku_trgm on public.products using gin (sku extensions.gin_trgm_ops);
create index products_model_idx on public.products (model_asset_id);
create index products_og_idx on public.products (og_image_asset_id);
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- Cost price is restricted to owners/admins, so it lives in its own table.
create table public.product_costs (
  product_id uuid primary key references public.products (id) on delete cascade,
  cost_price integer not null check (cost_price >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create trigger product_costs_set_updated_at before update on public.product_costs
  for each row execute function public.set_updated_at();

create table public.product_colors (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  hex text not null check (public.is_hex_color(hex)),
  family public.color_family not null default 'multi',
  sort_order integer not null default 0,
  unique (product_id, name)
);
create index product_colors_product_idx on public.product_colors (product_id, sort_order);
create index product_colors_family_idx on public.product_colors (family);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  color_id uuid references public.product_colors (id) on delete cascade,
  size_label text not null check (char_length(trim(size_label)) between 1 and 20),
  size_sort numeric(6, 2) not null default 0,
  sku text not null unique check (sku ~ '^[A-Z0-9][A-Z0-9-]{1,59}$'),
  stock_on_hand integer not null default 0 check (stock_on_hand >= 0),
  stock_reserved integer not null default 0 check (stock_reserved >= 0),
  available integer generated always as (stock_on_hand - stock_reserved) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_reserved_within_on_hand check (stock_reserved <= stock_on_hand),
  unique nulls not distinct (product_id, color_id, size_label)
);
comment on column public.product_variants.stock_reserved is 'Units held by unpaid orders awaiting payment or verification.';
create index product_variants_product_idx on public.product_variants (product_id, size_sort);
create index product_variants_color_idx on public.product_variants (color_id);
create index product_variants_size_idx on public.product_variants (size_label) where is_active;
create trigger product_variants_set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  asset_id uuid not null references public.media_assets (id) on delete cascade,
  color_id uuid references public.product_colors (id) on delete set null,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  alt_text text check (alt_text is null or char_length(alt_text) <= 300),
  created_at timestamptz not null default now(),
  unique (product_id, asset_id)
);
create unique index product_media_single_cover on public.product_media (product_id) where is_cover;
create index product_media_product_idx on public.product_media (product_id, sort_order);
create index product_media_asset_idx on public.product_media (asset_id);

create table public.product_attributes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 60),
  value text not null check (char_length(trim(value)) between 1 and 300),
  sort_order integer not null default 0
);
create index product_attributes_product_idx on public.product_attributes (product_id, sort_order);

-- Old slugs keep working: the storefront redirects them to the current slug.
create table public.product_slug_history (
  slug text primary key check (public.is_slug(slug)),
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index product_slug_history_product_idx on public.product_slug_history (product_id);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (public.is_slug(slug)),
  description text not null default '' check (char_length(description) <= 2000),
  image_asset_id uuid references public.media_assets (id) on delete set null,
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  seo_title text check (seo_title is null or char_length(seo_title) <= 70),
  seo_description text check (seo_description is null or char_length(seo_description) <= 170),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index collections_image_idx on public.collections (image_asset_id);
create trigger collections_set_updated_at before update on public.collections
  for each row execute function public.set_updated_at();

create table public.collection_products (
  collection_id uuid not null references public.collections (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (collection_id, product_id)
);
create index collection_products_product_idx on public.collection_products (product_id);

-- ---------------------------------------------------------------------------
-- Catalogue triggers
-- ---------------------------------------------------------------------------
create or replace function public.track_product_slug_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    insert into public.product_slug_history (slug, product_id)
    values (old.slug, old.id)
    on conflict (slug) do update set product_id = excluded.product_id, created_at = now();
  end if;
  -- A live product owns its slug outright; drop any redirect claiming it.
  delete from public.product_slug_history where slug = new.slug;
  return new;
end $$;
create trigger products_track_slug after update of slug on public.products
  for each row execute function public.track_product_slug_change();

create or replace function public.product_slug_redirect_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.product_slug_history where slug = new.slug;
  return new;
end $$;
create trigger products_slug_guard_insert after insert on public.products
  for each row execute function public.product_slug_redirect_guard();

create or replace function public.stamp_product_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end $$;
create trigger products_stamp_published before insert or update of status on public.products
  for each row execute function public.stamp_product_published_at();

-- A published product must be shoppable: an image and at least one active
-- variant. Deferred so that multi-statement saves can add media/variants first.
create or replace function public.assert_product_publishable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.product_status;
begin
  select status into v_status from public.products where id = new.id;
  if v_status is distinct from 'published' then
    return null;
  end if;
  if not exists (
    select 1 from public.product_media pm
    join public.media_assets m on m.id = pm.asset_id
    where pm.product_id = new.id and m.kind = 'image'
  ) then
    raise exception 'Add at least one product image before publishing.' using errcode = '23514', hint = 'publish_requires_image';
  end if;
  if not exists (select 1 from public.product_variants v where v.product_id = new.id and v.is_active) then
    raise exception 'Add at least one active size before publishing.' using errcode = '23514', hint = 'publish_requires_variant';
  end if;
  return null;
end $$;
create constraint trigger products_publishable_insert
  after insert on public.products
  deferrable initially deferred
  for each row when (new.status = 'published')
  execute function public.assert_product_publishable();
-- Only on the transition into `published`, so unrelated updates (e.g. sales
-- counters during payment approval) can never fail on catalogue state.
create constraint trigger products_publishable_update
  after update on public.products
  deferrable initially deferred
  for each row when (new.status = 'published' and old.status is distinct from 'published')
  execute function public.assert_product_publishable();

-- Effective price (sale price only inside its window).
create or replace function public.effective_price(p_price integer, p_sale_price integer, p_sale_starts timestamptz, p_sale_ends timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when p_sale_price is not null
     and (p_sale_starts is null or p_sale_starts <= now())
     and (p_sale_ends is null or p_sale_ends > now())
    then p_sale_price
    else p_price
  end;
$$;

-- Whether a media asset is referenced by something publicly visible. Unreleased
-- uploads stay invisible to anonymous Data API reads.
create or replace function public.media_asset_is_public(p_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.product_media pm
           join public.products p on p.id = pm.product_id
           where pm.asset_id = p_asset_id and p.status = 'published')
      or exists (
           select 1 from public.products p
           where p.status = 'published' and (p.model_asset_id = p_asset_id or p.og_image_asset_id = p_asset_id))
      or exists (select 1 from public.categories c where c.is_visible and c.image_asset_id = p_asset_id)
      or exists (select 1 from public.collections c where c.is_visible and c.image_asset_id = p_asset_id)
      or exists (select 1 from public.brands b where b.is_visible and b.logo_asset_id = p_asset_id)
      or exists (
           select 1 from public.media_assets v
           join public.product_media pm on pm.asset_id = v.id
           join public.products p on p.id = pm.product_id
           where v.poster_asset_id = p_asset_id and p.status = 'published');
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.media_folders enable row level security;
alter table public.media_assets enable row level security;
alter table public.size_guides enable row level security;
alter table public.size_guide_rows enable row level security;
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_costs enable row level security;
alter table public.product_colors enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_media enable row level security;
alter table public.product_attributes enable row level security;
alter table public.product_slug_history enable row level security;
alter table public.collections enable row level security;
alter table public.collection_products enable row level security;

-- Staff read everything in the catalogue; catalogue staff write.
create policy media_folders_staff_all on public.media_folders for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());
create policy media_folders_staff_read on public.media_folders for select to authenticated using (public.is_staff());

create policy media_assets_public_read on public.media_assets for select to anon, authenticated
  using (public.media_asset_is_public(id) or public.is_staff());
create policy media_assets_staff_write on public.media_assets for insert to authenticated with check (public.is_catalog_staff());
create policy media_assets_staff_update on public.media_assets for update to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());
create policy media_assets_staff_delete on public.media_assets for delete to authenticated using (public.is_catalog_staff());

create policy size_guides_public_read on public.size_guides for select to anon, authenticated using (true);
create policy size_guides_staff_write on public.size_guides for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());
create policy size_guide_rows_public_read on public.size_guide_rows for select to anon, authenticated using (true);
create policy size_guide_rows_staff_write on public.size_guide_rows for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());

create policy brands_public_read on public.brands for select to anon, authenticated using (is_visible or public.is_staff());
create policy brands_staff_write on public.brands for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());

create policy categories_public_read on public.categories for select to anon, authenticated using (is_visible or public.is_staff());
create policy categories_staff_write on public.categories for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());

create policy products_public_read on public.products for select to anon, authenticated
  using (status = 'published' or public.is_staff());
create policy products_staff_write on public.products for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());

create policy product_costs_admin on public.product_costs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy product_colors_public_read on public.product_colors for select to anon, authenticated
  using (public.is_staff() or exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
create policy product_colors_staff_write on public.product_colors for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());

create policy product_variants_public_read on public.product_variants for select to anon, authenticated
  using (public.is_staff() or (is_active and exists (select 1 from public.products p where p.id = product_id and p.status = 'published')));
create policy product_variants_staff_write on public.product_variants for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());

create policy product_media_public_read on public.product_media for select to anon, authenticated
  using (public.is_staff() or exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
create policy product_media_staff_write on public.product_media for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());

create policy product_attributes_public_read on public.product_attributes for select to anon, authenticated
  using (public.is_staff() or exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
create policy product_attributes_staff_write on public.product_attributes for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());

create policy product_slug_history_public_read on public.product_slug_history for select to anon, authenticated using (true);

create policy collections_public_read on public.collections for select to anon, authenticated using (is_visible or public.is_staff());
create policy collections_staff_write on public.collections for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());
create policy collection_products_public_read on public.collection_products for select to anon, authenticated
  using (public.is_staff() or exists (
    select 1 from public.collections c join public.products p on p.id = product_id
    where c.id = collection_id and c.is_visible and p.status = 'published'));
create policy collection_products_staff_write on public.collection_products for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());

-- Stock columns may only change through inventory functions (see commerce migration).
revoke insert, update, delete, truncate on public.product_slug_history from anon, authenticated;
revoke insert, update, delete, truncate on all tables in schema public from anon;
revoke all on public.product_costs from anon;

revoke execute on function public.track_product_slug_change() from public, anon, authenticated;
revoke execute on function public.product_slug_redirect_guard() from public, anon, authenticated;
revoke execute on function public.assert_product_publishable() from public, anon, authenticated;
revoke execute on function public.stamp_product_published_at() from public, anon, authenticated;

-- Audit catalogue configuration changes.
create trigger products_audit after insert or update or delete on public.products
  for each row execute function public.audit_row_change();
create trigger product_costs_audit after insert or update or delete on public.product_costs
  for each row execute function public.audit_row_change();
create trigger categories_audit after insert or update or delete on public.categories
  for each row execute function public.audit_row_change();
create trigger collections_audit after insert or update or delete on public.collections
  for each row execute function public.audit_row_change();
create trigger brands_audit after insert or update or delete on public.brands
  for each row execute function public.audit_row_change();
create trigger media_assets_audit after delete on public.media_assets
  for each row execute function public.audit_row_change();
create trigger size_guides_audit after insert or update or delete on public.size_guides
  for each row execute function public.audit_row_change();
