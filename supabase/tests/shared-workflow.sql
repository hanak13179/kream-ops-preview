begin;
insert into auth.users(id,email) values
('b6000000-0000-4000-8000-000000000001','workflow-factory1@example.invalid'),
('b6000000-0000-4000-8000-000000000002','workflow-factory2@example.invalid'),
('b6000000-0000-4000-8000-000000000003','workflow-store1@example.invalid'),
('b6000000-0000-4000-8000-000000000004','workflow-store2@example.invalid');
insert into public.kream_profiles(user_id,display_name,role,active) values
('b6000000-0000-4000-8000-000000000001','Workflow factory 1','factory',true),
('b6000000-0000-4000-8000-000000000002','Workflow factory 2','factory',true),
('b6000000-0000-4000-8000-000000000003','Workflow store 1','employee',true),
('b6000000-0000-4000-8000-000000000004','Workflow store 2','employee',true) on conflict(user_id) do update set display_name=excluded.display_name,role=excluded.role,active=true;
insert into public.kream_stores(id,name) values('workflow-test','Workflow test'),('workflow-other','Workflow other');
insert into public.kream_memberships(user_id,store_id) values('b6000000-0000-4000-8000-000000000003','workflow-test'),('b6000000-0000-4000-8000-000000000004','workflow-other');
insert into public.kream_catalog(id,name_ko,name_en,order_unit,unit_confirmed) values('workflow-a','검증 A','Test A','EA',true),('workflow-b','검증 B','Test B','EA',true);
insert into public.kream_orders(id,source_draft_id,source_revision,created_by,store_id,delivery_date,note) values('b6100000-0000-4000-8000-000000000001',gen_random_uuid(),1,'b6000000-0000-4000-8000-000000000003','workflow-test',current_date,'Workflow verification');
insert into public.kream_order_items(order_id,product_id,name_ko,name_en,order_unit,quantity) values('b6100000-0000-4000-8000-000000000001','workflow-a','검증 A','Test A','EA',4),('b6100000-0000-4000-8000-000000000001','workflow-b','검증 B','Test B','EA',2);
set local role authenticated;
do $test$
declare oid uuid='b6100000-0000-4000-8000-000000000001';snap jsonb;old jsonb;tokens jsonb;actual jsonb;basis jsonb;req uuid=gen_random_uuid();rec uuid=gen_random_uuid();x jsonb;
begin
 perform set_config('request.jwt.claim.sub','b6000000-0000-4000-8000-000000000001',true);
 snap:=public.kream_workflow_snapshot('dispatch',array[oid]);old:=snap;
 select value into x from jsonb_array_elements(snap) where value->>'product_id'='workflow-a';
 perform public.kream_save_workflow_checks('dispatch',jsonb_build_array(x||'{"quantity":4,"checked":true}'));
 perform set_config('request.jwt.claim.sub','b6000000-0000-4000-8000-000000000002',true);
 select value into x from jsonb_array_elements(old) where value->>'product_id'='workflow-b';
 perform public.kream_save_workflow_checks('dispatch',jsonb_build_array(x||'{"quantity":2,"checked":true}'));
 select value into x from jsonb_array_elements(old) where value->>'product_id'='workflow-a';
 begin perform public.kream_save_workflow_checks('dispatch',jsonb_build_array(x||'{"quantity":3,"checked":true}'));raise exception 'FAIL stale writer';exception when serialization_failure then null;end;
 snap:=public.kream_workflow_snapshot('dispatch',array[oid]);tokens:=snap;
 select value into x from jsonb_array_elements(snap) where value->>'product_id'='workflow-a';
 perform public.kream_save_workflow_checks('dispatch',jsonb_build_array(x||'{"quantity":3,"checked":true}'));
 basis:='[{"product_id":"workflow-a","quantity":4},{"product_id":"workflow-b","quantity":2}]';actual:='[{"product_id":"workflow-a","quantity":3},{"product_id":"workflow-b","quantity":2}]';
 begin perform public.kream_finalize_shared_dispatch(oid,req,basis,actual,'',tokens);raise exception 'FAIL stale finalization';exception when serialization_failure then null;end;
 tokens:=public.kream_workflow_snapshot('dispatch',array[oid]);
 perform public.kream_finalize_shared_dispatch(oid,req,basis,actual,'',tokens);
 perform public.kream_finalize_shared_dispatch(oid,req,basis,actual,'',tokens);
 if public.kream_workflow_snapshot('dispatch',array[oid])<>'[]' then raise exception 'FAIL closed dispatch';end if;
 perform set_config('request.jwt.claim.sub','b6000000-0000-4000-8000-000000000004',true);
 if public.kream_workflow_snapshot('receiving',array[oid])<>'[]' then raise exception 'FAIL foreign store snapshot';end if;
 if exists(select 1 from public.kream_workflow_checks where order_id=oid) then raise exception 'FAIL RLS foreign store';end if;
 perform set_config('request.jwt.claim.sub','b6000000-0000-4000-8000-000000000003',true);
 snap:=public.kream_workflow_snapshot('receiving',array[oid]);
 select jsonb_agg(value||jsonb_build_object('quantity',case when value->>'product_id'='workflow-a' then 2 else 2 end,'checked',true)) into x from jsonb_array_elements(snap);
 perform public.kream_save_workflow_checks('receiving',x);
 tokens:=public.kream_workflow_snapshot('receiving',array[oid]);basis:=actual;actual:='[{"product_id":"workflow-a","quantity":2},{"product_id":"workflow-b","quantity":2}]';
 perform public.kream_receive_shared_review(oid,rec,basis,actual,'',tokens);
 perform public.kream_receive_shared_review(oid,rec,basis,actual,'',tokens);
 if (select on_hand from public.kream_stock where store_id='workflow-test' and product_id='workflow-a')<>2 then raise exception 'FAIL duplicate inventory';end if;
 snap:=public.kream_workflow_snapshot('receiving',array[oid]);
 if exists(select 1 from jsonb_array_elements(snap) v where (v->>'checked')::boolean) then raise exception 'FAIL checks reused after partial receipt';end if;
 begin perform public.kream_save_workflow_checks('dispatch',old);raise exception 'FAIL employee dispatch';exception when insufficient_privilege then null;end;
end $test$;
reset role;
update public.kream_profiles set access_blocked=true where user_id='b6000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','b6000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$begin if public.kream_workflow_snapshot('dispatch',array['b6100000-0000-4000-8000-000000000001'::uuid])<>'[]' then raise exception 'FAIL blocked factory';end if;end $$;
reset role;
rollback;
select 'PASS: separate coworkers, stale writes and finalizations blocked, retry is idempotent, receiving stock once, foreign-store RLS, shared checks reset; all fixtures rolled back' as result;
