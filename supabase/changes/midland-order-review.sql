-- Midland: staff request review; managers finalize. Existing submitted orders
-- can be revised before 03:00 America/Toronto on their requested receipt day.
alter table public.kream_store_baskets
 add column review_requested_at timestamptz,
 add column review_requested_by uuid references public.kream_profiles(user_id),
 add column review_changed_since_request boolean not null default false;
alter table public.kream_orders
 add column order_revision bigint not null default 1,
 add column amended_at timestamptz,
 add column amended_by uuid references public.kream_profiles(user_id);

create function kream_private.can_finalize_midland()
returns boolean language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and kream_private.can_order_store('midland')
 and exists(select 1 from public.kream_profiles p where p.user_id=auth.uid()
 and p.active and (p.role in ('owner','manager','midland_owner')
 or p.role='factory' and p.factory_manager and p.store_manager)) $$;
revoke all on function kream_private.can_finalize_midland() from public,anon;
grant execute on function kream_private.can_finalize_midland() to authenticated;

create function kream_private.midland_edit_open(receipt_date date, at_time timestamptz)
returns boolean language sql immutable security invoker set search_path=''
as $$ select receipt_date is not null and at_time < ((receipt_date + time '03:00') at time zone 'America/Toronto') $$;
revoke all on function kream_private.midland_edit_open(date,timestamptz) from public,anon;
grant execute on function kream_private.midland_edit_open(date,timestamptz) to authenticated;

create function kream_private.midland_insert_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$ begin
 if new.store_id='midland' and new.source_kind='store'
 and not kream_private.can_finalize_midland() then
  raise exception 'MIDLAND_MANAGER_REQUIRED' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function kream_private.midland_insert_guard() from public,anon,authenticated;
create trigger midland_final_submission before insert on public.kream_orders
 for each row execute function kream_private.midland_insert_guard();

create function kream_private.basket_review_changed()
returns trigger language plpgsql security invoker set search_path=''
as $$ begin
 if new.store_id='midland' and new.submitted_order_id is null and old.review_requested_at is not null
 and (new.items is distinct from old.items or new.note is distinct from old.note or new.delivery_date is distinct from old.delivery_date) then
  new.review_changed_since_request:=true;
 end if;
 return new;
end $$;
revoke all on function kream_private.basket_review_changed() from public,anon,authenticated;
create trigger basket_review_change before update on public.kream_store_baskets
 for each row execute function kream_private.basket_review_changed();

create function kream_private.request_midland_review(draft_id uuid,expected_revision bigint)
returns public.kream_store_baskets language plpgsql security definer set search_path=''
as $$ declare b public.kream_store_baskets%rowtype;
begin
 if auth.uid() is null or not kream_private.can_order_store('midland') then raise exception 'Basket access denied' using errcode='42501';end if;
 select * into b from public.kream_store_baskets where id=draft_id and store_id='midland' for update;
 if not found then raise exception 'BASKET_CHANGED' using errcode='40001';end if;
 if b.submitted_order_id is not null then raise exception 'ALREADY_SUBMITTED' using errcode='40001';end if;
 if expected_revision is null or expected_revision<>b.revision then raise exception 'BASKET_CHANGED' using errcode='40001';end if;
 if jsonb_array_length(b.items)=0 then raise exception 'EMPTY_ORDER' using errcode='22023';end if;
 update public.kream_store_baskets set review_requested_at=clock_timestamp(),review_requested_by=auth.uid(),review_changed_since_request=false,updated_by=auth.uid()
 where id=b.id returning * into b;
 return b;
end $$;
revoke all on function kream_private.request_midland_review(uuid,bigint) from public,anon;
grant execute on function kream_private.request_midland_review(uuid,bigint) to authenticated;
create function public.kream_request_midland_review(draft_id uuid,expected_revision bigint)
returns public.kream_store_baskets language sql security invoker set search_path=''
as $$ select kream_private.request_midland_review(draft_id,expected_revision) $$;
revoke all on function public.kream_request_midland_review(uuid,bigint) from public,anon;
grant execute on function public.kream_request_midland_review(uuid,bigint) to authenticated;

create table public.kream_midland_order_revisions(
 id bigint generated always as identity primary key,
 order_id uuid not null references public.kream_orders(id),
 actor_id uuid not null references public.kream_profiles(user_id),
 changed_at timestamptz not null default clock_timestamp(),
 before_value jsonb not null,
 after_value jsonb not null
);
alter table public.kream_midland_order_revisions enable row level security;
revoke all on public.kream_midland_order_revisions from public,anon,authenticated;
grant select on public.kream_midland_order_revisions to authenticated;
create policy midland_revision_read on public.kream_midland_order_revisions
 for select to authenticated using ((select kream_private.can_finalize_midland()));

create function kream_private.revise_midland_order(target_order uuid,expected_revision bigint,new_items jsonb,new_note text,new_date date)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare o public.kream_orders%rowtype; x jsonb; p public.kream_catalog%rowtype; ids text[]:='{}'; pid text; q numeric; before_items jsonb; after_items jsonb; before_value jsonb; rev bigint; at_time timestamptz;
begin
 if auth.uid() is null or not kream_private.can_finalize_midland() then raise exception 'MIDLAND_MANAGER_REQUIRED' using errcode='42501';end if;
 select * into o from public.kream_orders where id=target_order and store_id='midland' and source_kind='store' for update;
 if not found then raise exception 'ORDER_UNAVAILABLE' using errcode='42501';end if;
 if expected_revision is null or expected_revision<>o.order_revision then raise exception 'ORDER_CHANGED' using errcode='40001';end if;
 at_time:=clock_timestamp();
 if not kream_private.midland_edit_open(o.delivery_date,at_time) or not kream_private.midland_edit_open(new_date,at_time) then raise exception 'MIDLAND_EDIT_CLOSED' using errcode='22023';end if;
 if o.status not in ('submitted','confirmed') or o.dispatch_finalized_at is not null
 or exists(select 1 from public.kream_dispatches where order_id=o.id)
 or exists(select 1 from public.kream_receipts where order_id=o.id) then raise exception 'ORDER_FULFILLMENT_STARTED' using errcode='40001';end if;
 if new_note is null or length(new_note)>2000 or jsonb_typeof(new_items) is distinct from 'array'
 or jsonb_array_length(new_items) not between 1 and 500 then raise exception 'INVALID_ORDER_REVISION' using errcode='22023';end if;
 for x in select value from jsonb_array_elements(new_items) loop
  pid:=x->>'product_id';
  if pid is null or pid=any(ids) or jsonb_typeof(x->'quantity') is distinct from 'number' then raise exception 'INVALID_QUANTITY' using errcode='22023';end if;
  q:=(x->>'quantity')::numeric;
  if q<=0 or q>100000 or q<>trunc(q) or q::text in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_QUANTITY' using errcode='22023';end if;
  select * into p from public.kream_catalog where id=pid and active and not archived and unit_confirmed for share;
  if not found then raise exception 'STORE_UNAVAILABLE' using errcode='22023';end if;
  ids:=array_append(ids,pid);
 end loop;
 select jsonb_agg(to_jsonb(i) - 'order_id' order by i.product_id) into before_items from public.kream_order_items i where i.order_id=o.id;
 before_value:=jsonb_build_object('delivery_date',o.delivery_date,'note',o.note,'revision',o.order_revision,'items',before_items);
 delete from public.kream_order_items where order_id=o.id and not(product_id=any(ids));
 for x in select value from jsonb_array_elements(new_items) loop
  pid:=x->>'product_id';q:=(x->>'quantity')::numeric;
  update public.kream_order_items set quantity=q where order_id=o.id and product_id=pid;
  if not found then insert into public.kream_order_items(order_id,product_id,name_ko,name_en,order_unit,quantity)
   select o.id,id,name_ko,name_en,order_unit,q from public.kream_catalog where id=pid;end if;
 end loop;
 update public.kream_store_baskets set items=new_items,note=new_note,delivery_date=new_date,updated_by=auth.uid()
 where id=o.source_draft_id and submitted_order_id=o.id returning revision into rev;
 update public.kream_orders set delivery_date=new_date,note=new_note,order_revision=order_revision+1,amended_at=clock_timestamp(),amended_by=auth.uid(),source_revision=coalesce(rev,source_revision)
 where id=o.id returning * into o;
 select jsonb_agg(to_jsonb(i) - 'order_id' order by i.product_id) into after_items from public.kream_order_items i where i.order_id=o.id;
 insert into public.kream_midland_order_revisions(order_id,actor_id,before_value,after_value)
 values(o.id,auth.uid(),before_value,jsonb_build_object('delivery_date',o.delivery_date,'note',o.note,'revision',o.order_revision,'items',after_items));
 return to_jsonb(o)||jsonb_build_object('kream_order_items',after_items);
end $$;
revoke all on function kream_private.revise_midland_order(uuid,bigint,jsonb,text,date) from public,anon;
grant execute on function kream_private.revise_midland_order(uuid,bigint,jsonb,text,date) to authenticated;
create function public.kream_revise_midland_order(target_order uuid,expected_revision bigint,new_items jsonb,new_note text,new_date date)
returns jsonb language sql security invoker set search_path=''
as $$ select kream_private.revise_midland_order(target_order,expected_revision,new_items,new_note,new_date) $$;
revoke all on function public.kream_revise_midland_order(uuid,bigint,jsonb,text,date) from public,anon;
grant execute on function public.kream_revise_midland_order(uuid,bigint,jsonb,text,date) to authenticated;
