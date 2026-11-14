-- Digital Vision: keep module entitlements under Super Admin control.
-- The RPC makes entitlement changes and restaurant-ordering state atomic.
-- Existing business/module data is preserved; only unselected entitlements are removed
-- when a Super Admin explicitly saves a new selection.

drop policy if exists business_modules_insert on public.business_modules;
drop policy if exists business_modules_update on public.business_modules;
drop policy if exists business_modules_delete on public.business_modules;

create policy business_modules_insert
on public.business_modules
for insert
to authenticated
with check (private.is_super_admin());

create policy business_modules_update
on public.business_modules
for update
to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

create policy business_modules_delete
on public.business_modules
for delete
to authenticated
using (private.is_super_admin());

create or replace function public.admin_set_business_modules(
  p_business_id uuid,
  p_module_ids uuid[],
  p_customer_ordering_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  selected_ids uuid[] := coalesce(p_module_ids, '{}'::uuid[]);
  valid_count bigint;
begin
  if not private.is_super_admin() then
    raise exception 'Super Admin access is required to change business modules'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.businesses where id = p_business_id
  ) then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;

  select count(*)
    into valid_count
    from public.modules
   where id = any(selected_ids);

  if valid_count <> cardinality(selected_ids) then
    raise exception 'The module selection contains an unknown or duplicate module'
      using errcode = '22023';
  end if;

  delete from public.business_modules
   where business_id = p_business_id
     and not (module_id = any(selected_ids));

  insert into public.business_modules (business_id, module_id, enabled)
  select p_business_id, selected.module_id, true
    from unnest(selected_ids) as selected(module_id)
  on conflict (business_id, module_id)
  do update set enabled = true, updated_at = pg_catalog.now();

  insert into public.restaurant_settings (business_id, customer_ordering_enabled)
  values (p_business_id, coalesce(p_customer_ordering_enabled, false))
  on conflict (business_id)
  do update set
    customer_ordering_enabled = excluded.customer_ordering_enabled,
    updated_at = pg_catalog.now();
end;
$function$;

revoke all on function public.admin_set_business_modules(uuid, uuid[], boolean) from public, anon;
grant execute on function public.admin_set_business_modules(uuid, uuid[], boolean) to authenticated;

-- Cover the composite foreign key from orders(table_id, business_id).
create index if not exists orders_table_business_idx
  on public.orders (table_id, business_id)
  where table_id is not null;

-- Cover staff reset-request foreign keys and business-scoped lookups.
create index if not exists staff_password_reset_requests_business_idx
  on public.staff_password_reset_requests (business_id);

create index if not exists staff_password_reset_requests_manager_idx
  on public.staff_password_reset_requests (manager_user_id);
