create table if not exists public.friday_programs (
  id uuid default gen_random_uuid() not null,
  semester_id uuid not null,
  meeting_id uuid not null,
  agenda_version smallint default 1 not null,
  group_a_facilitator text default 'Les' not null,
  group_b_facilitator text default 'Eric Chan' not null,
  startup_count integer not null,
  generated_by_profile_id uuid not null,
  generated_at timestamptz default now() not null,
  constraint friday_programs_pkey primary key (id),
  constraint friday_programs_agenda_version_check check (agenda_version = 1),
  constraint friday_programs_group_a_facilitator_check check (group_a_facilitator = 'Les'),
  constraint friday_programs_group_b_facilitator_check check (group_b_facilitator = 'Eric Chan'),
  constraint friday_programs_startup_count_check check (startup_count >= 0),
  constraint friday_programs_semester_id_id_key unique (semester_id, id),
  constraint friday_programs_semester_id_meeting_id_key unique (semester_id, meeting_id),
  constraint friday_programs_semester_id_fkey foreign key (semester_id) references public.semesters(id) on delete cascade,
  constraint friday_programs_semester_id_meeting_id_fkey foreign key (semester_id, meeting_id) references public.meetings(semester_id, id) on delete cascade,
  constraint friday_programs_generated_by_profile_id_fkey foreign key (generated_by_profile_id) references public.profiles(id) on delete restrict
);

create table if not exists public.friday_program_assignments (
  id uuid default gen_random_uuid() not null,
  semester_id uuid not null,
  program_id uuid not null,
  startup_semester_id uuid not null,
  startup_organization_id uuid not null,
  startup_name text not null,
  startup_slug text not null,
  group_code text not null,
  group_position smallint not null,
  created_at timestamptz default now() not null,
  constraint friday_program_assignments_pkey primary key (id),
  constraint friday_program_assignments_group_code_check check (group_code in ('A', 'B')),
  constraint friday_program_assignments_group_position_check check (group_position > 0),
  constraint friday_program_assignments_startup_name_check check (length(btrim(startup_name)) > 0),
  constraint friday_program_assignments_startup_slug_check check (length(btrim(startup_slug)) > 0),
  constraint friday_program_assignments_program_startup_key unique (program_id, startup_semester_id),
  constraint friday_program_assignments_program_group_position_key unique (program_id, group_code, group_position),
  constraint friday_program_assignments_semester_id_fkey foreign key (semester_id) references public.semesters(id) on delete cascade,
  constraint friday_program_assignments_semester_id_program_id_fkey foreign key (semester_id, program_id) references public.friday_programs(semester_id, id) on delete cascade,
  constraint friday_program_assignments_semester_id_startup_semester_id_fkey foreign key (semester_id, startup_semester_id) references public.startup_semesters(semester_id, id) on delete restrict,
  constraint friday_program_assignments_startup_organization_id_fkey foreign key (startup_organization_id) references public.startup_organizations(id) on delete restrict
);

create index friday_programs_meeting_idx on public.friday_programs (meeting_id);
create index friday_program_assignments_semester_idx on public.friday_program_assignments (semester_id, program_id);
create index friday_program_assignments_startup_idx on public.friday_program_assignments (startup_semester_id);

alter table public.friday_programs enable row level security;
alter table public.friday_program_assignments enable row level security;

create policy "semester members read Friday programs"
on public.friday_programs for select to authenticated
using (
  private.can_manage_semester(semester_id, (select auth.uid()))
  or exists (
    select 1
    from public.semester_memberships viewer_membership
    where viewer_membership.semester_id = friday_programs.semester_id
      and viewer_membership.profile_id = (select private.current_profile_id((select auth.uid())))
      and viewer_membership.role in ('mentor', 'startup', 'admin')
      and viewer_membership.status in ('active', 'alumni')
  )
);

create policy "Friday viewers read semester meetings"
on public.meetings for select to authenticated
using (
  private.can_manage_semester(semester_id, (select auth.uid()))
  or exists (
    select 1
    from public.semester_memberships viewer_membership
    where viewer_membership.semester_id = meetings.semester_id
      and viewer_membership.profile_id = (select private.current_profile_id((select auth.uid())))
      and viewer_membership.role in ('mentor', 'startup', 'admin')
      and viewer_membership.status in ('active', 'alumni')
  )
);

create policy "semester members read Friday assignments"
on public.friday_program_assignments for select to authenticated
using (
  private.can_manage_semester(semester_id, (select auth.uid()))
  or exists (
    select 1
    from public.semester_memberships viewer_membership
    where viewer_membership.semester_id = friday_program_assignments.semester_id
      and viewer_membership.profile_id = (select private.current_profile_id((select auth.uid())))
      and viewer_membership.role in ('mentor', 'startup', 'admin')
      and viewer_membership.status in ('active', 'alumni')
  )
);

create policy "semester admins insert Friday programs"
on public.friday_programs for insert to authenticated
with check (
  private.can_manage_semester(semester_id, (select auth.uid()))
  and generated_by_profile_id = (select private.current_profile_id((select auth.uid())))
);

create policy "semester admins insert Friday assignments"
on public.friday_program_assignments for insert to authenticated
with check (private.can_manage_semester(semester_id, (select auth.uid())));

create policy "semester admins update Friday programs"
on public.friday_programs for update to authenticated
using (private.can_manage_semester(semester_id, (select auth.uid())))
with check (
  private.can_manage_semester(semester_id, (select auth.uid()))
  and generated_by_profile_id = (select private.current_profile_id((select auth.uid())))
);

create policy "semester admins delete Friday assignments"
on public.friday_program_assignments for delete to authenticated
using (private.can_manage_semester(semester_id, (select auth.uid())));

create or replace function public.validate_friday_program_publication()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;

create constraint trigger validate_friday_program_after_program_change
after insert or update or delete on public.friday_programs
deferrable initially deferred
for each row execute function public.validate_friday_program_publication();

create constraint trigger validate_friday_program_after_assignment_change
after insert or update or delete on public.friday_program_assignments
deferrable initially deferred
for each row execute function public.validate_friday_program_publication();

drop function if exists public.generate_friday_program(uuid, uuid);

create function public.generate_friday_program(
  p_semester_id uuid,
  p_meeting_id uuid,
  p_regenerate boolean default false
)
returns table (
  program_id uuid,
  was_created boolean,
  assignment_count integer,
  generated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
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
    and semester.is_active
    and meeting.friday_canceled_at is null;
  if not found then
    if exists (
      select 1 from public.meetings meeting
      where meeting.id = p_meeting_id
        and meeting.semester_id = p_semester_id
        and meeting.friday_canceled_at is not null
    ) then
      raise exception 'Canceled Friday weeks cannot generate or regenerate groups' using errcode = 'P0003';
    end if;
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
$$;
