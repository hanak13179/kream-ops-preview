-- 새벽 3시 자동 발주: 그날 입고분 발주함을 아무도 '발주완료' 안 했으면, 담겨 있는 그대로 발주해요.
--  * 미들랜드는 매니저 최종 확인이 필요해서 빼요.
--  * 마지막으로 발주함을 고친 직원 이름으로 들어가요 (없으면 사장 계정).
--  * 재고를 다 안 셌어도 들어가요 (세기 잠금은 앱 화면에만 있어요).
--  * pg_cron은 UTC라서 07:05·08:05 UTC 두 번 돌리고, 함수 안에서 토론토 3시일 때만 실행해요 (서머타임 상관없이 하루 한 번).
create extension if not exists pg_cron;

create or replace function kream_private.auto_submit_baskets(for_date date default null)
returns integer language plpgsql security definer set search_path='' as $$
declare
  local_now timestamp := clock_timestamp() at time zone 'America/Toronto';
  target date := coalesce(for_date, local_now::date);
  fallback uuid; who uuid; b record; done integer := 0;
begin
  if for_date is null and extract(hour from local_now) <> 3 then return 0; end if;
  select user_id into fallback from public.kream_profiles where active and role = 'owner' order by user_id limit 1;
  for b in
    select id, revision, store_id, updated_by from public.kream_store_baskets
     where submitted_order_id is null and store_id <> 'midland' and delivery_date = target
       and jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0
     -- Lock each eligible basket before reading its revision for submission.
     order by store_id, id
     for update
  loop
    who := coalesce(b.updated_by, fallback);
    if who is null then continue; end if;
    begin
      perform set_config('request.jwt.claim.sub', who::text, true);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', who, 'role', 'authenticated')::text, true);
      perform public.kream_submit_store_basket(b.id, b.revision);
      done := done + 1;
      raise log 'kream auto-submit: % basket % for %', b.store_id, b.id, target;
    exception when others then
      raise warning 'kream auto-submit failed for % (%): %', b.store_id, b.id, sqlerrm;
    end;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  return done;
end $$;

revoke all on function kream_private.auto_submit_baskets(date) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'kream-auto-submit-baskets';
select cron.schedule('kream-auto-submit-baskets', '5 7,8 * * *', $cron$select kream_private.auto_submit_baskets()$cron$);
