begin;
insert into kream_private.preorder_connection(source,token_hash) values('website',encode(extensions.digest(repeat('a',64),'sha256'),'hex'));
do $test$
declare uid uuid; own_store text; other_store text; h text; example jsonb;
begin
 select p.user_id,m.store_id,s.id into uid,own_store,other_store
 from public.kream_profiles p join public.kream_memberships m on m.user_id=p.user_id
 cross join public.kream_stores s
 where p.active and not p.access_blocked and p.role='employee' and s.active and s.id in ('finch','downtown','midland','richmond-hill') and m.store_id in ('finch','downtown','midland','richmond-hill')
 and not exists(select 1 from public.kream_memberships x where x.user_id=p.user_id and x.store_id=s.id) limit 1;
 if uid is null then raise exception 'No suitable branch permission fixture';end if;
 perform set_config('kream.test_user',uid::text,true);
 example=jsonb_build_object('source_order_id',900000001,'order_number','SYNC-TEST-1','status','processing','store_id',own_store,'pickup_location','Test location','pickup_date','2026-11-21','pickup_time','14:00','customer_note','Test message','items',jsonb_build_array(jsonb_build_object('name','Test cake','quantity',1,'options','[]'::jsonb)),'source_modified_at','2026-11-21T10:00:00Z','source_exported_at','2026-11-21T10:00:01Z');
 begin perform public.kream_receive_reservations(repeat('b',64),jsonb_build_array(example));raise exception 'Bad token unexpectedly accepted';exception when insufficient_privilege then null;end;
 perform public.kream_receive_reservations(repeat('a',64),jsonb_build_array(example,example||jsonb_build_object('source_order_id',900000002,'order_number','SYNC-TEST-2','store_id',other_store)));
 perform public.kream_receive_reservations(repeat('a',64),jsonb_build_array(example||jsonb_build_object('customer_note','Changed test message','source_modified_at','2026-11-21T11:00:00Z','source_exported_at','2026-11-21T11:00:01Z')));
 perform public.kream_receive_reservations(repeat('a',64),jsonb_build_array(example));
 if (select customer_note from public.kream_cake_reservations where source_order_id=900000001)<>'Changed test message' then raise exception 'Stale update replaced newer message';end if;
end $test$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('kream.test_user'),'role','authenticated')::text,true);
set local role authenticated;
do $test$ declare h text;begin
 if (select count(*) from public.kream_cake_reservations where source_order_id in (900000001,900000002))<>1 then raise exception 'Branch access check failed';end if;
 begin perform public.kream_review_cake_reservation(900000002,'wrong',true);raise exception 'Cross-branch write accepted';exception when insufficient_privilege then null;end;
 select content_hash into h from public.kream_cake_reservations where source_order_id=900000001;
 begin perform public.kream_review_cake_reservation(900000001,'outdated-hash',true);raise exception 'Stale review accepted';exception when serialization_failure then null;end;
 perform public.kream_review_cake_reservation(900000001,h,true);
 if not exists(select 1 from public.kream_cake_reservations where source_order_id=900000001 and reviewed_hash=content_hash) then raise exception 'Written marker missing';end if;
 perform public.kream_review_cake_reservation(900000001,h,false);
 if exists(select 1 from public.kream_cake_reservations where source_order_id=900000001 and reviewed_hash is not null) then raise exception 'Undo marker failed';end if;
 begin update public.kream_cake_reservations set customer_note='not allowed' where source_order_id=900000001;raise exception 'Direct staff modification accepted';exception when insufficient_privilege then null;end;
end $test$;
reset role;
rollback;
select 'Token, stale update, branch isolation, reviewed hash and undo checks passed; no test data retained' result;