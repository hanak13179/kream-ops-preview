create table kream_private.preorder_connection (
 source text primary key check(source='website'),
 token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default true
);
revoke all on kream_private.preorder_connection from public,anon,authenticated;

create table public.kream_cake_reservations (
 source_order_id bigint primary key check(source_order_id>0),
 order_number text not null check(length(order_number) between 1 and 50),
 status text not null check(status in ('pending','on-hold','processing','completed','cancelled','refunded','failed','trash')),
 store_id text references public.kream_stores(id),
 pickup_location text not null default '',
 pickup_date date,
 pickup_time time,
 customer_note text not null default '' check(length(customer_note)<=10000),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=100),
 source_modified_at timestamptz not null,
 source_exported_at timestamptz not null,
 content_hash text not null,
 reviewed_hash text,
 reviewed_at timestamptz,
 reviewed_by uuid references public.kream_profiles(user_id),
 synced_at timestamptz not null default now()
);
create index kream_cake_reservations_store_pickup_idx on public.kream_cake_reservations(store_id,pickup_date,pickup_time);
alter table public.kream_cake_reservations enable row level security;
revoke all on public.kream_cake_reservations from public,anon,authenticated;
grant select on public.kream_cake_reservations to authenticated;

create function kream_private.can_read_cake_reservation(target_store text)
returns boolean language sql stable security definer set search_path=''
as $$select exists(select 1 from public.kream_profiles p where p.user_id=auth.uid() and p.active and not p.access_blocked and (p.role='owner' or kream_private.can_order_store(target_store)))$$;
revoke all on function kream_private.can_read_cake_reservation(text) from public,anon;
grant execute on function kream_private.can_read_cake_reservation(text) to authenticated;
create policy cake_reservations_read on public.kream_cake_reservations for select to authenticated using(kream_private.can_read_cake_reservation(store_id));

create table public.kream_preorder_sync_status (
 source text primary key check(source='website'),
 last_received_at timestamptz not null,
 orders_received integer not null default 0
);
alter table public.kream_preorder_sync_status enable row level security;
revoke all on public.kream_preorder_sync_status from public,anon,authenticated;
grant select on public.kream_preorder_sync_status to authenticated;
create policy preorder_sync_status_read on public.kream_preorder_sync_status for select to authenticated using(exists(select 1 from public.kream_profiles p where p.user_id=auth.uid() and p.active and not p.access_blocked));

create function public.kream_receive_reservations(sync_token text,orders jsonb)
returns integer language plpgsql security definer set search_path=''
as $$declare row jsonb; sid text; h text; n integer=0;
begin
 if sync_token is null or sync_token !~ '^[a-f0-9]{64}$' or not exists(select 1 from kream_private.preorder_connection c where c.source='website' and c.enabled and c.token_hash=encode(extensions.digest(sync_token,'sha256'),'hex')) then raise exception 'Unauthorized' using errcode='42501';end if;
 if jsonb_typeof(orders) is distinct from 'array' or jsonb_array_length(orders) not between 1 and 50 then raise exception 'Invalid orders';end if;
 for row in select value from jsonb_array_elements(orders) loop
  sid=row->>'store_id';
  if sid is not null and sid not in ('finch','downtown','midland','richmond-hill') then raise exception 'Invalid store';end if;
  h=encode(extensions.digest(jsonb_build_object('store_id',sid,'pickup_date',row->>'pickup_date','pickup_time',row->>'pickup_time','status',row->>'status','customer_note',row->>'customer_note','items',row->'items')::text,'sha256'),'hex');
  insert into public.kream_cake_reservations(source_order_id,order_number,status,store_id,pickup_location,pickup_date,pickup_time,customer_note,items,source_modified_at,source_exported_at,content_hash)
  values((row->>'source_order_id')::bigint,row->>'order_number',row->>'status',sid,coalesce(row->>'pickup_location',''),(row->>'pickup_date')::date,(row->>'pickup_time')::time,coalesce(row->>'customer_note',''),row->'items',(row->>'source_modified_at')::timestamptz,(row->>'source_exported_at')::timestamptz,h)
  on conflict(source_order_id) do update set order_number=excluded.order_number,status=excluded.status,store_id=excluded.store_id,pickup_location=excluded.pickup_location,pickup_date=excluded.pickup_date,pickup_time=excluded.pickup_time,customer_note=excluded.customer_note,items=excluded.items,source_modified_at=excluded.source_modified_at,source_exported_at=excluded.source_exported_at,content_hash=excluded.content_hash,synced_at=now()
  where (excluded.source_modified_at,excluded.source_exported_at)>=(kream_cake_reservations.source_modified_at,kream_cake_reservations.source_exported_at);
  n=n+1;
 end loop;
 insert into public.kream_preorder_sync_status(source,last_received_at,orders_received) values('website',now(),n)
 on conflict(source) do update set last_received_at=excluded.last_received_at,orders_received=kream_preorder_sync_status.orders_received+n;
 return n;
end$$;
revoke all on function public.kream_receive_reservations(text,jsonb) from public,anon,authenticated;
grant execute on function public.kream_receive_reservations(text,jsonb) to service_role;

create function public.kream_review_cake_reservation(order_id bigint,expected_hash text,reviewed boolean)
returns void language plpgsql security definer set search_path=''
as $$declare r public.kream_cake_reservations;
begin
 select * into r from public.kream_cake_reservations where source_order_id=order_id for update;
 if not found or not kream_private.can_read_cake_reservation(r.store_id) then raise exception 'Not allowed' using errcode='42501';end if;
 if r.content_hash is distinct from expected_hash then raise exception 'Reservation changed; reload first' using errcode='40001';end if;
 if r.status in ('pending','on-hold','cancelled','refunded','failed','trash') then raise exception 'Order not ready for preparation';end if;
 update public.kream_cake_reservations set reviewed_hash=case when reviewed then content_hash else null end,reviewed_at=case when reviewed then now() else null end,reviewed_by=case when reviewed then auth.uid() else null end where source_order_id=order_id;
end$$;
revoke all on function public.kream_review_cake_reservation(bigint,text,boolean) from public,anon;
grant execute on function public.kream_review_cake_reservation(bigint,text,boolean) to authenticated;
