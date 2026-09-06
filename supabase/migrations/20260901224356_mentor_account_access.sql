set local check_function_bodies = off;

create or replace function public.set_mentor_account_access (
  p_mentor_semester_id uuid,
  p_enabled            boolean
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
  v_profile_id uuid;
  v_semester_id uuid;
  v_suspended_membership_ids uuid[] := '{}';
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required' using errcode = '42501';
  end if;

  select membership.profile_id, term.semester_id, profile.auth_user_id
  into v_profile_id, v_semester_id, v_auth_user_id
  from public.mentor_semesters term
  join public.semester_memberships membership
    on membership.id = term.semester_membership_id
   and membership.semester_id = term.semester_id
   and membership.role = 'mentor'
  join public.profiles profile on profile.id = membership.profile_id
  where term.id = p_mentor_semester_id;

  if v_profile_id is null then
    raise exception 'Mentor semester not found' using errcode = 'P0002';
  end if;
  if v_profile_id = v_actor_profile_id then
    raise exception 'You cannot disable your own account from the mentor directory' using errcode = '42501';
  end if;
  if exists (select 1 from public.platform_roles where profile_id = v_profile_id) then
    raise exception 'Platform administrators cannot be disabled from the mentor directory' using errcode = '42501';
  end if;

  update public.profiles
  set is_active = p_enabled,
      updated_at = now()
  where id = v_profile_id;

  if not p_enabled then
    with suspended as (
      update public.semester_memberships
      set status = 'suspended',
          suspended_at = now(),
          updated_at = now()
      where profile_id = v_profile_id
        and status in ('invited', 'onboarding', 'active')
      returning id
    )
    select coalesce(array_agg(id), '{}')
    into v_suspended_membership_ids
    from suspended;
  end if;

  insert into public.program_audit_events (
    semester_id, actor_profile_id, action, subject_type, subject_id, details
  ) values (
    v_semester_id,
    v_actor_profile_id,
    case when p_enabled then 'mentor.account_reinstated' else 'mentor.account_disabled' end,
    'profile',
    v_profile_id,
    jsonb_build_object(
      'mentor_semester_id', p_mentor_semester_id,
      'profile_is_active', p_enabled,
      'suspended_membership_ids', v_suspended_membership_ids
    )
  );

  return query select v_profile_id, v_auth_user_id, p_enabled, v_suspended_membership_ids;
end;
$function$;

revoke all on function "public"."set_mentor_account_access"(uuid, boolean) from public;

grant execute on function "public"."set_mentor_account_access"(uuid, boolean) to "authenticated", "postgres";
