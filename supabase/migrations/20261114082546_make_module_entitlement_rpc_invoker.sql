-- The entitlement RPC is protected by the Super Admin-only RLS policies.
-- Use SECURITY INVOKER so it cannot bypass those policies and is not an exposed
-- SECURITY DEFINER function.

create or replace function public.admin_set_business_modules(
  p_business_id uuid,
  p_module_ids uuid[],
  p_customer_ordering_enabled boolean
)
returns void
language plpgsql
security invoker
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
