-- Allow independently selected store and factory workplaces without promoting employees.
alter table public.kream_profiles drop constraint kream_combined_manager_shape;
alter table public.kream_profiles add constraint kream_combined_manager_shape check (not store_manager or role='factory');
CREATE OR REPLACE FUNCTION kream_private.can_order_store(target_store text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.kream_profiles p
    join public.kream_stores s on s.id = target_store and s.active
    where p.user_id = auth.uid() and p.active and not coalesce(p.access_blocked,false) and (
      (p.role = 'owner' or p.role = 'manager' and p.general_manager) or (
        (p.role in ('employee','manager','midland_owner') or p.role='factory')
        and (p.role <> 'midland_owner' or target_store = 'midland')
        and exists (select 1 from public.kream_memberships m where m.user_id = p.user_id and m.store_id = target_store)
      )
    )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.kream_list_accounts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or (coalesce(kream_private.current_role(),'') not in ('owner','manager') and not kream_private.is_store_factory_manager()) then raise exception 'Owner access required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
 select u.id as user_id,u.email,coalesce(p.display_name,split_part(u.email,'@',1)) as display_name,
 coalesce(p.role,'employee') as role,coalesce(p.active,false) as active,coalesce(p.general_manager,false) as general_manager,
 coalesce(p.factory_manager,false) as factory_manager,coalesce(p.store_manager,false) as store_manager,coalesce(p.permission_revision,0) as permission_revision,
 coalesce(p.access_blocked,false) as access_blocked,
 coalesce((select jsonb_agg(to_jsonb(r)) from public.kream_access_requests r where r.user_id=u.id and (kream_private.current_role()='owner' or (r.location_key<>'factory' and kream_private.can_manage_store(r.location_key)))),'[]'::jsonb) as requests,
 u.created_at,u.email_confirmed_at is not null as email_confirmed,
 coalesce((select jsonb_agg(m.store_id order by m.store_id) from public.kream_memberships m where m.user_id=u.id and (kream_private.current_role()='owner' or kream_private.can_manage_store(m.store_id))),'[]'::jsonb) as store_ids,
 (select jsonb_build_object('at',a.changed_at,'by',coalesce(actor.display_name,'Administrator')) from public.kream_access_audit a left join public.kream_profiles actor on actor.user_id=a.changed_by where a.target_user=u.id order by a.changed_at desc limit 1) as last_change
 from auth.users u left join public.kream_profiles p on p.user_id=u.id where u.deleted_at is null and (kream_private.current_role()='owner' or (coalesce(p.role,'employee')='employee' and (exists(select 1 from public.kream_memberships m where m.user_id=u.id and kream_private.can_manage_store(m.store_id)) or exists(select 1 from public.kream_access_requests r where r.user_id=u.id and r.location_key<>'factory' and kream_private.can_manage_store(r.location_key)))) or (exists(select 1 from public.kream_profiles me where me.user_id=auth.uid() and me.general_manager) and p.role='manager' and not p.general_manager))
 ) x);
end $function$
;

CREATE OR REPLACE FUNCTION public.kream_assign_access(target_user uuid, access_kind text, store_keys text[], enabled boolean, expected_revision bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_profile public.kream_profiles; old_access jsonb; email_name text; selected_stores text[]; new_role text;
begin
 if auth.uid() is null or kream_private.current_role() is distinct from 'owner' then raise exception 'Owner access required' using errcode='42501';end if;
 if access_kind is null or access_kind not in ('employee','manager','employee_factory','employee_factory_manager','manager_factory_staff','manager_factory','general_manager','factory_staff','factory_manager','midland_owner') or enabled is null then raise exception 'Invalid access kind' using errcode='22023';end if;
 select split_part(u.email,'@',1) into email_name from auth.users u where u.id=target_user and u.deleted_at is null for update;
 if not found then raise exception 'Account not found' using errcode='22023';end if;
 select * into old_profile from public.kream_profiles where user_id=target_user for update;
 if old_profile.role='owner' then raise exception 'Owner account is protected' using errcode='42501';end if;
 if expected_revision is null or coalesce(old_profile.permission_revision,0)<>expected_revision then raise exception 'ACCESS_CONFLICT' using errcode='40001';end if;
 old_access=jsonb_build_object('profile',to_jsonb(old_profile),'stores',coalesce((select jsonb_agg(store_id order by store_id) from public.kream_memberships where user_id=target_user),'[]'::jsonb));
 select coalesce(array_agg(distinct k order by k),array[]::text[]) into selected_stores from unnest(coalesce(store_keys,array[]::text[])) k;
 if access_kind='midland_owner' then selected_stores=array['midland'];
 elsif access_kind in ('factory_staff','factory_manager','general_manager') then selected_stores=array[]::text[];end if;
 if exists(select 1 from unnest(selected_stores) k where k is null or not exists(select 1 from public.kream_stores s where s.id=k and s.active)) or (enabled and access_kind in ('employee','manager','employee_factory','employee_factory_manager','manager_factory_staff','manager_factory') and cardinality(selected_stores)=0) then raise exception 'Select active stores' using errcode='22023';end if;
 new_role=case when access_kind='general_manager' then 'manager' when access_kind in ('factory_staff','factory_manager','employee_factory','employee_factory_manager','manager_factory_staff','manager_factory') then 'factory' else access_kind end;
 insert into public.kream_profiles(user_id,display_name,role,active,general_manager,factory_manager,store_manager,permission_revision)
 values(target_user,coalesce(nullif(email_name,''),'Staff'),new_role,enabled,access_kind='general_manager',access_kind in ('factory_manager','employee_factory_manager','manager_factory'),access_kind in ('manager_factory_staff','manager_factory'),1)
 on conflict(user_id) do update set role=excluded.role,active=excluded.active,access_blocked=case when excluded.active then false else kream_profiles.access_blocked end,general_manager=excluded.general_manager,factory_manager=excluded.factory_manager,store_manager=excluded.store_manager,permission_revision=kream_profiles.permission_revision+1;
 delete from public.kream_memberships where user_id=target_user;
 insert into public.kream_memberships(user_id,store_id) select target_user,k from unnest(selected_stores) k;

 -- sync assigned workplace request states, without adding access
 if enabled then
 update public.kream_access_requests r
 set status='approved',reviewed_by=auth.uid(),reviewed_at=clock_timestamp()
 where r.user_id=target_user and r.status='pending'
 and ((r.location_key='factory' and new_role='factory')
 or (r.location_key<>'factory' and (r.location_key=any(selected_stores)
 or (access_kind='general_manager' and exists(select 1 from public.kream_stores s where s.id=r.location_key and s.active)))));
 end if;
 insert into public.kream_access_audit(target_user,changed_by,before_access,after_access)
 values(target_user,auth.uid(),old_access,jsonb_build_object('kind',access_kind,'enabled',enabled,'stores',to_jsonb(selected_stores)));
end $function$
;

CREATE OR REPLACE FUNCTION public.kream_my_workplaces()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 return jsonb_build_object('blocked',coalesce((select access_blocked from public.kream_profiles where user_id=auth.uid()),false),'memberships',coalesce((select jsonb_agg(location_key order by location_key) from (select store_id as location_key from public.kream_memberships where user_id=auth.uid() union select 'factory' where exists(select 1 from public.kream_profiles where user_id=auth.uid() and role='factory' and active and not access_blocked)) locations),'[]'::jsonb),'requests',coalesce((select jsonb_agg(to_jsonb(r) order by requested_at desc) from public.kream_access_requests r where user_id=auth.uid()),'[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION public.kream_review_workplace(request_key uuid, approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.kream_access_requests; p public.kream_profiles; actor_role text=kream_private.current_role();before_json jsonb;
begin
 if auth.uid() is null or (actor_role not in ('owner','manager') and not kream_private.is_store_factory_manager()) or actor_role is null then raise exception 'Manager required' using errcode='42501';end if;
 select * into r from public.kream_access_requests where id=request_key for update;
 if not found or r.status<>'pending' or approve is null then raise exception 'Request changed' using errcode='40001';end if;
 select * into p from public.kream_profiles where user_id=r.user_id for update;
 if r.user_id=auth.uid() or p.access_blocked or p.role='owner' then raise exception 'Protected account' using errcode='42501';end if;
 if actor_role<>'owner' and (r.location_key='factory' or p.role<>'employee' or not kream_private.can_manage_store(r.location_key)) then raise exception 'Outside managed stores' using errcode='42501';end if;
 if approve and not exists(select 1 from auth.users where id=r.user_id and email_confirmed_at is not null) then raise exception 'Email verification required' using errcode='22023';end if;
 if approve and r.location_key<>'factory' and not exists(select 1 from public.kream_stores where id=r.location_key and active) then raise exception 'Inactive store' using errcode='22023';end if;
 before_json=to_jsonb(p);
 if approve then
 if r.location_key='factory' then
 if p.role='midland_owner' or p.general_manager then raise exception 'Use owner role editor for this privileged role' using errcode='22023';end if;
 update public.kream_profiles set role='factory',active=true,store_manager=(p.role='manager' or coalesce(p.store_manager,false)),factory_manager=case when p.role='factory' then p.factory_manager else false end,permission_revision=permission_revision+1 where user_id=r.user_id;
 else
 if p.role not in ('employee','manager','midland_owner','factory') or (p.role='midland_owner' and r.location_key<>'midland') then raise exception 'Role does not allow store assignment' using errcode='22023';end if;
 insert into public.kream_memberships(user_id,store_id) values(r.user_id,r.location_key) on conflict do nothing;
 update public.kream_profiles set active=true,permission_revision=permission_revision+1 where user_id=r.user_id;
 end if;end if;
 update public.kream_access_requests set status=case when approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
 insert into public.kream_access_audit(target_user,changed_by,before_access,after_access) values(r.user_id,auth.uid(),before_json,jsonb_build_object('action',case when approve then 'approve_workplace' else 'reject_workplace' end,'location',r.location_key));
end $function$
;

CREATE OR REPLACE FUNCTION kream_private.is_store_factory_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists(select 1 from public.kream_profiles p where p.user_id=auth.uid() and p.active and not coalesce(p.access_blocked,false) and p.role='factory' and p.store_manager and exists(select 1 from public.kream_memberships m where m.user_id=p.user_id)) $function$
;
-- Store managers keep Midland finalization independent of their factory level.
CREATE OR REPLACE FUNCTION kream_private.can_finalize_midland()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select auth.uid() is not null and kream_private.can_order_store('midland')
 and exists(select 1 from public.kream_profiles p where p.user_id=auth.uid()
 and p.active and (p.role in ('owner','manager','midland_owner')
 or p.role='factory' and p.store_manager)) $function$
;
