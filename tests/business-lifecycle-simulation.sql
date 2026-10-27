-- 100-case database QA simulation. All writes are rolled back.
-- Categories: 30 lifecycle, 20 invalid status, 15 duplicate slug, 15 invalid module FK,
-- 10 operational-data retention fixtures, 10 idempotent state transitions.
begin;
create temp table qa_simulation_results(category text, cases int, passed int, failed int, notes text) on commit drop;
do $$
declare i int; bid uuid; mid uuid; st text; caught boolean; n int;
begin
  select id into mid from public.modules order by created_at limit 1;
  if mid is null then raise exception 'No module fixture exists'; end if;

  for i in 1..30 loop
    insert into public.businesses(name,business_type,slug) values ('QA Success '||i,'other','qa-success-'||i||'-20261027') returning id into bid;
    insert into public.business_modules(business_id,module_id,enabled) values(bid,mid,true);
    update public.businesses set status='suspended' where id=bid;
    update public.businesses set status='active' where id=bid;
    update public.businesses set status='archived' where id=bid;
    update public.businesses set status='active' where id=bid;
    delete from public.business_modules where business_id=bid;
    delete from public.businesses where id=bid;
    if exists(select 1 from public.businesses where id=bid) then raise exception 'success lifecycle case failed %',i; end if;
  end loop;
  insert into qa_simulation_results values('successful lifecycle',30,30,0,'Create, module assignment, suspend, reactivate, archive, delete');

  for i in 1..20 loop
    insert into public.businesses(name,business_type,slug) values ('QA Invalid Status '||i,'other','qa-invalid-status-'||i||'-20261027') returning id into bid;
    caught:=false;
    begin update public.businesses set status='not-a-status' where id=bid;
    exception when check_violation then caught:=true; end;
    if not caught then raise exception 'invalid status accepted case %',i; end if;
    delete from public.businesses where id=bid;
  end loop;
  insert into qa_simulation_results values('invalid status rejection',20,20,0,'Invalid status updates rejected by database constraint');

  for i in 1..15 loop
    insert into public.businesses(name,business_type,slug) values ('QA Unique A '||i,'other','qa-unique-'||i||'-20261027') returning id into bid;
    caught:=false;
    begin insert into public.businesses(name,business_type,slug) values ('QA Unique B '||i,'other','qa-unique-'||i||'-20261027');
    exception when unique_violation then caught:=true; end;
    if not caught then raise exception 'duplicate slug accepted case %',i; end if;
    delete from public.businesses where id=bid;
  end loop;
  insert into qa_simulation_results values('duplicate slug rejection',15,15,0,'Unique slug constraint enforced');

  for i in 1..15 loop
    insert into public.businesses(name,business_type,slug) values ('QA Invalid Module '||i,'other','qa-invalid-module-'||i||'-20261027') returning id into bid;
    caught:=false;
    begin insert into public.business_modules(business_id,module_id,enabled) values(bid,gen_random_uuid(),true);
    exception when foreign_key_violation then caught:=true; end;
    if not caught then raise exception 'invalid module foreign key accepted case %',i; end if;
    delete from public.businesses where id=bid;
  end loop;
  insert into qa_simulation_results values('invalid module reference rejection',15,15,0,'Invalid module foreign keys rejected');

  for i in 1..10 loop
    insert into public.businesses(name,business_type,slug) values ('QA Retention '||i,'other','qa-retention-'||i||'-20261027') returning id into bid;
    insert into public.customers(business_id,name) values(bid,'Simulation customer');
    select count(*) into n from public.customers where business_id=bid;
    if n<1 then raise exception 'operational data guard fixture missing case %',i; end if;
    delete from public.customers where business_id=bid;
    delete from public.businesses where id=bid;
  end loop;
  insert into qa_simulation_results values('operational data retention guard fixtures',10,10,0,'Business with customer data identified; fixture safely cleaned');

  for i in 1..10 loop
    insert into public.businesses(name,business_type,slug) values ('QA Idempotent '||i,'other','qa-idempotent-'||i||'-20261027') returning id into bid;
    update public.businesses set status='active' where id=bid;
    update public.businesses set status='active' where id=bid;
    update public.businesses set status='suspended' where id=bid;
    update public.businesses set status='suspended' where id=bid;
    select status into st from public.businesses where id=bid;
    if st<>'suspended' then raise exception 'idempotent transition failed case %',i; end if;
    delete from public.businesses where id=bid;
  end loop;
  insert into qa_simulation_results values('idempotent state transitions',10,10,0,'Repeated activate/suspend operations preserve expected state');
end $$;
select sum(cases) as total_cases, sum(passed) as passed, sum(failed) as failed,
       json_agg(qa_simulation_results order by category) as breakdown
from qa_simulation_results;
rollback;
