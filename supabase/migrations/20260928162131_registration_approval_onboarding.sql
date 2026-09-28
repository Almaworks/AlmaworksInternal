set local check_function_bodies = off;

create or replace function public.set_semester_member_access (
  p_actor_profile_id uuid,
  p_profile_id       uuid,
  p_semester_id      uuid,
  p_role             public.user_role,
  p_approve          boolean,
  p_full_name        text,
  p_email            text
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  v_existing_email text;
  v_existing_role public.user_role;
  v_existing_status text;
  v_membership_id uuid;
begin
  if p_actor_profile_id is null or not private.actor_can_manage_semester(p_semester_id, p_actor_profile_id) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;

  select membership.id, membership.role
  into v_membership_id, v_existing_role
  from public.semester_memberships membership
  where membership.semester_id = p_semester_id
    and membership.profile_id = p_profile_id;

  select profile.email, profile.status
  into v_existing_email, v_existing_status
  from public.profiles profile
  where profile.id = p_profile_id;

  if v_existing_email is null then
    raise exception 'Pending Auth-triggered profile is required' using errcode = 'P0002';
  end if;
  if not p_approve and v_membership_id is null then
    raise exception 'Semester member not found' using errcode = 'P0002';
  end if;
  if v_membership_id is null and v_existing_status is distinct from 'pending' then
    raise exception 'Pending Auth-triggered profile is required' using errcode = '23514';
  end if;
  if v_membership_id is null and (
    nullif(trim(p_email), '') is null
    or lower(v_existing_email) is distinct from lower(trim(p_email))
  ) then
    raise exception 'Profile email does not match the Auth-triggered identity' using errcode = '23514';
  end if;

  if private.actor_is_super_admin(p_profile_id) and not private.actor_is_super_admin(p_actor_profile_id) then
    raise exception 'Platform super-administrator access required for this identity' using errcode = '42501';
  end if;

  if v_membership_id is not null
     and v_existing_role is distinct from p_role
     and (
       exists (
         select 1 from public.mentor_semesters
         where semester_membership_id = v_membership_id
       )
       or exists (
         select 1 from public.startup_team_memberships
         where semester_membership_id = v_membership_id
       )
     ) then
    raise exception 'Role transition requires explicit data migration' using errcode = '23514';
  end if;

  if p_approve then
    update public.profiles
    set status = 'approved',
        is_active = true,
        updated_at = now()
    where id = p_profile_id;
  else
    update public.profiles
    set email = coalesce(nullif(trim(p_email), ''), email),
        full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
        updated_at = now()
    where id = p_profile_id;
  end if;

  insert into public.semester_memberships (
    semester_id, profile_id, role, status, activated_at
  ) values (
    p_semester_id,
    p_profile_id,
    p_role,
    case
      when p_approve is not true or p_role = 'admin' then 'active'::public.membership_lifecycle_status
      else 'onboarding'::public.membership_lifecycle_status
    end,
    case when p_approve is not true or p_role = 'admin' then now() else null end
  )
  on conflict (semester_id, profile_id) do update
  set role = excluded.role,
      status = case
        when p_approve is not true then 'active'::public.membership_lifecycle_status
        when public.semester_memberships.status = 'invited' then
          case
            when excluded.role = 'admin' then 'active'::public.membership_lifecycle_status
            else 'onboarding'::public.membership_lifecycle_status
          end
        else public.semester_memberships.status
      end,
      activated_at = case
        when p_approve is not true then coalesce(public.semester_memberships.activated_at, now())
        when public.semester_memberships.status = 'invited' and excluded.role = 'admin' then
          coalesce(public.semester_memberships.activated_at, now())
        when public.semester_memberships.status = 'invited' then null
        else public.semester_memberships.activated_at
      end,
      updated_at = now()
  returning id into v_membership_id;

  if p_role = 'mentor' then
    insert into public.mentor_profiles (profile_id)
    values (p_profile_id)
    on conflict (profile_id) do nothing;

    insert into public.mentor_semesters (
      semester_id, semester_membership_id, readiness_status
    ) values (
      p_semester_id, v_membership_id, 'not_started'
    )
    on conflict (semester_id, semester_membership_id) do nothing;
  end if;

  return v_membership_id;
end;
$function$;
