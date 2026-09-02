set local check_function_bodies = off;

create or replace function public.attach_replacement_auth_identity (
  p_profile_id   uuid,
  p_auth_user_id uuid
)
  returns table (
    profile_id        uuid,
    auth_user_id      uuid,
    profile_is_active boolean
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
  v_placeholder_profile_id uuid;
  v_placeholder_email text;
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
    raise exception 'You cannot replace your own login identity' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.platform_roles platform_role
    where platform_role.profile_id = p_profile_id
  ) then
    raise exception 'Platform role holders cannot have their login identity replaced' using errcode = '42501';
  end if;
  if v_retained_auth_user_id is not null or v_retained_is_active then
    raise exception 'Retained profile must be unlinked and disabled' using errcode = '55000';
  end if;

  select profile.id, profile.email
  into v_placeholder_profile_id, v_placeholder_email
  from public.profiles profile
  where profile.auth_user_id = p_auth_user_id
  for update;

  if not found or v_placeholder_profile_id = p_profile_id then
    raise exception 'Replacement placeholder profile not found' using errcode = 'P0002';
  end if;
  if lower(btrim(v_retained_email)) is distinct from lower(btrim(v_placeholder_email)) then
    raise exception 'Replacement email does not match the retained profile' using errcode = '22023';
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
  where profile.id = v_placeholder_profile_id;

  update public.profiles profile
  set auth_user_id = p_auth_user_id,
      is_active = true,
      updated_at = now()
  where profile.id = p_profile_id;

  insert into public.program_audit_events (
    semester_id,
    actor_profile_id,
    action,
    subject_type,
    subject_id,
    details
  )
  select
    membership.semester_id,
    v_actor_profile_id,
    'member.login_restored',
    'profile',
    p_profile_id,
    jsonb_build_object(
      'target_profile_id', p_profile_id,
      'replacement_auth_user_id', p_auth_user_id,
      'membership_status', membership.status
    )
  from public.semester_memberships membership
  where membership.profile_id = p_profile_id
  order by membership.semester_id;

  return query
  select p_profile_id, p_auth_user_id, true;
end;
$function$;

create or replace function public.prepare_member_login_removal (
  p_profile_id uuid,
  p_reason     text
)
  returns table (
    profile_id               uuid,
    auth_user_id             uuid,
    profile_is_active        boolean,
    suspended_membership_ids uuid[]
  )
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  v_actor_profile_id uuid := private.current_profile_id();
  v_auth_user_id uuid;
  v_is_active boolean;
  v_latest_account_action text;
  v_prior_statuses jsonb;
  v_suspended_membership_ids uuid[] := '{}'::uuid[];
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Removal reason is required' using errcode = '22023';
  end if;

  select profile.auth_user_id, profile.is_active
  into v_auth_user_id, v_is_active
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if not found then
    raise exception 'Member profile not found' using errcode = 'P0002';
  end if;
  if p_profile_id = v_actor_profile_id then
    raise exception 'You cannot remove your own login account' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.platform_roles platform_role
    where platform_role.profile_id = p_profile_id
  ) then
    raise exception 'Platform role holders cannot have their login account removed' using errcode = '42501';
  end if;

  select audit_event.action
  into v_latest_account_action
  from public.program_audit_events audit_event
  where audit_event.subject_type = 'profile'
    and audit_event.subject_id = p_profile_id
    and audit_event.action in ('member.login_removal_prepared', 'member.login_restored')
  order by audit_event.created_at desc, audit_event.action desc
  limit 1;

  select coalesce(
    jsonb_object_agg(membership.id::text, membership.status::text),
    '{}'::jsonb
  )
  into v_prior_statuses
  from public.semester_memberships membership
  where membership.profile_id = p_profile_id;

  if v_is_active then
    update public.profiles profile
    set is_active = false,
        updated_at = now()
    where profile.id = p_profile_id
      and profile.is_active;
  end if;

  with suspended as (
    update public.semester_memberships membership
    set status = 'suspended',
        suspended_at = now(),
        updated_at = now()
    where membership.profile_id = p_profile_id
      and membership.status in ('invited', 'onboarding', 'active')
    returning membership.id
  )
  select coalesce(array_agg(suspended.id order by suspended.id), '{}'::uuid[])
  into v_suspended_membership_ids
  from suspended;

  if v_latest_account_action is distinct from 'member.login_removal_prepared' then
    insert into public.program_audit_events (
      semester_id,
      actor_profile_id,
      action,
      subject_type,
      subject_id,
      details
    )
    select
      membership.semester_id,
      v_actor_profile_id,
      'member.login_removal_prepared',
      'profile',
      p_profile_id,
      jsonb_build_object(
        'reason', btrim(p_reason),
        'target_profile_id', p_profile_id,
        'prior_statuses', jsonb_build_array(
          jsonb_build_object(
            'membership_id', membership.id,
            'status', v_prior_statuses ->> membership.id::text
          )
        ),
        'affected_membership_ids', case
          when membership.id = any(v_suspended_membership_ids) then jsonb_build_array(membership.id)
          else '[]'::jsonb
        end
      )
    from public.semester_memberships membership
    where membership.profile_id = p_profile_id
    order by membership.semester_id;
  end if;

  return query
  select p_profile_id, v_auth_user_id, false, v_suspended_membership_ids;
end;
$function$;

create or replace function public.preview_member_login_removal (
  p_profile_id uuid
)
  returns table (
    profile_id             uuid,
    auth_user_id           uuid,
    full_name              text,
    email                  text,
    profile_is_active      boolean,
    semester_count         bigint,
    session_count          bigint,
    suspend_membership_ids uuid[],
    already_prepared       boolean
  )
  language plpgsql
  stable
  security definer
  set search_path to ''
  AS $function$
declare
  v_latest_account_action text;
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required' using errcode = '42501';
  end if;

  if p_profile_id = private.current_profile_id() then
    raise exception 'You cannot remove your own login account' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.platform_roles platform_role
    where platform_role.profile_id = p_profile_id
  ) then
    raise exception 'Platform role holders cannot have their login account removed' using errcode = '42501';
  end if;

  select audit_event.action
  into v_latest_account_action
  from public.program_audit_events audit_event
  where audit_event.subject_type = 'profile'
    and audit_event.subject_id = p_profile_id
    and audit_event.action in ('member.login_removal_prepared', 'member.login_restored')
  order by audit_event.created_at desc, audit_event.action desc
  limit 1;

  return query
  select
    profile.id,
    profile.auth_user_id,
    profile.full_name,
    profile.email,
    profile.is_active,
    (
      select count(distinct membership.semester_id)
      from public.semester_memberships membership
      where membership.profile_id = profile.id
    ),
    (
      select count(*)
      from (
        select session.id
        from public.sessions session
        join public.mentor_semesters mentor_term
          on mentor_term.id = session.mentor_semester_id
         and mentor_term.semester_id = session.semester_id
        join public.semester_memberships mentor_membership
          on mentor_membership.id = mentor_term.semester_membership_id
         and mentor_membership.semester_id = mentor_term.semester_id
        where mentor_membership.profile_id = profile.id
        union
        select session.id
        from public.sessions session
        join public.startup_team_memberships startup_team
          on startup_team.startup_semester_id = session.startup_semester_id
         and startup_team.semester_id = session.semester_id
        join public.semester_memberships startup_membership
          on startup_membership.id = startup_team.semester_membership_id
         and startup_membership.semester_id = startup_team.semester_id
        where startup_membership.profile_id = profile.id
      ) retained_session
    ),
    (
      select coalesce(array_agg(membership.id order by membership.id), '{}'::uuid[])
      from public.semester_memberships membership
      where membership.profile_id = profile.id
        and membership.status in ('invited', 'onboarding', 'active')
    ),
    coalesce(v_latest_account_action = 'member.login_removal_prepared', false)
  from public.profiles profile
  where profile.id = p_profile_id;

  if not found then
    raise exception 'Member profile not found' using errcode = 'P0002';
  end if;
end;
$function$;

revoke all on function "public"."attach_replacement_auth_identity"(uuid, uuid) from public;

grant execute on function "public"."attach_replacement_auth_identity"(uuid, uuid) to "authenticated", "postgres";

revoke all on function "public"."prepare_member_login_removal"(uuid, text) from public;

grant execute on function "public"."prepare_member_login_removal"(uuid, text) to "authenticated", "postgres";

revoke all on function "public"."preview_member_login_removal"(uuid) from public;

grant execute on function "public"."preview_member_login_removal"(uuid) to "authenticated", "postgres";
