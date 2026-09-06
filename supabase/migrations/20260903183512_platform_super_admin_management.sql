set local check_function_bodies = off;

create or replace function public.set_platform_super_admin (
  p_profile_id uuid,
  p_enabled    boolean
)
  returns void
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  v_actor_profile_id uuid;
  v_audit_semester_id uuid;
  v_super_admin_count integer;
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required' using errcode = '42501';
  end if;

  v_actor_profile_id := private.current_profile_id();
  if p_profile_id is null then
    raise exception 'Profile is required' using errcode = '22023';
  end if;
  if p_profile_id = v_actor_profile_id then
    raise exception 'You cannot change your own platform super-administrator access' using errcode = '42501';
  end if;

  select semester.id into v_audit_semester_id
  from public.semesters semester
  where semester.is_active = true
  limit 1;
  if v_audit_semester_id is null then
    raise exception 'An active semester is required to change platform access' using errcode = '22023';
  end if;

  if p_enabled then
    if not exists (
      select 1 from public.semester_memberships membership
      join public.semesters semester on semester.id = membership.semester_id
      where membership.profile_id = p_profile_id and membership.role = 'admin'
        and membership.status = 'active' and semester.is_active = true
    ) then
      raise exception 'Only an active Admin member can be granted platform super-administrator access' using errcode = '42501';
    end if;
    insert into public.platform_roles (profile_id, role, granted_by)
    values (p_profile_id, 'super_admin', v_actor_profile_id)
    on conflict (profile_id, role) do update
    set granted_by = v_actor_profile_id, granted_at = now();
  else
    if not exists (select 1 from public.platform_roles where profile_id = p_profile_id and role = 'super_admin') then return; end if;
    select count(*) into v_super_admin_count from public.platform_roles where role = 'super_admin';
    if v_super_admin_count <= 1 then
      raise exception 'You cannot revoke the final platform super-administrator' using errcode = '42501';
    end if;
    delete from public.platform_roles where profile_id = p_profile_id and role = 'super_admin';
  end if;

  insert into public.program_audit_events (semester_id, actor_profile_id, action, subject_type, subject_id, details)
  values (v_audit_semester_id, v_actor_profile_id,
    case when p_enabled then 'platform.super_admin_granted' else 'platform.super_admin_revoked' end,
    'profile', p_profile_id, jsonb_build_object('role', 'super_admin'));
end;
$function$;

revoke all on function "public"."set_platform_super_admin"(uuid, boolean) from "authenticated";

grant execute on function "public"."set_platform_super_admin"(uuid, boolean) to "authenticated";
