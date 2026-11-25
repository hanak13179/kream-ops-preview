-- Runtime secrets stay encrypted in Vault; only server functions can read them.
create function public.kream_push_runtime_config() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('public_key',c->>'vapid_public','private_key',c->>'vapid_private','subject',c->>'subject','cron_secret',c->>'push_cron_secret')
 from (select decrypted_secret::jsonb c from vault.decrypted_secrets where name='kream_live_integrations') x
$$;
create function public.kream_team_sheet_runtime_config() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('secret',decrypted_secret::jsonb->>'team_sheet_secret') from vault.decrypted_secrets where name='kream_live_integrations'
$$;
revoke all on function public.kream_push_runtime_config(),public.kream_team_sheet_runtime_config() from public,anon,authenticated;
grant execute on function public.kream_push_runtime_config(),public.kream_team_sheet_runtime_config() to service_role;

-- Claim each planned alert once across overlapping invocations. Failed sends can release the claim.
create function public.kream_push_claim(alert_key text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 insert into public.kream_push_sent(key) values(alert_key) on conflict do nothing;
 return found;
end $$;
revoke all on function public.kream_push_claim(text) from public,anon,authenticated;
grant execute on function public.kream_push_claim(text) to service_role;

create function kream_private.invoke_push_job(dry_run boolean default false) returns bigint
language sql security definer set search_path='' as $$
 select net.http_post(url:='https://imkhosgnkgwchoyrqczw.supabase.co/functions/v1/kream-push',
 headers:=jsonb_build_object('Content-Type','application/json','x-kream-cron-secret',decrypted_secret::jsonb->>'push_cron_secret'),
 body:=jsonb_build_object('dry_run',dry_run),timeout_milliseconds:=20000)
 from vault.decrypted_secrets where name='kream_live_integrations'
$$;
revoke all on function kream_private.invoke_push_job(boolean) from public,anon,authenticated;

-- Server-only reads for notification planning and delivery cleanup.
grant select on public.kream_profiles,public.kream_memberships,public.kream_orders,public.kream_team_shifts,public.kream_team_timecards,public.kream_team_time_off,public.kream_team_swaps,public.kream_team_timecard_requests,public.kream_finished_stock,public.kream_catalog,public.kream_push_subscriptions to service_role;
grant delete on public.kream_push_subscriptions,public.kream_push_sent to service_role;
select cron.schedule('kream-push-every-five-minutes','*/5 * * * *',$job$select kream_private.invoke_push_job(false);$job$);
