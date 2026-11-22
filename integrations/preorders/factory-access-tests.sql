begin;
do $fixture$
declare uid uuid; own_store text; other_store text;
begin
 if exists(select 1 from public.kream_cake_reservations where source_order_id in (900000011,900000012)) then raise exception 'Fixture IDs already exist';end if;
 select p.user_id,m.store_id,s.id into uid,own_store,other_store
 from public.kream_profiles p join public.kream_memberships m on m.user_id=p.user_id cross join public.kream_stores s
 where p.role='employee' and p.active and not p.access_blocked and s.active
 and not exists(select 1 from public.kream_memberships x where x.user_id=p.user_id and x.store_id=s.id)
 limit 1;
 if uid is null then raise exception 'No employee fixture available';end if;
 perform set_config('kream.test_employee',uid::text,true);
 insert into public.kream_cake_reservations(source_order_id,order_number,status,store_id,pickup_location,pickup_date,pickup_time,customer_note,items,source_modified_at,source_exported_at,content_hash)
 values(900000011,'FACTORY-TEST-1','processing',own_store,'Test location','2026-11-23','14:00','Synthetic test message','[{"name":"Test cake","quantity":1,"options":[]}]',now(),now(),'test-hash'),
 (900000012,'FACTORY-TEST-2','processing',other_store,'Test location','2026-11-23','15:00','Synthetic test message','[{"name":"Test cake","quantity":2,"options":[]}]',now(),now(),'test-hash');
end $fixture$;
do $factory$
declare p record; tested integer=0; allowed_store_review boolean;
begin
 for p in select user_id,active,access_blocked from public.kream_profiles where role='factory' loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p.user_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if p.active and not p.access_blocked then
   if (select count(*) from public.kream_cake_reservations where source_order_id in (900000011,900000012))<>2 then raise exception 'Factory branch visibility failed';end if;
   select kream_private.can_read_cake_reservation(store_id) into allowed_store_review from public.kream_cake_reservations where source_order_id=900000011;
   if not allowed_store_review then
    begin perform public.kream_review_cake_reservation(900000011,'test-hash',true);raise exception 'Factory unexpectedly received store review rights';exception when insufficient_privilege then null;end;
   end if;
   begin update public.kream_cake_reservations set customer_note='forbidden' where source_order_id=900000011;raise exception 'Factory direct write accepted';exception when insufficient_privilege then null;end;
  else
   if exists(select 1 from public.kream_cake_reservations where source_order_id in (900000011,900000012)) then raise exception 'Blocked factory can read';end if;
  end if;
  execute 'reset role';tested=tested+1;
 end loop;
 if tested=0 then raise exception 'No factory fixtures';end if;
end $factory$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('kream.test_employee'),'role','authenticated')::text,true);
set local role authenticated;
do $employee$
begin
 if (select count(*) from public.kream_cake_reservations where source_order_id in (900000011,900000012))<>1 then raise exception 'Employee branch isolation failed';end if;
 begin perform public.kream_review_cake_reservation(900000012,'test-hash',true);raise exception 'Cross branch review accepted';exception when insufficient_privilege then null;end;
end $employee$;
reset role;
rollback;
select 'Passed: all active factory accounts see both branches; blocked accounts see neither; employee remains branch scoped; no new write rights; fixtures rolled back' as result;