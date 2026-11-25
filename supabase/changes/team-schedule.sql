-- 근무·스케줄 (1·3·4호점): 출퇴근(GPS), 가능 시간, 스케줄, 휴가, 교대, 팁용 근무시간
-- Hana 작업 (feature/team-schedule). Sora 확인 후 적용해 주세요. 미들랜드(2호점)·공장은 쓰지 않아요.
-- 쓰기는 모두 security definer RPC로만 해요 (직원이 다른 사람 기록을 직접 못 바꿔요).
begin;

create function kream_private.is_team_store(s text) returns boolean language sql immutable set search_path='' as $$ select s in ('downtown','richmond-hill','finch') $$;
create function kream_private.team_manager(s text) returns boolean language sql stable security definer set search_path='' as $$
 select kream_private.is_team_store(s) and kream_private.can_manage_store(s)
$$;
create function kream_private.team_member(s text) returns boolean language sql stable security definer set search_path='' as $$
 select kream_private.is_team_store(s) and kream_private.can_read_store(s)
$$;
create function kream_private.distance_m(lat1 double precision,lng1 double precision,lat2 double precision,lng2 double precision) returns double precision language sql immutable set search_path='' as $$
 select 2*6371000*asin(least(1,sqrt(power(sin(radians(lat2-lat1)/2),2)+cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2))))
$$;
revoke all on function kream_private.is_team_store(text),kream_private.team_manager(text),kream_private.team_member(text),kream_private.distance_m(double precision,double precision,double precision,double precision) from public,anon;
grant execute on function kream_private.is_team_store(text),kream_private.team_manager(text),kream_private.team_member(text),kream_private.distance_m(double precision,double precision,double precision,double precision) to authenticated;

-- ── 매장 설정: 위치·반경, 휴가 신청 기한, 교대 승인, 필요 인원(자동 스케줄용) ──
create table public.kream_team_settings(
 store_id text primary key references public.kream_stores(id) check(kream_private.is_team_store(store_id)),
 lat double precision check(lat between -90 and 90),
 lng double precision check(lng between -180 and 180),
 radius_m integer not null default 100 check(radius_m between 30 and 500),
 notice_days integer not null default 14 check(notice_days between 0 and 90),
 swap_approval boolean not null default true,
 needs jsonb not null default '[]'::jsonb check(jsonb_typeof(needs)='array' and jsonb_array_length(needs)<=200),
 updated_by uuid references public.kream_profiles(user_id),
 updated_at timestamptz not null default now(),
 check((lat is null)=(lng is null))
);

-- ── 가능 시간 (요일별) + 주 최대 시간 ──
create table public.kream_team_availability(
 user_id uuid not null references public.kream_profiles(user_id),
 weekday smallint not null check(weekday between 0 and 6),
 kind text not null check(kind in ('all','none','range')),
 start_min integer check(start_min between 0 and 1440),
 end_min integer check(end_min between 0 and 1440),
 primary key(user_id,weekday),
 check(kind<>'range' or (start_min is not null and end_min>start_min))
);
create table public.kream_team_prefs(
 user_id uuid primary key references public.kream_profiles(user_id),
 max_hours numeric(5,2) check(max_hours between 0 and 80),
 note text not null default '' check(char_length(note)<=500),
 updated_at timestamptz not null default now()
);

-- ── 스케줄 ── (user_id 비어 있으면 '빈 근무' → 직원이 가져가기 요청)
create table public.kream_team_shifts(
 id uuid primary key,
 store_id text not null references public.kream_stores(id) check(kream_private.is_team_store(store_id)),
 shift_date date not null,
 start_min integer not null check(start_min between 0 and 1439),
 end_min integer not null check(end_min between 1 and 1440),
 position text not null default '' check(char_length(position)<=40),
 user_id uuid references public.kream_profiles(user_id),
 note text not null default '' check(char_length(note)<=300),
 published boolean not null default false,
 updated_by uuid references public.kream_profiles(user_id),
 updated_at timestamptz not null default now(),
 check(end_min>start_min)
);
create index kream_team_shifts_store_date on public.kream_team_shifts(store_id,shift_date);
create index kream_team_shifts_user_date on public.kream_team_shifts(user_id,shift_date);

-- ── 휴가 ──
create table public.kream_team_time_off(
 id uuid primary key,
 user_id uuid not null references public.kream_profiles(user_id),
 start_date date not null,
 end_date date not null,
 reason text not null default '' check(char_length(reason)<=300),
 status text not null default 'pending' check(status in ('pending','approved','denied','cancelled')),
 decided_by uuid references public.kream_profiles(user_id),
 decided_name text,
 decided_at timestamptz,
 created_at timestamptz not null default now(),
 check(end_date>=start_date and end_date-start_date<=60)
);
create index kream_team_time_off_user on public.kream_team_time_off(user_id,start_date);

-- ── 교대·대타 ── open: 누구나 가져갈 수 있음 / accepted: 받을 사람 정해짐(매니저 승인 대기) / approved: 근무가 넘어감
create table public.kream_team_swaps(
 id uuid primary key,
 shift_id uuid not null references public.kream_team_shifts(id) on delete cascade,
 from_user uuid references public.kream_profiles(user_id),
 to_user uuid references public.kream_profiles(user_id),
 status text not null check(status in ('open','accepted','approved','denied','cancelled')),
 note text not null default '' check(char_length(note)<=300),
 decided_by uuid references public.kream_profiles(user_id),
 decided_at timestamptz,
 created_at timestamptz not null default now(),
 check(status<>'accepted' or to_user is not null)
);
create index kream_team_swaps_shift on public.kream_team_swaps(shift_id);

-- ── 출퇴근 기록 ── breaks: [{start, end}]  in_geo/out_geo: {lat,lng,acc,dist,ok}
create table public.kream_team_timecards(
 id uuid primary key,
 user_id uuid not null references public.kream_profiles(user_id),
 store_id text not null references public.kream_stores(id) check(kream_private.is_team_store(store_id)),
 clock_in timestamptz not null,
 clock_out timestamptz,
 breaks jsonb not null default '[]'::jsonb check(jsonb_typeof(breaks)='array' and jsonb_array_length(breaks)<=10),
 in_geo jsonb,
 out_geo jsonb,
 source text not null default 'app' check(source in ('app','manager')),
 note text not null default '' check(char_length(note)<=300),
 edited_by uuid references public.kream_profiles(user_id),
 edited_at timestamptz,
 created_at timestamptz not null default now(),
 check(clock_out is null or (clock_out>clock_in and clock_out-clock_in<interval '18 hours'))
);
-- 매니저가 고치거나 지운 출퇴근은 전부 남겨요
create table public.kream_team_timecard_audit(
 id bigint generated always as identity primary key,
 timecard_id uuid not null,
 action text not null check(action in ('edit','delete')),
 before_row jsonb,
 after_row jsonb,
 reason text not null,
 actor uuid not null references public.kream_profiles(user_id),
 at timestamptz not null default now()
);
create unique index kream_team_one_open_card on public.kream_team_timecards(user_id) where clock_out is null;
create index kream_team_timecards_store_in on public.kream_team_timecards(store_id,clock_in);

-- ── 읽기 권한 ──
alter table public.kream_team_settings enable row level security;
alter table public.kream_team_availability enable row level security;
alter table public.kream_team_prefs enable row level security;
alter table public.kream_team_shifts enable row level security;
alter table public.kream_team_time_off enable row level security;
alter table public.kream_team_swaps enable row level security;
alter table public.kream_team_timecards enable row level security;
alter table public.kream_team_timecard_audit enable row level security;
revoke all on public.kream_team_timecard_audit from public,anon,authenticated;
revoke all on public.kream_team_settings,public.kream_team_availability,public.kream_team_prefs,public.kream_team_shifts,public.kream_team_time_off,public.kream_team_swaps,public.kream_team_timecards from public,anon,authenticated;
grant select on public.kream_team_settings,public.kream_team_availability,public.kream_team_prefs,public.kream_team_shifts,public.kream_team_time_off,public.kream_team_swaps,public.kream_team_timecards to authenticated;

-- 매장 사람이면 매장 설정을 봐요 (위치는 출근 확인에 필요)
create policy team_settings_read on public.kream_team_settings for select to authenticated using(kream_private.team_member(store_id));
-- 가능 시간·휴가: 본인, 그리고 그 사람이 속한 매장의 매니저
create policy team_availability_read on public.kream_team_availability for select to authenticated using(
 user_id=auth.uid() or exists(select 1 from public.kream_memberships m where m.user_id=kream_team_availability.user_id and kream_private.team_manager(m.store_id)));
create policy team_prefs_read on public.kream_team_prefs for select to authenticated using(
 user_id=auth.uid() or exists(select 1 from public.kream_memberships m where m.user_id=kream_team_prefs.user_id and kream_private.team_manager(m.store_id)));
create policy team_time_off_read on public.kream_team_time_off for select to authenticated using(
 user_id=auth.uid() or exists(select 1 from public.kream_memberships m where m.user_id=kream_team_time_off.user_id and kream_private.team_manager(m.store_id)));
-- 스케줄: 매니저는 전부(초안 포함), 매장 사람은 게시된 것만
create policy team_shifts_read on public.kream_team_shifts for select to authenticated using(
 kream_private.team_manager(store_id) or (published and kream_private.team_member(store_id)));
create policy team_swaps_read on public.kream_team_swaps for select to authenticated using(
 from_user=auth.uid() or to_user=auth.uid() or exists(select 1 from public.kream_team_shifts s where s.id=shift_id and (kream_private.team_manager(s.store_id) or (kream_team_swaps.status='open' and s.published and kream_private.team_member(s.store_id)))));
-- 출퇴근: 본인과 그 매장 매니저
create policy team_timecards_read on public.kream_team_timecards for select to authenticated using(user_id=auth.uid() or kream_private.team_manager(store_id));

-- ── 같은 매장 사람 이름 (스케줄에 이름 보이게) ──
create function public.kream_team_people(target_store text) returns table(user_id uuid,display_name text,role text)
language sql stable security definer set search_path='' as $$
 select p.user_id,p.display_name,p.role from public.kream_profiles p
 join public.kream_memberships m on m.user_id=p.user_id and m.store_id=target_store
 where kream_private.team_member(target_store) and p.active and not coalesce(p.access_blocked,false)
 order by p.display_name
$$;

-- ── 매니저: 매장 설정 ──
create function public.kream_team_save_settings(target_store text,new_lat double precision,new_lng double precision,new_radius integer,new_notice integer,new_swap_approval boolean,new_needs jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not kream_private.team_manager(target_store) then raise exception 'Manager access required' using errcode='42501'; end if;
 insert into public.kream_team_settings as s(store_id,lat,lng,radius_m,notice_days,swap_approval,needs,updated_by,updated_at)
 values(target_store,new_lat,new_lng,coalesce(new_radius,100),coalesce(new_notice,14),coalesce(new_swap_approval,true),coalesce(new_needs,'[]'::jsonb),auth.uid(),now())
 on conflict(store_id) do update set lat=excluded.lat,lng=excluded.lng,radius_m=excluded.radius_m,notice_days=excluded.notice_days,swap_approval=excluded.swap_approval,needs=excluded.needs,updated_by=auth.uid(),updated_at=now();
end $$;

-- ── 본인: 가능 시간 (요일 7개 통째로 바꿔요) ──
create function public.kream_team_save_availability(rows jsonb,new_max_hours numeric,new_note text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.kream_profiles where user_id=auth.uid() and active) then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows)>7 then raise exception 'Bad availability' using errcode='22023'; end if;
 delete from public.kream_team_availability where user_id=auth.uid();
 insert into public.kream_team_availability(user_id,weekday,kind,start_min,end_min)
 select auth.uid(),(r->>'weekday')::smallint,r->>'kind',(r->>'start_min')::int,(r->>'end_min')::int from jsonb_array_elements(rows) r;
 insert into public.kream_team_prefs(user_id,max_hours,note,updated_at) values(auth.uid(),new_max_hours,coalesce(new_note,''),now())
 on conflict(user_id) do update set max_hours=excluded.max_hours,note=excluded.note,updated_at=now();
end $$;

-- ── 매니저: 근무 저장·삭제 (게시된 근무를 바꾸면 그대로 게시 상태 유지) ──
create function public.kream_team_save_shifts(target_store text,rows jsonb,delete_ids uuid[] default '{}') returns integer
language plpgsql security definer set search_path='' as $$
declare r jsonb; n integer:=0; who uuid;
begin
 if not kream_private.team_manager(target_store) then raise exception 'Manager access required' using errcode='42501'; end if;
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows)>400 then raise exception 'Bad shifts' using errcode='22023'; end if;
 if exists(select 1 from public.kream_team_shifts where id=any(coalesce(delete_ids,'{}')) and store_id<>target_store) then raise exception 'Shift belongs to another store' using errcode='42501'; end if;
 delete from public.kream_team_shifts where id=any(coalesce(delete_ids,'{}')) and store_id=target_store;
 for r in select * from jsonb_array_elements(rows) loop
  who:=nullif(r->>'user_id','')::uuid;
  if who is not null and not exists(select 1 from public.kream_memberships where user_id=who and store_id=target_store) then raise exception 'Person is not on this store' using errcode='22023'; end if;
  if exists(select 1 from public.kream_team_shifts where id=(r->>'id')::uuid and store_id<>target_store) then raise exception 'Shift belongs to another store' using errcode='42501'; end if;
  insert into public.kream_team_shifts as s(id,store_id,shift_date,start_min,end_min,position,user_id,note,published,updated_by,updated_at)
  values((r->>'id')::uuid,target_store,(r->>'date')::date,(r->>'start_min')::int,(r->>'end_min')::int,coalesce(r->>'position',''),who,coalesce(r->>'note',''),coalesce((r->>'published')::boolean,false),auth.uid(),now())
  on conflict(id) do update set shift_date=excluded.shift_date,start_min=excluded.start_min,end_min=excluded.end_min,position=excluded.position,user_id=excluded.user_id,note=excluded.note,published=s.published or excluded.published,updated_by=auth.uid(),updated_at=now();
  n:=n+1;
 end loop;
 return n;
end $$;
create function public.kream_team_publish(target_store text,from_date date,to_date date) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not kream_private.team_manager(target_store) then raise exception 'Manager access required' using errcode='42501'; end if;
 update public.kream_team_shifts set published=true,updated_by=auth.uid(),updated_at=now() where store_id=target_store and shift_date between from_date and to_date and not published;
 get diagnostics n=row_count; return n;
end $$;

-- ── 휴가: 신청 (매장 설정의 기한보다 늦으면 막아요) · 취소 · 승인 ──
create function public.kream_team_request_time_off(request_id uuid,from_date date,to_date date,why text) returns void
language plpgsql security definer set search_path='' as $$
declare need integer;
begin
 if auth.uid() is null or not exists(select 1 from public.kream_profiles where user_id=auth.uid() and active) then raise exception 'Authentication required' using errcode='42501'; end if;
 select coalesce(max(s.notice_days),14) into need from public.kream_memberships m left join public.kream_team_settings s on s.store_id=m.store_id where m.user_id=auth.uid() and kream_private.is_team_store(m.store_id);
 if from_date-(now() at time zone 'America/Toronto')::date<need then raise exception 'Time off needs % days notice',need using errcode='22023'; end if;
 insert into public.kream_team_time_off(id,user_id,start_date,end_date,reason) values(request_id,auth.uid(),from_date,to_date,coalesce(why,'')) on conflict(id) do nothing;
end $$;
create function public.kream_team_cancel_time_off(target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.kream_team_time_off set status='cancelled' where id=target_id and user_id=auth.uid() and status in ('pending','approved') and start_date>(now() at time zone 'America/Toronto')::date;
 if not found then raise exception 'Cannot cancel' using errcode='22023'; end if;
end $$;
create function public.kream_team_decide_time_off(target_id uuid,approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare r public.kream_team_time_off;
begin
 select * into r from public.kream_team_time_off where id=target_id for update;
 if not found or not exists(select 1 from public.kream_memberships m where m.user_id=r.user_id and kream_private.team_manager(m.store_id)) then raise exception 'Manager access required' using errcode='42501'; end if;
 if r.status<>'pending' then raise exception 'Already decided' using errcode='22023'; end if;
 update public.kream_team_time_off set status=case when approve then 'approved' else 'denied' end,decided_by=auth.uid(),decided_name=(select display_name from public.kream_profiles where user_id=auth.uid()),decided_at=now() where id=target_id;
end $$;

-- ── 교대·대타 ──
-- 내 근무 내놓기(target_user 비우면 누구나) / 빈 근무 가져가기 요청(from_user 없음)
create function public.kream_team_swap_offer(request_id uuid,target_shift uuid,target_user uuid,why text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.kream_team_shifts;
begin
 select * into s from public.kream_team_shifts where id=target_shift;
 if not found or not s.published or not kream_private.team_member(s.store_id) then raise exception 'Shift not found' using errcode='42501'; end if;
 if s.shift_date<(now() at time zone 'America/Toronto')::date then raise exception 'Shift already passed' using errcode='22023'; end if;
 if exists(select 1 from public.kream_team_swaps where shift_id=target_shift and status in ('open','accepted')) then raise exception 'Swap already requested' using errcode='22023'; end if;
 if s.user_id=auth.uid() then
  if target_user is not null and (target_user=auth.uid() or not exists(select 1 from public.kream_memberships where user_id=target_user and store_id=s.store_id)) then raise exception 'Person is not on this store' using errcode='22023'; end if;
  insert into public.kream_team_swaps(id,shift_id,from_user,to_user,status,note) values(request_id,target_shift,auth.uid(),target_user,case when target_user is null then 'open' else 'accepted' end,coalesce(why,''));
 elsif s.user_id is null then
  insert into public.kream_team_swaps(id,shift_id,from_user,to_user,status,note) values(request_id,target_shift,null,auth.uid(),'accepted',coalesce(why,''));
 else raise exception 'Not your shift' using errcode='42501'; end if;
 if coalesce((select not swap_approval from public.kream_team_settings where store_id=s.store_id),false) and (select status from public.kream_team_swaps where id=request_id)='accepted' then
  perform kream_private.apply_swap(request_id,null);
 end if;
end $$;
create function kream_private.apply_swap(target_id uuid,decider uuid) returns void
language plpgsql security definer set search_path='' as $$
declare w public.kream_team_swaps;
begin
 select * into w from public.kream_team_swaps where id=target_id for update;
 update public.kream_team_shifts set user_id=w.to_user,updated_by=coalesce(decider,w.to_user),updated_at=now() where id=w.shift_id;
 update public.kream_team_swaps set status='approved',decided_by=decider,decided_at=now() where id=target_id;
end $$;
revoke all on function kream_private.apply_swap(uuid,uuid) from public,anon,authenticated;
create function public.kream_team_swap_accept(target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare w public.kream_team_swaps; s public.kream_team_shifts;
begin
 select * into w from public.kream_team_swaps where id=target_id for update;
 if not found then raise exception 'Swap not found' using errcode='22023'; end if;
 select * into s from public.kream_team_shifts where id=w.shift_id;
 if w.status<>'open' or w.from_user=auth.uid() or not exists(select 1 from public.kream_memberships where user_id=auth.uid() and store_id=s.store_id) then raise exception 'Cannot take this shift' using errcode='42501'; end if;
 if exists(select 1 from public.kream_team_shifts x where x.user_id=auth.uid() and x.shift_date=s.shift_date and x.start_min<s.end_min and s.start_min<x.end_min) then raise exception 'You already work then' using errcode='22023'; end if;
 update public.kream_team_swaps set to_user=auth.uid(),status='accepted' where id=target_id;
 if coalesce((select not swap_approval from public.kream_team_settings where store_id=s.store_id),false) then perform kream_private.apply_swap(target_id,null); end if;
end $$;
create function public.kream_team_swap_decide(target_id uuid,approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare w public.kream_team_swaps; st text;
begin
 select * into w from public.kream_team_swaps where id=target_id for update;
 select store_id into st from public.kream_team_shifts where id=w.shift_id;
 if w.id is null or st is null or not kream_private.team_manager(st) then raise exception 'Manager access required' using errcode='42501'; end if;
 if w.status<>'accepted' then raise exception 'Nothing to approve' using errcode='22023'; end if;
 if approve then perform kream_private.apply_swap(target_id,auth.uid());
 else update public.kream_team_swaps set status='denied',decided_by=auth.uid(),decided_at=now() where id=target_id; end if;
end $$;
create function public.kream_team_swap_cancel(target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.kream_team_swaps set status='cancelled' where id=target_id and status in ('open','accepted') and (from_user=auth.uid() or (from_user is null and to_user=auth.uid()));
 if not found then raise exception 'Cannot cancel' using errcode='22023'; end if;
end $$;

-- ── 출퇴근: 출근은 매장 POS에서 반경(기본 100m) 안에서만. 퇴근·휴식은 위치만 기록 ──
create function public.kream_team_punch(request_id uuid,target_store text,punch text,lat double precision,lng double precision,accuracy double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare st public.kream_team_settings; card public.kream_team_timecards; d double precision; geo jsonb; ok boolean;
begin
 if auth.uid() is null or not kream_private.is_team_store(target_store) or not exists(select 1 from public.kream_memberships where user_id=auth.uid() and store_id=target_store) then raise exception 'Not on this store' using errcode='42501'; end if;
 if punch not in ('in','out','break_start','break_end') then raise exception 'Bad punch' using errcode='22023'; end if;
 select * into st from public.kream_team_settings where store_id=target_store;
 if lat is not null and lng is not null and st.lat is not null then d:=kream_private.distance_m(st.lat,st.lng,lat,lng); end if;
 ok:=case when st.lat is null then null when d is null then false else d<=coalesce(st.radius_m,100) end;
 geo:=jsonb_build_object('lat',lat,'lng',lng,'acc',round(accuracy::numeric),'dist',round(d::numeric),'ok',ok,'at',now());
 select * into card from public.kream_team_timecards where user_id=auth.uid() and clock_out is null for update;
 if punch='in' then
  if exists(select 1 from public.kream_team_timecards where id=request_id) then return jsonb_build_object('id',request_id,'repeat',true); end if;
  if card.id is not null then raise exception 'Already clocked in' using errcode='22023'; end if;
  if lat is null or lng is null then raise exception 'Location required' using errcode='22023'; end if;
  if ok=false then raise exception 'Too far from store: % m (limit % m)',round(d),coalesce(st.radius_m,100) using errcode='22023'; end if;
  insert into public.kream_team_timecards(id,user_id,store_id,clock_in,in_geo) values(request_id,auth.uid(),target_store,now(),geo);
  return jsonb_build_object('id',request_id,'geo',geo);
 end if;
 if card.id is null then raise exception 'Not clocked in' using errcode='22023'; end if;
 if punch='break_start' then
  if exists(select 1 from jsonb_array_elements(card.breaks) b where b->>'end' is null) then return jsonb_build_object('id',card.id,'repeat',true); end if;
  update public.kream_team_timecards set breaks=breaks||jsonb_build_array(jsonb_build_object('start',now())) where id=card.id;
 elsif punch='break_end' then
  update public.kream_team_timecards set breaks=(select coalesce(jsonb_agg(case when b->>'end' is null then b||jsonb_build_object('end',now()) else b end),'[]'::jsonb) from jsonb_array_elements(breaks) b) where id=card.id;
 else
  update public.kream_team_timecards set clock_out=greatest(now(),clock_in+interval '1 minute'),out_geo=geo,
   breaks=(select coalesce(jsonb_agg(case when b->>'end' is null then b||jsonb_build_object('end',now()) else b end),'[]'::jsonb) from jsonb_array_elements(breaks) b) where id=card.id;
 end if;
 return jsonb_build_object('id',card.id,'geo',geo);
end $$;
-- 매니저: 출퇴근 고치기·빠진 기록 넣기·지우기 (사유 필수)
create function public.kream_team_save_timecard(target_id uuid,target_user uuid,target_store text,new_in timestamptz,new_out timestamptz,new_breaks jsonb,why text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not kream_private.team_manager(target_store) then raise exception 'Manager access required' using errcode='42501'; end if;
 if char_length(btrim(coalesce(why,'')))=0 then raise exception 'Reason required' using errcode='22023'; end if;
 if not exists(select 1 from public.kream_memberships where user_id=target_user and store_id=target_store) then raise exception 'Person is not on this store' using errcode='22023'; end if;
 if exists(select 1 from public.kream_team_timecards where id=target_id and (store_id<>target_store or user_id<>target_user)) then raise exception 'Timecard mismatch' using errcode='22023'; end if;
 insert into public.kream_team_timecard_audit(timecard_id,action,before_row,reason,actor) select id,'edit',to_jsonb(c),why,auth.uid() from public.kream_team_timecards c where id=target_id;
 insert into public.kream_team_timecards as c(id,user_id,store_id,clock_in,clock_out,breaks,source,note,edited_by,edited_at)
 values(target_id,target_user,target_store,new_in,new_out,coalesce(new_breaks,'[]'::jsonb),'manager',why,auth.uid(),now())
 on conflict(id) do update set clock_in=excluded.clock_in,clock_out=excluded.clock_out,breaks=excluded.breaks,note=excluded.note,edited_by=auth.uid(),edited_at=now();
end $$;
create function public.kream_team_delete_timecard(target_id uuid,why text) returns void
language plpgsql security definer set search_path='' as $$
declare st text;
begin
 select store_id into st from public.kream_team_timecards where id=target_id;
 if st is null or not kream_private.team_manager(st) then raise exception 'Manager access required' using errcode='42501'; end if;
 if char_length(btrim(coalesce(why,'')))=0 then raise exception 'Reason required' using errcode='22023'; end if;
 insert into public.kream_team_timecard_audit(timecard_id,action,before_row,reason,actor) select id,'delete',to_jsonb(c),why,auth.uid() from public.kream_team_timecards c where id=target_id;
 delete from public.kream_team_timecards where id=target_id;
end $$;


-- ── 직원: 출퇴근 시간 고치기 요청 → 매니저가 확인하고 승인해야 적용돼요 ──
create table public.kream_team_timecard_requests(
 id uuid primary key,
 timecard_id uuid references public.kream_team_timecards(id) on delete set null,
 user_id uuid not null references public.kream_profiles(user_id),
 store_id text not null references public.kream_stores(id) check(kream_private.is_team_store(store_id)),
 new_in timestamptz not null,
 new_out timestamptz,
 break_min integer not null default 0 check(break_min between 0 and 240),
 reason text not null check(char_length(btrim(reason)) between 1 and 300),
 status text not null default 'pending' check(status in ('pending','approved','denied','cancelled')),
 decided_by uuid references public.kream_profiles(user_id),
 decided_at timestamptz,
 created_at timestamptz not null default now(),
 check(new_out is null or (new_out>new_in and new_out-new_in<interval '18 hours'))
);
alter table public.kream_team_timecard_requests enable row level security;
revoke all on public.kream_team_timecard_requests from public,anon,authenticated;
grant select on public.kream_team_timecard_requests to authenticated;
create policy team_tc_requests_read on public.kream_team_timecard_requests for select to authenticated using(user_id=auth.uid() or kream_private.team_manager(store_id));
create function public.kream_team_request_timecard_fix(request_id uuid,target_timecard uuid,target_store text,want_in timestamptz,want_out timestamptz,want_break integer,why text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.kream_team_timecards;
begin
 if auth.uid() is null or not exists(select 1 from public.kream_memberships where user_id=auth.uid() and store_id=target_store) then raise exception 'Not on this store' using errcode='42501'; end if;
 if target_timecard is not null then
  select * into c from public.kream_team_timecards where id=target_timecard;
  if c.id is null or c.user_id<>auth.uid() or c.store_id<>target_store then raise exception 'Not your timecard' using errcode='42501'; end if;
 end if;
 if want_in<now()-interval '31 days' or want_in>now() then raise exception 'Only the last 31 days' using errcode='22023'; end if;
 if exists(select 1 from public.kream_team_timecard_requests where user_id=auth.uid() and status='pending' and timecard_id is not distinct from target_timecard and target_timecard is not null) then raise exception 'Fix already requested' using errcode='22023'; end if;
 insert into public.kream_team_timecard_requests(id,timecard_id,user_id,store_id,new_in,new_out,break_min,reason) values(request_id,target_timecard,auth.uid(),target_store,want_in,want_out,coalesce(want_break,0),why) on conflict(id) do nothing;
end $$;
create function public.kream_team_cancel_timecard_fix(target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.kream_team_timecard_requests set status='cancelled' where id=target_id and user_id=auth.uid() and status='pending';
 if not found then raise exception 'Cannot cancel' using errcode='22023'; end if;
end $$;
create function public.kream_team_decide_timecard_fix(target_id uuid,approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare r public.kream_team_timecard_requests; cid uuid; brk jsonb;
begin
 select * into r from public.kream_team_timecard_requests where id=target_id for update;
 if r.id is null or not kream_private.team_manager(r.store_id) then raise exception 'Manager access required' using errcode='42501'; end if;
 if r.status<>'pending' then raise exception 'Already decided' using errcode='22023'; end if;
 if approve then
  cid:=coalesce(r.timecard_id,target_id);
  brk:=case when r.break_min>0 then jsonb_build_array(jsonb_build_object('start',r.new_in+interval '3 hours','end',r.new_in+interval '3 hours'+make_interval(mins=>r.break_min))) else '[]'::jsonb end;
  insert into public.kream_team_timecard_audit(timecard_id,action,before_row,after_row,reason,actor)
  select cid,'edit',(select to_jsonb(c) from public.kream_team_timecards c where id=cid),to_jsonb(r),'employee request: '||r.reason,auth.uid();
  insert into public.kream_team_timecards as c(id,user_id,store_id,clock_in,clock_out,breaks,source,note,edited_by,edited_at)
  values(cid,r.user_id,r.store_id,r.new_in,r.new_out,brk,'manager','✓ '||r.reason,auth.uid(),now())
  on conflict(id) do update set clock_in=excluded.clock_in,clock_out=excluded.clock_out,breaks=excluded.breaks,note=excluded.note,edited_by=auth.uid(),edited_at=now();
 end if;
 update public.kream_team_timecard_requests set status=case when approve then 'approved' else 'denied' end,decided_by=auth.uid(),decided_at=now() where id=target_id;
end $$;

do $$ declare f text; begin
 foreach f in array array['kream_team_people(text)','kream_team_save_settings(text,double precision,double precision,integer,integer,boolean,jsonb)','kream_team_save_availability(jsonb,numeric,text)','kream_team_save_shifts(text,jsonb,uuid[])','kream_team_publish(text,date,date)','kream_team_request_time_off(uuid,date,date,text)','kream_team_cancel_time_off(uuid)','kream_team_decide_time_off(uuid,boolean)','kream_team_swap_offer(uuid,uuid,uuid,text)','kream_team_swap_accept(uuid)','kream_team_swap_decide(uuid,boolean)','kream_team_swap_cancel(uuid)','kream_team_punch(uuid,text,text,double precision,double precision,double precision)','kream_team_save_timecard(uuid,uuid,text,timestamptz,timestamptz,jsonb,text)','kream_team_delete_timecard(uuid,text)','kream_team_request_timecard_fix(uuid,uuid,text,timestamptz,timestamptz,integer,text)','kream_team_cancel_timecard_fix(uuid)','kream_team_decide_timecard_fix(uuid,boolean)'] loop
  execute format('revoke all on function public.%s from public,anon',f);
  execute format('grant execute on function public.%s to authenticated',f);
 end loop;
end $$;
commit;
