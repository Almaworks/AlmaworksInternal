-- Compose after google_calendar.sql. The owner is the existing NOLOGIN,
-- NOBYPASSRLS calendar role, with only explicit table grants and RLS policies.
-- CREATE is needed only while transferring the function to that role.
grant create on schema public to calendar_sql_internal;

create or replace function public.calendar_effective_slots(
  p_semester_id uuid,p_mentor_semester_id uuid,p_from timestamptz,p_until timestamptz
) returns table(starts_at timestamptz,ends_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare
  v_semester public.semesters%rowtype;
  v_settings public.mentor_calendar_settings%rowtype;
  v_program_zone text;
  v_slot_zone text;
begin
  if p_from is null or p_until is null or p_until<=p_from
    or p_until-p_from>interval '90 days' then
    raise exception 'Calendar range must be positive and at most 90 days' using errcode='22023';
  end if;
  if not private.calendar_can_read_mentor(p_semester_id,p_mentor_semester_id) then
    raise exception 'Calendar is not accessible' using errcode='42501';
  end if;

  select * into v_semester from public.semesters where id=p_semester_id;
  if v_semester.id is null then return; end if;
  v_program_zone:=coalesce(nullif(btrim(v_semester.configuration->>'timezone'),''),'America/New_York');
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_program_zone) then return; end if;
  select * into v_settings from public.mentor_calendar_settings
    where semester_id=p_semester_id and mentor_semester_id=p_mentor_semester_id;
  v_slot_zone:=coalesce(v_settings.time_zone,v_program_zone);

  -- These checks apply to the entire call. A connected account and healthy
  -- setting alone do not establish per-slot coverage; that is tested below.
  if v_settings.mode='synced' then
    if v_settings.sync_unavailable or not exists (
      select 1 from public.google_calendar_connections c
      where c.id=v_settings.connection_id and c.status='connected'
    ) then return; end if;
  end if;

  return query
  with grid as materialized (
    select g.slot_start,g.slot_start+interval '15 minutes' as slot_end
    from pg_catalog.generate_series(
      pg_catalog.to_timestamp(pg_catalog.ceil(extract(epoch from greatest(p_from,now()))/900)*900),
      p_until-interval '15 minutes',interval '15 minutes') g(slot_start)
    where g.slot_start>now()
  ), zoned as (
    select g.slot_start,g.slot_end,
      g.slot_start at time zone v_program_zone as program_start,
      (g.slot_end-interval '1 microsecond') at time zone v_program_zone as program_end,
      g.slot_end at time zone v_program_zone as program_end_boundary,
      g.slot_start at time zone v_slot_zone as local_start,
      (g.slot_end-interval '1 microsecond') at time zone v_slot_zone as local_end
    from grid g
  )
  select z.slot_start,z.slot_end from zoned z
  where z.program_start::date>=v_semester.start_date
    and z.program_end::date<=v_semester.end_date
    and not (extract(dow from z.program_start)=5
      and z.program_start::time<time '17:00'
      and z.program_end_boundary::time>time '15:00')
    and not exists (
      select 1 from public.mentor_booking_accepted_occupancy occ
      where occ.semester_id=p_semester_id and occ.mentor_semester_id=p_mentor_semester_id
        and occ.starts_at<z.slot_end and occ.ends_at>z.slot_start
    )
    and not exists (
      select 1 from public.mentor_calendar_overrides o
      where o.semester_id=p_semester_id and o.mentor_semester_id=p_mentor_semester_id
        and not o.available and o.starts_at<z.slot_end and o.ends_at>z.slot_start
    )
    and (v_settings.mode is distinct from 'synced' or (
      exists (
        select 1 from private.google_calendar_busy_snapshots s
        where s.semester_id=p_semester_id and s.mentor_semester_id=p_mentor_semester_id
          and s.connection_id=v_settings.connection_id
          and s.fetched_at<=now() and s.fetched_at>=now()-interval '15 minutes'
          and s.coverage_start<=z.slot_start and s.coverage_end>=z.slot_end
      )
      and not exists (
        -- Match the canonical write check: any retained busy snapshot for
        -- this mentor blocks an overlapping slot, even an older snapshot.
        select 1 from private.google_calendar_busy_snapshots s
        join private.google_calendar_busy_intervals b
          on b.snapshot_id=s.id and b.semester_id=s.semester_id
        where s.semester_id=p_semester_id and s.mentor_semester_id=p_mentor_semester_id
          and b.starts_at<z.slot_end and b.ends_at>z.slot_start
      )
    ))
    and (
      exists (
        select 1 from public.mentor_calendar_overrides o
        where o.semester_id=p_semester_id and o.mentor_semester_id=p_mentor_semester_id
          and o.available and o.starts_at<=z.slot_start and o.ends_at>=z.slot_end
      )
      or (v_settings.mode='manual' and exists (
        select 1 from public.mentor_calendar_manual_slots m
        where m.semester_id=p_semester_id and m.mentor_semester_id=p_mentor_semester_id
          and m.starts_at<=z.slot_start and m.ends_at>=z.slot_end
      ))
      or (v_settings.mode is distinct from 'manual' and exists (
        select 1 from public.mentor_weekly_availability w
        where w.semester_id=p_semester_id and w.mentor_semester_id=p_mentor_semester_id
          and extract(dow from z.local_start)=w.weekday
          and z.local_start::date=z.local_end::date
          and w.starts_at<=z.local_start::time and w.ends_at>z.local_end::time
      ))
    )
  order by z.slot_start;
end $$;

alter function public.calendar_effective_slots(uuid,uuid,timestamptz,timestamptz)
  owner to calendar_sql_internal;
revoke all on function public.calendar_effective_slots(uuid,uuid,timestamptz,timestamptz)
  from public,anon,service_role;
grant execute on function public.calendar_effective_slots(uuid,uuid,timestamptz,timestamptz)
  to authenticated,calendar_sql_internal;
revoke create on schema public from calendar_sql_internal;
