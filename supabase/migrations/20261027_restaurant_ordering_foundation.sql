-- Digital Vision restaurant ordering foundation
-- Apply only after reviewing the current production schema and testing in a staging project.
-- Public QR ordering must go through a validated Edge Function; do not add broad anon table policies.

create table if not exists public.restaurant_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  menu_published boolean not null default false,
  customer_ordering_enabled boolean not null default false,
  menu_theme text not null default 'luxury-dark'
    check (menu_theme in ('luxury-dark', 'clean-light', 'warm-cafe')),
  updated_at timestamptz not null default now()
);

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
  add column if not exists source text not null default 'staff'
    check (source in ('staff', 'qr'));

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

create index if not exists restaurant_tables_business_active_idx
  on public.restaurant_tables (business_id, active, table_number);

alter table public.restaurant_settings enable row level security;
alter table public.restaurant_tables enable row level security;

drop policy if exists restaurant_settings_member_select on public.restaurant_settings;
create policy restaurant_settings_member_select
  on public.restaurant_settings for select to authenticated
  using (private.is_super_admin() or private.is_business_member(business_id));

drop policy if exists restaurant_settings_manager_insert on public.restaurant_settings;
create policy restaurant_settings_manager_insert
  on public.restaurant_settings for insert to authenticated
  with check (private.is_super_admin() or private.is_business_manager(business_id));

drop policy if exists restaurant_settings_manager_update on public.restaurant_settings;
create policy restaurant_settings_manager_update
  on public.restaurant_settings for update to authenticated
  using (private.is_super_admin() or private.is_business_manager(business_id))
  with check (private.is_super_admin() or private.is_business_manager(business_id));

drop policy if exists restaurant_tables_member_select on public.restaurant_tables;
create policy restaurant_tables_member_select
  on public.restaurant_tables for select to authenticated
  using (private.is_super_admin() or private.is_business_member(business_id));

drop policy if exists restaurant_tables_manager_insert on public.restaurant_tables;
create policy restaurant_tables_manager_insert
  on public.restaurant_tables for insert to authenticated
  with check (private.is_super_admin() or private.is_business_manager(business_id));

drop policy if exists restaurant_tables_manager_update on public.restaurant_tables;
create policy restaurant_tables_manager_update
  on public.restaurant_tables for update to authenticated
  using (private.is_super_admin() or private.is_business_manager(business_id))
  with check (private.is_super_admin() or private.is_business_manager(business_id));

drop policy if exists restaurant_tables_manager_delete on public.restaurant_tables;
create policy restaurant_tables_manager_delete
  on public.restaurant_tables for delete to authenticated
  using (private.is_super_admin() or private.is_business_manager(business_id));

drop trigger if exists restaurant_settings_updated_at on public.restaurant_settings;
create trigger restaurant_settings_updated_at
  before update on public.restaurant_settings
  for each row execute function public.set_updated_at();

drop trigger if exists restaurant_tables_updated_at on public.restaurant_tables;
create trigger restaurant_tables_updated_at
  before update on public.restaurant_tables
  for each row execute function public.set_updated_at();

-- QR customers must not write orders directly with the browser anon key.
-- A dedicated Edge Function must validate published/ordering-enabled settings,
-- resolve qr_token to an active table, read current active prices, generate order_code,
-- and create order + item snapshots in a transaction-safe flow.
