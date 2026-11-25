-- 🔔 폰 알림 (Web Push) 저장 표 · team-schedule.sql 다음에 적용해 주세요.
begin;
create table public.kream_push_subscriptions(
 id bigint generated always as identity primary key,
 user_id uuid not null references public.kream_profiles(user_id) on delete cascade,
 endpoint text not null unique check(char_length(endpoint)<=1000 and endpoint like 'https://%'),
 p256dh text not null check(char_length(p256dh)<=200),
 auth text not null check(char_length(auth)<=100),
 topics text[] not null default '{}' check(array_length(topics,1) is null or array_length(topics,1)<=20),
 user_agent text not null default '' check(char_length(user_agent)<=200),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index kream_push_subscriptions_user on public.kream_push_subscriptions(user_id);
-- 같은 알림은 한 번만 (5분마다 확인할 때 이미 보낸 key는 건너뜀). 오래된 기록은 아래 cron이 지워요.
create table public.kream_push_sent(key text primary key check(char_length(key)<=200), sent_at timestamptz not null default now());
alter table public.kream_push_subscriptions enable row level security;
alter table public.kream_push_sent enable row level security;
revoke all on public.kream_push_subscriptions,public.kream_push_sent from public,anon,authenticated;
grant select on public.kream_push_subscriptions to authenticated;
create policy push_subs_own on public.kream_push_subscriptions for select to authenticated using(user_id=auth.uid());

create function public.kream_push_save(sub_endpoint text,sub_p256dh text,sub_auth text,sub_topics text[],sub_agent text default '') returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.kream_profiles where user_id=auth.uid() and active) then raise exception 'Authentication required' using errcode='42501'; end if;
 if sub_topics is not null and exists(select 1 from unnest(sub_topics) t where t not in ('order_missing','cash_missing','late_noshow','open_punch','requests','schedule_unpublished','factory_short','shift_reminder','clock_out','market','schedule_published','my_requests')) then raise exception 'Bad topic' using errcode='22023'; end if;
 insert into public.kream_push_subscriptions(user_id,endpoint,p256dh,auth,topics,user_agent) values(auth.uid(),sub_endpoint,sub_p256dh,sub_auth,coalesce(sub_topics,'{}'),coalesce(sub_agent,''))
 on conflict(endpoint) do update set user_id=auth.uid(),p256dh=excluded.p256dh,auth=excluded.auth,topics=excluded.topics,user_agent=excluded.user_agent,updated_at=now();
end $$;
create function public.kream_push_remove(sub_endpoint text) returns void
language sql security definer set search_path='' as $$ delete from public.kream_push_subscriptions where endpoint=sub_endpoint and user_id=auth.uid() $$;
revoke all on function public.kream_push_save(text,text,text,text[],text),public.kream_push_remove(text) from public,anon;
grant execute on function public.kream_push_save(text,text,text,text[],text),public.kream_push_remove(text) to authenticated;
commit;

-- ── 설정 (한 번만, Sora) ───────────────────────────────────────────
-- 1) 키 만들기:   npx web-push generate-vapid-keys
--    공개 키 → staff/push.mjs 의 PUSH_PUBLIC_KEY 에 넣기 (공개해도 돼요)
--    개인 키 → 코드에 넣지 말고 비밀값으로만
-- 2) supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:ops@kreamtoronto.com \
--      PUSH_CRON_SECRET=<아무 긴 랜덤 글자> CASH_SHEET_URL=<캐시 카운트 Apps Script URL> CASH_SHEET_KEY=kream-stock-sync
-- 3) supabase functions deploy kream-push --no-verify-jwt
-- 4) 5분마다 실행 (Database → Extensions 에서 pg_cron, pg_net 켜고):
--    select cron.schedule('kream-push','*/5 * * * *',$$select net.http_post(url:='https://imkhosgnkgwchoyrqczw.supabase.co/functions/v1/kream-push',
--      headers:=jsonb_build_object('Content-Type','application/json','x-kream-cron-secret','<PUSH_CRON_SECRET 같은 값>'),body:='{}'::jsonb)$$);
--    select cron.schedule('kream-push-cleanup','15 4 * * *',$$delete from public.kream_push_sent where sent_at<now()-interval '30 days'$$);
