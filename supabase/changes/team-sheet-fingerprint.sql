-- Only the fingerprint leaves the private Apps Script project.
create or replace function public.kream_team_sheet_runtime_config() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('secret',c->>'team_sheet_secret','fingerprint',c->>'team_sheet_fingerprint')
 from (select decrypted_secret::jsonb c from vault.decrypted_secrets where name='kream_live_integrations') x
$$;
revoke all on function public.kream_team_sheet_runtime_config() from public,anon,authenticated;
grant execute on function public.kream_team_sheet_runtime_config() to service_role;
