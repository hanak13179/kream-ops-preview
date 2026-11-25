do $migration$
declare current_definition text;
begin
 select pg_get_functiondef('public.kream_receive_with_review(uuid,uuid,jsonb,jsonb,text)'::regprocedure) into current_definition;
 if current_definition <> $reviewed$CREATE OR REPLACE FUNCTION public.kream_receive_with_review(target_order uuid, request_id uuid, expected_items jsonb, actual_items jsonb, receipt_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.kream_orders%rowtype;old public.kream_receiving_reviews%rowtype;expected jsonb;actual jsonb;item jsonb;pid text;qty numeric;positive boolean:=false;diff boolean;author text;
begin
 if auth.uid() is null or request_id is null then raise exception 'Receipt denied' using errcode='42501';end if;
 select * into o from public.kream_orders where id=target_order for update;
 if o.id is null or not coalesce(kream_private.can_order_store(o.store_id),false) then raise exception 'Receipt denied' using errcode='42501';end if;
 select * into old from public.kream_receiving_reviews where id=request_id;
 if found then if old.order_id<>target_order or old.recorded_by<>auth.uid() or old.actual_items<>actual_items or old.expected_items<>expected_items or old.note<>receipt_note then raise exception 'Receipt retry changed' using errcode='22023';end if;return request_id;end if;
 if o.dispatch_finalized_at is null then raise exception 'Dispatch confirmation required before receipt' using errcode='22023';end if;
 if o.status='cancelled' or receipt_note is null or char_length(receipt_note)>2000 or jsonb_typeof(actual_items) is distinct from 'array' or jsonb_typeof(expected_items) is distinct from 'array' then raise exception 'Invalid receipt' using errcode='22023';end if;
 if o.store_id='midland' and not exists(select 1 from public.kream_dispatches where order_id=o.id) then raise exception 'Dispatch record required for Midland' using errcode='22023';end if;
 with quantities as(select oi.product_id,greatest(0,(case when exists(select 1 from public.kream_dispatches where order_id=o.id) then (select coalesce(sum(di.quantity),0) from public.kream_dispatch_items di join public.kream_dispatches d on d.id=di.dispatch_id where d.order_id=o.id and di.product_id=oi.product_id) else oi.quantity end)-(select coalesce(sum(ri.quantity),0) from public.kream_receipt_items ri join public.kream_receipts r on r.id=ri.receipt_id where r.order_id=o.id and ri.product_id=oi.product_id)) quantity from public.kream_order_items oi where oi.order_id=o.id)
 select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity) order by product_id),'[]') into expected from quantities where quantity>0;
 if expected='[]'::jsonb or expected<>expected_items then raise exception 'Receipt reference changed' using errcode='40001';end if;
 if jsonb_array_length(actual_items)<>jsonb_array_length(expected) then raise exception 'Enter every item, including zero for missing' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(actual_items) loop
 pid:=item->>'product_id';qty:=(item->>'quantity')::numeric;
 if pid is null or not exists(select 1 from jsonb_array_elements(expected) e where e->>'product_id'=pid) or qty is null or qty::text in('NaN','Infinity','-Infinity') or qty<0 or qty>100000 or qty<>round(qty,3) then raise exception 'Invalid actual quantity' using errcode='22023';end if;
 end loop;
 if (select count(distinct x->>'product_id') from jsonb_array_elements(actual_items) x)<>jsonb_array_length(actual_items) then raise exception 'Duplicate item' using errcode='22023';end if;
 select jsonb_agg(jsonb_build_object('product_id',x->>'product_id','quantity',(x->>'quantity')::numeric) order by x->>'product_id') into actual from jsonb_array_elements(actual_items) x;
 diff:=actual<>expected;
 if diff and char_length(trim(receipt_note))=0 then raise exception 'Difference requires reason' using errcode='22023';end if;
 select display_name into author from public.kream_profiles where user_id=auth.uid();
 insert into public.kream_receiving_reviews(id,order_id,store_id,expected_items,actual_items,note,status,recorded_by,recorded_name) values(request_id,o.id,o.store_id,expected_items,actual_items,receipt_note,case when diff then 'open' else 'matched' end,auth.uid(),author);
 if exists(select 1 from jsonb_array_elements(actual) x where (x->>'quantity')::numeric>0) then
 insert into public.kream_receipts(id,order_id,store_id,received_by,note) values(request_id,o.id,o.store_id,auth.uid(),receipt_note);
 for item in select value from jsonb_array_elements(actual) order by value->>'product_id' loop
 pid:=item->>'product_id';qty:=(item->>'quantity')::numeric;
 if qty>0 then
 insert into public.kream_receipt_items values(request_id,pid,qty);
 perform pg_advisory_xact_lock(hashtextextended(o.store_id||':'||pid,0));
 insert into public.kream_stock(store_id,product_id,on_hand,counted_by)
 values(o.store_id,pid,qty,auth.uid())
 on conflict(store_id,product_id) do update
 set on_hand=coalesce(public.kream_stock.on_hand,0)+excluded.on_hand;
 end if;end loop;end if;
 if not exists(select 1 from public.kream_order_items oi where oi.order_id=o.id and oi.quantity>(select coalesce(sum(ri.quantity),0) from public.kream_receipt_items ri join public.kream_receipts r on r.id=ri.receipt_id where r.order_id=o.id and ri.product_id=oi.product_id)) then update public.kream_orders set status='received' where id=o.id;end if;
 return request_id;
end$function$
$reviewed$ then raise exception 'Receiving function changed; review before retrying'; end if;
 execute $replacement$CREATE OR REPLACE FUNCTION public.kream_receive_with_review(target_order uuid, request_id uuid, expected_items jsonb, actual_items jsonb, receipt_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.kream_orders%rowtype;old public.kream_receiving_reviews%rowtype;expected jsonb;actual jsonb;item jsonb;pid text;qty numeric;positive boolean:=false;diff boolean;author text;
begin
 if auth.uid() is null or request_id is null then raise exception 'Receipt denied' using errcode='42501';end if;
 select * into o from public.kream_orders where id=target_order for update;
 if o.id is null or not coalesce(kream_private.can_order_store(o.store_id),false) then raise exception 'Receipt denied' using errcode='42501';end if;
 select * into old from public.kream_receiving_reviews where id=request_id;
 if found then if old.order_id<>target_order or old.recorded_by<>auth.uid() or old.actual_items<>actual_items or old.expected_items<>expected_items or old.note<>receipt_note then raise exception 'Receipt retry changed' using errcode='22023';end if;return request_id;end if;
 if o.dispatch_finalized_at is null then raise exception 'Dispatch confirmation required before receipt' using errcode='22023';end if;
 if o.status='cancelled' or receipt_note is null or char_length(receipt_note)>2000 or jsonb_typeof(actual_items) is distinct from 'array' or jsonb_typeof(expected_items) is distinct from 'array' then raise exception 'Invalid receipt' using errcode='22023';end if;
 if o.store_id='midland' and not exists(select 1 from public.kream_dispatches where order_id=o.id) then raise exception 'Dispatch record required for Midland' using errcode='22023';end if;
 with quantities as(select oi.product_id,greatest(0,(case when exists(select 1 from public.kream_dispatches where order_id=o.id) then (select coalesce(sum(di.quantity),0) from public.kream_dispatch_items di join public.kream_dispatches d on d.id=di.dispatch_id where d.order_id=o.id and di.product_id=oi.product_id) else oi.quantity end)-(select coalesce(sum(ri.quantity),0) from public.kream_receipt_items ri join public.kream_receipts r on r.id=ri.receipt_id where r.order_id=o.id and ri.product_id=oi.product_id)) quantity from public.kream_order_items oi where oi.order_id=o.id)
 select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity) order by product_id),'[]') into expected from quantities where quantity>0;
 if expected='[]'::jsonb or expected<>expected_items then raise exception 'Receipt reference changed' using errcode='40001';end if;
 if jsonb_array_length(actual_items)<>jsonb_array_length(expected) then raise exception 'Enter every item, including zero for missing' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(actual_items) loop
 pid:=item->>'product_id';qty:=(item->>'quantity')::numeric;
 if pid is null or not exists(select 1 from jsonb_array_elements(expected) e where e->>'product_id'=pid) or qty is null or qty::text in('NaN','Infinity','-Infinity') or qty<0 or qty>100000 or qty<>round(qty,3) then raise exception 'Invalid actual quantity' using errcode='22023';end if;
 end loop;
 if (select count(distinct x->>'product_id') from jsonb_array_elements(actual_items) x)<>jsonb_array_length(actual_items) then raise exception 'Duplicate item' using errcode='22023';end if;
 select jsonb_agg(jsonb_build_object('product_id',x->>'product_id','quantity',(x->>'quantity')::numeric) order by x->>'product_id') into actual from jsonb_array_elements(actual_items) x;
 diff:=actual<>expected;
 if o.store_id='midland' and diff and char_length(trim(receipt_note))=0 then raise exception 'Difference requires reason' using errcode='22023';end if;
 select display_name into author from public.kream_profiles where user_id=auth.uid();
 insert into public.kream_receiving_reviews(id,order_id,store_id,expected_items,actual_items,note,status,recorded_by,recorded_name) values(request_id,o.id,o.store_id,expected_items,actual_items,receipt_note,case when diff then 'open' else 'matched' end,auth.uid(),author);
 if exists(select 1 from jsonb_array_elements(actual) x where (x->>'quantity')::numeric>0) then
 insert into public.kream_receipts(id,order_id,store_id,received_by,note) values(request_id,o.id,o.store_id,auth.uid(),receipt_note);
 for item in select value from jsonb_array_elements(actual) order by value->>'product_id' loop
 pid:=item->>'product_id';qty:=(item->>'quantity')::numeric;
 if qty>0 then
 insert into public.kream_receipt_items values(request_id,pid,qty);
 perform pg_advisory_xact_lock(hashtextextended(o.store_id||':'||pid,0));
 insert into public.kream_stock(store_id,product_id,on_hand,counted_by)
 values(o.store_id,pid,qty,auth.uid())
 on conflict(store_id,product_id) do update
 set on_hand=coalesce(public.kream_stock.on_hand,0)+excluded.on_hand;
 end if;end loop;end if;
 if not exists(select 1 from public.kream_order_items oi where oi.order_id=o.id and oi.quantity>(select coalesce(sum(ri.quantity),0) from public.kream_receipt_items ri join public.kream_receipts r on r.id=ri.receipt_id where r.order_id=o.id and ri.product_id=oi.product_id)) then update public.kream_orders set status='received' where id=o.id;end if;
 return request_id;
end$function$
$replacement$;
end $migration$;
