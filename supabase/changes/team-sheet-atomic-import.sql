-- A sheet block is committed once, only if the app has not changed since it was read.
create or replace function public.kream_team_sheet_apply(target_store text,week_start date,expected jsonb,rows jsonb,delete_ids uuid[]) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer:=0; r record;
begin
 if not kream_private.is_team_store(target_store) or extract(isodow from week_start)<>1 or jsonb_typeof(expected)<>'array' or jsonb_typeof(rows)<>'array' or jsonb_array_length(rows)>300 then raise exception 'Invalid import'; end if;
 perform pg_advisory_xact_lock(hashtextextended('team-sheet:'||target_store||':'||week_start,0));
 perform 1 from public.kream_team_shifts where store_id=target_store and shift_date between week_start and week_start+6 for update;
 if exists(
  select 1 from (select id,updated_at from public.kream_team_shifts where store_id=target_store and shift_date between week_start and week_start+6) s
  full join jsonb_to_recordset(expected) e(id uuid,updated_at timestamptz) using(id)
  where s.id is null or e.id is null or s.updated_at is distinct from e.updated_at
 ) then raise exception 'Schedule changed; retry'; end if;
 if exists(select 1 from unnest(delete_ids) d(id) where not exists(select 1 from public.kream_team_shifts s where s.id=d.id and s.store_id=target_store and (s.published or s.note like '시트 이름 확인:%') and s.shift_date between week_start and week_start+6)) then raise exception 'Invalid deletion'; end if;
 for r in select * from jsonb_to_recordset(rows) x(id uuid,date date,start_min integer,end_min integer,user_id uuid,position text,note text) loop
  if r.date not between week_start and week_start+6 or r.date is null or r.start_min is null or r.end_min is null or r.start_min<0 or r.end_min>1440 or r.end_min<=r.start_min or r.id is null then raise exception 'Invalid shift'; end if;
  if r.user_id is not null and not kream_private.team_any_user(r.user_id) then raise exception 'Inactive or unassigned person'; end if;
  if exists(select 1 from public.kream_team_shifts where id=r.id and (store_id<>target_store or (not published and note not like '시트 이름 확인:%') or shift_date not between week_start and week_start+6)) then raise exception 'Shift outside block'; end if;
  insert into public.kream_team_shifts(id,store_id,shift_date,start_min,end_min,user_id,position,note,published,updated_at)
  values(r.id,target_store,r.date,r.start_min,r.end_min,r.user_id,coalesce(r.position,''),coalesce(r.note,''),coalesce(r.note,'') not like '시트 이름 확인:%',now())
  on conflict(id) do update set shift_date=excluded.shift_date,start_min=excluded.start_min,end_min=excluded.end_min,user_id=excluded.user_id,position=excluded.position,note=excluded.note,published=excluded.published,updated_at=now();
  n:=n+1;
 end loop;
 delete from public.kream_team_shifts where id=any(delete_ids) and store_id=target_store;
 return n+coalesce(cardinality(delete_ids),0);
end $$;
revoke all on function public.kream_team_sheet_apply(text,date,jsonb,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.kream_team_sheet_apply(text,date,jsonb,jsonb,uuid[]) to service_role;

-- Unmatched names are manager drafts and cannot become claimable open shifts.
alter table public.kream_team_shifts add constraint team_unmatched_name_stays_draft check(not published or user_id is not null or note not like '시트 이름 확인:%');
create or replace function public.kream_team_publish(target_store text,from_date date,to_date date) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not kream_private.team_active() then raise exception 'Authentication required' using errcode='42501'; end if;
 if not kream_private.team_manager(target_store) then raise exception 'Manager access required' using errcode='42501'; end if;
 update public.kream_team_shifts set published=true,updated_by=auth.uid(),updated_at=now() where store_id=target_store and shift_date between from_date and to_date and not published and not(user_id is null and note like '시트 이름 확인:%');
 get diagnostics n=row_count; return n;
end $$;
