create table public.kream_midland_legacy_orders(
 source_file_id text not null,
 order_date date not null,
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 1000),
 source_fingerprint text not null check(char_length(source_fingerprint)=64),
 source_note text not null,
 imported_at timestamptz not null default now(),
 primary key(source_file_id,order_date)
);
alter table public.kream_midland_legacy_orders enable row level security;
revoke all on public.kream_midland_legacy_orders from public,anon,authenticated;
grant select on public.kream_midland_legacy_orders to authenticated;
create policy midland_legacy_money_read on public.kream_midland_legacy_orders for select to authenticated using((select kream_private.can_read_midland_money()));
comment on table public.kream_midland_legacy_orders is 'Historical source-sheet order observations only. Does not create OPS orders, dispatches, receipts, stock movements or confirmed statements.';