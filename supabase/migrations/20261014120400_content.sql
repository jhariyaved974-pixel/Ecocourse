-- -----------------------------------------------------------------------------
-- Content management: store settings, homepage sections (draft/published with
-- revision history), announcements, navigation, policy pages and FAQs.
-- All content is plain text or Markdown rendered without raw HTML; links are
-- validated with is_safe_href(), so no executable content can be stored.
-- -----------------------------------------------------------------------------

create type public.content_version as enum ('draft', 'published');
create type public.section_type as enum (
  'hero', 'product_rail', 'category_grid', 'promo_banner', 'editorial_story',
  'usp_strip', 'testimonials', 'newsletter', 'collection_spotlight', 'discount_banner'
);

create table public.store_settings (
  id boolean primary key default true check (id),
  store_name text not null default 'Save The Money' check (char_length(trim(store_name)) between 1 and 60),
  legal_name text check (legal_name is null or char_length(legal_name) <= 120),
  tagline text not null default 'Everything you need, for less.' check (char_length(tagline) <= 160),
  logo_asset_id uuid references public.media_assets (id) on delete set null,
  favicon_asset_id uuid references public.media_assets (id) on delete set null,
  support_email text check (support_email is null or support_email ~* '^[^\s@]+@[^\s@]+\.[a-z]{2,}$'),
  support_phone text check (support_phone is null or support_phone ~ '^\+?[0-9][0-9 -]{6,18}$'),
  whatsapp_number text check (whatsapp_number is null or whatsapp_number ~ '^\+?[0-9]{8,15}$'),
  address text check (address is null or char_length(address) <= 500),
  currency char(3) not null default 'INR' check (currency = 'INR'),
  locale text not null default 'en-IN' check (locale in ('en-IN')),
  timezone text not null default 'Asia/Kolkata' check (char_length(timezone) between 3 and 60),
  theme_preset text not null default 'noir' check (theme_preset in ('noir', 'bone', 'ember', 'forest')),
  accent_color text not null default '#15803D' check (public.is_hex_color(accent_color)),
  font_preset text not null default 'editorial' check (font_preset in ('editorial', 'modern', 'classic')),
  seo_title text not null default 'Save The Money — Everyday products at honest prices' check (char_length(seo_title) <= 70),
  seo_title_template text not null default '%s · Save The Money' check (seo_title_template like '%\%s%' and char_length(seo_title_template) <= 70),
  seo_description text not null default 'Shop electronics, fashion, footwear, home & kitchen, beauty, sports, toys and stationery at honest prices. Pay securely by UPI. Delivery across India.'
    check (char_length(seo_description) <= 170),
  og_image_asset_id uuid references public.media_assets (id) on delete set null,
  instagram_url text check (instagram_url is null or instagram_url ~* '^https://[^\s<>"]+$'),
  facebook_url text check (facebook_url is null or facebook_url ~* '^https://[^\s<>"]+$'),
  x_url text check (x_url is null or x_url ~* '^https://[^\s<>"]+$'),
  youtube_url text check (youtube_url is null or youtube_url ~* '^https://[^\s<>"]+$'),
  pinterest_url text check (pinterest_url is null or pinterest_url ~* '^https://[^\s<>"]+$'),
  footer_about text not null default 'Everyday products across electronics, fashion, footwear, home, beauty and more, at honest prices. Every UPI payment is verified by our team before dispatch.' check (char_length(footer_about) <= 400),
  footer_note text not null default 'All prices are in INR and include applicable taxes.' check (char_length(footer_note) <= 200),
  maintenance_mode boolean not null default false,
  maintenance_message text not null default 'We are refreshing the store and will be back shortly.' check (char_length(maintenance_message) <= 300),
  analytics_provider text not null default 'none' check (analytics_provider in ('none', 'plausible', 'ga4')),
  analytics_id text check (analytics_id is null or analytics_id ~ '^[A-Za-z0-9._-]{3,80}$'),
  low_stock_threshold integer not null default 5 check (low_stock_threshold between 0 and 1000),
  order_number_prefix text not null default 'STM' check (order_number_prefix ~ '^[A-Z]{2,4}$'),
  free_returns_days integer not null default 7 check (free_returns_days between 0 and 90),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.store_settings (id) values (true) on conflict do nothing;
create trigger store_settings_set_updated_at before update on public.store_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Homepage
-- ---------------------------------------------------------------------------
create table public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  version public.content_version not null default 'draft',
  section_key uuid not null default gen_random_uuid(),
  type public.section_type not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  eyebrow text check (eyebrow is null or char_length(eyebrow) <= 80),
  heading text check (heading is null or char_length(heading) <= 160),
  subheading text check (subheading is null or char_length(subheading) <= 400),
  body text check (body is null or char_length(body) <= 2000),
  cta_label text check (cta_label is null or char_length(cta_label) <= 40),
  cta_href text check (public.is_safe_href(cta_href)),
  secondary_cta_label text check (secondary_cta_label is null or char_length(secondary_cta_label) <= 40),
  secondary_cta_href text check (public.is_safe_href(secondary_cta_href)),
  image_asset_id uuid references public.media_assets (id) on delete set null,
  mobile_image_asset_id uuid references public.media_assets (id) on delete set null,
  video_asset_id uuid references public.media_assets (id) on delete set null,
  model_asset_id uuid references public.media_assets (id) on delete set null,
  product_source text check (product_source is null or product_source in (
    'featured', 'new_arrivals', 'bestsellers', 'trending', 'on_sale', 'collection', 'category', 'manual')),
  collection_id uuid references public.collections (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  product_limit integer not null default 8 check (product_limit between 1 and 24),
  theme text not null default 'light' check (theme in ('light', 'dark', 'accent', 'muted')),
  layout text not null default 'default' check (layout in ('default', 'split', 'centered', 'wide', 'carousel', 'grid')),
  show_3d boolean not null default true,
  coupon_code text check (coupon_code is null or coupon_code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (version, section_key)
);
create index homepage_sections_version_idx on public.homepage_sections (version, sort_order);
create index homepage_sections_assets_idx on public.homepage_sections (image_asset_id, mobile_image_asset_id, video_asset_id, model_asset_id);
create trigger homepage_sections_set_updated_at before update on public.homepage_sections
  for each row execute function public.set_updated_at();

create table public.homepage_section_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.homepage_sections (id) on delete cascade,
  sort_order integer not null default 0,
  title text check (title is null or char_length(title) <= 120),
  body text check (body is null or char_length(body) <= 400),
  href text check (public.is_safe_href(href)),
  image_asset_id uuid references public.media_assets (id) on delete set null,
  icon text check (icon is null or icon in (
    'truck', 'refresh', 'shield', 'sparkles', 'ruler', 'leaf', 'award', 'heart', 'clock', 'badge-check', 'package', 'star')),
  product_id uuid references public.products (id) on delete cascade
);
create index homepage_section_items_section_idx on public.homepage_section_items (section_id, sort_order);
create index homepage_section_items_image_idx on public.homepage_section_items (image_asset_id);

create table public.content_revisions (
  id bigint generated always as identity primary key,
  content_type text not null check (content_type in ('homepage', 'page')),
  content_id text not null,
  snapshot jsonb not null,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.content_revisions is 'Point-in-time snapshots taken on every publish; used for undo/restore.';
create index content_revisions_lookup_idx on public.content_revisions (content_type, content_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Announcements, navigation, pages, FAQ
-- ---------------------------------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(trim(message)) between 2 and 160),
  href text check (public.is_safe_href(href)),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create trigger announcements_set_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

create table public.navigation_links (
  id uuid primary key default gen_random_uuid(),
  menu text not null check (menu in ('header', 'footer')),
  group_title text check (group_title is null or char_length(group_title) <= 40),
  label text not null check (char_length(trim(label)) between 1 and 40),
  href text not null check (href <> '' and public.is_safe_href(href)),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  highlight boolean not null default false,
  open_in_new_tab boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index navigation_links_menu_idx on public.navigation_links (menu, sort_order);
create trigger navigation_links_set_updated_at before update on public.navigation_links
  for each row execute function public.set_updated_at();

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (public.is_slug(slug)),
  title text not null check (char_length(trim(title)) between 2 and 120),
  body_markdown text not null default '' check (char_length(body_markdown) <= 60000),
  draft_title text check (draft_title is null or char_length(trim(draft_title)) between 2 and 120),
  draft_body_markdown text check (draft_body_markdown is null or char_length(draft_body_markdown) <= 60000),
  is_published boolean not null default false,
  published_at timestamptz,
  show_in_footer boolean not null default true,
  seo_title text check (seo_title is null or char_length(seo_title) <= 70),
  seo_description text check (seo_description is null or char_length(seo_description) <= 170),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.pages.draft_body_markdown is 'Unpublished edits. Publishing copies draft_* into the live columns.';
create trigger pages_set_updated_at before update on public.pages
  for each row execute function public.set_updated_at();

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(trim(question)) between 5 and 200),
  answer text not null check (char_length(trim(answer)) between 2 and 2000),
  group_name text not null default 'General' check (char_length(group_name) between 1 and 40),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger faqs_set_updated_at before update on public.faqs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Media visibility now also covers content references.
-- ---------------------------------------------------------------------------
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
           select 1 from public.homepage_sections s
           where s.version = 'published'
             and p_asset_id in (s.image_asset_id, s.mobile_image_asset_id, s.video_asset_id, s.model_asset_id))
      or exists (
           select 1 from public.homepage_section_items i
           join public.homepage_sections s on s.id = i.section_id
           where s.version = 'published' and i.image_asset_id = p_asset_id)
      or exists (
           select 1 from public.store_settings st
           where p_asset_id in (st.logo_asset_id, st.favicon_asset_id, st.og_image_asset_id))
      or exists (
           select 1 from public.media_assets v
           join public.product_media pm on pm.asset_id = v.id
           join public.products p on p.id = pm.product_id
           where v.poster_asset_id = p_asset_id and p.status = 'published')
      or exists (
           select 1 from public.media_assets v
           join public.homepage_sections s on s.video_asset_id = v.id
           where v.poster_asset_id = p_asset_id and s.version = 'published');
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.store_settings enable row level security;
alter table public.homepage_sections enable row level security;
alter table public.homepage_section_items enable row level security;
alter table public.content_revisions enable row level security;
alter table public.announcements enable row level security;
alter table public.navigation_links enable row level security;
alter table public.pages enable row level security;
alter table public.faqs enable row level security;

create policy store_settings_public_read on public.store_settings for select to anon, authenticated using (true);
create policy store_settings_admin_update on public.store_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy homepage_sections_public_read on public.homepage_sections for select to anon, authenticated
  using ((version = 'published' and is_visible) or public.is_staff());
create policy homepage_sections_staff_write on public.homepage_sections for all to authenticated
  using (public.is_catalog_staff() and version = 'draft') with check (public.is_catalog_staff() and version = 'draft');

create policy homepage_section_items_public_read on public.homepage_section_items for select to anon, authenticated
  using (public.is_staff() or exists (
    select 1 from public.homepage_sections s where s.id = section_id and s.version = 'published' and s.is_visible));
create policy homepage_section_items_staff_write on public.homepage_section_items for all to authenticated
  using (public.is_catalog_staff() and exists (
    select 1 from public.homepage_sections s where s.id = section_id and s.version = 'draft'))
  with check (public.is_catalog_staff() and exists (
    select 1 from public.homepage_sections s where s.id = section_id and s.version = 'draft'));

create policy content_revisions_staff_read on public.content_revisions for select to authenticated using (public.is_catalog_staff());

create policy announcements_public_read on public.announcements for select to anon, authenticated
  using ((is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) or public.is_staff());
create policy announcements_staff_write on public.announcements for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());

create policy navigation_links_public_read on public.navigation_links for select to anon, authenticated
  using (is_visible or public.is_staff());
create policy navigation_links_staff_write on public.navigation_links for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());

create policy pages_public_read on public.pages for select to anon, authenticated using (is_published or public.is_staff());
create policy pages_staff_write on public.pages for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());

create policy faqs_public_read on public.faqs for select to anon, authenticated using (is_visible or public.is_staff());
create policy faqs_staff_write on public.faqs for all to authenticated
  using (public.is_catalog_staff()) with check (public.is_catalog_staff());

revoke insert, update, delete, truncate on public.content_revisions from anon, authenticated;
revoke insert, delete, truncate on public.store_settings from authenticated;

create trigger store_settings_audit after update on public.store_settings
  for each row execute function public.audit_row_change();
create trigger navigation_links_audit after insert or update or delete on public.navigation_links
  for each row execute function public.audit_row_change();
create trigger pages_audit after insert or update or delete on public.pages
  for each row execute function public.audit_row_change();
create trigger announcements_audit after insert or update or delete on public.announcements
  for each row execute function public.audit_row_change();
