begin;
do $test$
declare k text; target uuid='895e3963-c5dc-4f63-8ee4-9403026de6ca'; owner_id uuid='a7ee8fbe-9054-4d27-9568-3229b19f158c'; p public.kream_profiles; req uuid; st text;
begin
 foreach k in array array['employee_factory','employee_factory_manager','manager_factory_staff','manager_factory'] loop
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  select * into p from public.kream_profiles where user_id=target;
  perform public.kream_assign_access(target,k,array['finch'],true,p.permission_revision);
  select * into p from public.kream_profiles where user_id=target;
  if p.role<>'factory' or p.factory_manager<>(k in ('employee_factory_manager','manager_factory')) or p.store_manager<>(k in ('manager_factory_staff','manager_factory')) then raise exception 'Role level mismatch %',k;end if;
  perform set_config('request.jwt.claim.sub',target::text,true);
  if not kream_private.can_order_store('finch') or kream_private.can_order_store('downtown') then raise exception 'Assigned-store scope failed %',k;end if;
  if kream_private.can_manage_store('finch')<>(k in ('manager_factory_staff','manager_factory')) then raise exception 'Employee promoted to manager %',k;end if;
  if not (public.kream_my_workplaces()->'memberships' @> '["finch","factory"]'::jsonb) then raise exception 'Missing workplaces';end if;
 end loop;
 foreach st in array array['finch','factory'] loop
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  delete from public.kream_access_requests where user_id=target;
  delete from public.kream_memberships where user_id=target;
  update public.kream_profiles set role='employee',active=false,factory_manager=false,store_manager=false,general_manager=false,access_blocked=false where user_id=target;
  insert into public.kream_access_requests(user_id,location_key) values(target,st) returning id into req;
  perform public.kream_review_workplace(req,true);
  insert into public.kream_access_requests(user_id,location_key) values(target,case when st='finch' then 'factory' else 'finch' end) returning id into req;
  perform public.kream_review_workplace(req,true);
  select * into p from public.kream_profiles where user_id=target;
  if p.role<>'factory' or p.factory_manager or p.store_manager or not exists(select 1 from public.kream_memberships where user_id=target and store_id='finch') then raise exception 'Approval order loses workplace %',st;end if;
 end loop;
 perform set_config('request.jwt.claim.sub',target::text,true);
 begin
  perform public.kream_assign_access(target,'manager_factory',array['finch'],true,p.permission_revision);
  raise exception 'Employee self-promotion allowed';
 exception when insufficient_privilege then null; end;
end $test$;
rollback;
select 'all mixed-role combinations, both approval orders, store scoping and self-promotion checks passed; rolled back' as result;
