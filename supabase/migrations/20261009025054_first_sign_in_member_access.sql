set local check_function_bodies = off;

alter table "public"."profiles"
  drop constraint "profiles_status_check";

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  AS $function$ begin insert into public.profiles(id,auth_user_id,email,role,status,full_name) values(new.id,new.id,lower(new.email),'startup'::public.user_role,case when new.raw_user_meta_data->>'access_request_submitted' = 'true' then 'pending' else 'unregistered' end,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name')) on conflict(id) do update set auth_user_id=excluded.auth_user_id,email=excluded.email,full_name=coalesce(public.profiles.full_name,excluded.full_name),updated_at=now(); return new; end; $function$;

create or replace function public.request_own_access (
  p_full_name text
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
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
$function$;

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
  if auth.uid() is not null and p_actor_profile_id is distinct from private.current_profile_id() then
    raise exception 'Authenticated actor does not match administrator' using errcode = '42501';
  end if;
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
  if v_membership_id is null and (not p_approve or v_existing_status not in ('unregistered', 'pending', 'approved', 'rejected')) then
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
        full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
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

alter table "public"."profiles"
  add constraint "profiles_status_check" check ((status = ANY (ARRAY['unregistered'::text, 'pending'::text, 'approved'::text, 'rejected'::text])));

revoke all on function "public"."request_own_access"(text) from public;

grant execute on function "public"."request_own_access"(text) to "authenticated", "postgres";

revoke all on function "public"."set_semester_member_access"(uuid, uuid, uuid, public.user_role, boolean, text, text) from "authenticated";

grant execute on function "public"."set_semester_member_access"(uuid, uuid, uuid, public.user_role, boolean, text, text) to "authenticated";
