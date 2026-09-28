set local check_function_bodies = off;

create or replace function public.calendar_owner_week (
  p_semester_id        uuid,
  p_mentor_semester_id uuid,
  p_week_start         date default null::date
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  AS $function$
declare v_settings public.mentor_calendar_settings%rowtype; v_semester public.semesters%rowtype;
  v_zone text; v_date date; v_from timestamptz; v_until timestamptz; v_slots jsonb;
begin
  if not private.calendar_can_read_mentor(p_semester_id,p_mentor_semester_id) or not exists(
    select 1 from public.mentor_semesters t join public.semester_memberships m on m.id=t.semester_membership_id
    join public.profiles p on p.id=m.profile_id
    where t.id=p_mentor_semester_id and t.semester_id=p_semester_id and p.auth_user_id=(select auth.uid())
      and m.role='mentor' and m.status in ('active','invited','onboarding') and p.is_active and p.status='approved'
  ) then raise exception 'Only the owning mentor can read this calendar' using errcode='42501'; end if;
  select * into v_settings from public.mentor_calendar_settings where semester_id=p_semester_id and mentor_semester_id=p_mentor_semester_id;
  select * into v_semester from public.semesters where id=p_semester_id;
  v_zone:=coalesce(v_settings.time_zone,nullif(v_semester.configuration->>'timezone',''),'America/New_York');
  v_date:=coalesce(p_week_start,(now() at time zone v_zone)::date);
  v_date:=v_date-extract(dow from v_date)::integer;
  if v_date < least((now() at time zone v_zone)::date,v_semester.start_date)-interval '370 days'
    or v_date > greatest((now() at time zone v_zone)::date,v_semester.end_date)+interval '370 days'
    then raise exception 'Calendar week is out of range' using errcode='22023'; end if;
  v_from:=v_date::timestamp at time zone v_zone;
  v_until:=(v_date+7)::timestamp at time zone v_zone;
  if v_date+7<=v_semester.start_date or v_date>v_semester.end_date then v_slots:='[]'::jsonb;
  else select coalesce(jsonb_agg(jsonb_build_object('startsAt',s.starts_at,'endsAt',s.ends_at) order by s.starts_at),'[]'::jsonb)
    into v_slots from public.calendar_effective_slots(p_semester_id,p_mentor_semester_id,v_from,v_until) s; end if;
  return jsonb_build_object('weekStart',v_date,'timeZone',v_zone,'semesterStart',v_semester.start_date,'semesterEnd',v_semester.end_date,
    'mode',coalesce(v_settings.mode,'weekly'),'lastSuccessAt',v_settings.last_success_at,
    'syncUnavailable',coalesce(v_settings.sync_unavailable,false) or (v_settings.mode='synced' and not exists(
      select 1 from private.google_calendar_busy_snapshots s where s.semester_id=p_semester_id and s.mentor_semester_id=p_mentor_semester_id
        and s.connection_id=v_settings.connection_id and s.fetched_at between now()-interval '15 minutes' and now() and s.coverage_start<=greatest(v_from,now()) and s.coverage_end>=v_until)),
    'workingHours',(select coalesce(jsonb_agg(jsonb_build_object('weekday',h.weekday,'startsAt',h.starts_at,'endsAt',h.ends_at) order by h.weekday,h.starts_at),'[]'::jsonb)
      from public.mentor_weekly_availability h where h.semester_id=p_semester_id and h.mentor_semester_id=p_mentor_semester_id),
    'busy',(select coalesce(jsonb_agg(jsonb_build_object('startsAt',b.starts_at,'endsAt',b.ends_at) order by b.starts_at),'[]'::jsonb)
      from private.google_calendar_busy_snapshots s join private.google_calendar_busy_intervals b on b.snapshot_id=s.id and b.semester_id=s.semester_id
      where s.semester_id=p_semester_id and s.mentor_semester_id=p_mentor_semester_id and s.connection_id=v_settings.connection_id and b.starts_at<v_until and b.ends_at>v_from),
    'bookings',(select coalesce(jsonb_agg(jsonb_build_object('startsAt',o.starts_at,'endsAt',o.ends_at) order by o.starts_at),'[]'::jsonb)
      from public.mentor_booking_accepted_occupancy o where o.semester_id=p_semester_id and o.mentor_semester_id=p_mentor_semester_id and o.starts_at<v_until and o.ends_at>v_from),
    'slots',v_slots);
end $function$;

revoke all on schema "public" from "calendar_sql_internal";

grant create, usage on schema "public" to "calendar_sql_internal";
