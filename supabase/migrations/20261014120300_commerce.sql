-- -----------------------------------------------------------------------------
-- Commerce: payment/shipping/tax settings, coupons, orders, payments, refunds,
-- inventory ledger and reservations, customer data, reviews, email outbox.
-- -----------------------------------------------------------------------------

create type public.order_status as enum (
  'pending_payment', 'payment_review', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'
);
create type public.payment_status as enum (
  'unpaid', 'proof_submitted', 'verification_pending', 'verified_paid', 'rejected', 'refund_pending', 'refunded'
);
create type public.payment_method as enum ('upi_manual', 'razorpay');
create type public.proof_status as enum ('submitted', 'under_review', 'approved', 'rejected', 'resubmission_requested');
create type public.reservation_status as enum ('active', 'consumed', 'released');
create type public.inventory_reason as enum (
  'initial', 'restock', 'adjustment', 'correction', 'damaged', 'sale', 'cancellation', 'return', 'import'
);
create type public.coupon_type as enum ('percentage', 'fixed');
create type public.coupon_scope as enum ('all', 'products', 'categories');
create type public.review_status as enum ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Payment settings (manual UPI + future gateway). Server-side only.
-- ---------------------------------------------------------------------------
create table public.payment_settings (
  id boolean primary key default true check (id),
  upi_enabled boolean not null default true,
  upi_id text not null default 'sadiajay4311@ybl'
    check (upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9.-]{1,63}$'),
  upi_payee_name text not null default '' check (upi_payee_name ~ '^[A-Za-z0-9 .&''-]{0,50}$'),
  upi_show_qr boolean not null default true,
  upi_include_tr boolean not null default false,
  require_payment_proof boolean not null default true,
  customer_instructions text not null default
    'Pay the exact amount shown using any UPI app. Add your order number in the payment note if your app allows it. After paying, upload the payment screenshot and enter the UTR/UPI reference number.'
    check (char_length(customer_instructions) <= 2000),
  review_instructions text not null default
    'Open your bank statement or UPI merchant app and confirm a credit of the exact order amount with the matching UTR before approving. A screenshot alone is never sufficient.'
    check (char_length(review_instructions) <= 2000),
  review_deadline_hours integer not null default 24 check (review_deadline_hours between 1 and 336),
  reservation_minutes integer not null default 60 check (reservation_minutes between 10 and 10080),
  resubmission_hours integer not null default 24 check (resubmission_hours between 1 and 168),
  notify_customer_emails boolean not null default true,
  notify_admin_on_proof boolean not null default true,
  admin_notification_email text check (admin_notification_email is null or admin_notification_email ~* '^[^\s@]+@[^\s@]+\.[a-z]{2,}$'),
  razorpay_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.payment_settings (id) values (true) on conflict do nothing;
create trigger payment_settings_set_updated_at before update on public.payment_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Shipping & tax
-- ---------------------------------------------------------------------------
create table public.shipping_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,30}$'),
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 200),
  fee integer not null check (fee >= 0),
  free_over integer check (free_over is null or free_over >= 0),
  min_days integer not null default 3 check (min_days >= 0),
  max_days integer not null default 7,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_days >= min_days)
);
create trigger shipping_methods_set_updated_at before update on public.shipping_methods
  for each row execute function public.set_updated_at();

create table public.tax_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  prices_include_tax boolean not null default true,
  tax_label text not null default 'GST' check (char_length(tax_label) between 1 and 20),
  business_tax_id text check (business_tax_id is null or business_tax_id ~ '^[0-9A-Z]{15}$'),
  updated_at timestamptz not null default now()
);
insert into public.tax_settings (id) values (true) on conflict do nothing;
create trigger tax_settings_set_updated_at before update on public.tax_settings
  for each row execute function public.set_updated_at();

create table public.tax_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  rate_bps integer not null check (rate_bps between 0 and 10000),
  min_unit_price integer not null default 0 check (min_unit_price >= 0),
  max_unit_price integer check (max_unit_price is null or max_unit_price >= min_unit_price),
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.tax_rules is 'Per-unit price bands mapped to a tax rate (basis points). Verify current rates with a tax professional.';
create trigger tax_rules_set_updated_at before update on public.tax_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  description text not null default '' check (char_length(description) <= 200),
  discount_type public.coupon_type not null,
  value integer not null check (value > 0),
  max_discount integer check (max_discount is null or max_discount > 0),
  min_subtotal integer not null default 0 check (min_subtotal >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0),
  first_order_only boolean not null default false,
  scope public.coupon_scope not null default 'all',
  is_active boolean not null default true,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_percentage_range check (discount_type <> 'percentage' or value <= 90),
  constraint coupons_window check (ends_at is null or starts_at is null or ends_at > starts_at)
);
comment on column public.coupons.value is 'Percentage (1-90) or fixed amount in minor units.';
create trigger coupons_set_updated_at before update on public.coupons
  for each row execute function public.set_updated_at();

create table public.coupon_products (
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (coupon_id, product_id)
);
create index coupon_products_product_idx on public.coupon_products (product_id);

create table public.coupon_categories (
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (coupon_id, category_id)
);
create index coupon_categories_category_idx on public.coupon_categories (category_id);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique check (order_number ~ '^[A-Z]{2,4}-[0-9]{6}-[0-9A-Z]{5}$'),
  user_id uuid references auth.users (id) on delete set null,
  access_token_hash text not null check (access_token_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key uuid not null unique,
  email text not null check (char_length(email) <= 254 and email ~* '^[^\s@]+@[^\s@]+\.[a-z]{2,}$'),
  phone text not null check (phone ~ '^\+?[0-9][0-9 -]{6,18}$'),
  customer_name text not null check (char_length(trim(customer_name)) between 2 and 120),
  ship_line1 text not null check (char_length(trim(ship_line1)) between 3 and 200),
  ship_line2 text check (ship_line2 is null or char_length(ship_line2) <= 200),
  ship_landmark text check (ship_landmark is null or char_length(ship_landmark) <= 120),
  ship_city text not null check (char_length(trim(ship_city)) between 2 and 80),
  ship_state text not null check (char_length(trim(ship_state)) between 2 and 80),
  ship_postal_code text not null check (ship_postal_code ~ '^[1-9][0-9]{5}$'),
  ship_country char(2) not null default 'IN' check (ship_country = 'IN'),
  currency char(3) not null default 'INR',
  subtotal integer not null check (subtotal >= 0),
  discount_total integer not null default 0 check (discount_total >= 0),
  shipping_total integer not null default 0 check (shipping_total >= 0),
  tax_total integer not null default 0 check (tax_total >= 0),
  tax_inclusive boolean not null default true,
  total integer not null check (total > 0),
  coupon_id uuid references public.coupons (id) on delete set null,
  coupon_code text,
  shipping_method_code text not null,
  shipping_method_name text not null,
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'unpaid',
  order_status public.order_status not null default 'pending_payment',
  reservation_expires_at timestamptz,
  review_due_at timestamptz,
  requires_attention boolean not null default false,
  attention_reason text check (attention_reason is null or char_length(attention_reason) <= 300),
  customer_note text check (customer_note is null or char_length(customer_note) <= 500),
  paid_at timestamptz,
  payment_verified_by uuid references auth.users (id) on delete set null,
  payment_reference text check (payment_reference is null or char_length(payment_reference) <= 80),
  confirmed_at timestamptz,
  processing_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  expired boolean not null default false,
  tracking_carrier text check (tracking_carrier is null or char_length(tracking_carrier) <= 60),
  tracking_number text check (tracking_number is null or tracking_number ~ '^[A-Za-z0-9-]{4,40}$'),
  tracking_url text check (tracking_url is null or tracking_url ~* '^https://[^\s<>"]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_total_matches check (
    total = subtotal - discount_total + shipping_total + case when tax_inclusive then 0 else tax_total end
  ),
  constraint orders_discount_within_subtotal check (discount_total <= subtotal),
  -- A payment can only be in a paid state once someone (or a verified gateway) recorded it.
  constraint orders_paid_requires_record check (
    payment_status not in ('verified_paid', 'refund_pending', 'refunded') or paid_at is not null
  ),
  -- Fulfilment states are impossible without a verified payment.
  constraint orders_fulfilment_requires_payment check (
    order_status not in ('confirmed', 'processing', 'shipped', 'delivered')
    or payment_status in ('verified_paid', 'refund_pending', 'refunded')
  )
);
comment on column public.orders.access_token_hash is 'SHA-256 of the secret that lets a guest view the order and submit payment proof.';
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_email_idx on public.orders (lower(email), created_at desc);
create index orders_status_idx on public.orders (order_status, created_at desc);
create index orders_payment_status_idx on public.orders (payment_status, created_at desc);
create index orders_expiry_idx on public.orders (reservation_expires_at) where order_status = 'pending_payment';
create index orders_attention_idx on public.orders (requires_attention) where requires_attention;
create index orders_created_idx on public.orders (created_at desc);
create index orders_number_trgm on public.orders using gin (order_number extensions.gin_trgm_ops);
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  -- RESTRICT keeps catalogue rows that history depends on; products with
  -- orders are archived instead of deleted. Snapshots below keep the history
  -- accurate even after the product is edited.
  product_id uuid not null references public.products (id) on delete restrict,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  product_name text not null,
  product_slug text not null,
  sku text not null,
  color_name text,
  -- Option name and value at the time of purchase (e.g. "Strap size" / "S/M").
  -- A size_label of 'Standard' means the product had no options.
  variant_label text not null default 'Size' check (char_length(variant_label) between 1 and 30),
  size_label text not null,
  image_url text,
  unit_price integer not null check (unit_price > 0),
  unit_regular_price integer not null check (unit_regular_price >= unit_price),
  quantity integer not null check (quantity between 1 and 10),
  line_total integer not null check (line_total = unit_price * quantity),
  discount_allocated integer not null default 0 check (discount_allocated >= 0 and discount_allocated <= line_total),
  tax_rate_bps integer not null default 0,
  tax_amount integer not null default 0 check (tax_amount >= 0),
  created_at timestamptz not null default now()
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);
create index order_items_variant_idx on public.order_items (variant_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  event_type text not null check (event_type ~ '^[a-z_]{3,40}$'),
  from_status text,
  to_status text,
  message text check (message is null or char_length(message) <= 2000),
  is_customer_visible boolean not null default false,
  actor_id uuid references auth.users (id) on delete set null,
  actor_type text not null default 'system' check (actor_type in ('customer', 'staff', 'system', 'gateway')),
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  utr text check (utr is null or utr ~ '^[A-Za-z0-9]{6,35}$'),
  paid_at timestamptz,
  payer_upi_id text check (payer_upi_id is null or payer_upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9.-]{1,63}$'),
  customer_note text check (customer_note is null or char_length(customer_note) <= 500),
  file_path text check (file_path is null or file_path ~ '^orders/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'),
  file_mime text check (file_mime is null or file_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size integer check (file_size is null or file_size between 1 and 10485760),
  file_sha256 text check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  status public.proof_status not null default 'submitted',
  review_reason text check (review_reason is null or char_length(review_reason) <= 500),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  submitted_ip_hash text,
  constraint payment_proofs_has_evidence check (file_path is not null or utr is not null),
  constraint payment_proofs_file_complete check (
    (file_path is null and file_mime is null and file_size is null)
    or (file_path is not null and file_mime is not null and file_size is not null)
  )
);
comment on table public.payment_proofs is 'Customer-submitted evidence of a manual UPI payment. Evidence only: never proof that money arrived.';
-- At most one proof awaiting review per order (prevents duplicate submissions).
create unique index payment_proofs_one_open on public.payment_proofs (order_id) where status in ('submitted', 'under_review');
-- A UTR can confirm only one order.
create unique index payment_proofs_utr_approved on public.payment_proofs (upper(utr)) where status = 'approved' and utr is not null;
create index payment_proofs_order_idx on public.payment_proofs (order_id, submitted_at desc);
create index payment_proofs_utr_idx on public.payment_proofs (upper(utr));
create index payment_proofs_status_idx on public.payment_proofs (status, submitted_at);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null check (provider in ('razorpay')),
  provider_order_id text not null unique,
  provider_payment_id text unique,
  amount integer not null check (amount > 0),
  currency char(3) not null default 'INR',
  status text not null default 'created'
    check (status in ('created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded')),
  error_code text,
  error_description text check (error_description is null or char_length(error_description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_transactions_order_idx on public.payment_transactions (order_id);
create trigger payment_transactions_set_updated_at before update on public.payment_transactions
  for each row execute function public.set_updated_at();

create table public.payment_webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  order_id uuid references public.orders (id) on delete set null,
  payload_sha256 text not null,
  result text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
  method public.payment_method not null,
  reference text check (reference is null or char_length(reference) <= 80),
  provider_refund_id text unique,
  reason text not null check (char_length(reason) between 3 and 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users (id) on delete set null
);
create index refunds_order_idx on public.refunds (order_id);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  discount_amount integer not null check (discount_amount >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'redeemed', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id, status);
create index coupon_redemptions_email_idx on public.coupon_redemptions (coupon_id, lower(email));
create trigger coupon_redemptions_set_updated_at before update on public.coupon_redemptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Inventory ledger & reservations
-- ---------------------------------------------------------------------------
create table public.inventory_movements (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity_delta integer not null check (quantity_delta <> 0),
  reason public.inventory_reason not null,
  order_id uuid references public.orders (id) on delete set null,
  note text check (note is null or char_length(note) <= 300),
  on_hand_after integer not null check (on_hand_after >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_movements_variant_idx on public.inventory_movements (variant_id, created_at desc);
create index inventory_movements_created_idx on public.inventory_movements (created_at desc);
create index inventory_movements_order_idx on public.inventory_movements (order_id);

create table public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status public.reservation_status not null default 'active',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (order_id, variant_id)
);
create index stock_reservations_variant_idx on public.stock_reservations (variant_id) where status = 'active';

-- Stock columns can only be changed by the inventory functions, which set a
-- transaction-local flag. Direct API writes (even by staff) are rejected so the
-- ledger in inventory_movements always explains the current stock.
create or replace function public.guard_variant_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.inventory_write', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.stock_on_hand <> 0 or new.stock_reserved <> 0 then
      raise exception 'Stock must be set through inventory adjustments.' using errcode = '42501';
    end if;
  elsif new.stock_on_hand is distinct from old.stock_on_hand or new.stock_reserved is distinct from old.stock_reserved then
    raise exception 'Stock must be changed through inventory adjustments.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger product_variants_guard_stock before insert or update on public.product_variants
  for each row execute function public.guard_variant_stock();

-- ---------------------------------------------------------------------------
-- Customer data
-- ---------------------------------------------------------------------------
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'Home' check (char_length(label) between 1 and 30),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone text not null check (phone ~ '^\+?[0-9][0-9 -]{6,18}$'),
  line1 text not null check (char_length(trim(line1)) between 3 and 200),
  line2 text check (line2 is null or char_length(line2) <= 200),
  landmark text check (landmark is null or char_length(landmark) <= 120),
  city text not null check (char_length(trim(city)) between 2 and 80),
  state text not null check (char_length(trim(state)) between 2 and 80),
  postal_code text not null check (postal_code ~ '^[1-9][0-9]{5}$'),
  country char(2) not null default 'IN' check (country = 'IN'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);
create unique index addresses_single_default on public.addresses (user_id) where is_default;
create trigger addresses_set_updated_at before update on public.addresses
  for each row execute function public.set_updated_at();

create table public.wishlist_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index wishlist_items_product_idx on public.wishlist_items (product_id);

create table public.cart_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity integer not null check (quantity between 1 and 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, variant_id)
);
create index cart_items_variant_idx on public.cart_items (variant_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  author_name text not null check (char_length(trim(author_name)) between 2 and 60),
  rating smallint not null check (rating between 1 and 5),
  title text check (title is null or char_length(title) <= 120),
  body text not null check (char_length(trim(body)) between 10 and 2000),
  status public.review_status not null default 'pending',
  is_verified_purchase boolean not null default false,
  is_featured boolean not null default false,
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 500),
  moderated_by uuid references auth.users (id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index reviews_product_idx on public.reviews (product_id, status, created_at desc);
create index reviews_status_idx on public.reviews (status, created_at desc);
create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) <= 254 and email ~* '^[^\s@]+@[^\s@]+\.[a-z]{2,}$'),
  status text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed')),
  source text not null default 'footer' check (char_length(source) <= 40),
  consent_text text not null,
  unsubscribe_token_hash text not null check (unsubscribe_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);
create unique index newsletter_subscribers_email_idx on public.newsletter_subscribers (lower(email));

create table public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  request_type text not null check (request_type in ('data_export', 'account_deletion', 'order_issue', 'other')),
  message text not null check (char_length(trim(message)) between 5 and 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'rejected')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_requests_status_idx on public.customer_requests (status, created_at desc);
create trigger customer_requests_set_updated_at before update on public.customer_requests
  for each row execute function public.set_updated_at();

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  to_email text not null,
  template text not null check (template ~ '^[a-z_]{3,40}$'),
  subject text not null check (char_length(subject) <= 200),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  provider_message_id text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
comment on column public.email_outbox.payload is 'Rendering snapshot for the email template (not a source of truth).';
create index email_outbox_pending_idx on public.email_outbox (next_attempt_at) where status in ('pending', 'failed');

-- ---------------------------------------------------------------------------
-- Review integrity & product rating aggregates
-- ---------------------------------------------------------------------------
create or replace function public.prepare_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_order_staff() then
    if tg_op = 'INSERT' then
      new.user_id := (select auth.uid());
      new.status := 'pending';
      new.is_featured := false;
      new.moderation_note := null;
      new.moderated_by := null;
      new.moderated_at := null;
    else
      -- Authors may edit their text; it goes back to moderation.
      if new.user_id is distinct from old.user_id or new.product_id is distinct from old.product_id
         or new.is_featured is distinct from old.is_featured or new.moderation_note is distinct from old.moderation_note then
        raise exception 'Not allowed.' using errcode = '42501';
      end if;
      new.status := 'pending';
    end if;
  else
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      new.moderated_by := (select auth.uid());
      new.moderated_at := now();
    end if;
    if new.is_featured and new.status <> 'approved' then
      new.is_featured := false;
    end if;
  end if;
  -- "Verified purchase" is derived from real paid orders, never from input.
  new.is_verified_purchase := new.user_id is not null and exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.user_id = new.user_id
      and oi.product_id = new.product_id
      and o.payment_status = 'verified_paid'
      and o.order_status in ('confirmed', 'processing', 'shipped', 'delivered')
  );
  return new;
end $$;
create trigger reviews_prepare before insert or update on public.reviews
  for each row execute function public.prepare_review();

create or replace function public.refresh_product_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p set
    rating_avg = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r where r.product_id = v_product and r.status = 'approved'), 0),
    rating_count = (select count(*) from public.reviews r where r.product_id = v_product and r.status = 'approved')
  where p.id = v_product;
  return null;
end $$;
create trigger reviews_refresh_rating after insert or update or delete on public.reviews
  for each row execute function public.refresh_product_rating();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.payment_settings enable row level security;
alter table public.shipping_methods enable row level security;
alter table public.tax_settings enable row level security;
alter table public.tax_rules enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_products enable row level security;
alter table public.coupon_categories enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.refunds enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.stock_reservations enable row level security;
alter table public.addresses enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.cart_items enable row level security;
alter table public.reviews enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.customer_requests enable row level security;
alter table public.email_outbox enable row level security;

create policy payment_settings_admin_read on public.payment_settings for select to authenticated using (public.is_admin());
create policy payment_settings_admin_update on public.payment_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy shipping_methods_public_read on public.shipping_methods for select to anon, authenticated
  using (is_active or public.is_staff());
create policy shipping_methods_admin_write on public.shipping_methods for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy tax_settings_public_read on public.tax_settings for select to anon, authenticated using (true);
create policy tax_settings_admin_update on public.tax_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy tax_rules_public_read on public.tax_rules for select to anon, authenticated using (is_active or public.is_staff());
create policy tax_rules_admin_write on public.tax_rules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy coupons_public_read on public.coupons for select to anon, authenticated
  using ((is_public and is_active and (ends_at is null or ends_at > now())) or public.is_admin());
create policy coupons_admin_write on public.coupons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy coupon_products_admin on public.coupon_products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy coupon_categories_admin on public.coupon_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy coupon_redemptions_admin_read on public.coupon_redemptions for select to authenticated using (public.is_admin());

-- Customers see their own orders; order staff see all. Nobody writes directly.
create policy orders_select on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or public.is_order_staff());
create policy order_items_select on public.order_items for select to authenticated
  using (public.is_order_staff() or exists (
    select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));
create policy order_events_select on public.order_events for select to authenticated
  using (public.is_order_staff() or (is_customer_visible and exists (
    select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))));
-- Customers may see the status of their own proofs (not the file); only owners/admins review.
create policy payment_proofs_select on public.payment_proofs for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));
create policy payment_transactions_admin_read on public.payment_transactions for select to authenticated using (public.is_admin());
create policy payment_webhook_events_admin_read on public.payment_webhook_events for select to authenticated using (public.is_admin());
create policy refunds_select on public.refunds for select to authenticated using (public.is_admin());

create policy inventory_movements_staff_read on public.inventory_movements for select to authenticated using (public.is_catalog_staff());
create policy stock_reservations_staff_read on public.stock_reservations for select to authenticated using (public.is_staff());

create policy addresses_own on public.addresses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy addresses_staff_read on public.addresses for select to authenticated using (public.is_order_staff());

create policy wishlist_own on public.wishlist_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cart_own on public.cart_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy reviews_public_read on public.reviews for select to anon, authenticated
  using (status = 'approved' or user_id = (select auth.uid()) or public.is_order_staff());
create policy reviews_author_insert on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.products p where p.id = product_id and p.status = 'published'));
create policy reviews_author_update on public.reviews for update to authenticated
  using (user_id = (select auth.uid()) or public.is_order_staff())
  with check (user_id = (select auth.uid()) or public.is_order_staff());
create policy reviews_delete on public.reviews for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_order_staff());

create policy newsletter_admin_read on public.newsletter_subscribers for select to authenticated using (public.is_admin());
create policy newsletter_admin_delete on public.newsletter_subscribers for delete to authenticated using (public.is_admin());

create policy customer_requests_own_read on public.customer_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_order_staff());
create policy customer_requests_own_insert on public.customer_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open' and resolution_note is null);
create policy customer_requests_staff_update on public.customer_requests for update to authenticated
  using (public.is_order_staff()) with check (public.is_order_staff());

create policy email_outbox_admin_read on public.email_outbox for select to authenticated using (public.is_admin());

-- Defence in depth: order/payment/stock tables are never written through the API.
revoke insert, update, delete, truncate on
  public.orders, public.order_items, public.order_events, public.payment_proofs,
  public.payment_transactions, public.payment_webhook_events, public.refunds,
  public.coupon_redemptions, public.inventory_movements, public.stock_reservations,
  public.email_outbox, public.newsletter_subscribers
from anon, authenticated;
revoke all on public.payment_settings from anon;
revoke insert, delete, truncate on public.payment_settings, public.tax_settings from authenticated;

revoke execute on function public.guard_variant_stock() from public, anon, authenticated;
revoke execute on function public.prepare_review() from public, anon, authenticated;
revoke execute on function public.refresh_product_rating() from public, anon, authenticated;

create trigger payment_settings_audit after update on public.payment_settings
  for each row execute function public.audit_row_change();
create trigger shipping_methods_audit after insert or update or delete on public.shipping_methods
  for each row execute function public.audit_row_change();
create trigger tax_settings_audit after update on public.tax_settings
  for each row execute function public.audit_row_change();
create trigger tax_rules_audit after insert or update or delete on public.tax_rules
  for each row execute function public.audit_row_change();
create trigger coupons_audit after insert or update or delete on public.coupons
  for each row execute function public.audit_row_change();
create trigger reviews_audit after update of status, is_featured or delete on public.reviews
  for each row execute function public.audit_row_change();
