set local check_function_bodies = off;

create or replace function public.bulk_set_membership_activity (
  p_semester_id    uuid,
  p_membership_ids uuid[],
  p_is_active      boolean
)
  returns integer
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
declare
  v_requested_count integer;
  v_matching_count integer;
  v_updated_count integer;
  v_status public.membership_lifecycle_status;
begin
  if auth.uid() is null or not public.can_manage_semester(p_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;

  v_requested_count := coalesce(cardinality(p_membership_ids), 0);
  if v_requested_count < 1 or v_requested_count > 200 then
    raise exception 'Between 1 and 200 membership ids are required' using errcode = '22023';
  end if;

  select count(*)
  into v_matching_count
  from public.semester_memberships as target
  where target.semester_id = p_semester_id
    and target.id = any(p_membership_ids);

  if v_matching_count <> v_requested_count then
    raise exception 'Every selected membership must belong to the target semester' using errcode = '22023';
  end if;

  v_status := case when p_is_active then 'active' else 'suspended' end;
  update public.semester_memberships as target
  set status = v_status,
      activated_at = case when p_is_active then coalesce(target.activated_at, now()) else target.activated_at end,
      suspended_at = case when p_is_active then null else now() end,
      updated_at = now()
  where target.semester_id = p_semester_id
    and target.id = any(p_membership_ids);
  get diagnostics v_updated_count = row_count;

  insert into public.lifecycle_audit_events (
    semester_id, actor_profile_id, action, subject_type, subject_id, details
  )
  select p_semester_id,
         auth.uid(),
         case when p_is_active then 'membership.activated' else 'membership.suspended' end,
         'semester_membership',
         membership_id,
         jsonb_build_object('bulk', true, 'status', v_status)
  from unnest(p_membership_ids) as membership_id;

  return v_updated_count;
end;
$function$;

create or replace function public.import_prior_semester_memberships (
  p_source_semester_id uuid,
  p_target_semester_id uuid,
  p_membership_ids     uuid[] default null::uuid[]
)
  returns table (
    source_count   integer,
    imported_count integer,
    skipped_count  integer
  )
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
declare
  v_source_count integer;
  v_requested_count integer;
  v_imported_ids uuid[];
  v_imported_count integer;
begin
  if p_source_semester_id = p_target_semester_id then
    raise exception 'Source and target semesters must differ' using errcode = '22023';
  end if;
  if auth.uid() is null
    or not public.can_manage_semester(p_source_semester_id, auth.uid())
    or not public.can_manage_semester(p_target_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required for both cohorts' using errcode = '42501';
  end if;

  v_requested_count := cardinality(p_membership_ids);
  if p_membership_ids is not null and (v_requested_count < 1 or v_requested_count > 200) then
    raise exception 'Between 1 and 200 membership ids are required' using errcode = '22023';
  end if;

  select count(*)
  into v_source_count
  from public.semester_memberships as source
  where source.semester_id = p_source_semester_id
    and (p_membership_ids is null or source.id = any(p_membership_ids));

  if p_membership_ids is not null and v_source_count <> v_requested_count then
    raise exception 'Every selected membership must belong to the source semester' using errcode = '22023';
  end if;

  with inserted as (
    insert into public.semester_memberships (
      semester_id, profile_id, role, status, invited_at
    )
    select p_target_semester_id, source.profile_id, source.role, 'invited', now()
    from public.semester_memberships as source
    where source.semester_id = p_source_semester_id
      and (p_membership_ids is null or source.id = any(p_membership_ids))
    on conflict (semester_id, profile_id, role) do nothing
    returning id
  )
  select coalesce(array_agg(inserted.id), '{}'::uuid[])
  into v_imported_ids
  from inserted;

  v_imported_count := cardinality(v_imported_ids);

  insert into public.startup_semesters (
    semester_id,
    startup_organization_id,
    company_snapshot,
    stage,
    goals,
    mentorship_needs,
    preferred_expertise_tags,
    readiness_status
  )
  select distinct
    p_target_semester_id,
    source_startup.startup_organization_id,
    source_startup.company_snapshot,
    source_startup.stage,
    source_startup.goals,
    source_startup.mentorship_needs,
    source_startup.preferred_expertise_tags,
    'not_started'
  from public.semester_memberships as source_membership
  join public.startup_team_memberships as source_team
    on source_team.semester_membership_id = source_membership.id
  join public.startup_semesters as source_startup
    on source_startup.id = source_team.startup_semester_id
  where source_membership.semester_id = p_source_semester_id
    and (p_membership_ids is null or source_membership.id = any(p_membership_ids))
  on conflict (semester_id, startup_organization_id) do nothing;

  insert into public.startup_team_memberships (
    semester_id, startup_semester_id, semester_membership_id, is_primary_contact
  )
  select
    p_target_semester_id,
    target_startup.id,
    target_membership.id,
    source_team.is_primary_contact
  from public.semester_memberships as source_membership
  join public.startup_team_memberships as source_team
    on source_team.semester_membership_id = source_membership.id
  join public.startup_semesters as source_startup
    on source_startup.id = source_team.startup_semester_id
  join public.startup_semesters as target_startup
    on target_startup.semester_id = p_target_semester_id
   and target_startup.startup_organization_id = source_startup.startup_organization_id
  join public.semester_memberships as target_membership
    on target_membership.semester_id = p_target_semester_id
   and target_membership.profile_id = source_membership.profile_id
   and target_membership.role = source_membership.role
  where source_membership.semester_id = p_source_semester_id
    and (p_membership_ids is null or source_membership.id = any(p_membership_ids))
  on conflict (startup_semester_id, semester_membership_id) do nothing;

  insert into public.mentor_semesters (
    semester_id,
    semester_membership_id,
    mentorship_goals,
    preferred_format,
    capacity,
    readiness_status
  )
  select
    p_target_semester_id,
    target_membership.id,
    source_mentor.mentorship_goals,
    source_mentor.preferred_format,
    source_mentor.capacity,
    'not_started'
  from public.semester_memberships as source_membership
  join public.mentor_semesters as source_mentor
    on source_mentor.semester_membership_id = source_membership.id
  join public.semester_memberships as target_membership
    on target_membership.semester_id = p_target_semester_id
   and target_membership.profile_id = source_membership.profile_id
   and target_membership.role = source_membership.role
  where source_membership.semester_id = p_source_semester_id
    and (p_membership_ids is null or source_membership.id = any(p_membership_ids))
  on conflict (semester_id, semester_membership_id) do nothing;

  insert into public.lifecycle_audit_events (
    semester_id, actor_profile_id, action, subject_type, subject_id, details
  )
  select p_target_semester_id,
         auth.uid(),
         'membership.imported',
         'semester_membership',
         imported_id,
         jsonb_build_object('source_semester_id', p_source_semester_id)
  from unnest(v_imported_ids) as imported_id;

  return query select v_source_count, v_imported_count, v_source_count - v_imported_count;
end;
$function$;

revoke all on function "public"."bulk_set_membership_activity"(uuid, uuid[], boolean) from public;

grant execute on function "public"."bulk_set_membership_activity"(uuid, uuid[], boolean) to "authenticated", "postgres";

revoke all on function "public"."import_prior_semester_memberships"(uuid, uuid, uuid[]) from public;

grant execute on function "public"."import_prior_semester_memberships"(uuid, uuid, uuid[]) to "authenticated", "postgres";
