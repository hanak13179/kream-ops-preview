-- Regression test only. Every change is rolled back.
begin;
do $test$
declare staff uuid; basket public.kream_store_baskets%rowtype; mid public.kream_store_baskets%rowtype; future_date date; n integer;
begin
  select user_id into staff from public.kream_profiles where active and role = 'employee' order by user_id limit 1;
  if staff is null then raise exception 'Test identity unavailable'; end if;
  insert into public.kream_memberships(user_id, store_id) values (staff, 'finch'), (staff, 'midland') on conflict do nothing;
  future_date := (clock_timestamp() at time zone 'America/Toronto')::date + 3;
  select * into basket from public.kream_store_baskets where store_id = 'finch' and submitted_order_id is null for update;
  if not found then insert into public.kream_store_baskets(store_id, delivery_date, items, note, updated_by) values ('finch', future_date, '[{"product_id":"milk","quantity":2}]', 'ROLLBACK auto submit', staff) returning * into basket;
  else update public.kream_store_baskets set items = '[{"product_id":"milk","quantity":2}]', delivery_date = future_date, note = 'ROLLBACK auto submit', updated_by = staff where id = basket.id returning * into basket; end if;
  select * into mid from public.kream_store_baskets where store_id = 'midland' and submitted_order_id is null for update;
  if not found then insert into public.kream_store_baskets(store_id, delivery_date, items, note, updated_by) values ('midland', future_date, '[{"product_id":"milk","quantity":1}]', 'ROLLBACK auto submit', staff) returning * into mid;
  else update public.kream_store_baskets set items = '[{"product_id":"milk","quantity":1}]', delivery_date = future_date, note = 'ROLLBACK auto submit' where id = mid.id returning * into mid; end if;

  if kream_private.auto_submit_baskets(null) <> 0 and extract(hour from clock_timestamp() at time zone 'America/Toronto') <> 3 then raise exception 'Ran outside 3AM'; end if;
  n := kream_private.auto_submit_baskets(future_date);
  if n < 1 then raise exception 'Nothing auto-submitted'; end if;
  if (select submitted_order_id from public.kream_store_baskets where id = basket.id) is null then raise exception 'Finch basket not submitted'; end if;
  if (select submitted_order_id from public.kream_store_baskets where id = mid.id) is not null then raise exception 'Midland must wait for manager'; end if;
  if kream_private.auto_submit_baskets(future_date) <> 0 then raise exception 'Submitted twice'; end if;
  if has_function_privilege('authenticated', 'kream_private.auto_submit_baskets(date)', 'execute') then raise exception 'Staff can run auto submit'; end if;
  raise notice 'PASS: 3AM auto-submit sends unsubmitted store baskets once, skips Midland, not callable by users.';
end $test$;
rollback;
