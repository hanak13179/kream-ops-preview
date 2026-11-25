begin;
do $test$
declare actor uuid;prod public.kream_catalog%rowtype;oid uuid;rid uuid;did uuid;expected jsonb;actual jsonb;branch text;got numeric;
begin
 select user_id into actor from public.kream_profiles where role='owner' and active order by user_id limit 1;
 if actor is null then raise exception 'Test requires an approved owner';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select * into prod from public.kream_catalog where active order by id limit 1;
 foreach branch in array array['finch','downtown','richmond-hill','midland'] loop
 oid:=gen_random_uuid();rid:=gen_random_uuid();did:=gen_random_uuid();
 insert into public.kream_orders(id,source_draft_id,source_revision,created_by,store_id,delivery_date,note)
 values(oid,gen_random_uuid(),1,actor,branch,(now() at time zone 'America/Toronto')::date,'rollback receiving reason test');
 insert into public.kream_order_items(order_id,product_id,name_ko,name_en,order_unit,quantity) values(oid,prod.id,prod.name_ko,prod.name_en,prod.order_unit,4);
 insert into public.kream_dispatches(id,order_id,store_id,dispatched_by) values(did,oid,branch,actor);
 insert into public.kream_dispatch_items(dispatch_id,product_id,quantity) values(did,prod.id,4);
 update public.kream_orders set dispatch_finalized_at=now() where id=oid;
 insert into public.kream_stock(store_id,product_id,on_hand,counted_by) values(branch,prod.id,10,actor)
 on conflict(store_id,product_id) do update set on_hand=10;
 expected:=jsonb_build_array(jsonb_build_object('product_id',prod.id,'quantity',4));actual:=jsonb_build_array(jsonb_build_object('product_id',prod.id,'quantity',3));
 if branch='midland' then
 begin
 perform public.kream_receive_with_review(oid,rid,expected,actual,'');
 raise exception 'FAIL Midland accepted a missing reason';
 exception when invalid_parameter_value then null;end;
 perform public.kream_receive_with_review(oid,rid,expected,actual,'One missing');
 perform public.kream_receive_with_review(oid,rid,expected,actual,'One missing');
 else
 perform public.kream_receive_with_review(oid,rid,expected,actual,'');
 perform public.kream_receive_with_review(oid,rid,expected,actual,'');
 end if;
 select on_hand into got from public.kream_stock where store_id=branch and product_id=prod.id;
 if got is distinct from 13 then raise exception 'FAIL stock/idempotency: %',branch;end if;
 if not exists(select 1 from public.kream_receiving_reviews where id=rid and status='open') then raise exception 'FAIL missing discrepancy review';end if;
 if (select quantity from public.kream_dispatch_items where dispatch_id=did and product_id=prod.id)<>4 then raise exception 'FAIL dispatch changed';end if;
 begin
 perform public.kream_receive_with_review(oid,gen_random_uuid(),expected,actual,'stale');
 raise exception 'FAIL stale basis accepted';exception when serialization_failure then null;end;
 expected:=jsonb_build_array(jsonb_build_object('product_id',prod.id,'quantity',1));actual:=jsonb_build_array(jsonb_build_object('product_id',prod.id,'quantity',0));
 perform public.kream_receive_with_review(oid,gen_random_uuid(),expected,actual,case when branch='midland' then 'Still missing' else '' end);
 select on_hand into got from public.kream_stock where store_id=branch and product_id=prod.id;
 if got is distinct from 13 then raise exception 'FAIL missing receipt changed stock';end if;
 end loop;
end $test$;
rollback;
select 'PASS: only Midland requires discrepancy reason; four branches accept actual quantities; retries add stock once; zero missing and stale basis protected; dispatch unchanged; all test changes rolled back.' as verification;
