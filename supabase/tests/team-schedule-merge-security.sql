begin;
insert into auth.users(id,email) values
 ('a7000000-0000-4000-8000-000000000001','merge-employee-one@example.invalid'),
 ('a7000000-0000-4000-8000-000000000002','merge-employee-two@example.invalid'),
 ('a7000000-0000-4000-8000-000000000003','merge-manager@example.invalid'),
 ('a7000000-0000-4000-8000-000000000004','merge-blocked@example.invalid');
insert into public.kream_profiles(user_id,display_name,role,active,access_blocked) values
 ('a7000000-0000-4000-8000-000000000001','Merge employee one','employee',true,false),
 ('a7000000-0000-4000-8000-000000000002','Merge employee two','employee',true,false),
 ('a7000000-0000-4000-8000-000000000003','Merge manager','manager',true,false),
 ('a7000000-0000-4000-8000-000000000004','Merge blocked','employee',true,true)
 on conflict(user_id) do update set display_name=excluded.display_name,role=excluded.role,active=excluded.active,access_blocked=excluded.access_blocked;
insert into public.kream_memberships(user_id,store_id) values
 ('a7000000-0000-4000-8000-000000000001','finch'),('a7000000-0000-4000-8000-000000000002','downtown'),
 ('a7000000-0000-4000-8000-000000000003','finch'),('a7000000-0000-4000-8000-000000000004','finch');
insert into public.kream_team_settings(store_id,lat,lng) values('finch',null,null)
 on conflict(store_id) do update set lat=null,lng=null;
select set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$begin
 begin perform public.kream_team_punch(gen_random_uuid(),'finch','in',43,-79,5);raise exception 'FAIL missing POS allowed';exception when invalid_parameter_value then null;end;
 begin perform public.kream_team_save_settings('finch',43,-79,100,14,false,'[]');raise exception 'FAIL employee changed settings';exception when insufficient_privilege then null;end;
 perform public.kream_team_save_availability('[{"weekday":1,"kind":"all"}]',40,'test',20,false);
 perform public.kream_push_save('https://example.invalid/merge-one','test-p256','test-auth',array['clock_out'],'rollback test');
end$$;
reset role;
update public.kream_team_settings set lat=43,lng=-79 where store_id='finch';
select set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.kream_push_subscriptions where endpoint='https://example.invalid/merge-one') then raise exception 'FAIL other subscription visible';end if;
 if exists(select 1 from public.kream_team_availability where user_id='a7000000-0000-4000-8000-000000000001') then raise exception 'FAIL other availability visible';end if;
 begin perform public.kream_team_punch(gen_random_uuid(),'finch','in',43,-79,5);raise exception 'FAIL other store punch allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$declare r jsonb;begin
 begin perform public.kream_team_punch(gen_random_uuid(),'finch','in',44,-79,5);raise exception 'FAIL distant punch allowed';exception when invalid_parameter_value then null;end;
 r:=public.kream_team_punch('a7100000-0000-4000-8000-000000000001','finch','in',43,-79,5);
 perform public.kream_team_punch('a7100000-0000-4000-8000-000000000001','finch','in',43,-79,5);
 if (select count(*) from public.kream_team_timecards where user_id='a7000000-0000-4000-8000-000000000001')<>1 then raise exception 'FAIL duplicate punch';end if;
 perform public.kream_team_punch(gen_random_uuid(),'finch','out',43,-79,5);
 if not exists(select 1 from public.kream_team_timecards where user_id='a7000000-0000-4000-8000-000000000001' and clock_out is not null) then raise exception 'FAIL clock out';end if;
end$$;
reset role;
select set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$begin
 if not exists(select 1 from public.kream_team_timecards where user_id='a7000000-0000-4000-8000-000000000001') then raise exception 'FAIL manager cannot read assigned card';end if;
 if exists(select 1 from public.kream_team_settings where store_id='downtown') then raise exception 'FAIL manager reads another store';end if;
 begin perform public.kream_team_save_settings('downtown',43,-79,100,14,false,'[]');raise exception 'FAIL manager changes another store';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000004',true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.kream_team_settings) then raise exception 'FAIL blocked reads';end if;
 begin perform public.kream_team_punch(gen_random_uuid(),'finch','in',43,-79,5);raise exception 'FAIL blocked punch allowed';exception when insufficient_privilege then null;end;
 begin perform public.kream_team_save_availability('[]',40,'blocked',20,false);raise exception 'FAIL blocked availability allowed';exception when insufficient_privilege then null;end;
 begin perform public.kream_push_save('https://example.invalid/merge-blocked','test','test',array['clock_out'],'rollback');raise exception 'FAIL blocked push allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
select 'PASS: missing POS, far and cross-store clock-in blocked; nearby and idempotent punch works; assigned manager only; blocked account denied; push subscription isolation; all fixtures rolled back.' as verification;
