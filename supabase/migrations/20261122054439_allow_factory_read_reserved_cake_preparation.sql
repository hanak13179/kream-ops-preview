create function kream_private.can_read_factory_cake_reservations()
returns boolean language sql stable security definer set search_path=''
as $$select exists(select 1 from public.kream_profiles p where p.user_id=auth.uid() and p.active and not p.access_blocked and p.role='factory')$$;
revoke all on function kream_private.can_read_factory_cake_reservations() from public,anon;
grant execute on function kream_private.can_read_factory_cake_reservations() to authenticated;
alter policy cake_reservations_read on public.kream_cake_reservations to authenticated
using(kream_private.can_read_cake_reservation(store_id) or kream_private.can_read_factory_cake_reservations());
comment on function kream_private.can_read_factory_cake_reservations() is 'Approved factory staff and managers may read all branches for cake preparation. This does not grant message review or direct write permissions.';