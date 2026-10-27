-- Business lifecycle database simulation: 100 iterations.
-- Safe: all writes are inside one transaction and rolled back at the end.
begin;
create temp table lifecycle_test_results(test_name text, passed int, failed int, details text) on commit drop;
do $$
declare
  i int;
  bid uuid;
  mid uuid;
  st text;
  passed_count int := 0;
begin
  select id into mid from public.modules order by created_at limit 1;
  if mid is null then raise exception 'No module fixture exists'; end if;
  for i in 1..100 loop
    insert into public.businesses(name,business_type,slug)
    values ('Simulation Business '||i,'other','simulation-verify-'||i||'-20261027')
    returning id into bid;
    insert into public.business_modules(business_id,module_id,enabled)
    values (bid,mid,true);

    update public.businesses set status='suspended' where id=bid;
    select status into st from public.businesses where id=bid;
    if st <> 'suspended' then raise exception 'suspend failed at iteration %',i; end if;

    update public.businesses set status='active' where id=bid;
    select status into st from public.businesses where id=bid;
    if st <> 'active' then raise exception 'reactivation failed at iteration %',i; end if;

    update public.businesses set status='archived' where id=bid;
    select status into st from public.businesses where id=bid;
    if st <> 'archived' then raise exception 'archive failed at iteration %',i; end if;

    update public.businesses set status='active' where id=bid;
    delete from public.business_modules where business_id=bid;
    delete from public.businesses where id=bid;
    if exists(select 1 from public.businesses where id=bid) then
      raise exception 'delete failed at iteration %',i;
    end if;
    passed_count := passed_count + 1;
  end loop;
  insert into lifecycle_test_results
  values ('create/module/suspend/reactivate/archive/delete',passed_count,100-passed_count,
          'All writes run inside a transaction and are rolled back');
end $$;
select * from lifecycle_test_results;
rollback;
