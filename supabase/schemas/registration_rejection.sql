-- Pending registration rejection is an RLS-scoped, status-only update.
-- A status column grant also applies to a member's existing self-update RLS
-- policy, so reject every other direct authenticated status transition.
create or replace function private.can_reject_pending_registration(candidate_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select candidate_id is not null
    and candidate_id is not distinct from auth.uid()
    and exists (
      select 1
      from public.profiles actor
      join public.platform_roles platform_role on platform_role.profile_id = actor.id
      where actor.auth_user_id = candidate_id
        and actor.status = 'approved'
        and actor.is_active
        and platform_role.role = 'super_admin'
    );
$$;

revoke all on function private.can_reject_pending_registration(uuid) from public;
grant execute on function private.can_reject_pending_registration(uuid) to authenticated, postgres;

create or replace function private.guard_direct_profile_status_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated'
     and old.status is distinct from new.status
     and not (
       old.status = 'pending'
       and new.status = 'rejected'
       and private.can_reject_pending_registration(auth.uid())
     ) then
    raise exception 'Profile status cannot be changed directly'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_direct_profile_status_change on public.profiles;
create trigger guard_direct_profile_status_change
  before update of status on public.profiles
  for each row execute function private.guard_direct_profile_status_change();

grant update (status) on table public.profiles to authenticated;

drop policy if exists "super admins reject pending registrations" on public.profiles;
create policy "super admins reject pending registrations"
  on public.profiles for update to authenticated
  using (status = 'pending' and private.can_reject_pending_registration((select auth.uid())))
  with check (status = 'rejected' and private.can_reject_pending_registration((select auth.uid())));
