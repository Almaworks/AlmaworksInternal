set local check_function_bodies = off;

alter table "public"."meetings"
  add column "friday_canceled_at" timestamp with time zone;

alter table "public"."meetings"
  add column "friday_canceled_by_profile_id" uuid;

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
$function$;

create or replace function public.guard_friday_week_cancellation_change()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin
  if old.friday_canceled_at is not distinct from new.friday_canceled_at
     and old.friday_canceled_by_profile_id is not distinct from new.friday_canceled_by_profile_id then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.semester_id::text || ':' || new.id::text, 0)
  );

  if current_user = 'authenticated' then
    if auth.uid() is null or not private.can_manage_semester(new.semester_id, auth.uid()) then
      raise exception 'Semester administrator access required' using errcode = '42501';
    end if;
    if new.friday_canceled_at is null then
      if new.friday_canceled_by_profile_id is not null then
        raise exception 'Restored Friday weeks cannot retain a canceling administrator' using errcode = '23514';
      end if;
    elsif new.friday_canceled_by_profile_id is distinct from private.current_profile_id(auth.uid()) then
      raise exception 'Canceled Friday weeks must record the acting administrator' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.reject_canceled_friday_speaker_change()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
declare
  v_meeting_id uuid := case when tg_op = 'DELETE' then old.meeting_id else new.meeting_id end;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      (case when tg_op = 'DELETE' then old.semester_id else new.semester_id end)::text || ':' || v_meeting_id::text,
      0
    )
  );
  if current_user = 'authenticated' and exists (
    select 1 from public.meetings meeting
    where meeting.id = v_meeting_id
      and meeting.friday_canceled_at is not null
  ) then
    raise exception 'Canceled Friday weeks cannot change speaker details' using errcode = 'P0003';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create or replace function public.set_friday_week_canceled (
  p_semester_id uuid,
  p_meeting_id  uuid,
  p_canceled    boolean
)
  returns boolean
  language plpgsql
  set search_path to ''
  AS $function$
begin
  if p_canceled is null then
    raise exception 'Canceled state is required' using errcode = '22004';
  end if;
  if auth.uid() is null or not private.can_manage_semester(p_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_semester_id::text || ':' || p_meeting_id::text, 0)
  );

  update public.meetings meeting
  set friday_canceled_at = case when p_canceled then now() else null end,
      friday_canceled_by_profile_id = case when p_canceled then private.current_profile_id(auth.uid()) else null end
  where meeting.semester_id = p_semester_id
    and meeting.id = p_meeting_id;

  if not found then
    raise exception 'Meeting does not belong to the selected semester' using errcode = 'P0002';
  end if;
  return true;
end;
$function$;

alter table "public"."meetings"
  add constraint "meetings_friday_canceled_by_profile_id_fkey" foreign key (friday_canceled_by_profile_id) references public.profiles(id) on delete set null;

alter table "public"."meetings"
  add constraint "meetings_friday_canceled_by_requires_timestamp_check" check (((friday_canceled_at IS NOT NULL) OR (friday_canceled_by_profile_id IS NULL)));

create trigger reject_canceled_friday_speaker_change
  before insert or delete or update on public.friday_speakers
  for each row
  execute function public.reject_canceled_friday_speaker_change();

create trigger guard_friday_week_cancellation_change
  before update of friday_canceled_at, friday_canceled_by_profile_id on public.meetings
  for each row
  execute function public.guard_friday_week_cancellation_change();

create policy "semester admins cancel Friday weeks" on "public"."meetings"
  for update
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)))
  with check (private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)));

revoke all on function "public"."guard_friday_week_cancellation_change"() from public;

grant execute on function "public"."guard_friday_week_cancellation_change"() to "postgres";

revoke all on function "public"."reject_canceled_friday_speaker_change"() from public;

grant execute on function "public"."reject_canceled_friday_speaker_change"() to "postgres";

revoke all on function "public"."set_friday_week_canceled"(uuid, uuid, boolean) from public;

grant execute on function "public"."set_friday_week_canceled"(uuid, uuid, boolean) to "authenticated", "postgres";

revoke all ("friday_canceled_at") on table "public"."meetings" from "authenticated";

grant update ("friday_canceled_at") on table "public"."meetings" to "authenticated";

revoke all ("friday_canceled_by_profile_id") on table "public"."meetings" from "authenticated";

grant update ("friday_canceled_by_profile_id") on table "public"."meetings" to "authenticated";
