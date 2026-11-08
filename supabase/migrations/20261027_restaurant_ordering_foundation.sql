-- Digital Vision restaurant ordering foundation
-- Reviewed against the live schema and applied to production with user approval on 2026-11-08.
-- Public QR ordering must go through a validated Edge Function; do not add broad anon table policies.

create table if not exists public.restaurant_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  menu_published boolean not null default false,
  customer_ordering_enabled boolean not null default false,
  menu_description text,
  logo_url text,
  cover_url text,
  menu_theme text not null default 'luxury-dark'
    check (menu_theme in ('luxury-dark', 'clean-light', 'warm-cafe')),
  gst_rate numeric(5,2) not null default 0 check (gst_rate >= 0 and gst_rate <= 100),
  notify_new_order boolean not null default true,
  notify_customer_status boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.restaurant_settings
  add column if not exists menu_description text,
  add column if not exists logo_url text,
  add column if not exists cover_url text,
  add column if not exists gst_rate numeric(5,2) not null default 0,
  add column if not exists notify_new_order boolean not null default true,
  add column if not exists notify_customer_status boolean not null default true;

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  table_number integer not null check (table_number > 0),
  label text not null,
  qr_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, table_number)
);

alter table public.orders
  add column if not exists order_code text,
  add column if not exists table_id uuid,
  add column if not exists customer_name_snapshot text,
  add column if not exists tracking_token uuid not null default gen_random_uuid(),
  add column if not exists subtotal numeric not null default 0,
  add column if not exists discount_total numeric not null default 0,
  add column if not exists tax_total numeric not null default 0,
  add column if not exists payment_status text not null default 'open'
    check (payment_status in ('open', 'paid', 'void')),
  add column if not exists source text not null default 'staff'
    check (source in ('staff', 'qr'));

update public.orders set subtotal = total where subtotal = 0 and total > 0;

create unique index if not exists orders_tracking_token_uidx on public.orders(tracking_token);

create table if not exists public.restaurant_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text,
  discount_kind text not null check (discount_kind in ('percentage', 'fixed')),
  discount_value numeric not null check (discount_value > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_kind <> 'percentage' or discount_value <= 100),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists restaurant_offers_business_active_idx
  on public.restaurant_offers (business_id, active, starts_at, ends_at);

-- Composite FK prevents an order from pointing to a table owned by another business.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_table_business_fk'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_table_business_fk
      foreign key (table_id, business_id)
      references public.restaurant_tables(id, business_id);
  end if;
end $$;

create unique index if not exists orders_business_order_code_uidx
  on public.orders (business_id, order_code)
  where order_code is not null;
create unique index if not exists orders_tracking_token_uidx
  on public.orders (tracking_token);

create index if not exists restaurant_tables_business_active_idx
  on public.restaurant_tables (business_id, active, table_number);

-- The public Edge Function is the only caller allowed to create QR orders.
-- It supplies server-validated prices and immutable item snapshots in one transaction.
create or replace function public.create_menu_order(
  p_business_id uuid,
  p_table_id uuid,
  p_customer_name text,
  p_order_code text,
  p_tracking_token uuid,
  p_subtotal numeric,
  p_discount_total numeric,
  p_tax_total numeric,
  p_total numeric,
  p_items jsonb
)
returns table (order_id uuid, order_code text, tracking_token uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_order_id uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Order must contain between 1 and 30 items';
  end if;
  if p_total < 0 or p_subtotal < 0 or p_discount_total < 0 or p_tax_total < 0 then
    raise exception 'Order totals cannot be negative';
  end if;

  insert into public.orders (
    business_id, status, total, currency, order_code, table_id, customer_name_snapshot,
    tracking_token, subtotal, discount_total, tax_total, payment_status, source
  ) values (
    p_business_id, 'new', p_total, 'INR', p_order_code, p_table_id, p_customer_name,
    p_tracking_token, p_subtotal, p_discount_total, p_tax_total, 'open', 'qr'
  ) returning id into created_order_id;

  insert into public.order_items (
    order_id, business_id, catalog_item_id, item_name, quantity, unit_price, line_total
  )
  select created_order_id, p_business_id, item.catalog_item_id, item.item_name,
         item.quantity, item.unit_price, item.line_total
  from jsonb_to_recordset(p_items) as item(
    catalog_item_id uuid, item_name text, quantity numeric, unit_price numeric, line_total numeric
  );

  return query select created_order_id, p_order_code, p_tracking_token;
end;
$$;

revoke all on function public.create_menu_order(uuid,uuid,text,text,uuid,numeric,numeric,numeric,numeric,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_menu_order(uuid,uuid,text,text,uuid,numeric,numeric,numeric,numeric,jsonb)
  to service_role;

-- Direct browser clients may read scoped orders, but cannot alter totals or item rows.
drop policy if exists orders_access on public.orders;
drop policy if exists orders_manager_select on public.orders;
create policy orders_manager_select on public.orders for select to authenticated
  using (private.is_super_admin() or (private.is_business_member(business_id) and private.has_business_module(business_id, 'ordering')));
drop policy if exists orders_manager_insert on public.orders;
create policy orders_manager_insert on public.orders for insert to authenticated
  with check (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'ordering')));
drop policy if exists orders_manager_update on public.orders;
create policy orders_manager_update on public.orders for update to authenticated
  using (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'ordering')))
  with check (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'ordering')));
drop policy if exists orders_manager_delete on public.orders;
create policy orders_manager_delete on public.orders for delete to authenticated
  using (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'ordering')));

drop policy if exists order_items_access on public.order_items;
drop policy if exists order_items_manager_select on public.order_items;
create policy order_items_manager_select on public.order_items for select to authenticated
  using (private.is_super_admin() or (private.is_business_member(business_id) and private.has_business_module(business_id, 'ordering')));
drop policy if exists order_items_manager_insert on public.order_items;
create policy order_items_manager_insert on public.order_items for insert to authenticated
  with check (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'ordering')));
drop policy if exists order_items_manager_update on public.order_items;
create policy order_items_manager_update on public.order_items for update to authenticated
  using (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'ordering')))
  with check (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'ordering')));
drop policy if exists order_items_manager_delete on public.order_items;
create policy order_items_manager_delete on public.order_items for delete to authenticated
  using (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'ordering')));

alter table public.restaurant_settings enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.restaurant_offers enable row level security;

drop policy if exists restaurant_settings_member_select on public.restaurant_settings;
create policy restaurant_settings_member_select
  on public.restaurant_settings for select to authenticated
  using (private.is_super_admin() or (private.is_business_member(business_id) and private.has_business_module(business_id, 'digital_page')));

drop policy if exists restaurant_settings_manager_insert on public.restaurant_settings;
create policy restaurant_settings_manager_insert
  on public.restaurant_settings for insert to authenticated
  with check (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'digital_page')));

drop policy if exists restaurant_settings_manager_update on public.restaurant_settings;
create policy restaurant_settings_manager_update
  on public.restaurant_settings for update to authenticated
  using (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'digital_page')))
  with check (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'digital_page')));

drop policy if exists restaurant_tables_member_select on public.restaurant_tables;
create policy restaurant_tables_member_select
  on public.restaurant_tables for select to authenticated
  using (private.is_super_admin() or (private.is_business_member(business_id) and private.has_business_module(business_id, 'qr')));

drop policy if exists restaurant_tables_manager_insert on public.restaurant_tables;
create policy restaurant_tables_manager_insert
  on public.restaurant_tables for insert to authenticated
  with check (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'qr')));

drop policy if exists restaurant_tables_manager_update on public.restaurant_tables;
create policy restaurant_tables_manager_update
  on public.restaurant_tables for update to authenticated
  using (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'qr')))
  with check (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'qr')));

drop policy if exists restaurant_tables_manager_delete on public.restaurant_tables;
create policy restaurant_tables_manager_delete
  on public.restaurant_tables for delete to authenticated
  using (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'qr')));

drop policy if exists restaurant_offers_member_select on public.restaurant_offers;
create policy restaurant_offers_member_select
  on public.restaurant_offers for select to authenticated
  using (private.is_super_admin() or (private.is_business_member(business_id) and private.has_business_module(business_id, 'offers')));

drop policy if exists restaurant_offers_manager_insert on public.restaurant_offers;
create policy restaurant_offers_manager_insert
  on public.restaurant_offers for insert to authenticated
  with check (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'offers')));

drop policy if exists restaurant_offers_manager_update on public.restaurant_offers;
create policy restaurant_offers_manager_update
  on public.restaurant_offers for update to authenticated
  using (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'offers')))
  with check (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'offers')));

drop policy if exists restaurant_offers_manager_delete on public.restaurant_offers;
create policy restaurant_offers_manager_delete
  on public.restaurant_offers for delete to authenticated
  using (private.is_super_admin() or (private.is_business_manager(business_id) and private.has_business_module(business_id, 'offers')));

drop trigger if exists restaurant_settings_updated_at on public.restaurant_settings;
create trigger restaurant_settings_updated_at
  before update on public.restaurant_settings
  for each row execute function private.set_updated_at();

drop trigger if exists restaurant_tables_updated_at on public.restaurant_tables;
create trigger restaurant_tables_updated_at
  before update on public.restaurant_tables
  for each row execute function private.set_updated_at();

drop trigger if exists restaurant_offers_updated_at on public.restaurant_offers;
create trigger restaurant_offers_updated_at
  before update on public.restaurant_offers
  for each row execute function private.set_updated_at();

-- Super Admin controls whether public ordering is enabled for a business.
create or replace function private.guard_ordering_enabled_setting()
returns trigger
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  if not private.is_super_admin()
     and new.customer_ordering_enabled is distinct from old.customer_ordering_enabled then
    raise exception 'Only a platform administrator can change customer ordering access';
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_settings_ordering_guard on public.restaurant_settings;
create trigger restaurant_settings_ordering_guard
  before update on public.restaurant_settings
  for each row execute function private.guard_ordering_enabled_setting();

-- Product and restaurant images are public menu assets; writes stay business-scoped.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('digital-menu-media', 'digital-menu-media', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists digital_menu_media_public_read on storage.objects;
create policy digital_menu_media_public_read on storage.objects
  for select to public using (bucket_id = 'digital-menu-media');

drop policy if exists digital_menu_media_manager_insert on storage.objects;
create policy digital_menu_media_manager_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'digital-menu-media' and
    case when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.is_super_admin() or (private.is_business_manager(split_part(name, '/', 1)::uuid) and (private.has_business_module(split_part(name, '/', 1)::uuid, 'catalog') or private.has_business_module(split_part(name, '/', 1)::uuid, 'digital_page')))
      else false end
  );

drop policy if exists digital_menu_media_manager_update on storage.objects;
create policy digital_menu_media_manager_update on storage.objects
  for update to authenticated using (
    bucket_id = 'digital-menu-media' and
    case when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.is_super_admin() or (private.is_business_manager(split_part(name, '/', 1)::uuid) and (private.has_business_module(split_part(name, '/', 1)::uuid, 'catalog') or private.has_business_module(split_part(name, '/', 1)::uuid, 'digital_page')))
      else false end
  ) with check (
    bucket_id = 'digital-menu-media' and
    case when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.is_super_admin() or (private.is_business_manager(split_part(name, '/', 1)::uuid) and (private.has_business_module(split_part(name, '/', 1)::uuid, 'catalog') or private.has_business_module(split_part(name, '/', 1)::uuid, 'digital_page')))
      else false end
  );

drop policy if exists digital_menu_media_manager_delete on storage.objects;
create policy digital_menu_media_manager_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'digital-menu-media' and
    case when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.is_super_admin() or (private.is_business_manager(split_part(name, '/', 1)::uuid) and (private.has_business_module(split_part(name, '/', 1)::uuid, 'catalog') or private.has_business_module(split_part(name, '/', 1)::uuid, 'digital_page')))
      else false end
  );

-- QR customers must not write orders directly with the browser anon key.
-- A dedicated Edge Function must validate published/ordering-enabled settings,
-- resolve qr_token to an active table, read current active prices, generate order_code,
-- and create order + item snapshots in a transaction-safe flow.

