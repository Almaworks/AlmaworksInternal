-- Compose after google_calendar.sql. Consent opts new mentor settings into sync;
-- reconnect never overwrites an explicit weekly/manual/synced preference.
grant create on schema private to calendar_sql_internal;
create function private.calendar_initialize_connected_mentor() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_mentor uuid; v_zone text;
begin
  if new.completed_at is null or old.completed_at is not null then return null; end if;
  if not private.is_calendar_worker() then
    raise exception 'Calendar worker required' using errcode='42501'; end if;
  select t.id,coalesce(nullif(btrim(s.configuration->>'timezone'),''),'America/New_York')
    into v_mentor,v_zone
    from public.mentor_semesters t
    join public.semester_memberships m on m.id=t.semester_membership_id and m.semester_id=t.semester_id
    join public.semesters s on s.id=t.semester_id
    join public.profiles p on p.id=m.profile_id
    where t.semester_id=new.semester_id and m.profile_id=new.profile_id
      and m.role='mentor' and m.status in ('invited','onboarding','active')
      and p.is_active and p.status='approved' and s.is_active;
  if v_mentor is null then return null; end if;
  -- Match the settings editor's lock. Both flows hold the connection before
  -- this lock; an editor's saved preference always wins over initialization.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('calendar-settings:'||v_mentor::text,0));
  insert into public.mentor_calendar_settings(semester_id,mentor_semester_id,mode,time_zone,connection_id)
    values(new.semester_id,v_mentor,'synced',v_zone,new.connection_id)
    on conflict(semester_id,mentor_semester_id) do nothing;
  -- Existing settings trigger queues sync. Existing working hours are retained;
  -- no hours or successful provider snapshot are fabricated here.
  return null;
end $$;
alter function private.calendar_initialize_connected_mentor() owner to calendar_sql_internal;
revoke all on function private.calendar_initialize_connected_mentor() from public,anon,authenticated,service_role;
create trigger initialize_connected_mentor_calendar after update of completed_at
  on private.google_calendar_oauth_transactions for each row
  execute function private.calendar_initialize_connected_mentor();
revoke create on schema private from calendar_sql_internal;
