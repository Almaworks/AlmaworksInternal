set local check_function_bodies = off;

create or replace function public.delete_startup_permanently (
  p_startup_organization_id uuid,
  p_confirmation_name       text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  v_name text;
  v_deleted_sessions integer;
  v_friday_program record;
  v_friday_program_ids uuid[];
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required' using errcode = '42501';
  end if;

  -- Generation takes this same lock before inserting organization references.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('almaworks:friday-roster-maintenance', 0)
  );

  select organization.name
  into v_name
  from public.startup_organizations organization
  where organization.id = p_startup_organization_id
  for update;

  if v_name is null then
    raise exception 'Startup not found' using errcode = 'P0002';
  end if;
  if p_confirmation_name is null or btrim(p_confirmation_name) <> v_name then
    raise exception 'Startup name confirmation does not match' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct assignment.program_id), '{}'::uuid[])
  into v_friday_program_ids
  from public.friday_program_assignments assignment
  where assignment.startup_organization_id = p_startup_organization_id;

  -- Match Friday generation's lock order and retain shared program records.
  for v_friday_program in
    select program.id, program.semester_id, program.meeting_id
    from public.friday_programs program
    where program.id = any(v_friday_program_ids)
    order by program.semester_id, program.meeting_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_friday_program.semester_id::text || ':' || v_friday_program.meeting_id::text, 0)
    );
    perform 1 from public.friday_programs where id = v_friday_program.id for update;
  end loop;

  delete from public.friday_program_assignments
  where startup_organization_id = p_startup_organization_id;

  -- Serialize mentor responses with cleanup so accepted occupancy cannot
  -- be recreated between releasing it and deleting the associated request.
  perform request.id from public.mentor_booking_requests request
  where request.startup_organization_id = p_startup_organization_id
  for update;

  delete from public.mentor_booking_decision_notes note
  using public.mentor_booking_requests request
  where note.semester_id = request.semester_id and note.request_id = request.id
    and request.startup_organization_id = p_startup_organization_id;

  delete from public.mentor_booking_meeting_details detail
  using public.mentor_booking_requests request
  where detail.semester_id = request.semester_id and detail.request_id = request.id
    and request.startup_organization_id = p_startup_organization_id;

  delete from public.mentor_booking_outcomes outcome
  using public.mentor_booking_requests request
  where outcome.semester_id = request.semester_id and outcome.request_id = request.id
    and request.startup_organization_id = p_startup_organization_id;

  delete from public.mentor_booking_accepted_occupancy occupancy
  using public.mentor_booking_requests request
  where occupancy.request_id = request.id
    and request.startup_organization_id = p_startup_organization_id;

  delete from public.mentor_booking_requests
  where startup_organization_id = p_startup_organization_id;

  delete from public.sessions session
  using public.startup_semesters term
  where session.startup_semester_id = term.id
    and term.startup_organization_id = p_startup_organization_id;
  get diagnostics v_deleted_sessions = row_count;

  delete from public.startup_organizations
  where id = p_startup_organization_id;

  -- Reinsert retained assignment identities to avoid immediate unique-position
  -- collisions while restoring balanced groups and contiguous positions.
  for v_friday_program in
    select program.id from public.friday_programs program
    where program.id = any(v_friday_program_ids)
  loop
    with retained as (
      delete from public.friday_program_assignments
      where program_id = v_friday_program.id
      returning *
    ), numbered as (
      select retained.*, row_number() over (order by group_code, group_position, id) as position
      from retained
    )
    insert into public.friday_program_assignments (
      id, semester_id, program_id, startup_semester_id, startup_organization_id,
      startup_name, startup_slug, group_code, group_position, created_at
    )
    select id, semester_id, program_id, startup_semester_id, startup_organization_id,
      startup_name, startup_slug, case when position % 2 = 1 then 'A' else 'B' end,
      ((position + 1) / 2)::smallint, created_at
    from numbered;

    update public.friday_programs
    set startup_count = (select count(*) from public.friday_program_assignments where program_id = v_friday_program.id)
    where id = v_friday_program.id;
  end loop;

  return jsonb_build_object('startupName', v_name, 'deletedSessions', v_deleted_sessions);
end;
$function$;
