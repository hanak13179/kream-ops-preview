-- Shared preparation checks, separate from final dispatch/receipt inventory records.
create table public.kream_workflow_checks (
 workflow text not null check(workflow in ('dispatch','receiving')),
 order_id uuid not null references public.kream_orders(id) on delete cascade,
 product_id text not null,
 basis_quantity numeric not null,
 source_version text not null,
 quantity numeric not null check(quantity>=0 and quantity<=100000),
 checked boolean not null default false,
 revision bigint not null default 1,
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(workflow,order_id,product_id)
);
alter table public.kream_workflow_checks enable row level security;
revoke all on public.kream_workflow_checks from anon,authenticated;
grant select on public.kream_workflow_checks to authenticated;
create policy workflow_read on public.kream_workflow_checks for select to authenticated using (
 exists(select 1 from public.kream_profiles p where p.user_id=auth.uid() and p.active and not p.access_blocked) and exists(select 1 from public.kream_orders o where o.id=order_id and
 ((workflow='dispatch' and kream_private.current_role() in ('owner','factory'))
 or (workflow='receiving' and kream_private.can_order_store(o.store_id))))
);
create or replace function kream_private.workflow_lines(flow text, ids uuid[])
returns table(order_id uuid,product_id text,basis_quantity numeric,source_version text)
language sql stable security definer set search_path='' as $$
 select o.id,oi.product_id,
 greatest(0,case when flow='dispatch' then oi.quantity-coalesce(d.qty,0) else coalesce(d.qty,0)-coalesce(r.qty,0) end),
 coalesce(o.order_revision,0)::text||':'||coalesce((select max(v.created_at)::text from public.kream_receiving_reviews v where v.order_id=o.id),'')
 from public.kream_orders o join public.kream_order_items oi on oi.order_id=o.id
 left join lateral(select sum(i.quantity) qty from public.kream_dispatch_items i join public.kream_dispatches h on h.id=i.dispatch_id where h.order_id=o.id and i.product_id=oi.product_id)d on true
 left join lateral(select sum(i.quantity) qty from public.kream_receipt_items i join public.kream_receipts h on h.id=i.receipt_id where h.order_id=o.id and i.product_id=oi.product_id)r on true
 where o.id=any(ids) and exists(select 1 from public.kream_profiles p where p.user_id=auth.uid() and p.active and not p.access_blocked) and o.status<>'cancelled' and
 ((flow='dispatch' and o.dispatch_finalized_at is null and o.status not in ('dispatched','received') and kream_private.current_role() in ('owner','factory'))
 or(flow='receiving' and o.dispatch_finalized_at is not null and o.status<>'received' and kream_private.can_order_store(o.store_id)))
$$;
create or replace function public.kream_workflow_snapshot(flow text, ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('order_id',l.order_id,'product_id',l.product_id,'basis_quantity',l.basis_quantity,'source_version',l.source_version,'revision',coalesce(c.revision,0),'checked',coalesce(c.checked and c.source_version=l.source_version and c.basis_quantity=l.basis_quantity,false),'quantity',c.quantity) order by l.order_id,l.product_id),'[]'::jsonb)
 from kream_private.workflow_lines(flow,ids) l left join public.kream_workflow_checks c on c.workflow=flow and c.order_id=l.order_id and c.product_id=l.product_id where l.basis_quantity>0 and auth.uid() is not null
$$;
create or replace function public.kream_save_workflow_checks(flow text, changes jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare x jsonb; l record; old public.kream_workflow_checks%rowtype; ids uuid[]; q numeric;
begin
 if auth.uid() is null or flow not in ('dispatch','receiving') or jsonb_typeof(changes)<>'array' or jsonb_array_length(changes) not between 1 and 1000 then raise exception 'Invalid shared check' using errcode='42501';end if;
 if (select count(distinct (v->>'order_id',v->>'product_id')) from jsonb_array_elements(changes)v)<>jsonb_array_length(changes) then raise exception 'Duplicate check' using errcode='22023';end if;
 select array_agg(distinct (v->>'order_id')::uuid) into ids from jsonb_array_elements(changes)v;
 -- Same lock order as finalization. Nothing is written if any item is stale.
 perform 1 from public.kream_orders where id=any(ids) order by id for update;
 for x in select value from jsonb_array_elements(changes) order by value->>'order_id',value->>'product_id' loop
 select * into l from kream_private.workflow_lines(flow,ids) z where z.order_id=(x->>'order_id')::uuid and z.product_id=x->>'product_id' and z.basis_quantity>0;
 if not found then raise exception 'Workflow access or source changed' using errcode='42501';end if;
 select * into old from public.kream_workflow_checks c where c.workflow=flow and c.order_id=l.order_id and c.product_id=l.product_id;
 if coalesce(old.revision,0) is distinct from (x->>'revision')::bigint or l.source_version is distinct from x->>'source_version' or l.basis_quantity is distinct from (x->>'basis_quantity')::numeric then raise exception 'A coworker changed this item. Review the latest quantity.' using errcode='40001';end if;
 q:=(x->>'quantity')::numeric;
 if jsonb_typeof(x->'checked') is distinct from 'boolean' or jsonb_typeof(x->'quantity') is distinct from 'number' or q is null or q::text in('NaN','Infinity','-Infinity') or q<0 or q>100000 or q<>round(q,3) or (flow='dispatch' and (q>l.basis_quantity or q<>trunc(q))) then raise exception 'Invalid check quantity' using errcode='22023';end if;
 insert into public.kream_workflow_checks(workflow,order_id,product_id,basis_quantity,source_version,quantity,checked,revision,updated_by)
 values(flow,l.order_id,l.product_id,l.basis_quantity,l.source_version,q,(x->>'checked')::boolean,1,auth.uid())
 on conflict(workflow,order_id,product_id) do update set basis_quantity=excluded.basis_quantity,source_version=excluded.source_version,quantity=excluded.quantity,checked=excluded.checked,revision=public.kream_workflow_checks.revision+1,updated_by=auth.uid(),updated_at=now();
 end loop;
 return public.kream_workflow_snapshot(flow,ids);
end $$;
create or replace function kream_private.assert_workflow_final(flow text, target uuid, tokens jsonb, actual jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare latest jsonb; x jsonb; c jsonb;
begin
 select public.kream_workflow_snapshot(flow,array[target]) into latest;
 if jsonb_array_length(latest)=0 or jsonb_array_length(tokens)<>jsonb_array_length(latest) or jsonb_array_length(actual)<>jsonb_array_length(latest) then raise exception 'Shared check reference changed' using errcode='40001';end if;
 for x in select value from jsonb_array_elements(latest) loop
 select value into c from jsonb_array_elements(tokens) where value->>'product_id'=x->>'product_id';
 if c is null or not (x->>'checked')::boolean or c->>'revision' is distinct from x->>'revision' or c->>'source_version' is distinct from x->>'source_version' or not exists(select 1 from jsonb_array_elements(actual) a where a->>'product_id'=x->>'product_id' and (a->>'quantity')::numeric=(x->>'quantity')::numeric) then raise exception 'A coworker changed the checked quantities. Review before finalizing.' using errcode='40001';end if;
 end loop;
end $$;
create or replace function public.kream_finalize_shared_dispatch(target_order uuid,request_id uuid,expected_items jsonb,actual_items jsonb,dispatch_note text,check_tokens jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
 perform 1 from public.kream_orders where id=target_order for update;
 if not exists(select 1 from public.kream_dispatch_finalizations where id=request_id) then perform kream_private.assert_workflow_final('dispatch',target_order,check_tokens,actual_items);end if;
 result_id:=public.kream_finalize_dispatch(target_order,request_id,expected_items,actual_items,dispatch_note);
 update public.kream_workflow_checks set checked=false,revision=revision+1,updated_at=now() where workflow='dispatch' and order_id=target_order and checked;
 return result_id;
end $$;
create or replace function public.kream_receive_shared_review(target_order uuid,request_id uuid,expected_items jsonb,actual_items jsonb,receipt_note text,check_tokens jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
 perform 1 from public.kream_orders where id=target_order for update;
 if not exists(select 1 from public.kream_receiving_reviews where id=request_id) then perform kream_private.assert_workflow_final('receiving',target_order,check_tokens,actual_items);end if;
 result_id:=public.kream_receive_with_review(target_order,request_id,expected_items,actual_items,receipt_note);
 update public.kream_workflow_checks set checked=false,revision=revision+1,updated_at=now() where workflow='receiving' and order_id=target_order and checked;
 return result_id;
end $$;
revoke all on function public.kream_workflow_snapshot(text,uuid[]),public.kream_save_workflow_checks(text,jsonb),public.kream_finalize_shared_dispatch(uuid,uuid,jsonb,jsonb,text,jsonb),public.kream_receive_shared_review(uuid,uuid,jsonb,jsonb,text,jsonb) from public,anon;
grant execute on function public.kream_workflow_snapshot(text,uuid[]),public.kream_save_workflow_checks(text,jsonb),public.kream_finalize_shared_dispatch(uuid,uuid,jsonb,jsonb,text,jsonb),public.kream_receive_shared_review(uuid,uuid,jsonb,jsonb,text,jsonb) to authenticated;
revoke all on function kream_private.workflow_lines(text,uuid[]),kream_private.assert_workflow_final(text,uuid,jsonb,jsonb) from public,anon,authenticated;
do $$begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='kream_workflow_checks') then alter publication supabase_realtime add table public.kream_workflow_checks;end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='kream_orders') then alter publication supabase_realtime add table public.kream_orders;end if;
end $$;
