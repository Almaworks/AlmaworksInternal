create table if not exists public.mentor_weekly_availability (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete restrict,
  mentor_semester_id uuid not null,
  weekday smallint not null,
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mentor_weekly_availability_semester_mentor_fkey foreign key (semester_id, mentor_semester_id) references public.mentor_semesters(semester_id,id) on delete restrict,
  constraint mentor_weekly_availability_weekday_check check (weekday between 0 and 6),
  constraint mentor_weekly_availability_interval_check check (ends_at > starts_at),
  constraint mentor_weekly_availability_quarter_hour_check check (
    extract(minute from starts_at)::integer % 15 = 0 and extract(second from starts_at)::integer = 0
    and extract(minute from ends_at)::integer % 15 = 0 and extract(second from ends_at)::integer = 0
  ),
  constraint mentor_weekly_availability_unique_range unique (mentor_semester_id, weekday, starts_at, ends_at)
);

create index if not exists mentor_weekly_availability_semester_mentor_idx on public.mentor_weekly_availability(semester_id, mentor_semester_id, weekday, starts_at);

alter table public.mentor_booking_requests
  add constraint mentor_booking_requests_semester_id_id_key unique (semester_id,id);

create table if not exists public.mentor_booking_accepted_occupancy (
  request_id uuid primary key references public.mentor_booking_requests(id) on delete restrict,
  semester_id uuid not null references public.semesters(id) on delete restrict,
  mentor_semester_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  constraint mentor_booking_accepted_occupancy_semester_request_fkey
    foreign key (semester_id,request_id) references public.mentor_booking_requests(semester_id,id) on delete restrict,
  constraint mentor_booking_accepted_occupancy_semester_mentor_fkey
    foreign key (semester_id,mentor_semester_id) references public.mentor_semesters(semester_id,id) on delete restrict,
  constraint mentor_booking_accepted_occupancy_interval_check check (ends_at > starts_at)
);

create index if not exists mentor_booking_accepted_occupancy_semester_time_idx
  on public.mentor_booking_accepted_occupancy(semester_id,starts_at,ends_at);
create index if not exists mentor_booking_accepted_occupancy_mentor_time_idx
  on public.mentor_booking_accepted_occupancy(mentor_semester_id,starts_at,ends_at);

alter table public.mentor_booking_requests alter column window_id drop not null;
alter table public.mentor_booking_requests drop constraint if exists mentor_booking_requests_semester_window_fkey;
drop index if exists public.mentor_booking_requests_live_window_idx;
create unique index if not exists mentor_booking_requests_live_selected_time_idx
  on public.mentor_booking_requests(mentor_semester_id, startup_semester_id, starts_at, ends_at)
  where status in ('pending','accepted');

drop trigger if exists sync_mentor_booking_request_claim on public.mentor_booking_requests;
drop table if exists public.mentor_booking_window_claims;

create or replace function private.guard_mentor_booking_request()
returns trigger language plpgsql security invoker set search_path='' as $$
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
$$;

create or replace function public.replace_mentor_weekly_availability(p_semester_id uuid,p_availability jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare own_mentor uuid;
begin
  select term.id into own_mentor from public.mentor_semesters term join public.semester_memberships membership on membership.id=term.semester_membership_id and membership.semester_id=term.semester_id join public.semesters semester on semester.id=term.semester_id where term.semester_id=p_semester_id and membership.profile_id=private.current_profile_id() and membership.role='mentor' and membership.status='active' and semester.is_active;
  if own_mentor is null then raise exception 'Active owning mentor required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('calendar-settings:'||own_mentor::text,0));
  if exists(select 1 from public.mentor_calendar_settings
      where semester_id=p_semester_id and mentor_semester_id=own_mentor) then
    raise exception 'Use Calendar availability settings to change these working hours' using errcode='55000';
  end if;
  if jsonb_typeof(p_availability) <> 'array' then raise exception 'Availability must be an array' using errcode='22023'; end if;
  delete from public.mentor_weekly_availability where semester_id=p_semester_id and mentor_semester_id=own_mentor;
  insert into public.mentor_weekly_availability(semester_id,mentor_semester_id,weekday,starts_at,ends_at)
  select p_semester_id,own_mentor,entry.weekday,entry.starts_at,entry.ends_at from jsonb_to_recordset(p_availability) as entry(weekday smallint, starts_at time, ends_at time);
end;
$$;

create or replace function public.request_mentor_booking(p_semester_id uuid,p_mentor_semester_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_topic text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare existing_id uuid; created_id uuid; own_startup uuid;
begin
  select team.startup_semester_id into own_startup from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id where team.semester_id=p_semester_id and membership.profile_id=private.current_profile_id() and membership.role='startup' and membership.status='active';
  if own_startup is null then raise exception 'Active startup membership required' using errcode='42501'; end if;
  select id into existing_id from public.mentor_booking_requests where semester_id=p_semester_id and mentor_semester_id=p_mentor_semester_id and startup_semester_id=own_startup and starts_at=p_starts_at and ends_at=p_ends_at and status in ('pending','accepted');
  if existing_id is not null then return existing_id; end if;
  insert into public.mentor_booking_requests(semester_id,window_id,mentor_semester_id,mentor_profile_id,mentor_name,startup_semester_id,startup_organization_id,startup_name,requested_by_profile_id,topic,status,starts_at,ends_at) values(p_semester_id,null,p_mentor_semester_id,gen_random_uuid(),'Mentor',own_startup,gen_random_uuid(),'Startup',private.current_profile_id(),p_topic,'pending',p_starts_at,p_ends_at) returning id into created_id;
  return created_id;
exception when unique_violation then select id into existing_id from public.mentor_booking_requests where semester_id=p_semester_id and mentor_semester_id=p_mentor_semester_id and startup_semester_id=own_startup and starts_at=p_starts_at and ends_at=p_ends_at and status in ('pending','accepted'); return existing_id;
end;
$$;

create or replace function private.sync_accepted_booking_occupancy()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.status='accepted' and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.mentor_booking_accepted_occupancy(request_id,semester_id,mentor_semester_id,starts_at,ends_at)
    values(new.id,new.semester_id,new.mentor_semester_id,new.starts_at,new.ends_at);
  elsif tg_op='UPDATE' and old.status='accepted' and new.status<>'accepted' then
    delete from public.mentor_booking_accepted_occupancy where request_id=new.id;
  end if;
  return null;
end;
$$;

create trigger sync_accepted_booking_occupancy
after insert or update of status on public.mentor_booking_requests
for each row execute function private.sync_accepted_booking_occupancy();
