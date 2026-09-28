set local check_function_bodies = off;

alter table "public"."friday_programs"
  drop constraint "friday_programs_startup_count_check";

create or replace function private.guard_mentor_booking_request()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
declare
  actor_profile uuid := private.current_profile_id();
  canonical_mentor record;
  canonical_startup record;
  local_start timestamp;
  local_end timestamp;
begin
  if tg_op='INSERT' then
    select term.id as mentor_semester_id, membership.profile_id, profile.full_name,
      semester.start_date, semester.end_date, coalesce(nullif(btrim(semester.configuration->>'timezone'),''),'America/New_York') as timezone
    into canonical_mentor
    from public.mentor_semesters term
    join public.semester_memberships membership on membership.id=term.semester_membership_id and membership.semester_id=term.semester_id
    join public.profiles profile on profile.id=membership.profile_id
    join public.semesters semester on semester.id=term.semester_id
    where term.id=new.mentor_semester_id and term.semester_id=new.semester_id and membership.role='mentor' and membership.status='active' and semester.is_active;
    if canonical_mentor.mentor_semester_id is null then raise exception 'Selected mentor is not available in this semester' using errcode='P0002'; end if;
    if new.ends_at-new.starts_at <> interval '15 minutes' or new.starts_at<=now() then raise exception 'Booking requests must be a future 15-minute appointment' using errcode='22023'; end if;
    local_start := new.starts_at at time zone canonical_mentor.timezone;
    local_end := new.ends_at at time zone canonical_mentor.timezone;
    if local_start::date <> local_end::date or local_start::date < canonical_mentor.start_date or local_start::date > canonical_mentor.end_date then raise exception 'Booking must occur during one semester day' using errcode='22023'; end if;
    if extract(minute from local_start)::integer % 15 <> 0 or extract(second from local_start)::integer <> 0 then raise exception 'Booking start must align to 15 minutes' using errcode='22023'; end if;
    if extract(dow from local_start)=5 and local_start::time < time '17:00' and local_end::time > time '15:00' then raise exception 'Independent mentor bookings cannot overlap the Friday Program from 3:00 PM to 5:00 PM' using errcode='22023'; end if;
    if not exists(select 1 from public.mentor_weekly_availability availability where availability.semester_id=new.semester_id and availability.mentor_semester_id=canonical_mentor.mentor_semester_id and availability.weekday=extract(dow from local_start)::smallint and availability.starts_at<=local_start::time and availability.ends_at>=local_end::time) then raise exception 'Selected time is outside this mentor''s weekly availability' using errcode='22023'; end if;
    select startup.id as startup_semester_id, startup.startup_organization_id, organization.name into canonical_startup
    from public.startup_team_memberships team
    join public.semester_memberships membership on membership.id=team.semester_membership_id and membership.semester_id=team.semester_id
    join public.startup_semesters startup on startup.id=team.startup_semester_id and startup.semester_id=team.semester_id
    join public.startup_organizations organization on organization.id=startup.startup_organization_id
    where team.semester_id=new.semester_id and membership.profile_id=actor_profile and membership.role='startup' and membership.status='active';
    if canonical_startup.startup_semester_id is null then raise exception 'Active startup membership required' using errcode='42501'; end if;
    new.window_id:=null; new.mentor_semester_id:=canonical_mentor.mentor_semester_id; new.mentor_profile_id:=canonical_mentor.profile_id; new.mentor_name:=coalesce(nullif(btrim(canonical_mentor.full_name),''),'Mentor');
    new.startup_semester_id:=canonical_startup.startup_semester_id; new.startup_organization_id:=canonical_startup.startup_organization_id; new.startup_name:=canonical_startup.name; new.requested_by_profile_id:=actor_profile; new.topic:=btrim(new.topic); new.status:='pending'; new.requested_at:=now(); new.responded_at:=null; new.cancelled_at:=null; new.updated_at:=now(); return new;
  end if;
  if tg_op='UPDATE' then
    if row(old.id,old.semester_id,old.window_id,old.mentor_semester_id,old.mentor_profile_id,old.mentor_name,old.startup_semester_id,old.startup_organization_id,old.startup_name,old.requested_by_profile_id,old.topic,old.starts_at,old.ends_at,old.requested_at) is distinct from row(new.id,new.semester_id,new.window_id,new.mentor_semester_id,new.mentor_profile_id,new.mentor_name,new.startup_semester_id,new.startup_organization_id,new.startup_name,new.requested_by_profile_id,new.topic,new.starts_at,new.ends_at,new.requested_at) then raise exception 'Booking identity, topic, and interval are immutable' using errcode='42501'; end if;
    if new.status=old.status then if row(new.responded_at,new.cancelled_at) is distinct from row(old.responded_at,old.cancelled_at) then raise exception 'Booking timestamps are protected' using errcode='42501'; end if; return old; end if;
    if old.status='pending' and new.status in ('accepted','declined') then if actor_profile is distinct from old.mentor_profile_id then raise exception 'Only the owning mentor can respond' using errcode='42501'; end if; new.responded_at:=now(); new.cancelled_at:=null;
    elsif old.status in ('pending','accepted') and new.status='cancelled' then if actor_profile is distinct from old.mentor_profile_id and not exists(select 1 from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id where team.semester_id=old.semester_id and team.startup_semester_id=old.startup_semester_id and membership.profile_id=actor_profile and membership.status='active' and membership.role='startup') then raise exception 'Only either booking party can cancel' using errcode='42501'; end if; new.cancelled_at:=now(); new.responded_at:=old.responded_at;
    else raise exception 'Invalid booking status transition' using errcode='55000'; end if;
    new.updated_at:=now(); return new;
  end if;
  -- Only the existing owner-executed, super-admin deletion RPC may remove
  -- booking history. Participant table access remains governed by RLS.
  if tg_op='DELETE' and current_user='postgres' and private.is_super_admin(auth.uid()) then
    return old;
  end if;
  raise exception 'Booking history cannot be deleted' using errcode='42501';
end;
$function$;

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

  -- Serialize roster publication with permanent organization cleanup before
  -- either path acquires organization or per-meeting locks.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('almaworks:friday-roster-maintenance', 0)
  );

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
    select
      v_program.id,
      false,
      count(*)::integer,
      v_program.generated_at
    from public.friday_program_assignments assignment
    where assignment.program_id = v_program.id;
    return;
  end if;

  if v_existing then
    delete from public.friday_program_assignments assignment
    where assignment.program_id = v_program.id;

    update public.friday_programs program
    set generated_by_profile_id = private.current_profile_id(),
        generated_at = now()
    where program.id = v_program.id
    returning * into v_program;
  end if;

  select count(*)
  into v_eligible_count
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
    insert into public.friday_programs (
      semester_id,
      meeting_id,
      startup_count,
      generated_by_profile_id
    )
    values (
      p_semester_id,
      p_meeting_id,
      v_eligible_count,
      private.current_profile_id()
    )
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
    join public.startup_organizations organization
      on organization.id = startup_term.startup_organization_id
    join public.startup_team_memberships team
      on team.semester_id = startup_term.semester_id
     and team.startup_semester_id = startup_term.id
    join public.semester_memberships membership
      on membership.id = team.semester_membership_id
     and membership.semester_id = team.semester_id
    where startup_term.semester_id = p_semester_id
      and membership.role = 'startup'
      and membership.status = 'active'
  ), randomized as (
    select
      eligible.*,
      row_number() over (order by random(), eligible.startup_semester_id) as randomized_position
    from eligible
  )
  insert into public.friday_program_assignments (
    semester_id,
    program_id,
    startup_semester_id,
    startup_organization_id,
    startup_name,
    startup_slug,
    group_code,
    group_position
  )
  select
    p_semester_id,
    v_program.id,
    randomized.startup_semester_id,
    randomized.startup_organization_id,
    randomized.startup_name,
    randomized.startup_slug,
    case when randomized.randomized_position % 2 = 1 then 'A' else 'B' end,
    ((randomized.randomized_position + 1) / 2)::smallint
  from randomized;

  return query
  select v_program.id, v_created, v_eligible_count, v_program.generated_at;
end;
$function$;

create or replace function public.validate_friday_program_publication()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
declare
  v_program_id uuid;
  v_program public.friday_programs%rowtype;
  v_assignment_count integer;
  v_eligible_count integer;
  v_group_a_count integer;
  v_group_b_count integer;
  v_allow_alumni boolean;
begin
  if tg_table_name = 'friday_programs' then
    v_program_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    v_program_id := case when tg_op = 'DELETE' then old.program_id else new.program_id end;
  end if;

  select program.*
  into v_program
  from public.friday_programs program
  where program.id = v_program_id;

  if not found then
    return null;
  end if;

  select not semester.is_active into v_allow_alumni
  from public.semesters semester where semester.id = v_program.semester_id;

  select count(*)
  into v_eligible_count
  from public.startup_semesters startup_term
  where startup_term.semester_id = v_program.semester_id
    and exists (
      select 1
      from public.startup_team_memberships team
      join public.semester_memberships membership
        on membership.id = team.semester_membership_id
       and membership.semester_id = team.semester_id
      join public.semesters semester
        on semester.id = team.semester_id
      where team.semester_id = startup_term.semester_id
        and team.startup_semester_id = startup_term.id
        and membership.role = 'startup'
        and (membership.status = 'active' or (v_allow_alumni and membership.status = 'alumni'))
    );

  select
    count(*),
    count(*) filter (where assignment.group_code = 'A'),
    count(*) filter (where assignment.group_code = 'B')
  into v_assignment_count, v_group_a_count, v_group_b_count
  from public.friday_program_assignments assignment
  where assignment.program_id = v_program_id;

  if v_assignment_count <> v_program.startup_count
     or v_assignment_count <> v_eligible_count then
    raise exception 'Friday publication must contain every eligible startup company exactly once'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.friday_program_assignments assignment
    join public.startup_semesters startup_term
      on startup_term.id = assignment.startup_semester_id
     and startup_term.semester_id = assignment.semester_id
    join public.startup_organizations organization
      on organization.id = startup_term.startup_organization_id
    where assignment.program_id = v_program_id
      and (
        assignment.startup_organization_id <> organization.id
        or assignment.startup_name <> organization.name
        or assignment.startup_slug <> organization.slug
        or not exists (
          select 1
          from public.startup_team_memberships team
          join public.semester_memberships membership
            on membership.id = team.semester_membership_id
           and membership.semester_id = team.semester_id
          where team.semester_id = assignment.semester_id
            and team.startup_semester_id = assignment.startup_semester_id
            and membership.role = 'startup'
            and (membership.status = 'active' or (v_allow_alumni and membership.status = 'alumni'))
        )
      )
  ) then
    raise exception 'Friday publication contains an ineligible or inconsistent startup assignment'
      using errcode = '23514';
  end if;

  if abs(v_group_a_count - v_group_b_count) > 1 then
    raise exception 'Friday publication groups must be balanced'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from (
      select
        assignment.group_code,
        count(*) as item_count,
        count(distinct assignment.group_position) as distinct_positions,
        min(assignment.group_position) as first_position,
        max(assignment.group_position) as last_position
      from public.friday_program_assignments assignment
      where assignment.program_id = v_program_id
      group by assignment.group_code
    ) positions
    where positions.distinct_positions <> positions.item_count
       or positions.first_position <> 1
       or positions.last_position <> positions.item_count
  ) then
    raise exception 'Friday publication group positions must be contiguous'
      using errcode = '23514';
  end if;

  return null;
end;
$function$;

alter table "public"."friday_programs"
  add constraint "friday_programs_startup_count_check" check ((startup_count >= 0));
