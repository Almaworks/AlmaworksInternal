create extension if not exists btree_gist with schema extensions;

create table if not exists public.mentor_booking_windows (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete restrict,
  mentor_semester_id uuid not null,
  mentor_profile_id uuid not null references public.profiles(id) on delete restrict,
  mentor_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mentor_booking_windows_semester_id_id_key unique (semester_id,id),
  constraint mentor_booking_windows_semester_mentor_fkey
    foreign key (semester_id,mentor_semester_id) references public.mentor_semesters(semester_id,id) on delete restrict,
  constraint mentor_booking_windows_valid_interval check (ends_at > starts_at),
  constraint mentor_booking_windows_mentor_name_check check (length(btrim(mentor_name)) between 1 and 200)
);

create unique index if not exists mentor_booking_windows_active_exact_idx
  on public.mentor_booking_windows (mentor_semester_id,starts_at,ends_at)
  where withdrawn_at is null;
create index if not exists mentor_booking_windows_semester_time_idx
  on public.mentor_booking_windows (semester_id,starts_at,id);

create table if not exists public.mentor_booking_requests (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete restrict,
  window_id uuid not null,
  mentor_semester_id uuid not null,
  mentor_profile_id uuid not null references public.profiles(id) on delete restrict,
  mentor_name text not null,
  startup_semester_id uuid not null,
  startup_organization_id uuid not null references public.startup_organizations(id) on delete restrict,
  startup_name text not null,
  requested_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  topic text not null,
  status text not null default 'pending',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint mentor_booking_requests_semester_window_fkey
    foreign key (semester_id,window_id) references public.mentor_booking_windows(semester_id,id) on delete restrict,
  constraint mentor_booking_requests_semester_mentor_fkey
    foreign key (semester_id,mentor_semester_id) references public.mentor_semesters(semester_id,id) on delete restrict,
  constraint mentor_booking_requests_semester_startup_fkey
    foreign key (semester_id,startup_semester_id) references public.startup_semesters(semester_id,id) on delete restrict,
  constraint mentor_booking_requests_status_check check (status in ('pending','accepted','declined','cancelled')),
  constraint mentor_booking_requests_topic_check check (length(btrim(topic)) between 1 and 1000),
  constraint mentor_booking_requests_valid_interval check (ends_at > starts_at),
  constraint mentor_booking_requests_status_timestamps_check check (
    (status='pending' and responded_at is null and cancelled_at is null)
    or (status in ('accepted','declined') and responded_at is not null and cancelled_at is null)
    or (status='cancelled' and cancelled_at is not null)
  )
);

create unique index if not exists mentor_booking_requests_live_window_idx
  on public.mentor_booking_requests (window_id) where status in ('pending','accepted');
create index if not exists mentor_booking_requests_semester_history_idx
  on public.mentor_booking_requests (semester_id,requested_at desc,id);
create index if not exists mentor_booking_requests_startup_history_idx
  on public.mentor_booking_requests (startup_semester_id,requested_at desc);

alter table public.mentor_booking_requests
  add constraint mentor_booking_requests_accepted_mentor_overlap
  exclude using gist (mentor_profile_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
  where (status='accepted');
alter table public.mentor_booking_requests
  add constraint mentor_booking_requests_accepted_startup_overlap
  exclude using gist (startup_organization_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
  where (status='accepted');

create table if not exists public.mentor_booking_window_claims (
  window_id uuid primary key,
  semester_id uuid not null,
  request_id uuid not null unique references public.mentor_booking_requests(id) on delete restrict,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mentor_booking_window_claims_semester_window_fkey
    foreign key (semester_id,window_id) references public.mentor_booking_windows(semester_id,id) on delete restrict,
  constraint mentor_booking_window_claims_status_check check (status in ('pending','accepted'))
);

create index if not exists mentor_booking_window_claims_semester_idx
  on public.mentor_booking_window_claims (semester_id,window_id);

create or replace function private.guard_mentor_booking_window()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor_profile uuid := private.current_profile_id();
  canonical_mentor record;
begin
  if tg_op='INSERT' then
    select term.id as mentor_semester_id,membership.profile_id,profile.full_name,
      coalesce(nullif(btrim(semester.configuration->>'timezone'),''),'America/New_York') as timezone
      into canonical_mentor
    from public.mentor_semesters term
    join public.semester_memberships membership on membership.id=term.semester_membership_id and membership.semester_id=term.semester_id
    join public.profiles profile on profile.id=membership.profile_id
    join public.semesters semester on semester.id=term.semester_id
    where term.semester_id=new.semester_id and membership.profile_id=actor_profile
      and membership.role='mentor' and membership.status='active' and semester.is_active;
    if canonical_mentor.mentor_semester_id is null then raise exception 'Active owning mentor required' using errcode='42501'; end if;
    if new.starts_at<=now() or new.ends_at<=new.starts_at then raise exception 'Availability must be a future positive interval' using errcode='22023'; end if;
    new.mentor_semester_id:=canonical_mentor.mentor_semester_id;
    new.mentor_profile_id:=canonical_mentor.profile_id;
    new.mentor_name:=coalesce(nullif(btrim(canonical_mentor.full_name),''),'Mentor');
    new.withdrawn_at:=null; new.created_at:=now(); new.updated_at:=now();
    return new;
  end if;
  if tg_op='UPDATE' then
    if row(old.id,old.semester_id,old.mentor_semester_id,old.mentor_profile_id,old.mentor_name,old.starts_at,old.ends_at,old.created_at)
       is distinct from row(new.id,new.semester_id,new.mentor_semester_id,new.mentor_profile_id,new.mentor_name,new.starts_at,new.ends_at,new.created_at)
    then raise exception 'Published availability fields are immutable' using errcode='42501'; end if;
    if old.withdrawn_at is not null then
      if new.withdrawn_at is distinct from old.withdrawn_at then raise exception 'Withdrawn availability is immutable' using errcode='55000'; end if;
      return old;
    end if;
    if actor_profile is distinct from old.mentor_profile_id then raise exception 'Only the owning mentor can withdraw availability' using errcode='42501'; end if;
    if old.starts_at<=now() then raise exception 'Only future availability can be withdrawn' using errcode='55000'; end if;
    if new.withdrawn_at is null then raise exception 'Availability update must withdraw the window' using errcode='42501'; end if;
    if exists(select 1 from public.mentor_booking_window_claims claim where claim.window_id=old.id) then
      raise exception 'Availability with a live request cannot be withdrawn' using errcode='55000';
    end if;
    new.withdrawn_at:=now(); new.updated_at:=now(); return new;
  end if;
  raise exception 'Availability records cannot be deleted' using errcode='42501';
end;
$$;

create trigger guard_mentor_booking_windows
before insert or update or delete on public.mentor_booking_windows
for each row execute function private.guard_mentor_booking_window();

create or replace function private.guard_mentor_booking_request()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor_profile uuid := private.current_profile_id();
  selected_window public.mentor_booking_windows%rowtype;
  canonical_startup record;
begin
  if tg_op='INSERT' then
    select booking_window.* into selected_window from public.mentor_booking_windows booking_window
      where booking_window.id=new.window_id and booking_window.semester_id=new.semester_id and booking_window.withdrawn_at is null and booking_window.starts_at>now();
    if selected_window.id is null then raise exception 'Availability window not found' using errcode='P0002'; end if;
    select startup.id as startup_semester_id,startup.startup_organization_id,organization.name
      into canonical_startup
    from public.startup_team_memberships team
    join public.semester_memberships membership on membership.id=team.semester_membership_id and membership.semester_id=team.semester_id
    join public.startup_semesters startup on startup.id=team.startup_semester_id and startup.semester_id=team.semester_id
    join public.startup_organizations organization on organization.id=startup.startup_organization_id
    join public.semesters semester on semester.id=team.semester_id
    where team.semester_id=new.semester_id and membership.profile_id=actor_profile
      and membership.role='startup' and membership.status='active' and semester.is_active;
    if canonical_startup.startup_semester_id is null then raise exception 'Active startup membership required' using errcode='42501'; end if;
    new.mentor_semester_id:=selected_window.mentor_semester_id;
    new.mentor_profile_id:=selected_window.mentor_profile_id;
    new.mentor_name:=selected_window.mentor_name;
    new.startup_semester_id:=canonical_startup.startup_semester_id;
    new.startup_organization_id:=canonical_startup.startup_organization_id;
    new.startup_name:=canonical_startup.name;
    new.requested_by_profile_id:=actor_profile;
    new.topic:=btrim(new.topic); new.status:='pending';
    new.starts_at:=selected_window.starts_at; new.ends_at:=selected_window.ends_at;
    new.requested_at:=now(); new.responded_at:=null; new.cancelled_at:=null; new.updated_at:=now();
    return new;
  end if;
  if tg_op='UPDATE' then
    if row(old.id,old.semester_id,old.window_id,old.mentor_semester_id,old.mentor_profile_id,old.mentor_name,old.startup_semester_id,old.startup_organization_id,old.startup_name,old.requested_by_profile_id,old.topic,old.starts_at,old.ends_at,old.requested_at)
       is distinct from row(new.id,new.semester_id,new.window_id,new.mentor_semester_id,new.mentor_profile_id,new.mentor_name,new.startup_semester_id,new.startup_organization_id,new.startup_name,new.requested_by_profile_id,new.topic,new.starts_at,new.ends_at,new.requested_at)
    then raise exception 'Booking identity, topic, and interval are immutable' using errcode='42501'; end if;
    if new.status=old.status then
      if row(new.responded_at,new.cancelled_at) is distinct from row(old.responded_at,old.cancelled_at) then raise exception 'Booking timestamps are protected' using errcode='42501'; end if;
      return old;
    end if;
    if old.status='pending' and new.status in ('accepted','declined') then
      if actor_profile is distinct from old.mentor_profile_id then raise exception 'Only the owning mentor can respond' using errcode='42501'; end if;
      new.responded_at:=now(); new.cancelled_at:=null;
    elsif old.status in ('pending','accepted') and new.status='cancelled' then
      if actor_profile is distinct from old.mentor_profile_id and not exists(
        select 1 from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id
        where team.semester_id=old.semester_id and team.startup_semester_id=old.startup_semester_id
          and membership.profile_id=actor_profile and membership.status='active' and membership.role='startup'
      ) then raise exception 'Only either booking party can cancel' using errcode='42501'; end if;
      new.cancelled_at:=now(); new.responded_at:=old.responded_at;
    else raise exception 'Invalid booking status transition' using errcode='55000';
    end if;
    new.updated_at:=now(); return new;
  end if;
  raise exception 'Booking history cannot be deleted' using errcode='42501';
end;
$$;

create trigger guard_mentor_booking_requests
before insert or update or delete on public.mentor_booking_requests
for each row execute function private.guard_mentor_booking_request();

create or replace function private.guard_mentor_booking_claim()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare linked_status text;
begin
  select request.status into linked_status from public.mentor_booking_requests request
    where request.id=coalesce(new.request_id,old.request_id) and request.window_id=coalesce(new.window_id,old.window_id)
      and request.semester_id=coalesce(new.semester_id,old.semester_id);
  if tg_op='INSERT' then
    if linked_status<>'pending' then raise exception 'Claim requires a pending request' using errcode='42501'; end if;
    new.status:='pending'; new.created_at:=now(); new.updated_at:=now(); return new;
  elsif tg_op='UPDATE' then
    if row(new.window_id,new.semester_id,new.request_id,new.created_at) is distinct from row(old.window_id,old.semester_id,old.request_id,old.created_at)
      or old.status<>'pending' or new.status<>'accepted' or linked_status<>'accepted'
    then raise exception 'Invalid booking claim transition' using errcode='42501'; end if;
    new.updated_at:=now(); return new;
  elsif tg_op='DELETE' then
    if linked_status not in ('declined','cancelled') then raise exception 'Only terminal requests release claims' using errcode='42501'; end if;
    return old;
  end if;
  return null;
end;
$$;

create trigger guard_mentor_booking_window_claims
before insert or update or delete on public.mentor_booking_window_claims
for each row execute function private.guard_mentor_booking_claim();

create or replace function private.sync_mentor_booking_claim()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if tg_op='INSERT' then
    insert into public.mentor_booking_window_claims(window_id,semester_id,request_id,status)
    values(new.window_id,new.semester_id,new.id,'pending');
  elsif new.status is distinct from old.status then
    if new.status='accepted' then
      update public.mentor_booking_window_claims set status='accepted',updated_at=now() where request_id=new.id;
    elsif new.status in ('declined','cancelled') then
      delete from public.mentor_booking_window_claims where request_id=new.id;
    end if;
  end if;
  return null;
end;
$$;

create trigger sync_mentor_booking_request_claim
after insert or update of status on public.mentor_booking_requests
for each row execute function private.sync_mentor_booking_claim();

create or replace function public.publish_mentor_booking_window(p_semester_id uuid,p_starts_at timestamptz,p_ends_at timestamptz)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare existing_id uuid; created_id uuid;
begin
  select booking_window.id into existing_id from public.mentor_booking_windows booking_window
  join public.mentor_semesters term on term.id=booking_window.mentor_semester_id and term.semester_id=booking_window.semester_id
  join public.semester_memberships membership on membership.id=term.semester_membership_id
  where booking_window.semester_id=p_semester_id and booking_window.starts_at=p_starts_at and booking_window.ends_at=p_ends_at
    and booking_window.withdrawn_at is null and membership.profile_id=private.current_profile_id();
  if existing_id is not null then return existing_id; end if;
  insert into public.mentor_booking_windows(semester_id,mentor_semester_id,mentor_profile_id,mentor_name,starts_at,ends_at)
  values(p_semester_id,gen_random_uuid(),private.current_profile_id(),'Mentor',p_starts_at,p_ends_at) returning id into created_id;
  return created_id;
exception when unique_violation then
  select booking_window.id into existing_id from public.mentor_booking_windows booking_window
  where booking_window.semester_id=p_semester_id and booking_window.mentor_profile_id=private.current_profile_id()
    and booking_window.starts_at=p_starts_at and booking_window.ends_at=p_ends_at and booking_window.withdrawn_at is null;
  if existing_id is not null then return existing_id; end if;
  raise;
end;
$$;

create or replace function public.withdraw_mentor_booking_window(p_semester_id uuid,p_window_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare selected public.mentor_booking_windows%rowtype;
begin
  select * into selected from public.mentor_booking_windows where id=p_window_id and semester_id=p_semester_id;
  if selected.id is null then raise exception 'Availability window not found' using errcode='P0002'; end if;
  if selected.mentor_profile_id is distinct from private.current_profile_id() then raise exception 'Only the owning mentor can withdraw availability' using errcode='42501'; end if;
  if selected.withdrawn_at is not null then return selected.id; end if;
  update public.mentor_booking_windows set withdrawn_at=now(),updated_at=now() where id=selected.id;
  return selected.id;
end;
$$;

create or replace function public.request_mentor_booking_window(p_semester_id uuid,p_window_id uuid,p_topic text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare startup_id uuid; existing_id uuid; created_id uuid;
begin
  select team.startup_semester_id into startup_id from public.startup_team_memberships team
  join public.semester_memberships membership on membership.id=team.semester_membership_id
  where team.semester_id=p_semester_id and membership.profile_id=private.current_profile_id()
    and membership.role='startup' and membership.status='active';
  if startup_id is null then raise exception 'Active startup membership required' using errcode='42501'; end if;
  select request.id into existing_id from public.mentor_booking_requests request
    where request.window_id=p_window_id and request.semester_id=p_semester_id and request.startup_semester_id=startup_id
      and request.status in ('pending','accepted');
  if existing_id is not null then return existing_id; end if;
  begin
    insert into public.mentor_booking_requests(semester_id,window_id,mentor_semester_id,mentor_profile_id,mentor_name,startup_semester_id,startup_organization_id,startup_name,requested_by_profile_id,topic,status,starts_at,ends_at)
    values(p_semester_id,p_window_id,gen_random_uuid(),private.current_profile_id(),'Mentor',startup_id,gen_random_uuid(),'Startup',private.current_profile_id(),p_topic,'pending',now(),now()+interval '1 minute')
    returning id into created_id;
    return created_id;
  exception when unique_violation then
    select request.id into existing_id from public.mentor_booking_requests request
      where request.window_id=p_window_id and request.semester_id=p_semester_id and request.startup_semester_id=startup_id
        and request.status in ('pending','accepted');
    if existing_id is not null then return existing_id; end if;
    raise;
  end;
end;
$$;

create or replace function public.respond_to_mentor_booking_request(p_semester_id uuid,p_request_id uuid,p_response text)
returns text language plpgsql security invoker set search_path='' as $$
declare selected public.mentor_booking_requests%rowtype;
begin
  if p_response not in ('accepted','declined') then raise exception 'Response must be accepted or declined' using errcode='22023'; end if;
  select * into selected from public.mentor_booking_requests where id=p_request_id and semester_id=p_semester_id;
  if selected.id is null then raise exception 'Booking request not found' using errcode='P0002'; end if;
  if selected.mentor_profile_id is distinct from private.current_profile_id() then raise exception 'Only the owning mentor can respond' using errcode='42501'; end if;
  select * into selected from public.mentor_booking_requests where id=p_request_id and semester_id=p_semester_id for update;
  if selected.status=p_response then return selected.status; end if;
  if selected.status<>'pending' then raise exception 'Booking request is no longer pending' using errcode='55000'; end if;
  update public.mentor_booking_requests set status=p_response,responded_at=now(),updated_at=now() where id=selected.id;
  return p_response;
end;
$$;

create or replace function public.cancel_mentor_booking_request(p_semester_id uuid,p_request_id uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare selected public.mentor_booking_requests%rowtype;
begin
  select * into selected from public.mentor_booking_requests where id=p_request_id and semester_id=p_semester_id for update;
  if selected.id is null then raise exception 'Booking request not found' using errcode='P0002'; end if;
  if selected.status='cancelled' then return selected.status; end if;
  if selected.status not in ('pending','accepted') then raise exception 'Booking request cannot be cancelled' using errcode='55000'; end if;
  update public.mentor_booking_requests set status='cancelled',cancelled_at=now(),updated_at=now() where id=selected.id;
  return 'cancelled';
end;
$$;
