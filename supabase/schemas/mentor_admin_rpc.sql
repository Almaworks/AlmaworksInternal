create or replace function public.create_mentor_records(
  p_actor_profile_id uuid,
  p_profile_id uuid,
  p_semester_id uuid,
  p_email text,
  p_biography text,
  p_company text,
  p_expertise_tags text[],
  p_is_active boolean,
  p_linkedin_url text,
  p_title text,
  p_general_availability text,
  p_opening_talk text,
  p_preferred_format text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_is_super_admin boolean;
  v_existing_email text;
  v_existing_role public.user_role;
  v_existing_status text;
  v_membership_id uuid;
  v_mentor_semester_id uuid;
begin
  select exists (
    select 1
    from public.platform_roles platform_role
    where platform_role.profile_id = p_actor_profile_id
      and platform_role.role = 'super_admin'
  )
  into v_actor_is_super_admin;

  if p_actor_profile_id is null or not (
    v_actor_is_super_admin
    or exists (
      select 1
      from public.semester_memberships membership
      where membership.semester_id = p_semester_id
        and membership.profile_id = p_actor_profile_id
        and membership.role = 'admin'
        and membership.status = 'active'
    )
  ) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.platform_roles platform_role
    where platform_role.profile_id = p_profile_id
      and platform_role.role = 'super_admin'
  ) and not v_actor_is_super_admin then
    raise exception 'Platform super-administrator access required for this identity' using errcode = '42501';
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
  if v_membership_id is null and v_existing_status is distinct from 'pending' then
    raise exception 'Pending Auth-triggered profile is required' using errcode = '23514';
  end if;
  if v_membership_id is null and (
    nullif(trim(p_email), '') is null
    or lower(v_existing_email) is distinct from lower(trim(p_email))
  ) then
    raise exception 'Profile email does not match the Auth-triggered identity' using errcode = '23514';
  end if;
  if v_existing_role is not null and v_existing_role <> 'mentor' then
    raise exception 'Existing semester membership has an incompatible role' using errcode = '23514';
  end if;

  update public.profiles
  set status = 'approved',
      is_active = true,
      updated_at = now()
  where id = p_profile_id;

  insert into public.semester_memberships (
    semester_id, profile_id, role, status, activated_at
  ) values (
    p_semester_id,
    p_profile_id,
    'mentor',
    case
      when p_is_active then 'active'::public.membership_lifecycle_status
      else 'onboarding'::public.membership_lifecycle_status
    end,
    case when p_is_active then now() else null end
  )
  on conflict (semester_id, profile_id) do update
  set status = excluded.status,
      activated_at = excluded.activated_at,
      updated_at = now()
  returning id into v_membership_id;

  insert into public.mentor_profiles (
    profile_id, biography, company, expertise_tags, linkedin_url, title
  ) values (
    p_profile_id,
    p_biography,
    p_company,
    coalesce(p_expertise_tags, '{}'::text[]),
    p_linkedin_url,
    p_title
  )
  on conflict (profile_id) do update
  set biography = excluded.biography,
      company = excluded.company,
      expertise_tags = excluded.expertise_tags,
      linkedin_url = excluded.linkedin_url,
      title = excluded.title,
      updated_at = now();

  insert into public.mentor_semesters (
    semester_id,
    semester_membership_id,
    general_availability,
    opening_talk,
    preferred_format,
    readiness_status
  ) values (
    p_semester_id,
    v_membership_id,
    p_general_availability,
    p_opening_talk,
    p_preferred_format,
    case when p_is_active then 'ready' else 'not_started' end
  )
  on conflict (semester_id, semester_membership_id) do update
  set general_availability = excluded.general_availability,
      opening_talk = excluded.opening_talk,
      preferred_format = excluded.preferred_format,
      readiness_status = excluded.readiness_status,
      updated_at = now()
  returning id into v_mentor_semester_id;

  return v_mentor_semester_id;
end;
$$;

revoke all on function public.create_mentor_records(uuid,uuid,uuid,text,text,text,text[],boolean,text,text,text,text,text)
from public, anon, authenticated;

grant execute on function public.create_mentor_records(uuid,uuid,uuid,text,text,text,text[],boolean,text,text,text,text,text)
to service_role, postgres;
