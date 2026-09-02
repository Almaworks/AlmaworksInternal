set local check_function_bodies = off;

create or replace function public.discard_replacement_auth_placeholder (
  p_profile_id   uuid,
  p_auth_user_id uuid
)
  returns table (
    profile_id            uuid,
    auth_user_id          uuid,
    placeholder_discarded boolean
  )
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  v_actor_profile_id uuid := private.current_profile_id();
  v_retained_auth_user_id uuid;
  v_retained_email text;
  v_retained_is_active boolean;
  v_auth_email text;
  v_placeholder_profile_id uuid;
  v_placeholder_auth_user_id uuid;
  v_placeholder_email text;
  v_placeholder_role public.user_role;
  v_placeholder_status text;
  v_placeholder_is_active boolean;
  v_placeholder_semester_id uuid;
  v_placeholder_created_at timestamptz;
  v_placeholder_updated_at timestamptz;
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required' using errcode = '42501';
  end if;

  select profile.auth_user_id, profile.email, profile.is_active
  into v_retained_auth_user_id, v_retained_email, v_retained_is_active
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if not found then
    raise exception 'Member profile not found' using errcode = 'P0002';
  end if;
  if p_profile_id = v_actor_profile_id then
    raise exception 'You cannot discard a replacement placeholder for your own login identity' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.platform_roles platform_role
    where platform_role.profile_id = p_profile_id
  ) then
    raise exception 'Platform role holders cannot have replacement placeholders discarded' using errcode = '42501';
  end if;
  if v_retained_auth_user_id is not null or v_retained_is_active then
    raise exception 'Retained profile must be unlinked and disabled' using errcode = '55000';
  end if;

  select auth_user.email
  into v_auth_email
  from auth.users auth_user
  where auth_user.id = p_auth_user_id
  for update;

  if not found then
    raise exception 'Replacement Auth user not found' using errcode = 'P0002';
  end if;
  if lower(btrim(v_retained_email)) is distinct from lower(btrim(v_auth_email)) then
    raise exception 'Replacement email does not match the retained profile' using errcode = '22023';
  end if;

  select
    profile.id,
    profile.auth_user_id,
    profile.email,
    profile.role,
    profile.status,
    profile.is_active,
    profile.semester_id,
    profile.created_at,
    profile.updated_at
  into
    v_placeholder_profile_id,
    v_placeholder_auth_user_id,
    v_placeholder_email,
    v_placeholder_role,
    v_placeholder_status,
    v_placeholder_is_active,
    v_placeholder_semester_id,
    v_placeholder_created_at,
    v_placeholder_updated_at
  from public.profiles profile
  where profile.id = p_auth_user_id
  for update;

  if not found then
    if exists (
      select 1
      from public.profiles profile
      where profile.auth_user_id = p_auth_user_id
    ) then
      raise exception 'Replacement Auth identity is linked to a non-placeholder profile' using errcode = '55000';
    end if;

    return query
    select p_profile_id, p_auth_user_id, false;
    return;
  end if;

  if v_placeholder_auth_user_id is distinct from p_auth_user_id
    or v_placeholder_role is distinct from 'startup'::public.user_role
    or v_placeholder_status is distinct from 'pending'
    or v_placeholder_is_active is distinct from true
    or v_placeholder_semester_id is not null
    or v_placeholder_created_at is distinct from v_placeholder_updated_at
  then
    raise exception 'Replacement profile is not an untouched Auth-trigger placeholder' using errcode = '55000';
  end if;
  if lower(btrim(v_placeholder_email)) is distinct from lower(btrim(v_auth_email)) then
    raise exception 'Replacement profile email does not match its Auth identity' using errcode = '22023';
  end if;

  if exists (select 1 from public.semester_memberships membership where membership.profile_id = v_placeholder_profile_id)
    or exists (select 1 from public.platform_roles platform_role where platform_role.profile_id = v_placeholder_profile_id or platform_role.granted_by = v_placeholder_profile_id)
    or exists (select 1 from public.mentor_profiles mentor_profile where mentor_profile.profile_id = v_placeholder_profile_id)
    or exists (select 1 from public.invitations invitation where invitation.invited_by = v_placeholder_profile_id or invitation.matched_profile_id = v_placeholder_profile_id)
    or exists (select 1 from public.program_audit_events audit_event where audit_event.actor_profile_id = v_placeholder_profile_id)
    or exists (select 1 from public.outreach_contacts contact where contact.created_by = v_placeholder_profile_id or contact.archived_by = v_placeholder_profile_id)
    or exists (select 1 from public.outreach_companies company where company.created_by = v_placeholder_profile_id)
    or exists (
      select 1
      from public.outreach_opportunities opportunity
      where opportunity.owner_profile_id = v_placeholder_profile_id
        or opportunity.silenced_by = v_placeholder_profile_id
        or opportunity.created_by = v_placeholder_profile_id
        or opportunity.archived_by = v_placeholder_profile_id
    )
    or exists (
      select 1
      from public.outreach_activities activity
      where activity.actor_profile_id = v_placeholder_profile_id
        or activity.previous_owner_profile_id = v_placeholder_profile_id
        or activity.new_owner_profile_id = v_placeholder_profile_id
    )
    or exists (select 1 from public.outreach_imports outreach_import where outreach_import.created_by = v_placeholder_profile_id)
  then
    raise exception 'Replacement profile contains durable references' using errcode = '55000';
  end if;

  delete from public.profiles profile
  where profile.id = v_placeholder_profile_id
    and profile.auth_user_id = p_auth_user_id;

  if not found then
    raise exception 'Replacement placeholder changed during discard' using errcode = '40001';
  end if;

  return query
  select p_profile_id, p_auth_user_id, true;
end;
$function$;

revoke all on function "public"."discard_replacement_auth_placeholder"(uuid, uuid) from public;

grant execute on function "public"."discard_replacement_auth_placeholder"(uuid, uuid) to "authenticated", "postgres";
