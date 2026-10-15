-- Owner-only dated availability projection and atomic batch editing.
-- calendar_sql_internal is NOLOGIN/NOBYPASSRLS; every command remains subject
-- to the existing canonical ownership predicates and table policies.
grant create on schema public to calendar_sql_internal;

create function public.calendar_save_dated_availability(
  p_semester_id uuid,
  p_mentor_semester_id uuid,
  p_changes jsonb
) returns boolean
language plpgsql security definer set search_path='' as $$
declare
  v_semester public.semesters%rowtype;
  v_program_zone text;
begin
  if not private.calendar_owns_editable_mentor(p_semester_id,p_mentor_semester_id) then
    raise exception 'Current owning mentor required' using errcode='42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes)<>'array'
    or jsonb_array_length(p_changes) not between 1 and 512
    or exists(select 1 from jsonb_array_elements(p_changes) e where jsonb_typeof(e)<>'object'
      or not (e ? 'startsAt' and e ? 'endsAt' and e ? 'available')
      or jsonb_typeof(e->'available')<>'boolean') then
    raise exception 'Choose between one and 512 dated availability changes' using errcode='22023';
  end if;

  select * into v_semester from public.semesters where id=p_semester_id and is_active;
  if v_semester.id is null then raise exception 'Active semester required' using errcode='42501'; end if;
  v_program_zone:=coalesce(nullif(btrim(v_semester.configuration->>'timezone'),''),'America/New_York');
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_program_zone) then
    raise exception 'Program timezone is invalid' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('calendar-settings:'||p_mentor_semester_id::text,0));

  if exists(
    select 1 from jsonb_to_recordset(p_changes) c("startsAt" timestamptz,"endsAt" timestamptz,available boolean)
    where c."startsAt" is null or c."endsAt" is null or c.available is null
      or c."endsAt"-c."startsAt"<>interval '15 minutes'
      or extract(epoch from c."startsAt")::numeric % 900<>0
      or extract(epoch from c."endsAt")::numeric % 900<>0
      or c."startsAt"<=now() or c."endsAt">now()+interval '90 days'
      or (c."startsAt" at time zone v_program_zone)::date<v_semester.start_date
      or ((c."endsAt"-interval '1 microsecond') at time zone v_program_zone)::date>v_semester.end_date
      or (extract(dow from c."startsAt" at time zone v_program_zone)=5
        and (c."startsAt" at time zone v_program_zone)::time<time '17:00'
        and (c."endsAt" at time zone v_program_zone)::time>time '15:00')
      or exists(select 1 from public.mentor_booking_accepted_occupancy o
        where o.semester_id=p_semester_id and o.mentor_semester_id=p_mentor_semester_id
          and o.starts_at<c."endsAt" and o.ends_at>c."startsAt")
  ) then raise exception 'Invalid, reserved, or booked dated availability slot' using errcode='22023'; end if;

  if exists(
    select 1
    from jsonb_to_recordset(p_changes) a("startsAt" timestamptz,"endsAt" timestamptz,available boolean)
    join jsonb_to_recordset(p_changes) b("startsAt" timestamptz,"endsAt" timestamptz,available boolean)
      on a."startsAt"=b."startsAt" and a."endsAt"=b."endsAt" and a.available<>b.available
  ) then raise exception 'A dated slot cannot be both available and unavailable' using errcode='22023'; end if;

  with changes as (
    select distinct c."startsAt" as starts_at,c."endsAt" as ends_at,c.available
    from jsonb_to_recordset(p_changes) c("startsAt" timestamptz,"endsAt" timestamptz,available boolean)
  )
  delete from public.mentor_calendar_overrides o using changes c
  where o.semester_id=p_semester_id and o.mentor_semester_id=p_mentor_semester_id
    and o.starts_at=c.starts_at and o.ends_at=c.ends_at;

  insert into public.mentor_calendar_overrides(semester_id,mentor_semester_id,starts_at,ends_at,available)
  select p_semester_id,p_mentor_semester_id,c.starts_at,c.ends_at,c.available
  from (select distinct r."startsAt" as starts_at,r."endsAt" as ends_at,r.available
    from jsonb_to_recordset(p_changes) r("startsAt" timestamptz,"endsAt" timestamptz,available boolean)) c;
  return true;
end $$;
alter function public.calendar_save_dated_availability(uuid,uuid,jsonb) owner to calendar_sql_internal;
revoke all on function public.calendar_save_dated_availability(uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function public.calendar_save_dated_availability(uuid,uuid,jsonb) to authenticated;

create function public.calendar_owner_dated_availability(
  p_semester_id uuid,
  p_mentor_semester_id uuid,
  p_from timestamptz,
  p_until timestamptz
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_settings public.mentor_calendar_settings%rowtype;
  v_semester public.semesters%rowtype;
  v_program_zone text;
  v_slot_zone text;
  v_offered jsonb;
begin
  if not private.calendar_owns_editable_mentor(p_semester_id,p_mentor_semester_id) then
    raise exception 'Only the owning mentor can read this calendar' using errcode='42501';
  end if;
  if p_from is null or p_until is null or p_until<=greatest(p_from,now())
    or p_until-p_from>interval '90 days' or p_from<now()-interval '15 minutes' then
    raise exception 'Choose a current date range of at most ninety days' using errcode='22023';
  end if;
  select * into v_semester from public.semesters where id=p_semester_id;
  select * into v_settings from public.mentor_calendar_settings
    where semester_id=p_semester_id and mentor_semester_id=p_mentor_semester_id;
  v_program_zone:=coalesce(nullif(btrim(v_semester.configuration->>'timezone'),''),'America/New_York');
  v_slot_zone:=coalesce(v_settings.time_zone,v_program_zone);
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_program_zone)
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_slot_zone) then
    raise exception 'Calendar timezone is invalid' using errcode='22023';
  end if;

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
  ), intended as (
    select z.slot_start,z.slot_end from zoned z
    where z.program_start::date>=v_semester.start_date and z.program_end::date<=v_semester.end_date
      and not (extract(dow from z.program_start)=5 and z.program_start::time<time '17:00' and z.program_end_boundary::time>time '15:00')
      and not exists(select 1 from public.mentor_calendar_overrides o
        where o.semester_id=p_semester_id and o.mentor_semester_id=p_mentor_semester_id and not o.available
          and o.starts_at<z.slot_end and o.ends_at>z.slot_start)
      and (
        exists(select 1 from public.mentor_calendar_overrides o
          where o.semester_id=p_semester_id and o.mentor_semester_id=p_mentor_semester_id and o.available
            and o.starts_at<=z.slot_start and o.ends_at>=z.slot_end)
        or (v_settings.mode='manual' and exists(select 1 from public.mentor_calendar_manual_slots m
          where m.semester_id=p_semester_id and m.mentor_semester_id=p_mentor_semester_id
            and m.starts_at<=z.slot_start and m.ends_at>=z.slot_end))
        or (v_settings.mode is distinct from 'manual' and exists(select 1 from public.mentor_weekly_availability w
          where w.semester_id=p_semester_id and w.mentor_semester_id=p_mentor_semester_id
            and extract(dow from z.local_start)=w.weekday and z.local_start::date=z.local_end::date
            and w.starts_at<=z.local_start::time and w.ends_at>z.local_end::time))
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object('startsAt',i.slot_start,'endsAt',i.slot_end) order by i.slot_start),'[]'::jsonb)
    into v_offered from intended i;

  return jsonb_build_object(
    'timeZone',v_slot_zone,'programTimeZone',v_program_zone,
    'semesterStart',v_semester.start_date,'semesterEnd',v_semester.end_date,
    'from',p_from,'until',p_until,'offered',v_offered,
    'busy',(select coalesce(jsonb_agg(jsonb_build_object('startsAt',b.starts_at,'endsAt',b.ends_at) order by b.starts_at),'[]'::jsonb)
      from private.google_calendar_busy_snapshots s join private.google_calendar_busy_intervals b on b.snapshot_id=s.id and b.semester_id=s.semester_id
      where s.semester_id=p_semester_id and s.mentor_semester_id=p_mentor_semester_id and s.connection_id=v_settings.connection_id
        and b.starts_at<p_until and b.ends_at>p_from),
    'bookings',(select coalesce(jsonb_agg(jsonb_build_object('startsAt',o.starts_at,'endsAt',o.ends_at) order by o.starts_at),'[]'::jsonb)
      from public.mentor_booking_accepted_occupancy o where o.semester_id=p_semester_id and o.mentor_semester_id=p_mentor_semester_id
        and o.starts_at<p_until and o.ends_at>p_from),
    -- Health is independent of the editor's requested horizon. The worker's
    -- canonical snapshot intentionally covers fewer than 90 future days;
    -- booking publication still fails closed per slot outside coverage.
    'syncUnavailable',coalesce(v_settings.sync_unavailable,false) or coalesce(v_settings.mode='synced' and not exists(
      select 1 from private.google_calendar_busy_snapshots s where s.semester_id=p_semester_id
        and s.mentor_semester_id=p_mentor_semester_id and s.connection_id=v_settings.connection_id
        and s.fetched_at between now()-interval '15 minutes' and now()
        and s.coverage_start<=now() and s.coverage_end>now()),false),
    'mode',coalesce(v_settings.mode,'weekly'),'lastSuccessAt',v_settings.last_success_at
  );
end $$;
alter function public.calendar_owner_dated_availability(uuid,uuid,timestamptz,timestamptz) owner to calendar_sql_internal;
revoke all on function public.calendar_owner_dated_availability(uuid,uuid,timestamptz,timestamptz) from public,anon,service_role;
grant execute on function public.calendar_owner_dated_availability(uuid,uuid,timestamptz,timestamptz) to authenticated;

revoke create on schema public from calendar_sql_internal;
