set local check_function_bodies = off;

drop function "public"."generate_friday_program"(uuid, uuid);

create or replace function public.generate_friday_program (
  p_semester_id uuid,
  p_meeting_id  uuid,
  p_regenerate  boolean default false
)
  returns table (
    program_id       uuid,
    was_created      boolean,
    assignment_count integer,
    generated_at     timestamp with time zone
  )
  language plpgsql
  set search_path to ''
  AS $function$
declare
  v_program public.friday_programs%rowtype;
  v_existing boolean;
  v_created boolean := false;
  v_eligible_count integer;
begin
  if auth.uid() is null or not private.can_manage_semester(p_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_semester_id::text || ':' || p_meeting_id::text, 0)
  );

  perform 1
  from public.meetings meeting
  join public.semesters semester on semester.id = meeting.semester_id
  where meeting.id = p_meeting_id
    and meeting.semester_id = p_semester_id
    and semester.is_active;
  if not found then
    raise exception 'Meeting does not belong to the active semester' using errcode = 'P0002';
  end if;

  select program.*
  into v_program
  from public.friday_programs program
  where program.semester_id = p_semester_id
    and program.meeting_id = p_meeting_id;
  v_existing := found;

  if v_existing and not p_regenerate then
    return query
    select v_program.id, false, count(*)::integer, v_program.generated_at
    from public.friday_program_assignments assignment
    where assignment.program_id = v_program.id;
    return;
  end if;

  if v_existing then
    delete from public.friday_program_assignments assignment
    where assignment.program_id = v_program.id;

    update public.friday_programs program
    set generated_by_profile_id = private.current_profile_id(), generated_at = now()
    where program.id = v_program.id
    returning * into v_program;
  end if;

  select count(*) into v_eligible_count
  from public.startup_semesters startup_term
  where startup_term.semester_id = p_semester_id
    and exists (
      select 1
      from public.startup_team_memberships team
      join public.semester_memberships membership
        on membership.id = team.semester_membership_id
       and membership.semester_id = team.semester_id
      where team.semester_id = startup_term.semester_id
        and team.startup_semester_id = startup_term.id
        and membership.role = 'startup'
        and membership.status = 'active'
    );

  if v_eligible_count = 0 then
    raise exception 'No active startup companies are eligible for this Friday meeting'
      using errcode = 'P0001';
  end if;

  if not v_existing then
    insert into public.friday_programs (semester_id, meeting_id, startup_count, generated_by_profile_id)
    values (p_semester_id, p_meeting_id, v_eligible_count, private.current_profile_id())
    returning * into v_program;
    v_created := true;
  else
    update public.friday_programs program
    set startup_count = v_eligible_count
    where program.id = v_program.id
    returning * into v_program;
  end if;

  with eligible as (
    select distinct
      startup_term.id as startup_semester_id,
      organization.id as startup_organization_id,
      organization.name as startup_name,
      organization.slug as startup_slug
    from public.startup_semesters startup_term
    join public.startup_organizations organization on organization.id = startup_term.startup_organization_id
    join public.startup_team_memberships team
      on team.semester_id = startup_term.semester_id and team.startup_semester_id = startup_term.id
    join public.semester_memberships membership
      on membership.id = team.semester_membership_id and membership.semester_id = team.semester_id
    where startup_term.semester_id = p_semester_id
      and membership.role = 'startup'
      and membership.status = 'active'
  ), randomized as (
    select eligible.*, row_number() over (order by random(), eligible.startup_semester_id) as randomized_position
    from eligible
  )
  insert into public.friday_program_assignments (
    semester_id, program_id, startup_semester_id, startup_organization_id,
    startup_name, startup_slug, group_code, group_position
  )
  select p_semester_id, v_program.id, randomized.startup_semester_id,
    randomized.startup_organization_id, randomized.startup_name, randomized.startup_slug,
    case when randomized.randomized_position % 2 = 1 then 'A' else 'B' end,
    ((randomized.randomized_position + 1) / 2)::smallint
  from randomized;

  return query
  select v_program.id, v_created, v_eligible_count, v_program.generated_at;
end;
$function$;

revoke all on function "public"."generate_friday_program"(uuid, uuid, boolean) from public;

grant execute on function "public"."generate_friday_program"(uuid, uuid, boolean) to "authenticated", "postgres";
