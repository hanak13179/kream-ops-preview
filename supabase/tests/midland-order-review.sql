-- Regression tests only. Every fixture, membership and order change is rolled back.
begin;
do $test$
declare staff uuid; manager uuid; owner_id uuid; basket public.kream_store_baskets%rowtype;
 legacy public.kream_drafts%rowtype; oid uuid; old_order uuid; future_date date;
 new_items jsonb:='[{"product_id":"milk","quantity":2}]'; result jsonb; revision bigint;
begin
 select user_id into staff from public.kream_profiles where active and role='employee' order by user_id limit 1;
 select user_id into manager from public.kream_profiles where active and role='midland_owner' limit 1;
 select user_id into owner_id from public.kream_profiles where active and role='owner' limit 1;
 if staff is null or manager is null or owner_id is null then raise exception 'Security test identities unavailable';end if;
 insert into public.kream_memberships(user_id,store_id) values(staff,'midland'),(staff,'finch') on conflict do nothing;
 future_date:=(clock_timestamp() at time zone 'America/Toronto')::date+2;
 select * into basket from public.kream_store_baskets where store_id='midland' and submitted_order_id is null for update;
 if not found then insert into public.kream_store_baskets(store_id,delivery_date,items,note,updated_by) values('midland',future_date,new_items,'ROLLBACK security test',staff) returning * into basket;
 else update public.kream_store_baskets set items=new_items,delivery_date=future_date,note='ROLLBACK security test',review_requested_at=null,review_requested_by=null,review_changed_since_request=false where id=basket.id returning * into basket;end if;
 select * into legacy from public.kream_drafts where user_id=staff and store_id='midland' and submitted_order_id is null for update;
 if not found then insert into public.kream_drafts(user_id,store_id,delivery_date,items,note) values(staff,'midland',future_date,new_items,'ROLLBACK legacy path') returning * into legacy;
 else update public.kream_drafts set items=new_items,delivery_date=future_date,note='ROLLBACK legacy path' where id=legacy.id returning * into legacy;end if;
 perform set_config('request.jwt.claim.sub',staff::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'role','authenticated')::text,true);
 set local role authenticated;
 if kream_private.can_finalize_midland() then raise exception 'Staff can finalize';end if;
 basket:=public.kream_request_midland_review(basket.id,basket.revision);
 if basket.review_requested_at is null or basket.review_requested_by<>staff then raise exception 'Review request missing';end if;
 begin perform public.kream_submit_store_basket(basket.id,basket.revision);raise exception 'Staff final submission unexpectedly succeeded';
 exception when insufficient_privilege then if sqlerrm<>'MIDLAND_MANAGER_REQUIRED' then raise;end if;end;
 begin perform public.kream_submit_order(legacy.id,legacy.revision);raise exception 'Legacy staff final submission unexpectedly succeeded';
 exception when insufficient_privilege then if sqlerrm<>'MIDLAND_MANAGER_REQUIRED' then raise;end if;end;
 basket:=public.kream_save_store_basket('midland',basket.id,basket.items,'[{"product_id":"milk","quantity":3}]',basket.note,basket.note,basket.delivery_date,basket.delivery_date);
 if not basket.review_changed_since_request then raise exception 'Later staff edits not flagged';end if;
 basket:=public.kream_request_midland_review(basket.id,basket.revision);
 if basket.review_changed_since_request then raise exception 'Repeat review request did not clear change flag';end if;
 perform set_config('request.jwt.claim.sub',manager::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated')::text,true);
 if not kream_private.can_finalize_midland() then raise exception 'Midland manager cannot finalize';end if;
 oid:=public.kream_submit_store_basket(basket.id,basket.revision);
 if not exists(select 1 from public.kream_orders where id=oid and status='submitted') then raise exception 'Manager final submission missing';end if;
 if public.kream_submit_store_basket(basket.id,basket.revision)<>oid then raise exception 'Submission retry duplicated order';end if;
 result:=public.kream_revise_midland_order(oid,1,'[{"product_id":"milk","quantity":4},{"product_id":"oat","quantity":1}]','Manager revision',future_date);
 if (result->>'order_revision')::bigint<>2 or (select quantity from public.kream_order_items where order_id=oid and product_id='milk')<>4 then raise exception 'Manager revision failed';end if;
 if (select count(*) from public.kream_midland_order_revisions where order_id=oid)<>1 then raise exception 'Revision audit missing';end if;
 begin perform public.kream_revise_midland_order(oid,1,new_items,'stale',future_date);raise exception 'Stale editor unexpectedly succeeded';
 exception when serialization_failure then if sqlerrm<>'ORDER_CHANGED' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',staff::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'role','authenticated')::text,true);
 begin perform public.kream_revise_midland_order(oid,2,new_items,'staff edit',future_date);raise exception 'Staff edited final order';
 exception when insufficient_privilege then if sqlerrm<>'MIDLAND_MANAGER_REQUIRED' then raise;end if;end;
 if exists(select 1 from public.kream_midland_order_revisions where order_id=oid) then raise exception 'Staff read manager audit';end if;
 -- Existing non-Midland submission still works for an employee.
 reset role;
 select * into legacy from public.kream_drafts where user_id=staff and store_id='finch' and submitted_order_id is null for update;
 if not found then insert into public.kream_drafts(user_id,store_id,delivery_date,items,note) values(staff,'finch',future_date,new_items,'ROLLBACK other store') returning * into legacy;
 else update public.kream_drafts set items=new_items,delivery_date=future_date,note='ROLLBACK other store' where id=legacy.id returning * into legacy;end if;
 set local role authenticated;
 old_order:=public.kream_submit_order(legacy.id,legacy.revision);
 if old_order is null then raise exception 'Other-store employee submission failed';end if;
 reset role;
 perform set_config('request.jwt.claim.sub',manager::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated')::text,true);
 update public.kream_orders set delivery_date=future_date-10 where id=oid;
 set local role authenticated;
 begin perform public.kream_revise_midland_order(oid,2,new_items,'move past order into future',future_date);raise exception 'Expired order deadline was bypassed';
 exception when invalid_parameter_value then if sqlerrm<>'MIDLAND_EDIT_CLOSED' then raise;end if;end;
 reset role;
 update public.kream_orders set delivery_date=future_date,dispatch_finalized_at=clock_timestamp() where id=oid;
 set local role authenticated;
 begin perform public.kream_revise_midland_order(oid,2,new_items,'after dispatch',future_date);raise exception 'Dispatched order revision succeeded';
 exception when serialization_failure then if sqlerrm<>'ORDER_FULFILLMENT_STARTED' then raise;end if;end;
 if not kream_private.midland_edit_open('2026-11-20','2026-11-20 07:59:59+00')
 or kream_private.midland_edit_open('2026-11-20','2026-11-20 08:00:00+00')
 or not kream_private.midland_edit_open('2026-07-20','2026-07-20 06:59:59+00')
 or kream_private.midland_edit_open('2026-07-20','2026-07-20 07:00:00+00') then raise exception 'Toronto 3AM DST boundary failed';end if;
 reset role;
 if has_function_privilege('anon','public.kream_request_midland_review(uuid,bigint)','execute')
 or has_function_privilege('anon','public.kream_revise_midland_order(uuid,bigint,jsonb,text,date)','execute')
 or has_table_privilege('authenticated','public.kream_orders','insert')
 or has_table_privilege('authenticated','public.kream_order_items','update') then raise exception 'Unexpected anonymous or direct table write access';end if;
 raise notice 'PASS: staff review only, legacy path blocked, manager final/revision, audit isolation, concurrency, other stores, dispatch guard and Toronto 3AM/DST.';
end $test$;
rollback;
