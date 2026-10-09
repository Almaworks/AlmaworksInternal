-- Ordinary sign-in creates an identity, not a request. Only the authenticated
-- owner may explicitly submit an unregistered identity for administrator review.
create or replace function public.request_own_access(p_full_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := private.current_profile_id();
  existing_status text;
begin
  if auth.uid() is null or actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_full_name), '') is null then
    raise exception 'Name is required' using errcode = '22023';
  end if;
  select status into existing_status from public.profiles where id=actor_id for update;
  if existing_status in ('pending', 'approved') then return actor_id; end if;
  if existing_status is distinct from 'unregistered' then
    raise exception 'Contact an administrator to restore rejected access' using errcode = '42501';
  end if;
  update public.profiles set status='pending', full_name=btrim(p_full_name), updated_at=now() where id=actor_id;
  return actor_id;
end;
$$;
revoke all on function public.request_own_access(text) from public, anon;
grant execute on function public.request_own_access(text) to authenticated;
