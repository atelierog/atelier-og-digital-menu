alter table public.business_members drop constraint if exists business_members_role_check;

alter table public.business_members
  add constraint business_members_role_check
  check (role = any (array['owner'::text, 'manager'::text, 'staff'::text, 'order_taker'::text, 'bill_counter'::text]));
