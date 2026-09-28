set local check_function_bodies = off;

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
  deletion_target uuid;
  deletion_mentor_name text;
  deletion_status text;
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
    if new.ends_at-new.starts_at not in (interval '15 minutes',interval '30 minutes') or new.starts_at<=now() then raise exception 'Booking requests must be a future 15- or 30-minute appointment' using errcode='22023'; end if;
    local_start := new.starts_at at time zone canonical_mentor.timezone;
    local_end := (new.ends_at-interval '1 microsecond') at time zone canonical_mentor.timezone;
    if local_start::date <> local_end::date or local_start::date < canonical_mentor.start_date or local_start::date > canonical_mentor.end_date then raise exception 'Booking must occur during one semester day' using errcode='22023'; end if;
    if extract(minute from local_start)::integer % 15 <> 0 or extract(second from local_start)::integer <> 0 then raise exception 'Booking start must align to 15 minutes' using errcode='22023'; end if;
    if extract(dow from local_start)=5 and local_start::time < time '17:00' and local_end::time > time '15:00' then raise exception 'Independent mentor bookings cannot overlap the Friday Program from 3:00 PM to 5:00 PM' using errcode='22023'; end if;
    if not public.calendar_slot_available(new.semester_id,new.mentor_semester_id,new.starts_at,new.ends_at) then
      raise exception 'Selected time is no longer available' using errcode='55000';
    end if;
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
    deletion_target := nullif(pg_catalog.current_setting('member_deletion.finalizing_profile_id',true),'')::uuid;
    if current_user='postgres' and deletion_target is not null and private.is_finalizing_member_deletion(deletion_target)
      and (old.mentor_profile_id=deletion_target or old.requested_by_profile_id=deletion_target) then
      deletion_mentor_name := case when old.mentor_profile_id=deletion_target then 'Deleted member' else old.mentor_name end;
      deletion_status := case when old.mentor_profile_id=deletion_target and old.starts_at>now()
        and old.status in ('pending','accepted') then 'cancelled' else old.status end;
      if row(old.id,old.semester_id,old.window_id,old.mentor_semester_id,old.mentor_profile_id,old.startup_semester_id,old.startup_organization_id,old.startup_name,old.requested_by_profile_id,old.starts_at,old.ends_at,old.requested_at)
         is distinct from row(new.id,new.semester_id,new.window_id,new.mentor_semester_id,new.mentor_profile_id,new.startup_semester_id,new.startup_organization_id,new.startup_name,new.requested_by_profile_id,new.starts_at,new.ends_at,new.requested_at)
        or new.topic<>'Private request removed'
        or new.mentor_name is distinct from deletion_mentor_name
        or new.status is distinct from deletion_status
      then raise exception 'Invalid personal deletion booking update' using errcode='42501'; end if;
      return new;
    end if;
    if row(old.id,old.semester_id,old.window_id,old.mentor_semester_id,old.mentor_profile_id,old.mentor_name,old.startup_semester_id,old.startup_organization_id,old.startup_name,old.requested_by_profile_id,old.topic,old.starts_at,old.ends_at,old.requested_at) is distinct from row(new.id,new.semester_id,new.window_id,new.mentor_semester_id,new.mentor_profile_id,new.mentor_name,new.startup_semester_id,new.startup_organization_id,new.startup_name,new.requested_by_profile_id,new.topic,new.starts_at,new.ends_at,new.requested_at) then raise exception 'Booking identity, topic, and interval are immutable' using errcode='42501'; end if;
    if new.status=old.status then if row(new.responded_at,new.cancelled_at) is distinct from row(old.responded_at,old.cancelled_at) then raise exception 'Booking timestamps are protected' using errcode='42501'; end if; return old; end if;
    if old.status='pending' and new.status in ('accepted','declined') then
      if actor_profile is distinct from old.mentor_profile_id then raise exception 'Only the owning mentor can respond' using errcode='42501'; end if;
      if new.status='accepted' then
        if not exists(select 1 from public.mentor_semesters term
          join public.semester_memberships membership on membership.id=term.semester_membership_id and membership.semester_id=term.semester_id
          where term.id=old.mentor_semester_id and term.semester_id=old.semester_id
            and membership.profile_id=actor_profile and membership.role='mentor' and membership.status='active')
          or not public.calendar_slot_available(old.semester_id,old.mentor_semester_id,old.starts_at,old.ends_at,old.id)
        then raise exception 'Selected time is no longer available' using errcode='55000'; end if;
      end if;
      new.responded_at:=now(); new.cancelled_at:=null;
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

create or replace function public.calendar_finish_sync_job (
  p_job_id                   uuid,
  p_lease_token              uuid,
  p_success                  boolean,
  p_error                    text,
  p_credential_generation    bigint                   default null::bigint,
  p_refresh_token_ciphertext text                     default null::text,
  p_access_token_ciphertext  text                     default null::text,
  p_access_expires_at        timestamp with time zone default null::timestamp with time zone
)
  returns boolean
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_job private.google_calendar_sync_jobs%rowtype;
begin
  if not private.is_calendar_worker() then raise exception 'Calendar worker required' using errcode='42501'; end if;
  select * into v_job from private.google_calendar_sync_jobs
    where id=p_job_id and lease_token=p_lease_token and leased_until>now() for update;
  if v_job.id is null then return false; end if;
  if p_success then raise exception 'Successful sync requires calendar_apply_sync_result' using errcode='22023'; end if;
  perform 1 from private.google_calendar_credentials cred
    where cred.connection_id=v_job.connection_id and cred.generation=p_credential_generation for update;
  if not found or not private.calendar_can_run_sync(v_job.semester_id,v_job.mentor_semester_id,v_job.connection_id)
    then return false; end if;
  if p_refresh_token_ciphertext is not null or p_access_token_ciphertext is not null then
    update private.google_calendar_credentials set
      refresh_token_ciphertext=coalesce(p_refresh_token_ciphertext,refresh_token_ciphertext),
      access_token_ciphertext=coalesce(p_access_token_ciphertext,access_token_ciphertext),
      access_expires_at=coalesce(p_access_expires_at,access_expires_at),
      generation=generation+1,updated_at=now() where connection_id=v_job.connection_id;
  end if;
  update private.google_calendar_sync_jobs set run_after=now()+
      least(interval '1 hour',interval '1 minute'*greatest(1,v_job.attempts)),
    lease_token=null,leased_until=null,last_error=left(coalesce(p_error,'Provider error'),500),updated_at=now()
    where id=v_job.id;
  update public.mentor_calendar_settings set sync_unavailable=true,last_error_at=now()
    where semester_id=v_job.semester_id and mentor_semester_id=v_job.mentor_semester_id;
  if p_error='reconnect' then
    update public.google_calendar_connections set status='reconnect_required',updated_at=now()
      where id=v_job.connection_id and status='connected';
  end if;
  return true;
end $function$;

create or replace function public.calendar_slot_available (
  p_semester_id        uuid,
  p_mentor_semester_id uuid,
  p_starts_at          timestamp with time zone,
  p_ends_at            timestamp with time zone,
  p_exclude_request_id uuid                     default null::uuid
)
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path to ''
  AS $function$
declare v_semester public.semesters%rowtype;
  v_settings public.mentor_calendar_settings%rowtype;
  v_local_start timestamp; v_local_end timestamp;
  v_program_start timestamp; v_program_end timestamp;
  v_program_zone text;
  v_working boolean; v_addition boolean;
begin
  if not private.calendar_can_read_mentor(p_semester_id,p_mentor_semester_id) then return false; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at-p_starts_at not in (interval '15 minutes',interval '30 minutes')
    or p_starts_at<=now() or extract(epoch from p_starts_at)::numeric % 900<>0 then return false; end if;
  select * into v_semester from public.semesters where id=p_semester_id;
  if v_semester.id is null then return false; end if;
  v_program_zone:=coalesce(nullif(btrim(v_semester.configuration->>'timezone'),''),'America/New_York');
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_program_zone) then return false; end if;
  v_program_start:=p_starts_at at time zone v_program_zone;
  v_program_end:=(p_ends_at-interval '1 microsecond') at time zone v_program_zone;
  if v_program_start::date<v_semester.start_date or v_program_end::date>v_semester.end_date then return false; end if;
  if extract(dow from v_program_start)=5 and v_program_start::time<time '17:00'
      and (p_ends_at at time zone v_program_zone)::time>time '15:00' then return false; end if;
  if exists(select 1 from public.mentor_booking_accepted_occupancy occ
    where occ.semester_id=p_semester_id and occ.mentor_semester_id=p_mentor_semester_id
      and occ.request_id is distinct from p_exclude_request_id
      and occ.starts_at<p_ends_at and occ.ends_at>p_starts_at) then return false; end if;
  if exists(select 1 from public.mentor_calendar_overrides o
    where o.semester_id=p_semester_id and o.mentor_semester_id=p_mentor_semester_id
      and not o.available and o.starts_at<p_ends_at and o.ends_at>p_starts_at) then return false; end if;

  select * into v_settings from public.mentor_calendar_settings
    where semester_id=p_semester_id and mentor_semester_id=p_mentor_semester_id;
  if v_settings.mode='synced' then
    if v_settings.sync_unavailable or not exists(select 1 from public.google_calendar_connections c
      where c.id=v_settings.connection_id and c.status='connected') then return false; end if;
    if not exists(select 1 from private.google_calendar_busy_snapshots s
      where s.semester_id=p_semester_id and s.mentor_semester_id=p_mentor_semester_id
        and s.connection_id=v_settings.connection_id
        and s.fetched_at<=now() and s.fetched_at>=now()-interval '15 minutes'
        and s.coverage_start<=p_starts_at and s.coverage_end>=p_ends_at) then return false; end if;
    if exists(select 1 from private.google_calendar_busy_snapshots s
      join private.google_calendar_busy_intervals b on b.snapshot_id=s.id and b.semester_id=s.semester_id
      where s.semester_id=p_semester_id and s.mentor_semester_id=p_mentor_semester_id
        and b.starts_at<p_ends_at and b.ends_at>p_starts_at) then return false; end if;
  end if;

  v_local_start:=p_starts_at at time zone coalesce(v_settings.time_zone,v_program_zone);
  v_local_end:=(p_ends_at-interval '1 microsecond') at time zone coalesce(v_settings.time_zone,v_program_zone);
  select exists(select 1 from public.mentor_weekly_availability w
    where w.semester_id=p_semester_id and w.mentor_semester_id=p_mentor_semester_id
      and extract(dow from v_local_start)=w.weekday
      and v_local_start::date=v_local_end::date
      and w.starts_at<=v_local_start::time and w.ends_at>v_local_end::time) into v_working;
  select exists(select 1 from public.mentor_calendar_overrides o
    where o.semester_id=p_semester_id and o.mentor_semester_id=p_mentor_semester_id
      and o.available and o.starts_at<=p_starts_at and o.ends_at>=p_ends_at) into v_addition;
  if v_addition then return true; end if;
  if v_settings.mode='manual' then
    return exists(select 1 from public.mentor_calendar_manual_slots m
      where m.semester_id=p_semester_id and m.mentor_semester_id=p_mentor_semester_id
        and m.starts_at<=p_starts_at and m.ends_at>=p_ends_at);
  end if;
  return v_working;
end $function$;
