-- This file is composed after the canonical booking schema and security files.
-- Calendar worker is an ordinary authenticated Auth user provisioned in this
-- database registry. No service-role key, JWT metadata, or BYPASSRLS is used.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='calendar_sql_internal') then
    create role calendar_sql_internal nologin nobypassrls;
  end if;
end $$;
grant calendar_sql_internal to postgres;
-- Auth owns its schema grants. Inherit the ordinary participant role to use
-- auth.uid() and its helpers; this does not confer BYPASSRLS or a login.
grant authenticated to calendar_sql_internal;
grant usage on schema public,private to calendar_sql_internal;
-- PostgreSQL requires CREATE while transferring function ownership. The role
-- cannot log in; remove this setup-only privilege after all transfers below.
grant create on schema public,private to calendar_sql_internal;

create table private.calendar_worker_identities (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table private.calendar_worker_identities enable row level security;
create policy "worker reads its registry entry" on private.calendar_worker_identities
  for select to authenticated using (auth_user_id=(select auth.uid()));
revoke all on private.calendar_worker_identities from public,anon,authenticated,service_role;
grant select on private.calendar_worker_identities to authenticated;

create function private.is_calendar_worker() returns boolean
language sql stable security invoker set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from private.calendar_worker_identities w
    where w.auth_user_id=(select auth.uid()) and w.enabled
  )
$$;
revoke all on function private.is_calendar_worker() from public,anon,service_role;
grant execute on function private.is_calendar_worker() to authenticated;

-- Global identity/integration configuration: no participation is inferred.
create table public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  provider_subject text not null,
  account_email text not null,
  calendar_id text not null default 'primary',
  status text not null default 'connected' check (status in ('connected','reconnect_required','disconnecting','disconnected')),
  disconnect_cleanup_incomplete boolean not null default false,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disconnected_at timestamptz,
  constraint google_calendar_connection_profile_key unique(id,profile_id),
  constraint google_calendar_connection_status_time_check check ((status='disconnected')=(disconnected_at is not null))
);
alter table public.google_calendar_connections enable row level security;
create policy "connection owner sees own status" on public.google_calendar_connections
  for select to authenticated using (exists (
    select 1 from public.profiles p where p.id=profile_id and p.auth_user_id=(select auth.uid())
  ));
create policy "calendar worker manages connection status" on public.google_calendar_connections
  for all to authenticated using (private.is_calendar_worker()) with check (private.is_calendar_worker());
create policy "calendar internal reads and changes connections" on public.google_calendar_connections
  for all to calendar_sql_internal using (true) with check (true);
revoke all on public.google_calendar_connections from public,anon,authenticated,service_role;
grant select on public.google_calendar_connections to authenticated;
grant select,insert,update,delete on public.google_calendar_connections to calendar_sql_internal;

create table private.google_calendar_credentials (
  connection_id uuid primary key references public.google_calendar_connections(id) on delete cascade,
  generation bigint not null default 1 check (generation>0),
  refresh_token_ciphertext text not null check (length(refresh_token_ciphertext)>20),
  access_token_ciphertext text,
  access_expires_at timestamptz,
  disconnect_lease_token uuid,
  disconnect_leased_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table private.google_calendar_credentials enable row level security;
create policy "worker manages encrypted credentials" on private.google_calendar_credentials
  for all to authenticated using (private.is_calendar_worker()) with check (private.is_calendar_worker());
create policy "calendar internal removes credentials" on private.google_calendar_credentials
  for all to calendar_sql_internal using (true) with check (true);
revoke all on private.google_calendar_credentials from public,anon,authenticated,service_role;
grant select,insert,update,delete on private.google_calendar_credentials to calendar_sql_internal;

create table private.google_calendar_oauth_transactions (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null,
  state_hash text not null unique check (length(state_hash)>=32),
  verifier_ciphertext text not null check (length(verifier_ciphertext)>20),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint calendar_oauth_lifecycle_check check (completed_at is null or consumed_at is not null)
);
create index google_calendar_oauth_profile_idx on private.google_calendar_oauth_transactions(profile_id,semester_id,expires_at);
alter table private.google_calendar_oauth_transactions enable row level security;
create policy "worker manages oauth transactions" on private.google_calendar_oauth_transactions
  for all to authenticated using (private.is_calendar_worker()) with check (private.is_calendar_worker());
create policy "calendar internal removes oauth transactions" on private.google_calendar_oauth_transactions
  for all to calendar_sql_internal using (true) with check (true);
revoke all on private.google_calendar_oauth_transactions from public,anon,authenticated,service_role;
grant select,insert,update,delete on private.google_calendar_oauth_transactions to calendar_sql_internal;

-- One row per mentor semester. Existing mentor_weekly_availability remains the
-- canonical weekly-hours table, so existing manual mentors keep their behavior.
create table public.mentor_calendar_settings (
  semester_id uuid not null references public.semesters(id) on delete cascade,
  mentor_semester_id uuid not null,
  mode text not null check (mode in ('weekly','manual','synced')),
  time_zone text not null,
  connection_id uuid references public.google_calendar_connections(id) on delete set null,
  sync_unavailable boolean not null default false,
  last_success_at timestamptz,
  last_error_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(semester_id,mentor_semester_id),
  foreign key(semester_id,mentor_semester_id) references public.mentor_semesters(semester_id,id) on delete cascade,
  constraint mentor_calendar_synced_connection_check check (mode<>'synced' or connection_id is not null)
);
create function private.calendar_validate_mentor_settings() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_owner uuid;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name=new.time_zone) then
    raise exception 'Unknown IANA timezone' using errcode='22023';
  end if;
  if new.connection_id is not null then
    select m.profile_id into v_owner from public.mentor_semesters t
      join public.semester_memberships m on m.id=t.semester_membership_id and m.semester_id=t.semester_id
      where t.id=new.mentor_semester_id and t.semester_id=new.semester_id;
    if not exists (select 1 from public.google_calendar_connections c
      where c.id=new.connection_id and c.profile_id=v_owner and c.status='connected') then
      raise exception 'Calendar connection must belong to the mentor and be connected' using errcode='42501';
    end if;
  end if;
  -- Health/coverage are written by the worker, not the editor.
  if not private.is_calendar_worker() and current_user not in ('postgres','calendar_sql_internal') then
    if tg_op='INSERT' then
      new.sync_unavailable:=false; new.last_success_at:=null; new.last_error_at:=null;
    elsif row(new.sync_unavailable,new.last_success_at,new.last_error_at) is distinct from
          row(old.sync_unavailable,old.last_success_at,old.last_error_at) then
      raise exception 'Sync health is worker controlled' using errcode='42501';
    end if;
  end if;
  new.updated_at:=now();
  return new;
end $$;
create trigger validate_mentor_calendar_settings before insert or update on public.mentor_calendar_settings
  for each row execute function private.calendar_validate_mentor_settings();
alter table public.mentor_calendar_settings enable row level security;
create policy "mentor edits own calendar settings" on public.mentor_calendar_settings
  for all to authenticated
  using (exists (select 1 from public.mentor_semesters t join public.semester_memberships m
    on m.id=t.semester_membership_id and m.semester_id=t.semester_id
    where t.id=mentor_semester_id and t.semester_id=mentor_calendar_settings.semester_id
    and m.profile_id=private.current_profile_id() and m.role='mentor' and m.status in ('active','invited','onboarding')))
  with check (exists (select 1 from public.mentor_semesters t join public.semester_memberships m
    on m.id=t.semester_membership_id and m.semester_id=t.semester_id
    where t.id=mentor_semester_id and t.semester_id=mentor_calendar_settings.semester_id
    and m.profile_id=private.current_profile_id() and m.role='mentor' and m.status in ('active','invited','onboarding')));
create policy "worker manages mentor calendar health" on public.mentor_calendar_settings
  for all to authenticated using (private.is_calendar_worker()) with check (private.is_calendar_worker());
create policy "calendar internal reads settings" on public.mentor_calendar_settings
  for select to calendar_sql_internal using (true);
revoke all on public.mentor_calendar_settings from public,anon,authenticated,service_role;
grant select on public.mentor_calendar_settings to authenticated;
grant select on public.mentor_calendar_settings to calendar_sql_internal;

create table public.mentor_calendar_overrides (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  mentor_semester_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  available boolean not null,
  created_at timestamptz not null default now(),
  foreign key(semester_id,mentor_semester_id) references public.mentor_semesters(semester_id,id) on delete cascade,
  constraint mentor_calendar_override_range_check check (
    ends_at>starts_at and extract(epoch from starts_at)::bigint % 900=0
    and extract(epoch from ends_at)::bigint % 900=0)
);
create index mentor_calendar_override_range_idx on public.mentor_calendar_overrides(semester_id,mentor_semester_id,starts_at,ends_at);
create table public.mentor_calendar_manual_slots (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  mentor_semester_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key(semester_id,mentor_semester_id) references public.mentor_semesters(semester_id,id) on delete cascade,
  constraint mentor_calendar_manual_range_check check (
    ends_at>starts_at and extract(epoch from starts_at)::bigint % 900=0
    and extract(epoch from ends_at)::bigint % 900=0),
  unique(semester_id,mentor_semester_id,starts_at,ends_at)
);
create index mentor_calendar_manual_range_idx on public.mentor_calendar_manual_slots(semester_id,mentor_semester_id,starts_at,ends_at);
alter table public.mentor_calendar_overrides enable row level security;
alter table public.mentor_calendar_manual_slots enable row level security;
create policy "mentor manages own dated overrides" on public.mentor_calendar_overrides
  for all to authenticated
  using (exists (select 1 from public.mentor_semesters t join public.semester_memberships m
    on m.id=t.semester_membership_id and m.semester_id=t.semester_id
    where t.id=mentor_semester_id and t.semester_id=mentor_calendar_overrides.semester_id
    and m.profile_id=private.current_profile_id() and m.role='mentor' and m.status in ('active','invited','onboarding')))
  with check (exists (select 1 from public.mentor_semesters t join public.semester_memberships m
    on m.id=t.semester_membership_id and m.semester_id=t.semester_id
    where t.id=mentor_semester_id and t.semester_id=mentor_calendar_overrides.semester_id
    and m.profile_id=private.current_profile_id() and m.role='mentor' and m.status in ('active','invited','onboarding')));
create policy "mentor manages own manual slots" on public.mentor_calendar_manual_slots
  for all to authenticated
  using (exists (select 1 from public.mentor_semesters t join public.semester_memberships m
    on m.id=t.semester_membership_id and m.semester_id=t.semester_id
    where t.id=mentor_semester_id and t.semester_id=mentor_calendar_manual_slots.semester_id
    and m.profile_id=private.current_profile_id() and m.role='mentor' and m.status in ('active','invited','onboarding')))
  with check (exists (select 1 from public.mentor_semesters t join public.semester_memberships m
    on m.id=t.semester_membership_id and m.semester_id=t.semester_id
    where t.id=mentor_semester_id and t.semester_id=mentor_calendar_manual_slots.semester_id
    and m.profile_id=private.current_profile_id() and m.role='mentor' and m.status in ('active','invited','onboarding')));
create policy "calendar internal reads overrides" on public.mentor_calendar_overrides for select to calendar_sql_internal using (true);
create policy "calendar internal reads manual slots" on public.mentor_calendar_manual_slots for select to calendar_sql_internal using (true);
revoke all on public.mentor_calendar_overrides,public.mentor_calendar_manual_slots from public,anon,authenticated,service_role;
grant select on public.mentor_calendar_overrides,public.mentor_calendar_manual_slots to authenticated;
grant select on public.mentor_calendar_overrides,public.mentor_calendar_manual_slots to calendar_sql_internal;

create table private.google_calendar_busy_snapshots (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  mentor_semester_id uuid not null,
  connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
  coverage_start timestamptz not null,
  coverage_end timestamptz not null,
  fetched_at timestamptz not null,
  unique(semester_id,mentor_semester_id),
  unique(semester_id,id),
  foreign key(semester_id,mentor_semester_id) references public.mentor_semesters(semester_id,id) on delete cascade,
  check (coverage_end>coverage_start and coverage_end-coverage_start<=interval '90 days')
);
create table private.google_calendar_busy_intervals (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  snapshot_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  foreign key(semester_id,snapshot_id) references private.google_calendar_busy_snapshots(semester_id,id) on delete cascade,
  check (ends_at>starts_at)
);
create index google_calendar_busy_intervals_range_idx on private.google_calendar_busy_intervals(snapshot_id,starts_at,ends_at);
create function private.calendar_validate_busy_interval() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not exists (select 1 from private.google_calendar_busy_snapshots s
    where s.id=new.snapshot_id and s.semester_id=new.semester_id
      and s.coverage_start<=new.starts_at and s.coverage_end>=new.ends_at) then
    raise exception 'Google busy interval lies outside snapshot coverage' using errcode='22023';
  end if;
  return new;
end $$;
create trigger validate_google_busy_interval before insert or update on private.google_calendar_busy_intervals
  for each row execute function private.calendar_validate_busy_interval();
alter table private.google_calendar_busy_snapshots enable row level security;
alter table private.google_calendar_busy_intervals enable row level security;
create policy "worker manages busy snapshots" on private.google_calendar_busy_snapshots
  for all to authenticated using (private.is_calendar_worker()) with check (private.is_calendar_worker());
create policy "worker manages busy intervals" on private.google_calendar_busy_intervals
  for all to authenticated using (private.is_calendar_worker()) with check (private.is_calendar_worker());
create policy "calendar internal reads and clears snapshots" on private.google_calendar_busy_snapshots
  for all to calendar_sql_internal using (true) with check (true);
create policy "calendar internal reads and clears busy intervals" on private.google_calendar_busy_intervals
  for all to calendar_sql_internal using (true) with check (true);
revoke all on private.google_calendar_busy_snapshots,private.google_calendar_busy_intervals from public,anon,authenticated,service_role;
grant select,delete on private.google_calendar_busy_snapshots,private.google_calendar_busy_intervals to calendar_sql_internal;

create table private.google_calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  mentor_semester_id uuid not null,
  connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
  run_after timestamptz not null default now(),
  lease_token uuid,
  leased_until timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 50),
  last_error text,
  updated_at timestamptz not null default now(),
  unique(semester_id,mentor_semester_id),
  foreign key(semester_id,mentor_semester_id) references public.mentor_semesters(semester_id,id) on delete cascade,
  check ((lease_token is null)=(leased_until is null))
);
create index google_calendar_due_sync_idx on private.google_calendar_sync_jobs(run_after,leased_until);
alter table private.google_calendar_sync_jobs enable row level security;
create policy "worker manages sync queue" on private.google_calendar_sync_jobs
  for all to authenticated using (private.is_calendar_worker()) with check (private.is_calendar_worker());
create policy "calendar internal clears sync queue" on private.google_calendar_sync_jobs
  for delete to calendar_sql_internal using (true);
revoke all on private.google_calendar_sync_jobs from public,anon,authenticated,service_role;
grant delete on private.google_calendar_sync_jobs to calendar_sql_internal;

create table private.google_calendar_hold_jobs (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  request_id uuid not null,
  connection_id uuid not null,
  profile_id uuid not null,
  desired_state text not null check (desired_state in ('present','absent')),
  applied_state text not null default 'unknown' check (applied_state in ('unknown','present','absent')),
  generation bigint not null default 1 check (generation>0),
  event_id text not null,
  run_after timestamptz not null default now(),
  lease_token uuid,
  leased_until timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 50),
  last_error text,
  updated_at timestamptz not null default now(),
  unique(semester_id,request_id,connection_id),
  foreign key(semester_id,request_id) references public.mentor_booking_requests(semester_id,id) on delete cascade,
  foreign key(connection_id,profile_id) references public.google_calendar_connections(id,profile_id) on delete cascade,
  check ((lease_token is null)=(leased_until is null))
);
create index google_calendar_due_hold_idx on private.google_calendar_hold_jobs(run_after,leased_until);
alter table private.google_calendar_hold_jobs enable row level security;
create policy "worker manages hold queue" on private.google_calendar_hold_jobs
  for all to authenticated using (private.is_calendar_worker()) with check (private.is_calendar_worker());
create policy "calendar internal enqueues and clears holds" on private.google_calendar_hold_jobs
  for all to calendar_sql_internal using (true) with check (true);
revoke all on private.google_calendar_hold_jobs from public,anon,authenticated,service_role;
grant select,insert,update,delete on private.google_calendar_hold_jobs to calendar_sql_internal;

-- A dedicated NOLOGIN, NOBYPASSRLS function owner can see only its explicit
-- SELECT policies. User JWT and cohort checks are evaluated in the function.
grant select on public.semesters,public.profiles,public.semester_memberships,
  public.mentor_semesters,public.startup_team_memberships,public.mentor_weekly_availability,
  public.mentor_booking_requests,public.mentor_booking_accepted_occupancy to calendar_sql_internal;
create policy "calendar internal reads semesters" on public.semesters for select to calendar_sql_internal using (true);
create policy "calendar internal reads profiles" on public.profiles for select to calendar_sql_internal using (true);
create policy "calendar internal reads memberships" on public.semester_memberships for select to calendar_sql_internal using (true);
create policy "calendar internal reads mentor terms" on public.mentor_semesters for select to calendar_sql_internal using (true);
create policy "calendar internal reads startup teams" on public.startup_team_memberships for select to calendar_sql_internal using (true);
create policy "calendar internal reads weekly hours" on public.mentor_weekly_availability for select to calendar_sql_internal using (true);
create policy "calendar internal reads bookings" on public.mentor_booking_requests for select to calendar_sql_internal using (true);
create policy "calendar internal reads occupancy" on public.mentor_booking_accepted_occupancy for select to calendar_sql_internal using (true);
grant select on public.platform_roles to calendar_sql_internal;
create policy "calendar internal reads platform roles" on public.platform_roles for select to calendar_sql_internal using (true);

create policy "calendar internal verifies worker registry" on private.calendar_worker_identities
  for select to calendar_sql_internal using (auth_user_id=(select auth.uid()));
grant select on private.calendar_worker_identities to calendar_sql_internal;
grant execute on function private.is_calendar_worker() to calendar_sql_internal;
create policy "calendar internal manages oauth state" on private.google_calendar_oauth_transactions
  for all to calendar_sql_internal using (true) with check (true);
create policy "calendar internal manages sync jobs" on private.google_calendar_sync_jobs
  for all to calendar_sql_internal using (true) with check (true);
create policy "calendar internal manages credentials" on private.google_calendar_credentials
  for all to calendar_sql_internal using (true) with check (true);
create policy "calendar internal manages snapshot writes" on private.google_calendar_busy_snapshots
  for insert to calendar_sql_internal with check (true);
create policy "calendar internal manages interval writes" on private.google_calendar_busy_intervals
  for insert to calendar_sql_internal with check (true);
create policy "calendar internal updates health" on public.mentor_calendar_settings
  for update to calendar_sql_internal using (true) with check (true);
grant select,insert,update,delete on private.google_calendar_oauth_transactions,
  private.google_calendar_sync_jobs,private.google_calendar_credentials to calendar_sql_internal;
grant insert,update on private.google_calendar_busy_snapshots to calendar_sql_internal;
grant insert on private.google_calendar_busy_intervals to calendar_sql_internal;
grant update on public.mentor_calendar_settings to calendar_sql_internal;

-- Leases use live participant records, not JWT role claims or cached settings.
-- Onboarding mentors may sync; meeting holds require active participants.
create function private.calendar_can_run_sync(p_semester_id uuid,p_mentor_semester_id uuid,p_connection_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.mentor_calendar_settings settings
    join public.mentor_semesters mentor on mentor.semester_id=settings.semester_id
      and mentor.id=settings.mentor_semester_id
    join public.semester_memberships membership on membership.id=mentor.semester_membership_id
      and membership.semester_id=mentor.semester_id
    join public.profiles profile on profile.id=membership.profile_id
    join public.semesters semester on semester.id=mentor.semester_id
    join public.google_calendar_connections connection on connection.id=settings.connection_id
      and connection.profile_id=profile.id
    where settings.semester_id=p_semester_id and settings.mentor_semester_id=p_mentor_semester_id
      and settings.connection_id=p_connection_id and settings.mode='synced'
      and semester.is_active and semester.lifecycle_status='active'
      and membership.role='mentor' and membership.status in ('invited','onboarding','active')
      and profile.is_active and profile.status='approved' and profile.auth_user_id is not null
      and connection.status='connected'
  )
$$;
alter function private.calendar_can_run_sync(uuid,uuid,uuid) owner to calendar_sql_internal;
revoke all on function private.calendar_can_run_sync(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.calendar_can_run_sync(uuid,uuid,uuid) to calendar_sql_internal;

create function private.calendar_can_run_hold(p_semester_id uuid,p_request_id uuid,p_connection_id uuid,p_profile_id uuid,p_desired_state text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    -- Cleanup was explicitly requested by the connection owner. It remains
    -- permitted after a semester closes or a team assignment changes.
    select 1 from public.google_calendar_connections c
    join public.mentor_booking_requests b on b.semester_id=p_semester_id and b.id=p_request_id
    where c.id=p_connection_id and c.profile_id=p_profile_id and c.status='disconnecting'
      and p_desired_state='absent' and p_profile_id in (b.mentor_profile_id,b.requested_by_profile_id)
  ) or exists (
    select 1 from public.mentor_booking_requests booking
    join public.semesters semester on semester.id=booking.semester_id
    join public.google_calendar_connections connection on connection.id=p_connection_id
      and connection.profile_id=p_profile_id
    join public.profiles profile on profile.id=connection.profile_id
    join public.semester_memberships membership on membership.semester_id=booking.semester_id
      and membership.profile_id=profile.id
    where booking.semester_id=p_semester_id and booking.id=p_request_id
      and semester.is_active and semester.lifecycle_status='active'
      and profile.is_active and profile.status='approved' and profile.auth_user_id is not null
      and membership.status='active' and connection.status='connected'
      and ((membership.role='mentor' and booking.mentor_profile_id=profile.id)
        or (membership.role='startup' and booking.requested_by_profile_id=profile.id
          and exists (select 1 from public.startup_team_memberships team
            where team.semester_id=booking.semester_id
              and team.semester_membership_id=membership.id
              and team.startup_semester_id=booking.startup_semester_id)))
      and ((p_desired_state='present' and booking.status='accepted')
        or (p_desired_state='absent' and booking.status='cancelled'))
  )
$$;
alter function private.calendar_can_run_hold(uuid,uuid,uuid,uuid,text) owner to calendar_sql_internal;
revoke all on function private.calendar_can_run_hold(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.calendar_can_run_hold(uuid,uuid,uuid,uuid,text) to calendar_sql_internal;

-- Caller authentication is checked even for the dedicated SQL role: the
-- function owner has only explicit RLS permissions and cannot be logged into.
create function private.calendar_can_read_mentor(p_semester_id uuid,p_mentor_semester_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.mentor_semesters t
    join public.semester_memberships owner on owner.id=t.semester_membership_id and owner.semester_id=t.semester_id
    join public.profiles owner_profile on owner_profile.id=owner.profile_id
    join public.semesters s on s.id=t.semester_id
    where t.id=p_mentor_semester_id and t.semester_id=p_semester_id
      and s.is_active and owner_profile.is_active and owner_profile.status='approved'
      and owner.role='mentor' and owner.status in ('active','invited','onboarding')
      and exists(select 1 from public.profiles actor where actor.auth_user_id=(select auth.uid())
        and actor.is_active and actor.status='approved')
      and (exists (
        select 1 from public.semester_memberships viewer
        join public.profiles p on p.id=viewer.profile_id
        where viewer.semester_id=p_semester_id and p.auth_user_id=(select auth.uid())
          and (viewer.role='mentor' and viewer.id=t.semester_membership_id and viewer.status in ('active','invited','onboarding')
            or viewer.role in ('admin','startup') and viewer.status='active' and owner.status='active' and s.is_active)
      ) or owner.status='active' and exists (
        select 1 from public.platform_roles platform_role join public.profiles p on p.id=platform_role.profile_id
        where p.auth_user_id=(select auth.uid()) and platform_role.role='super_admin'
      ))
  )
$$;
alter function private.calendar_can_read_mentor(uuid,uuid) owner to calendar_sql_internal;
revoke all on function private.calendar_can_read_mentor(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.calendar_can_read_mentor(uuid,uuid) to authenticated,calendar_sql_internal;

create function public.calendar_slot_available(
  p_semester_id uuid,p_mentor_semester_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,
  p_exclude_request_id uuid default null
) returns boolean language plpgsql stable security definer set search_path='' as $$
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
end $$;
alter function public.calendar_slot_available(uuid,uuid,timestamptz,timestamptz,uuid) owner to calendar_sql_internal;
revoke all on function public.calendar_slot_available(uuid,uuid,timestamptz,timestamptz,uuid) from public,anon,service_role;
grant execute on function public.calendar_slot_available(uuid,uuid,timestamptz,timestamptz,uuid) to authenticated;
grant execute on function public.calendar_slot_available(uuid,uuid,timestamptz,timestamptz,uuid) to calendar_sql_internal;

create function public.calendar_effective_slots(
  p_semester_id uuid,p_mentor_semester_id uuid,p_from timestamptz,p_until timestamptz
) returns table(starts_at timestamptz,ends_at timestamptz)
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_from is null or p_until is null or p_until<=p_from
    or p_until-p_from>interval '90 days' then
    raise exception 'Calendar range must be positive and at most 90 days' using errcode='22023';
  end if;
  if not private.calendar_can_read_mentor(p_semester_id,p_mentor_semester_id) then
    raise exception 'Calendar is not accessible' using errcode='42501';
  end if;
  return query select slot_start,slot_start+interval '15 minutes'
    from pg_catalog.generate_series(
      pg_catalog.to_timestamp(pg_catalog.ceil(extract(epoch from greatest(p_from,now()))/900)*900),
      p_until-interval '15 minutes',interval '15 minutes') slot_start
    where public.calendar_slot_available(p_semester_id,p_mentor_semester_id,slot_start,slot_start+interval '15 minutes');
end $$;
revoke all on function public.calendar_effective_slots(uuid,uuid,timestamptz,timestamptz) from public,anon,service_role;
grant execute on function public.calendar_effective_slots(uuid,uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.calendar_effective_slots(uuid,uuid,timestamptz,timestamptz) to calendar_sql_internal;

-- Worker entry points are in public because private is deliberately absent
-- from PostgREST's exposed schemas. Every entry point checks the registry.
create function public.calendar_begin_oauth(
  p_semester_id uuid,p_profile_id uuid,p_state_hash text,p_verifier_ciphertext text,p_expires_at timestamptz
) returns table(transaction_id uuid,connection_id uuid)
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_connection_id uuid;
begin
  if not private.is_calendar_worker() then raise exception 'Calendar worker required' using errcode='42501'; end if;
  if p_expires_at<=now() or p_expires_at>now()+interval '15 minutes' then
    raise exception 'OAuth transaction expiration is invalid' using errcode='22023'; end if;
  if not exists(select 1 from public.semester_memberships m
    join public.profiles p on p.id=m.profile_id
    join public.semesters s on s.id=m.semester_id
    where m.semester_id=p_semester_id and m.profile_id=p_profile_id
      and p.is_active and p.status='approved' and s.is_active
      and m.role in ('mentor','startup') and m.status in ('invited','onboarding','active')) then
    raise exception 'Calendar connection requires participant membership' using errcode='42501';
  end if;
  -- A new consent flow can supersede an unopened link, but not a callback
  -- already exchanging credentials. All lifecycle entry points lock profile first.
  perform 1 from public.profiles where id=p_profile_id for update;
  if exists(select 1 from private.google_calendar_oauth_transactions
    where profile_id=p_profile_id and consumed_at is not null
      and completed_at is null and expires_at>now()) then
    raise exception 'Google Calendar callback is in progress' using errcode='PGC02'; end if;
  if exists(select 1 from public.google_calendar_connections where profile_id=p_profile_id and status='disconnecting') then
    raise exception 'Calendar disconnect cleanup is still in progress' using errcode='55000'; end if;
  update private.google_calendar_oauth_transactions set expires_at=now()
    where profile_id=p_profile_id and completed_at is null and expires_at>now();
  select c.id into v_connection_id from public.google_calendar_connections c
    where c.profile_id=p_profile_id;
  v_connection_id:=coalesce(v_connection_id,gen_random_uuid());
  insert into private.google_calendar_oauth_transactions
    (semester_id,profile_id,connection_id,state_hash,verifier_ciphertext,expires_at)
    values(p_semester_id,p_profile_id,v_connection_id,p_state_hash,p_verifier_ciphertext,p_expires_at)
    returning id into v_id;
  return query select v_id,v_connection_id;
end $$;
alter function public.calendar_begin_oauth(uuid,uuid,text,text,timestamptz) owner to calendar_sql_internal;
revoke all on function public.calendar_begin_oauth(uuid,uuid,text,text,timestamptz) from public,anon,service_role;
grant execute on function public.calendar_begin_oauth(uuid,uuid,text,text,timestamptz) to authenticated;

create function public.calendar_consume_oauth(
  p_state_hash text,p_profile_id uuid,p_semester_id uuid
) returns table(transaction_id uuid,connection_id uuid,verifier_ciphertext text)
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_calendar_worker() then raise exception 'Calendar worker required' using errcode='42501'; end if;
  perform 1 from public.profiles where id=p_profile_id for update;
  if exists(select 1 from public.google_calendar_connections where profile_id=p_profile_id and status='disconnecting') then
    return; end if;
  return query update private.google_calendar_oauth_transactions t
    set consumed_at=now()
    where t.state_hash=p_state_hash and t.profile_id=p_profile_id and t.semester_id=p_semester_id
      and t.consumed_at is null and t.expires_at>now()
    returning t.id,t.connection_id,t.verifier_ciphertext;
end $$;
alter function public.calendar_consume_oauth(text,uuid,uuid) owner to calendar_sql_internal;
revoke all on function public.calendar_consume_oauth(text,uuid,uuid) from public,anon,service_role;
grant execute on function public.calendar_consume_oauth(text,uuid,uuid) to authenticated;

create function public.calendar_abort_oauth(p_transaction_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not private.is_calendar_worker() then raise exception 'Calendar worker required' using errcode='42501'; end if;
  perform 1 from public.profiles where id=(select t.profile_id
    from private.google_calendar_oauth_transactions t where t.id=p_transaction_id) for update;
  update private.google_calendar_oauth_transactions set expires_at=now()
    where id=p_transaction_id and consumed_at is not null and completed_at is null and expires_at>now();
  return found;
end $$;
alter function public.calendar_abort_oauth(uuid) owner to calendar_sql_internal;
revoke all on function public.calendar_abort_oauth(uuid) from public,anon,service_role;
grant execute on function public.calendar_abort_oauth(uuid) to authenticated;

create function public.calendar_complete_oauth(
  p_transaction_id uuid,p_provider_subject text,p_account_email text,p_calendar_id text,
  p_refresh_token_ciphertext text,p_access_token_ciphertext text,p_access_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_transaction private.google_calendar_oauth_transactions%rowtype; v_connection uuid;
begin
  if not private.is_calendar_worker() then raise exception 'Calendar worker required' using errcode='42501'; end if;
  perform 1 from public.profiles where id=(select t.profile_id
    from private.google_calendar_oauth_transactions t where t.id=p_transaction_id) for update;
  select * into v_transaction from private.google_calendar_oauth_transactions
    where id=p_transaction_id and consumed_at is not null and completed_at is null
      and expires_at>now() for update;
  if v_transaction.id is null then raise exception 'OAuth transaction consumed or expired' using errcode='55000'; end if;
  if exists(select 1 from public.google_calendar_connections where profile_id=v_transaction.profile_id and status='disconnecting') then
    raise exception 'Calendar disconnect cleanup is still in progress' using errcode='55000'; end if;
  if not exists(select 1 from public.semester_memberships m
    join public.profiles p on p.id=m.profile_id
    join public.semesters s on s.id=m.semester_id
    where m.semester_id=v_transaction.semester_id and m.profile_id=v_transaction.profile_id
      and p.is_active and p.status='approved' and s.is_active
      and m.role in ('mentor','startup') and m.status in ('invited','onboarding','active')) then
    raise exception 'Calendar connection requires current participant access' using errcode='42501'; end if;
  if exists(select 1 from private.google_calendar_oauth_transactions t
    where t.profile_id=v_transaction.profile_id and t.id<>v_transaction.id
      and t.created_at>v_transaction.created_at and t.completed_at is null) then
    raise exception 'OAuth transaction superseded' using errcode='55000'; end if;
  if nullif(btrim(p_provider_subject),'') is null or nullif(btrim(p_account_email),'') is null
    or nullif(btrim(p_calendar_id),'') is null then raise exception 'Google identity is required' using errcode='22023'; end if;
  -- Keep the original credentials available for owned-hold cleanup. The profile
  -- lock above serializes this decision with disconnect and other callbacks.
  if exists(select 1 from public.google_calendar_connections c
    where c.profile_id=v_transaction.profile_id and c.status<>'disconnected'
      and (c.provider_subject<>p_provider_subject or c.calendar_id<>p_calendar_id)) then
    raise exception 'Disconnect existing Google Calendar before switching accounts' using errcode='PGC01';
  end if;
  insert into public.google_calendar_connections(id,profile_id,provider_subject,account_email,calendar_id,status,disconnected_at)
    values(v_transaction.connection_id,v_transaction.profile_id,p_provider_subject,p_account_email,p_calendar_id,'connected',null)
    on conflict(profile_id) do update set provider_subject=excluded.provider_subject,
      account_email=excluded.account_email,calendar_id=excluded.calendar_id,status='connected',
      connected_at=now(),updated_at=now(),disconnected_at=null,disconnect_cleanup_incomplete=false
    returning id into v_connection;
  if v_connection<>v_transaction.connection_id then
    raise exception 'OAuth connection generation changed' using errcode='55000'; end if;
  update private.google_calendar_sync_jobs set lease_token=null,leased_until=null,
    attempts=0,run_after=now(),updated_at=now() where connection_id=v_connection;
  update private.google_calendar_hold_jobs set generation=generation+1,
    applied_state='unknown',attempts=0,
    run_after=greatest(now(),coalesce(leased_until,now())),updated_at=now()
    where connection_id=v_connection and lease_token is not null;
  insert into private.google_calendar_credentials(connection_id,refresh_token_ciphertext,access_token_ciphertext,access_expires_at)
    values(v_connection,p_refresh_token_ciphertext,p_access_token_ciphertext,p_access_expires_at)
    on conflict(connection_id) do update set refresh_token_ciphertext=excluded.refresh_token_ciphertext,
      access_token_ciphertext=excluded.access_token_ciphertext,access_expires_at=excluded.access_expires_at,
      generation=private.google_calendar_credentials.generation+1,updated_at=now();
  update private.google_calendar_oauth_transactions set completed_at=now() where id=v_transaction.id;
  return v_connection;
end $$;
alter function public.calendar_complete_oauth(uuid,text,text,text,text,text,timestamptz) owner to calendar_sql_internal;
revoke all on function public.calendar_complete_oauth(uuid,text,text,text,text,text,timestamptz) from public,anon,service_role;
grant execute on function public.calendar_complete_oauth(uuid,text,text,text,text,text,timestamptz) to authenticated;

create function public.calendar_lease_sync_jobs(p_limit integer default 10)
returns table(job_id uuid,semester_id uuid,mentor_semester_id uuid,connection_id uuid,profile_id uuid,
  lease_token uuid,refresh_token_ciphertext text,access_token_ciphertext text,
  access_expires_at timestamptz,calendar_id text,semester_start_date date,
  semester_end_date date,program_time_zone text,credential_generation bigint)
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_calendar_worker() then raise exception 'Calendar worker required' using errcode='42501'; end if;
  if p_limit<1 or p_limit>50 then raise exception 'Invalid lease batch size' using errcode='22023'; end if;
  return query with due as (
    select j.id from private.google_calendar_sync_jobs j
    join public.google_calendar_connections c on c.id=j.connection_id
    join private.google_calendar_credentials cred on cred.connection_id=c.id
    where j.run_after<=now() and (j.leased_until is null or j.leased_until<now()) and j.attempts<50
      and private.calendar_can_run_sync(j.semester_id,j.mentor_semester_id,j.connection_id)
      and not exists (select 1 from private.google_calendar_hold_jobs h
        where h.connection_id=j.connection_id and h.leased_until>now())
      and not exists (select 1 from private.google_calendar_sync_jobs earlier
        where earlier.connection_id=j.connection_id and earlier.id<>j.id
          and earlier.run_after<=now() and (earlier.leased_until is null or earlier.leased_until<now())
          and earlier.attempts<50 and (earlier.run_after,earlier.id)<(j.run_after,j.id)
          and private.calendar_can_run_sync(earlier.semester_id,earlier.mentor_semester_id,earlier.connection_id))
    order by j.run_after,j.id limit p_limit for update of j,c skip locked
  ), leased as (
    update private.google_calendar_sync_jobs j set lease_token=gen_random_uuid(),
      leased_until=now()+interval '2 minutes',attempts=j.attempts+1,updated_at=now()
      from due where j.id=due.id
      returning j.id,j.semester_id,j.mentor_semester_id,j.connection_id,j.lease_token
  ) select l.id,l.semester_id,l.mentor_semester_id,l.connection_id,c.profile_id,l.lease_token,
    cred.refresh_token_ciphertext,cred.access_token_ciphertext,cred.access_expires_at,c.calendar_id,
    semester.start_date,semester.end_date,
    coalesce(nullif(btrim(semester.configuration->>'timezone'),''),'America/New_York'),cred.generation
    from leased l join private.google_calendar_credentials cred on cred.connection_id=l.connection_id
    join public.google_calendar_connections c on c.id=l.connection_id
    join public.semesters semester on semester.id=l.semester_id;
end $$;
alter function public.calendar_lease_sync_jobs(integer) owner to calendar_sql_internal;
revoke all on function public.calendar_lease_sync_jobs(integer) from public,anon,service_role;
grant execute on function public.calendar_lease_sync_jobs(integer) to authenticated;

create function public.calendar_apply_sync_result(
  p_job_id uuid,p_lease_token uuid,p_coverage_start timestamptz,p_coverage_end timestamptz,
  p_busy jsonb,p_refresh_token_ciphertext text default null,p_access_token_ciphertext text default null,
  p_access_expires_at timestamptz default null,p_credential_generation bigint default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_job private.google_calendar_sync_jobs%rowtype; v_snapshot uuid;
  v_count integer;
begin
  if not private.is_calendar_worker() then raise exception 'Calendar worker required' using errcode='42501'; end if;
  select * into v_job from private.google_calendar_sync_jobs
    where id=p_job_id and lease_token=p_lease_token and leased_until>now() for update;
  if v_job.id is null then return false; end if;
  perform 1 from private.google_calendar_credentials cred
    where cred.connection_id=v_job.connection_id and cred.generation=p_credential_generation for update;
  if not found or not private.calendar_can_run_sync(v_job.semester_id,v_job.mentor_semester_id,v_job.connection_id)
    then return false; end if;
  if p_coverage_start is null or p_coverage_end<=p_coverage_start
    or p_coverage_end-p_coverage_start>interval '90 days'
    or p_coverage_start>now() or p_coverage_end<=now()
    or jsonb_typeof(p_busy)<>'array' or jsonb_array_length(p_busy)>5000 then
    raise exception 'Invalid Google FreeBusy coverage or intervals' using errcode='22023'; end if;
  select count(*) into v_count from jsonb_to_recordset(p_busy) as b(starts_at timestamptz,ends_at timestamptz)
    where b.starts_at is null or b.ends_at is null or b.ends_at<=b.starts_at
      or b.starts_at<p_coverage_start or b.ends_at>p_coverage_end;
  if v_count>0 then raise exception 'Invalid Google busy interval' using errcode='22023'; end if;
  delete from private.google_calendar_busy_snapshots
    where semester_id=v_job.semester_id and mentor_semester_id=v_job.mentor_semester_id;
  insert into private.google_calendar_busy_snapshots
    (semester_id,mentor_semester_id,connection_id,coverage_start,coverage_end,fetched_at)
    values(v_job.semester_id,v_job.mentor_semester_id,v_job.connection_id,p_coverage_start,p_coverage_end,now())
    returning id into v_snapshot;
  insert into private.google_calendar_busy_intervals(semester_id,snapshot_id,starts_at,ends_at)
    select v_job.semester_id,v_snapshot,b.starts_at,b.ends_at
    from jsonb_to_recordset(p_busy) as b(starts_at timestamptz,ends_at timestamptz);
  if p_refresh_token_ciphertext is not null or p_access_token_ciphertext is not null then
    update private.google_calendar_credentials set
      refresh_token_ciphertext=coalesce(p_refresh_token_ciphertext,refresh_token_ciphertext),
      access_token_ciphertext=coalesce(p_access_token_ciphertext,access_token_ciphertext),
      access_expires_at=coalesce(p_access_expires_at,access_expires_at),generation=generation+1,updated_at=now()
      where connection_id=v_job.connection_id;
  end if;
  update public.mentor_calendar_settings set sync_unavailable=false,last_success_at=now(),last_error_at=null
    where semester_id=v_job.semester_id and mentor_semester_id=v_job.mentor_semester_id;
  update private.google_calendar_sync_jobs set run_after=now()+interval '5 minutes',
    lease_token=null,leased_until=null,attempts=0,last_error=null,updated_at=now() where id=v_job.id;
  return true;
end $$;
alter function public.calendar_apply_sync_result(uuid,uuid,timestamptz,timestamptz,jsonb,text,text,timestamptz,bigint) owner to calendar_sql_internal;
revoke all on function public.calendar_apply_sync_result(uuid,uuid,timestamptz,timestamptz,jsonb,text,text,timestamptz,bigint) from public,anon,service_role;
grant execute on function public.calendar_apply_sync_result(uuid,uuid,timestamptz,timestamptz,jsonb,text,text,timestamptz,bigint) to authenticated;

create function public.calendar_finish_sync_job(p_job_id uuid,p_lease_token uuid,p_success boolean,p_error text,
  p_credential_generation bigint default null,p_refresh_token_ciphertext text default null,
  p_access_token_ciphertext text default null,p_access_expires_at timestamptz default null)
returns boolean language plpgsql security definer set search_path='' as $$
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
end $$;
alter function public.calendar_finish_sync_job(uuid,uuid,boolean,text,bigint,text,text,timestamptz) owner to calendar_sql_internal;
revoke all on function public.calendar_finish_sync_job(uuid,uuid,boolean,text,bigint,text,text,timestamptz) from public,anon,service_role;
grant execute on function public.calendar_finish_sync_job(uuid,uuid,boolean,text,bigint,text,text,timestamptz) to authenticated;

create function private.calendar_queue_sync_setting() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.mode='synced' and new.connection_id is not null then
    insert into private.google_calendar_sync_jobs(semester_id,mentor_semester_id,connection_id,run_after)
      values(new.semester_id,new.mentor_semester_id,new.connection_id,now())
      on conflict(semester_id,mentor_semester_id) do update set
        connection_id=excluded.connection_id,run_after=now(),lease_token=null,leased_until=null,
        attempts=0,last_error=null,updated_at=now();
  else
    delete from private.google_calendar_sync_jobs
      where semester_id=new.semester_id and mentor_semester_id=new.mentor_semester_id;
  end if;
  return null;
end $$;
alter function private.calendar_queue_sync_setting() owner to calendar_sql_internal;
revoke all on function private.calendar_queue_sync_setting() from public,anon,authenticated,service_role;
create trigger queue_mentor_calendar_sync after insert or update of mode,connection_id on public.mentor_calendar_settings
  for each row execute function private.calendar_queue_sync_setting();

create function public.calendar_request_sync(p_semester_id uuid,p_mentor_semester_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.mentor_semesters t
    join public.semester_memberships m on m.id=t.semester_membership_id and m.semester_id=t.semester_id
    join public.profiles p on p.id=m.profile_id
    join public.mentor_calendar_settings s on s.semester_id=t.semester_id and s.mentor_semester_id=t.id
    join public.semesters semester on semester.id=t.semester_id and semester.is_active
    join public.google_calendar_connections c on c.id=s.connection_id and c.profile_id=p.id and c.status='connected'
    where t.semester_id=p_semester_id and t.id=p_mentor_semester_id
      and p.auth_user_id=(select auth.uid()) and p.is_active and p.status='approved' and m.role='mentor'
      and m.status in ('active','invited','onboarding') and s.mode='synced') then
    raise exception 'Owning mentor with synced availability required' using errcode='42501'; end if;
  update private.google_calendar_sync_jobs set run_after=now(),updated_at=now()
    where semester_id=p_semester_id and mentor_semester_id=p_mentor_semester_id;
  return found;
end $$;
alter function public.calendar_request_sync(uuid,uuid) owner to calendar_sql_internal;
revoke all on function public.calendar_request_sync(uuid,uuid) from public,anon,service_role;
grant execute on function public.calendar_request_sync(uuid,uuid) to authenticated;

create policy "calendar internal edits manual snapshot" on public.mentor_calendar_manual_slots
  for all to calendar_sql_internal using (true) with check (true);
grant insert,delete on public.mentor_calendar_manual_slots to calendar_sql_internal;
create function public.calendar_disconnect(p_connection_id uuid,p_keep_manual boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_connection public.google_calendar_connections%rowtype; v_setting record;
  v_snapshot private.google_calendar_busy_snapshots%rowtype; v_uncertain_write boolean;
begin
  perform 1 from public.profiles p where p.auth_user_id=(select auth.uid())
    and p.id=(select c.profile_id from public.google_calendar_connections c where c.id=p_connection_id)
    for update;
  select * into v_connection from public.google_calendar_connections c
    where c.id=p_connection_id and c.profile_id in
      (select p.id from public.profiles p where p.auth_user_id=(select auth.uid())) for update;
  if v_connection.id is null then raise exception 'Own connection required' using errcode='42501'; end if;
  if exists(select 1 from private.google_calendar_oauth_transactions
    where profile_id=v_connection.profile_id and consumed_at is not null
      and completed_at is null and expires_at>now()) then return false; end if;
  if v_connection.status in ('disconnected','disconnecting') then return true; end if;
  -- Leasers lock this connection too. Do not invalidate a provider operation
  -- that still owns a lease (including a token refresh being persisted).
  if exists(select 1 from private.google_calendar_sync_jobs where connection_id=p_connection_id and leased_until>now())
    or exists(select 1 from private.google_calendar_hold_jobs where connection_id=p_connection_id and leased_until>now()) then
    return false;
  end if;
  -- An expired lease or timed-out create can have an unknown remote outcome.
  -- Even a subsequent delete acknowledgement cannot prove no late write exists.
  v_uncertain_write:=exists(select 1 from private.google_calendar_hold_jobs
    where connection_id=p_connection_id and (leased_until is not null
      or desired_state='present' and last_error='retryable'));
  for v_setting in select s.semester_id,s.mentor_semester_id,s.mode
    from public.mentor_calendar_settings s where s.connection_id=p_connection_id for update loop
    if p_keep_manual and v_setting.mode='synced' then
      select * into v_snapshot from private.google_calendar_busy_snapshots bs
        where bs.semester_id=v_setting.semester_id and bs.mentor_semester_id=v_setting.mentor_semester_id
          and bs.connection_id=p_connection_id and bs.fetched_at<=now()
          and bs.fetched_at>=now()-interval '15 minutes';
      if v_snapshot.id is null then
        raise exception 'A fresh complete Google snapshot is required to retain manual availability' using errcode='55000'; end if;
      delete from public.mentor_calendar_manual_slots where semester_id=v_setting.semester_id
        and mentor_semester_id=v_setting.mentor_semester_id;
      insert into public.mentor_calendar_manual_slots(semester_id,mentor_semester_id,starts_at,ends_at)
        select v_setting.semester_id,v_setting.mentor_semester_id,slot.starts_at,slot.ends_at
        from public.calendar_effective_slots(v_setting.semester_id,v_setting.mentor_semester_id,
          greatest(now(),v_snapshot.coverage_start),v_snapshot.coverage_end) slot;
    elsif not p_keep_manual then
      delete from public.mentor_calendar_manual_slots where semester_id=v_setting.semester_id
        and mentor_semester_id=v_setting.mentor_semester_id;
    end if;
    update public.mentor_calendar_settings set
      mode=case when p_keep_manual and v_setting.mode<>'weekly' then 'manual' else 'weekly' end,
      connection_id=null,sync_unavailable=false,last_success_at=null,last_error_at=null
      where semester_id=v_setting.semester_id and mentor_semester_id=v_setting.mentor_semester_id;
  end loop;
  update public.google_calendar_connections set status='disconnecting',disconnect_cleanup_incomplete=v_uncertain_write,updated_at=now()
    where id=p_connection_id;
  delete from private.google_calendar_busy_snapshots where connection_id=p_connection_id;
  delete from private.google_calendar_sync_jobs where connection_id=p_connection_id;
  update private.google_calendar_hold_jobs set desired_state='absent',applied_state='unknown',
    generation=generation+1,attempts=0,last_error=null,lease_token=null,leased_until=null,run_after=now(),updated_at=now()
    where connection_id=p_connection_id;
  delete from private.google_calendar_oauth_transactions where profile_id=v_connection.profile_id;
  update private.google_calendar_credentials set disconnect_lease_token=null,disconnect_leased_until=null where connection_id=p_connection_id;
  if not found then
    -- There is no provider credential to revoke or use for hold cleanup.
    update public.google_calendar_connections set status='disconnected',disconnected_at=now(),
      disconnect_cleanup_incomplete=true where id=p_connection_id;
    delete from private.google_calendar_hold_jobs where connection_id=p_connection_id;
  end if;
  return true;
end $$;
alter function public.calendar_disconnect(uuid,boolean) owner to calendar_sql_internal;
revoke all on function public.calendar_disconnect(uuid,boolean) from public,anon,service_role;
grant execute on function public.calendar_disconnect(uuid,boolean) to authenticated;

-- Booking acceptance and cancellation atomically change the desired provider
-- state. A lease carries its generation so an older result cannot overwrite a
-- newer cancellation/reschedule intention.
create function private.calendar_hold_event_id(p_request_id uuid,p_connection_id uuid)
returns text language sql immutable strict security invoker set search_path='' as $$
  select 'a'||pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    '["almaworks-hold-v1","'||p_request_id::text||'","'||p_connection_id::text||'"]','UTF8')),'hex');
$$;
revoke all on function private.calendar_hold_event_id(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.calendar_hold_event_id(uuid,uuid) to calendar_sql_internal;

create function private.calendar_enqueue_booking_holds() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_connection record; v_desired text; v_changed boolean;
begin
  if tg_op='INSERT' then
    if new.status<>'accepted' then return null; end if;
    v_changed:=true;
  elsif new.status not in ('accepted','cancelled') or
        (old.status is not distinct from new.status and
         old.starts_at is not distinct from new.starts_at and
         old.ends_at is not distinct from new.ends_at) then return null;
  else
    v_changed:=old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at;
  end if;
  v_desired:=case when new.status='accepted' then 'present' else 'absent' end;
  for v_connection in select c.id,c.profile_id from public.google_calendar_connections c
      where c.status='connected' and c.profile_id in (new.mentor_profile_id,new.requested_by_profile_id)
      order by c.id for update of c
    loop
    insert into private.google_calendar_hold_jobs
      (semester_id,request_id,connection_id,profile_id,desired_state,event_id)
      values(new.semester_id,new.id,v_connection.id,v_connection.profile_id,v_desired,
        private.calendar_hold_event_id(new.id,v_connection.id))
      on conflict(semester_id,request_id,connection_id) do update set
        desired_state=excluded.desired_state,applied_state='unknown',
        generation=private.google_calendar_hold_jobs.generation+1,
        run_after=greatest(now(),coalesce(private.google_calendar_hold_jobs.leased_until,now())),
        attempts=0,last_error=null,updated_at=now()
      where private.google_calendar_hold_jobs.desired_state is distinct from excluded.desired_state or v_changed;
  end loop;
  return null;
end $$;
alter function private.calendar_enqueue_booking_holds() owner to calendar_sql_internal;
revoke all on function private.calendar_enqueue_booking_holds() from public,anon,authenticated,service_role;
create trigger enqueue_google_calendar_booking_holds after insert or update of status,starts_at,ends_at on public.mentor_booking_requests
  for each row execute function private.calendar_enqueue_booking_holds();

create function private.calendar_enqueue_existing_holds() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='connected' and (tg_op='INSERT' or old.status<>'connected') then
    insert into private.google_calendar_hold_jobs
      (semester_id,request_id,connection_id,profile_id,desired_state,event_id)
      select b.semester_id,b.id,new.id,new.profile_id,'present',private.calendar_hold_event_id(b.id,new.id)
      from public.mentor_booking_requests b where b.status='accepted' and b.ends_at>now()
        and new.profile_id in (b.mentor_profile_id,b.requested_by_profile_id)
      on conflict(semester_id,request_id,connection_id) do update set desired_state='present',
        applied_state='unknown',generation=private.google_calendar_hold_jobs.generation+1,
        run_after=greatest(now(),coalesce(private.google_calendar_hold_jobs.leased_until,now())),updated_at=now()
      where private.google_calendar_hold_jobs.desired_state<>'present';
  end if;
  return null;
end $$;
alter function private.calendar_enqueue_existing_holds() owner to calendar_sql_internal;
revoke all on function private.calendar_enqueue_existing_holds() from public,anon,authenticated,service_role;
create trigger enqueue_existing_google_calendar_holds after insert or update of status on public.google_calendar_connections
  for each row execute function private.calendar_enqueue_existing_holds();

create function public.calendar_lease_hold_jobs(p_limit integer default 10)
returns table(job_id uuid,semester_id uuid,request_id uuid,connection_id uuid,profile_id uuid,
  desired_state text,event_id text,generation bigint,lease_token uuid,
  refresh_token_ciphertext text,access_token_ciphertext text,access_expires_at timestamptz,calendar_id text,
  starts_at timestamptz,ends_at timestamptz,credential_generation bigint)
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_calendar_worker() then raise exception 'Calendar worker required' using errcode='42501'; end if;
  if p_limit<1 or p_limit>50 then raise exception 'Invalid lease batch size' using errcode='22023'; end if;
  return query with due as (
    select j.id from private.google_calendar_hold_jobs j
    join public.google_calendar_connections c on c.id=j.connection_id
    join private.google_calendar_credentials cred on cred.connection_id=c.id
    where j.desired_state<>j.applied_state and j.run_after<=now()
      and (cred.disconnect_leased_until is null or cred.disconnect_leased_until<now())
      and (c.status<>'disconnecting' or (j.attempts<5 and coalesce(j.last_error,'') not in ('reconnect','credentials','ownership','invalid')))
      and (j.leased_until is null or j.leased_until<now()) and j.attempts<50
      and private.calendar_can_run_hold(j.semester_id,j.request_id,j.connection_id,j.profile_id,j.desired_state)
      and not exists (select 1 from private.google_calendar_sync_jobs s
        where s.connection_id=j.connection_id and s.leased_until>now())
      and not exists (select 1 from private.google_calendar_hold_jobs active
        where active.connection_id=j.connection_id and active.id<>j.id and active.leased_until>now())
      and not exists (select 1 from private.google_calendar_hold_jobs earlier
        where earlier.connection_id=j.connection_id and earlier.id<>j.id
          and earlier.desired_state<>earlier.applied_state and earlier.run_after<=now()
          and (earlier.leased_until is null or earlier.leased_until<now()) and earlier.attempts<50
          and (c.status<>'disconnecting' or (earlier.attempts<5 and coalesce(earlier.last_error,'') not in ('reconnect','credentials','ownership','invalid')))
          and (earlier.run_after,earlier.id)<(j.run_after,j.id)
          and private.calendar_can_run_hold(earlier.semester_id,earlier.request_id,
            earlier.connection_id,earlier.profile_id,earlier.desired_state))
    order by j.run_after,j.id limit p_limit for update of j,c skip locked
  ), leased as (
    update private.google_calendar_hold_jobs j set lease_token=gen_random_uuid(),
      leased_until=now()+interval '2 minutes',attempts=j.attempts+1,updated_at=now()
      from due where j.id=due.id
      returning j.id,j.semester_id,j.request_id,j.connection_id,j.profile_id,
        j.desired_state,j.event_id,j.generation,j.lease_token
  ) select l.id,l.semester_id,l.request_id,l.connection_id,l.profile_id,
    l.desired_state,l.event_id,l.generation,l.lease_token,
    cred.refresh_token_ciphertext,cred.access_token_ciphertext,cred.access_expires_at,c.calendar_id,
    booking.starts_at,booking.ends_at,cred.generation
    from leased l join private.google_calendar_credentials cred on cred.connection_id=l.connection_id
    join public.google_calendar_connections c on c.id=l.connection_id
    join public.mentor_booking_requests booking on booking.semester_id=l.semester_id and booking.id=l.request_id;
end $$;
alter function public.calendar_lease_hold_jobs(integer) owner to calendar_sql_internal;
revoke all on function public.calendar_lease_hold_jobs(integer) from public,anon,service_role;
grant execute on function public.calendar_lease_hold_jobs(integer) to authenticated;

create function public.calendar_finish_hold_job(
  p_job_id uuid,p_lease_token uuid,p_generation bigint,p_success boolean,p_error text,
  p_refresh_token_ciphertext text default null,p_access_token_ciphertext text default null,
  p_access_expires_at timestamptz default null,p_credential_generation bigint default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_job private.google_calendar_hold_jobs%rowtype;
begin
  if not private.is_calendar_worker() then raise exception 'Calendar worker required' using errcode='42501'; end if;
  select * into v_job from private.google_calendar_hold_jobs
    where id=p_job_id and lease_token=p_lease_token and generation=p_generation
      and leased_until>now() for update;
  if v_job.id is null then return false; end if;
  perform 1 from private.google_calendar_credentials cred
    where cred.connection_id=v_job.connection_id and cred.generation=p_credential_generation for update;
  if not found or not private.calendar_can_run_hold(v_job.semester_id,v_job.request_id,v_job.connection_id,
    v_job.profile_id,v_job.desired_state) then return false; end if;
  if p_refresh_token_ciphertext is not null or p_access_token_ciphertext is not null then
    update private.google_calendar_credentials set
      refresh_token_ciphertext=coalesce(p_refresh_token_ciphertext,refresh_token_ciphertext),
      access_token_ciphertext=coalesce(p_access_token_ciphertext,access_token_ciphertext),
      access_expires_at=coalesce(p_access_expires_at,access_expires_at),
      generation=generation+1,updated_at=now() where connection_id=v_job.connection_id;
  end if;
  if p_success then
    update private.google_calendar_hold_jobs set applied_state=desired_state,
      lease_token=null,leased_until=null,attempts=0,last_error=null,updated_at=now() where id=v_job.id;
  else
    update private.google_calendar_hold_jobs set run_after=now()+
        least(interval '1 hour',interval '1 minute'*greatest(1,v_job.attempts)),
      lease_token=null,leased_until=null,last_error=left(coalesce(p_error,'Provider error'),500),updated_at=now()
      where id=v_job.id;
  end if;
  return true;
end $$;
alter function public.calendar_finish_hold_job(uuid,uuid,bigint,boolean,text,text,text,timestamptz,bigint) owner to calendar_sql_internal;
revoke all on function public.calendar_finish_hold_job(uuid,uuid,bigint,boolean,text,text,text,timestamptz,bigint) from public,anon,service_role;
grant execute on function public.calendar_finish_hold_job(uuid,uuid,bigint,boolean,text,text,text,timestamptz,bigint) to authenticated;

-- Keep credentials only for owned-hold cleanup, then forget them locally.
-- Google project-wide grant revocation is deliberately not part of disconnect.
create function public.calendar_lease_disconnect_jobs(p_limit integer default 10)
returns table(connection_id uuid,lease_token uuid,credential_generation bigint)
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_calendar_worker() then raise exception 'Calendar worker required' using errcode='42501'; end if;
  if p_limit<1 or p_limit>50 then raise exception 'Invalid lease batch size' using errcode='22023'; end if;
  return query with due as (
    select c.id from public.google_calendar_connections c
    join private.google_calendar_credentials cred on cred.connection_id=c.id
    where c.status='disconnecting'
      and (cred.disconnect_leased_until is null or cred.disconnect_leased_until<now())
      and not exists(select 1 from private.google_calendar_sync_jobs s where s.connection_id=c.id and s.leased_until>now())
      and not exists(select 1 from private.google_calendar_hold_jobs h where h.connection_id=c.id and (
        h.leased_until>now() or h.desired_state<>'absent' or
        (h.applied_state<>'absent' and h.attempts<5 and coalesce(h.last_error,'') not in ('reconnect','credentials','ownership','invalid'))))
    order by c.updated_at,c.id limit p_limit for update of c,cred skip locked
  ), leased as (
    update private.google_calendar_credentials cred set disconnect_lease_token=gen_random_uuid(),
      disconnect_leased_until=now()+interval '2 minutes'
      from due where cred.connection_id=due.id
      returning cred.connection_id,cred.disconnect_lease_token,cred.generation
  ) select l.connection_id,l.disconnect_lease_token,l.generation from leased l;
end $$;
alter function public.calendar_lease_disconnect_jobs(integer) owner to calendar_sql_internal;
revoke all on function public.calendar_lease_disconnect_jobs(integer) from public,anon,service_role;
grant execute on function public.calendar_lease_disconnect_jobs(integer) to authenticated;

create function public.calendar_finish_disconnect_job(p_connection_id uuid,p_lease_token uuid,p_credential_generation bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_credential private.google_calendar_credentials%rowtype; v_warning boolean;
begin
  if not private.is_calendar_worker() then raise exception 'Calendar worker required' using errcode='42501'; end if;
  perform 1 from public.google_calendar_connections where id=p_connection_id and status='disconnecting' for update;
  if not found then return false; end if;
  select * into v_credential from private.google_calendar_credentials
    where connection_id=p_connection_id and generation=p_credential_generation
      and disconnect_lease_token=p_lease_token and disconnect_leased_until>now() for update;
  if v_credential.connection_id is null then return false; end if;
  if exists(select 1 from private.google_calendar_sync_jobs where connection_id=p_connection_id and leased_until>now())
    or exists(select 1 from private.google_calendar_hold_jobs where connection_id=p_connection_id and (
      leased_until>now() or desired_state<>'absent' or
      (applied_state<>'absent' and attempts<5 and coalesce(last_error,'') not in ('reconnect','credentials','ownership','invalid')))) then
    return false;
  end if;
  v_warning:=exists(select 1 from public.google_calendar_connections
    where id=p_connection_id and disconnect_cleanup_incomplete) or exists(select 1 from private.google_calendar_hold_jobs
    where connection_id=p_connection_id and applied_state<>'absent');
  delete from private.google_calendar_busy_snapshots where connection_id=p_connection_id;
  delete from private.google_calendar_sync_jobs where connection_id=p_connection_id;
  delete from private.google_calendar_hold_jobs where connection_id=p_connection_id;
  delete from private.google_calendar_credentials where connection_id=p_connection_id;
  update public.google_calendar_connections set status='disconnected',disconnected_at=now(),updated_at=now(),
    disconnect_cleanup_incomplete=v_warning where id=p_connection_id;
  return true;
end $$;
alter function public.calendar_finish_disconnect_job(uuid,uuid,bigint) owner to calendar_sql_internal;
revoke all on function public.calendar_finish_disconnect_job(uuid,uuid,bigint) from public,anon,service_role;
grant execute on function public.calendar_finish_disconnect_job(uuid,uuid,bigint) to authenticated;

create function public.calendar_hold_status(p_semester_id uuid,p_request_id uuid)
returns table(connection_id uuid,desired_state text,applied_state text,last_error text)
language plpgsql stable security definer set search_path='' as $$
begin
  return query select j.connection_id,j.desired_state,j.applied_state,j.last_error
    from private.google_calendar_hold_jobs j
    join public.profiles p on p.id=j.profile_id
    where j.semester_id=p_semester_id and j.request_id=p_request_id
      and p.auth_user_id=(select auth.uid());
end $$;
alter function public.calendar_hold_status(uuid,uuid) owner to calendar_sql_internal;
revoke all on function public.calendar_hold_status(uuid,uuid) from public,anon,service_role;
grant execute on function public.calendar_hold_status(uuid,uuid) to authenticated;

create function public.calendar_hold_statuses(p_semester_id uuid,p_request_ids uuid[])
returns table(request_id uuid,desired_state text,applied_state text,last_error text)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_request_ids is null or cardinality(p_request_ids)>100 then
    raise exception 'At most 100 booking statuses may be read' using errcode='22023'; end if;
  return query select j.request_id,j.desired_state,j.applied_state,j.last_error
    from private.google_calendar_hold_jobs j
    join public.profiles p on p.id=j.profile_id
    where j.semester_id=p_semester_id and j.request_id=any(p_request_ids)
      and p.auth_user_id=(select auth.uid()) and p.is_active and p.status='approved'
      and exists(select 1 from public.semester_memberships m where m.profile_id=p.id
        and m.semester_id=p_semester_id and m.role in ('mentor','startup') and m.status in ('active','onboarding'));
end $$;
alter function public.calendar_hold_statuses(uuid,uuid[]) owner to calendar_sql_internal;
revoke all on function public.calendar_hold_statuses(uuid,uuid[]) from public,anon,service_role;
grant execute on function public.calendar_hold_statuses(uuid,uuid[]) to authenticated;

-- Called by the existing, authorized personal-deletion finalizer after it sets
-- member_deletion.finalizing_profile_id and before it scrubs the profile.
-- The executor owns only explicit RLS policies on Calendar tables.
grant execute on function private.is_finalizing_member_deletion(uuid) to calendar_sql_internal;
create policy "calendar internal deletes mentor settings" on public.mentor_calendar_settings
  for delete to calendar_sql_internal using (true);
create policy "calendar internal deletes mentor overrides" on public.mentor_calendar_overrides
  for delete to calendar_sql_internal using (true);
grant delete on public.mentor_calendar_settings,public.mentor_calendar_overrides to calendar_sql_internal;
create function private.calendar_forget_profile(p_profile_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.is_finalizing_member_deletion(p_profile_id) then
    raise exception 'Authorized personal deletion required' using errcode='42501'; end if;
  delete from public.mentor_calendar_overrides o using public.mentor_semesters t
    join public.semester_memberships m on m.id=t.semester_membership_id and m.semester_id=t.semester_id
    where o.semester_id=t.semester_id and o.mentor_semester_id=t.id and m.profile_id=p_profile_id;
  delete from public.mentor_calendar_manual_slots o using public.mentor_semesters t
    join public.semester_memberships m on m.id=t.semester_membership_id and m.semester_id=t.semester_id
    where o.semester_id=t.semester_id and o.mentor_semester_id=t.id and m.profile_id=p_profile_id;
  delete from public.mentor_calendar_settings s using public.mentor_semesters t
    join public.semester_memberships m on m.id=t.semester_membership_id and m.semester_id=t.semester_id
    where s.semester_id=t.semester_id and s.mentor_semester_id=t.id and m.profile_id=p_profile_id;
  delete from private.google_calendar_busy_snapshots s using public.mentor_semesters t
    join public.semester_memberships m on m.id=t.semester_membership_id and m.semester_id=t.semester_id
    where s.semester_id=t.semester_id and s.mentor_semester_id=t.id and m.profile_id=p_profile_id;
  delete from private.google_calendar_sync_jobs j where j.connection_id in
    (select c.id from public.google_calendar_connections c where c.profile_id=p_profile_id);
  delete from private.google_calendar_hold_jobs j where j.profile_id=p_profile_id;
  delete from private.google_calendar_oauth_transactions t where t.profile_id=p_profile_id;
  delete from private.google_calendar_credentials cred where cred.connection_id in
    (select c.id from public.google_calendar_connections c where c.profile_id=p_profile_id);
  delete from public.google_calendar_connections c where c.profile_id=p_profile_id;
end $$;
alter function private.calendar_forget_profile(uuid) owner to calendar_sql_internal;
revoke all on function private.calendar_forget_profile(uuid) from public,anon,authenticated,service_role;
grant execute on function private.calendar_forget_profile(uuid) to postgres;
create function private.calendar_forget_profile_on_anonymization()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  -- Auth deletion may already have cleared auth_user_id through its foreign key.
  -- Finalization still has to forget Calendar data when it anonymizes the profile.
  if new.auth_user_id is null
    and new.is_active=false and new.status='rejected'
    and (old.auth_user_id is not null or old.is_active or old.status<>'rejected')
    and private.is_finalizing_member_deletion(old.id) then
    perform private.calendar_forget_profile(old.id);
  end if;
  return new;
end $$;
revoke all on function private.calendar_forget_profile_on_anonymization() from public,anon,authenticated,service_role;
create trigger forget_google_calendar_on_personal_deletion
  before update of auth_user_id,is_active,status on public.profiles
  for each row execute function private.calendar_forget_profile_on_anonymization();

-- Participant commands share one fresh identity predicate and transaction lock.
create function private.calendar_owns_editable_mentor(p_semester_id uuid,p_mentor_semester_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.mentor_semesters t
    join public.semester_memberships m on m.id=t.semester_membership_id and m.semester_id=t.semester_id
    join public.profiles p on p.id=m.profile_id
    join public.semesters s on s.id=t.semester_id
    where t.id=p_mentor_semester_id and t.semester_id=p_semester_id
      and p.auth_user_id=(select auth.uid()) and p.is_active and p.status='approved'
      and s.is_active and m.role='mentor' and m.status in ('invited','onboarding','active'));
$$;
alter function private.calendar_owns_editable_mentor(uuid,uuid) owner to calendar_sql_internal;
revoke all on function private.calendar_owns_editable_mentor(uuid,uuid) from public,anon,service_role;
grant execute on function private.calendar_owns_editable_mentor(uuid,uuid) to authenticated;
create policy "onboarding mentor reads own working hours" on public.mentor_weekly_availability
  for select to authenticated using (private.calendar_owns_editable_mentor(semester_id,mentor_semester_id));

grant insert,delete on public.mentor_weekly_availability to calendar_sql_internal;
create policy "calendar owner command inserts weekly hours" on public.mentor_weekly_availability
  for insert to calendar_sql_internal with check (private.calendar_owns_editable_mentor(semester_id,mentor_semester_id));
create policy "calendar owner command deletes weekly hours" on public.mentor_weekly_availability
  for delete to calendar_sql_internal using (private.calendar_owns_editable_mentor(semester_id,mentor_semester_id));
grant insert on public.mentor_calendar_settings,public.mentor_calendar_overrides to calendar_sql_internal;
create policy "calendar owner command inserts settings" on public.mentor_calendar_settings
  for insert to calendar_sql_internal with check (private.calendar_owns_editable_mentor(semester_id,mentor_semester_id));
create policy "calendar owner command inserts overrides" on public.mentor_calendar_overrides
  for insert to calendar_sql_internal with check (private.calendar_owns_editable_mentor(semester_id,mentor_semester_id));

create function public.calendar_save_settings(p_semester_id uuid,p_mentor_semester_id uuid,
  p_time_zone text,p_working_hours jsonb,p_mode text,p_connection_id uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not private.calendar_owns_editable_mentor(p_semester_id,p_mentor_semester_id) then
    raise exception 'Current owning mentor required' using errcode='42501'; end if;
  if p_mode is null or p_mode not in ('weekly','synced') or p_time_zone is null
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone)
    or p_working_hours is null or jsonb_typeof(p_working_hours)<>'array' then
    raise exception 'Invalid Calendar settings' using errcode='22023'; end if;
  if p_mode='synced' then
    -- Serialize enabling sync with disconnect so a stale editor cannot relink
    -- a connection whose credentials are being cleaned up.
    perform 1 from public.google_calendar_connections c join public.profiles p on p.id=c.profile_id
      where c.id=p_connection_id and c.status='connected' and p.auth_user_id=(select auth.uid()) for update of c;
    if not found then raise exception 'Own connected Google Calendar required' using errcode='42501'; end if;
  end if;
  if jsonb_array_length(p_working_hours)>56 then
    raise exception 'Too many working hour ranges' using errcode='22023'; end if;
  if exists(select 1 from jsonb_to_recordset(p_working_hours) as h(weekday smallint,starts_at time,ends_at time)
    where h.weekday is null or h.weekday not between 0 and 6 or h.starts_at is null or h.ends_at is null
      or h.ends_at<=h.starts_at or extract(epoch from h.starts_at)::numeric % 900<>0
      or extract(epoch from h.ends_at)::numeric % 900<>0) then
    raise exception 'Working hours must use ordered fifteen-minute boundaries' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_working_hours) with ordinality a(value,n)
    join jsonb_array_elements(p_working_hours) with ordinality b(value,n) on a.n<b.n
    where (a.value->>'weekday')::smallint=(b.value->>'weekday')::smallint
      and (a.value->>'starts_at')::time<(b.value->>'ends_at')::time
      and (b.value->>'starts_at')::time<(a.value->>'ends_at')::time) then
    raise exception 'Working hour ranges must not overlap' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('calendar-settings:'||p_mentor_semester_id::text,0));
  delete from public.mentor_weekly_availability where semester_id=p_semester_id and mentor_semester_id=p_mentor_semester_id;
  insert into public.mentor_weekly_availability(semester_id,mentor_semester_id,weekday,starts_at,ends_at)
    select p_semester_id,p_mentor_semester_id,h.weekday,h.starts_at,h.ends_at
    from jsonb_to_recordset(p_working_hours) as h(weekday smallint,starts_at time,ends_at time);
  insert into public.mentor_calendar_settings(semester_id,mentor_semester_id,mode,time_zone,connection_id)
    values(p_semester_id,p_mentor_semester_id,p_mode,p_time_zone,case when p_mode='synced' then p_connection_id else null end)
    on conflict(semester_id,mentor_semester_id) do update set mode=excluded.mode,
      time_zone=excluded.time_zone,connection_id=excluded.connection_id;
  return true;
end $$;
alter function public.calendar_save_settings(uuid,uuid,text,jsonb,text,uuid) owner to calendar_sql_internal;
revoke all on function public.calendar_save_settings(uuid,uuid,text,jsonb,text,uuid) from public,anon,service_role;
grant execute on function public.calendar_save_settings(uuid,uuid,text,jsonb,text,uuid) to authenticated;

create function public.calendar_set_override(p_semester_id uuid,p_mentor_semester_id uuid,
  p_starts_at timestamptz,p_ends_at timestamptz,p_available boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_semester public.semesters%rowtype; v_zone text;
begin
  if not private.calendar_owns_editable_mentor(p_semester_id,p_mentor_semester_id) then
    raise exception 'Current owning mentor required' using errcode='42501'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at-p_starts_at<>interval '15 minutes'
    or extract(epoch from p_starts_at)::numeric % 900<>0 or p_starts_at<=now()
    or p_starts_at>now()+interval '90 days' then
    raise exception 'Choose a future fifteen-minute slot within ninety days' using errcode='22023'; end if;
  select * into v_semester from public.semesters where id=p_semester_id;
  v_zone:=coalesce(nullif(btrim(v_semester.configuration->>'timezone'),''),'America/New_York');
  if (p_starts_at at time zone v_zone)::date<v_semester.start_date
    or ((p_ends_at-interval '1 microsecond') at time zone v_zone)::date>v_semester.end_date then
    raise exception 'Choose a slot within this semester' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('calendar-settings:'||p_mentor_semester_id::text,0));
  delete from public.mentor_calendar_overrides where semester_id=p_semester_id and mentor_semester_id=p_mentor_semester_id
    and starts_at=p_starts_at and ends_at=p_ends_at;
  if p_available is not null then
    insert into public.mentor_calendar_overrides(semester_id,mentor_semester_id,starts_at,ends_at,available)
      values(p_semester_id,p_mentor_semester_id,p_starts_at,p_ends_at,p_available);
  end if;
  return true;
end $$;
alter function public.calendar_set_override(uuid,uuid,timestamptz,timestamptz,boolean) owner to calendar_sql_internal;
revoke all on function public.calendar_set_override(uuid,uuid,timestamptz,timestamptz,boolean) from public,anon,service_role;
revoke execute on function public.calendar_set_override(uuid,uuid,timestamptz,timestamptz,boolean) from authenticated;

create function public.calendar_import_snapshot(p_semester_id uuid,p_mentor_semester_id uuid,
  p_from timestamptz,p_until timestamptz)
returns integer language plpgsql security definer set search_path='' as $$
declare v_settings public.mentor_calendar_settings%rowtype;
  v_snapshot private.google_calendar_busy_snapshots%rowtype; v_count integer;
begin
  if not private.calendar_owns_editable_mentor(p_semester_id,p_mentor_semester_id) then
    raise exception 'Current owning mentor required' using errcode='42501'; end if;
  if p_from is null or p_until is null or p_until<=greatest(p_from,now())
    or p_until-p_from>interval '90 days' or p_from<now()-interval '15 minutes' then
    raise exception 'Choose a current import range of at most ninety days' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('calendar-settings:'||p_mentor_semester_id::text,0));
  select * into v_settings from public.mentor_calendar_settings
    where semester_id=p_semester_id and mentor_semester_id=p_mentor_semester_id for update;
  if v_settings.mode is distinct from 'synced' or v_settings.sync_unavailable then
    raise exception 'A successful Calendar sync is required before importing' using errcode='55000'; end if;
  select * into v_snapshot from private.google_calendar_busy_snapshots
    where semester_id=p_semester_id and mentor_semester_id=p_mentor_semester_id
      and connection_id=v_settings.connection_id and fetched_at between now()-interval '15 minutes' and now()
      and coverage_start<=p_from and coverage_end>=p_until for share;
  if v_snapshot.id is null then
    raise exception 'Refresh Calendar before importing this date range' using errcode='55000'; end if;
  delete from public.mentor_calendar_manual_slots where semester_id=p_semester_id and mentor_semester_id=p_mentor_semester_id;
  -- Projection still runs in synced mode, so Google busy and reservations apply.
  insert into public.mentor_calendar_manual_slots(semester_id,mentor_semester_id,starts_at,ends_at)
    select p_semester_id,p_mentor_semester_id,s.starts_at,s.ends_at
    from public.calendar_effective_slots(p_semester_id,p_mentor_semester_id,p_from,p_until) s;
  get diagnostics v_count=row_count;
  update public.mentor_calendar_settings set mode='manual' where semester_id=p_semester_id and mentor_semester_id=p_mentor_semester_id;
  delete from private.google_calendar_sync_jobs where semester_id=p_semester_id and mentor_semester_id=p_mentor_semester_id;
  -- Keep the authorized connection and credentials for accepted meeting holds.
  return v_count;
end $$;
alter function public.calendar_import_snapshot(uuid,uuid,timestamptz,timestamptz) owner to calendar_sql_internal;
revoke all on function public.calendar_import_snapshot(uuid,uuid,timestamptz,timestamptz) from public,anon,service_role;
revoke execute on function public.calendar_import_snapshot(uuid,uuid,timestamptz,timestamptz) from authenticated;
revoke create on schema public,private from calendar_sql_internal;
