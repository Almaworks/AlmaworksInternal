SET local check_function_bodies = off;

CREATE ROLE "calendar_sql_internal" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;

GRANT "calendar_sql_internal" TO "postgres";
GRANT "authenticated" TO "calendar_sql_internal";
GRANT USAGE, CREATE ON SCHEMA "public", "private" TO "calendar_sql_internal";

-- pg_net is managed separately by the worker scheduler, not this Calendar schema release.

CREATE TABLE "private"."calendar_worker_identities" (
  "auth_user_id" uuid                     NOT NULL,
  "enabled"      boolean                  NOT NULL DEFAULT false,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "calendar_worker_identities_pkey" PRIMARY KEY (auth_user_id)
);

ALTER TABLE "private"."calendar_worker_identities"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."google_calendar_busy_intervals" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "semester_id" uuid                     NOT NULL,
  "snapshot_id" uuid                     NOT NULL,
  "starts_at"   timestamp with time zone NOT NULL,
  "ends_at"     timestamp with time zone NOT NULL,
  CONSTRAINT "google_calendar_busy_intervals_check" CHECK ((ends_at > starts_at)),
  CONSTRAINT "google_calendar_busy_intervals_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."google_calendar_busy_intervals"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."google_calendar_busy_snapshots" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "semester_id"        uuid                     NOT NULL,
  "mentor_semester_id" uuid                     NOT NULL,
  "connection_id"      uuid                     NOT NULL,
  "coverage_start"     timestamp with time zone NOT NULL,
  "coverage_end"       timestamp with time zone NOT NULL,
  "fetched_at"         timestamp with time zone NOT NULL,
  CONSTRAINT "google_calendar_busy_snapshot_semester_id_mentor_semester_i_key" UNIQUE (semester_id, mentor_semester_id),
  CONSTRAINT "google_calendar_busy_snapshots_check" CHECK (((coverage_end > coverage_start) AND ((coverage_end - coverage_start) <= '90 days'::interval))),
  CONSTRAINT "google_calendar_busy_snapshots_pkey" PRIMARY KEY (id),
  CONSTRAINT "google_calendar_busy_snapshots_semester_id_id_key" UNIQUE (semester_id, id)
);

ALTER TABLE "private"."google_calendar_busy_snapshots"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."google_calendar_credentials" (
  "connection_id"            uuid                     NOT NULL,
  "generation"               bigint                   NOT NULL DEFAULT 1,
  "refresh_token_ciphertext" text                     NOT NULL,
  "access_token_ciphertext"  text,
  "access_expires_at"        timestamp with time zone,
  "disconnect_lease_token"   uuid,
  "disconnect_leased_until"  timestamp with time zone,
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "google_calendar_credentials_generation_check" CHECK ((generation > 0)),
  CONSTRAINT "google_calendar_credentials_pkey" PRIMARY KEY (connection_id),
  CONSTRAINT "google_calendar_credentials_refresh_token_ciphertext_check" CHECK ((length(refresh_token_ciphertext) > 20))
);

ALTER TABLE "private"."google_calendar_credentials"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."google_calendar_hold_jobs" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "semester_id"   uuid                     NOT NULL,
  "request_id"    uuid                     NOT NULL,
  "connection_id" uuid                     NOT NULL,
  "profile_id"    uuid                     NOT NULL,
  "desired_state" text                     NOT NULL,
  "applied_state" text                     NOT NULL DEFAULT 'unknown'::text,
  "generation"    bigint                   NOT NULL DEFAULT 1,
  "event_id"      text                     NOT NULL,
  "run_after"     timestamp with time zone NOT NULL DEFAULT now(),
  "lease_token"   uuid,
  "leased_until"  timestamp with time zone,
  "attempts"      integer                  NOT NULL DEFAULT 0,
  "last_error"    text,
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "google_calendar_hold_jobs_applied_state_check" CHECK ((applied_state = ANY (ARRAY['unknown'::text, 'present'::text, 'absent'::text]))),
  CONSTRAINT "google_calendar_hold_jobs_attempts_check" CHECK (((attempts >= 0) AND (attempts <= 50))),
  CONSTRAINT "google_calendar_hold_jobs_check" CHECK (((lease_token IS NULL) = (leased_until IS NULL))),
  CONSTRAINT "google_calendar_hold_jobs_desired_state_check" CHECK ((desired_state = ANY (ARRAY['present'::text, 'absent'::text]))),
  CONSTRAINT "google_calendar_hold_jobs_generation_check" CHECK ((generation > 0)),
  CONSTRAINT "google_calendar_hold_jobs_pkey" PRIMARY KEY (id),
  CONSTRAINT "google_calendar_hold_jobs_semester_id_request_id_connection_key" UNIQUE (semester_id, request_id, connection_id)
);

ALTER TABLE "private"."google_calendar_hold_jobs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."google_calendar_oauth_transactions" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "semester_id"         uuid                     NOT NULL,
  "profile_id"          uuid                     NOT NULL,
  "connection_id"       uuid                     NOT NULL,
  "state_hash"          text                     NOT NULL,
  "verifier_ciphertext" text                     NOT NULL,
  "expires_at"          timestamp with time zone NOT NULL,
  "consumed_at"         timestamp with time zone,
  "completed_at"        timestamp with time zone,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "calendar_oauth_lifecycle_check" CHECK (((completed_at IS NULL) OR (consumed_at IS NOT NULL))),
  CONSTRAINT "google_calendar_oauth_transactions_pkey" PRIMARY KEY (id),
  CONSTRAINT "google_calendar_oauth_transactions_state_hash_check" CHECK ((length(state_hash) >= 32)),
  CONSTRAINT "google_calendar_oauth_transactions_state_hash_key" UNIQUE (state_hash),
  CONSTRAINT "google_calendar_oauth_transactions_verifier_ciphertext_check" CHECK ((length(verifier_ciphertext) > 20))
);

ALTER TABLE "private"."google_calendar_oauth_transactions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."google_calendar_sync_jobs" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "semester_id"        uuid                     NOT NULL,
  "mentor_semester_id" uuid                     NOT NULL,
  "connection_id"      uuid                     NOT NULL,
  "run_after"          timestamp with time zone NOT NULL DEFAULT now(),
  "lease_token"        uuid,
  "leased_until"       timestamp with time zone,
  "attempts"           integer                  NOT NULL DEFAULT 0,
  "last_error"         text,
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "google_calendar_sync_jobs_attempts_check" CHECK (((attempts >= 0) AND (attempts <= 50))),
  CONSTRAINT "google_calendar_sync_jobs_check" CHECK (((lease_token IS NULL) = (leased_until IS NULL))),
  CONSTRAINT "google_calendar_sync_jobs_pkey" PRIMARY KEY (id),
  CONSTRAINT "google_calendar_sync_jobs_semester_id_mentor_semester_id_key" UNIQUE (semester_id, mentor_semester_id)
);

ALTER TABLE "private"."google_calendar_sync_jobs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."google_calendar_connections" (
  "id"                            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "profile_id"                    uuid                     NOT NULL,
  "provider_subject"              text                     NOT NULL,
  "account_email"                 text                     NOT NULL,
  "calendar_id"                   text                     NOT NULL DEFAULT 'primary'::text,
  "status"                        text                     NOT NULL DEFAULT 'connected'::text,
  "disconnect_cleanup_incomplete" boolean                  NOT NULL DEFAULT false,
  "connected_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                    timestamp with time zone NOT NULL DEFAULT now(),
  "disconnected_at"               timestamp with time zone,
  CONSTRAINT "google_calendar_connection_profile_key" UNIQUE (id, profile_id),
  CONSTRAINT "google_calendar_connection_status_time_check" CHECK (((status = 'disconnected'::text) = (disconnected_at IS NOT NULL))),
  CONSTRAINT "google_calendar_connections_pkey" PRIMARY KEY (id),
  CONSTRAINT "google_calendar_connections_profile_id_key" UNIQUE (profile_id),
  CONSTRAINT "google_calendar_connections_status_check" CHECK ((status = ANY (ARRAY['connected'::text, 'reconnect_required'::text, 'disconnecting'::text, 'disconnected'::text])))
);

ALTER TABLE "public"."google_calendar_connections"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."mentor_calendar_manual_slots" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "semester_id"        uuid                     NOT NULL,
  "mentor_semester_id" uuid                     NOT NULL,
  "starts_at"          timestamp with time zone NOT NULL,
  "ends_at"            timestamp with time zone NOT NULL,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mentor_calendar_manual_range_check"
    CHECK (((ends_at > starts_at) AND (((EXTRACT(epoch FROM starts_at))::bigint % (900)::bigint) = 0) AND (((EXTRACT(epoch FROM ends_at))::bigint % (900)::bigint) = 0))),
  CONSTRAINT "mentor_calendar_manual_slots_pkey" PRIMARY KEY (id),
  CONSTRAINT "mentor_calendar_manual_slots_semester_id_mentor_semester_id_key" UNIQUE (semester_id, mentor_semester_id, starts_at, ends_at)
);

ALTER TABLE "public"."mentor_calendar_manual_slots"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."mentor_calendar_overrides" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "semester_id"        uuid                     NOT NULL,
  "mentor_semester_id" uuid                     NOT NULL,
  "starts_at"          timestamp with time zone NOT NULL,
  "ends_at"            timestamp with time zone NOT NULL,
  "available"          boolean                  NOT NULL,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mentor_calendar_override_range_check"
    CHECK (((ends_at > starts_at) AND (((EXTRACT(epoch FROM starts_at))::bigint % (900)::bigint) = 0) AND (((EXTRACT(epoch FROM ends_at))::bigint % (900)::bigint) = 0))),
  CONSTRAINT "mentor_calendar_overrides_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."mentor_calendar_overrides"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."mentor_calendar_settings" (
  "semester_id"        uuid                     NOT NULL,
  "mentor_semester_id" uuid                     NOT NULL,
  "mode"               text                     NOT NULL,
  "time_zone"          text                     NOT NULL,
  "connection_id"      uuid,
  "sync_unavailable"   boolean                  NOT NULL DEFAULT false,
  "last_success_at"    timestamp with time zone,
  "last_error_at"      timestamp with time zone,
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mentor_calendar_settings_mode_check" CHECK ((mode = ANY (ARRAY['weekly'::text, 'manual'::text, 'synced'::text]))),
  CONSTRAINT "mentor_calendar_settings_pkey" PRIMARY KEY (semester_id, mentor_semester_id),
  CONSTRAINT "mentor_calendar_synced_connection_check" CHECK (((mode <> 'synced'::text) OR (connection_id IS NOT NULL)))
);

ALTER TABLE "public"."mentor_calendar_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.calendar_can_read_mentor (
  p_semester_id        uuid,
  p_mentor_semester_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

ALTER FUNCTION "private"."calendar_can_read_mentor"(uuid, uuid) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION private.calendar_can_run_hold (
  p_semester_id   uuid,
  p_request_id    uuid,
  p_connection_id uuid,
  p_profile_id    uuid,
  p_desired_state text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

ALTER FUNCTION "private"."calendar_can_run_hold"(uuid, uuid, uuid, uuid, text) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION private.calendar_can_run_sync (
  p_semester_id        uuid,
  p_mentor_semester_id uuid,
  p_connection_id      uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

ALTER FUNCTION "private"."calendar_can_run_sync"(uuid, uuid, uuid) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION private.calendar_enqueue_booking_holds()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "private"."calendar_enqueue_booking_holds"() OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION private.calendar_enqueue_existing_holds()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "private"."calendar_enqueue_existing_holds"() OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION private.calendar_forget_profile (
  p_profile_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "private"."calendar_forget_profile"(uuid) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION private.calendar_forget_profile_on_anonymization()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION private.calendar_hold_event_id (
  p_request_id    uuid,
  p_connection_id uuid
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  STRICT
  SET search_path TO ''
  AS $function$
  select 'a'||pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    '["almaworks-hold-v1","'||p_request_id::text||'","'||p_connection_id::text||'"]','UTF8')),'hex');
$function$;

CREATE OR REPLACE FUNCTION private.calendar_owns_editable_mentor (
  p_semester_id        uuid,
  p_mentor_semester_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists(select 1 from public.mentor_semesters t
    join public.semester_memberships m on m.id=t.semester_membership_id and m.semester_id=t.semester_id
    join public.profiles p on p.id=m.profile_id
    join public.semesters s on s.id=t.semester_id
    where t.id=p_mentor_semester_id and t.semester_id=p_semester_id
      and p.auth_user_id=(select auth.uid()) and p.is_active and p.status='approved'
      and s.is_active and m.role='mentor' and m.status in ('invited','onboarding','active'));
$function$;

ALTER FUNCTION "private"."calendar_owns_editable_mentor"(uuid, uuid) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION private.calendar_queue_sync_setting()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "private"."calendar_queue_sync_setting"() OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION private.calendar_validate_busy_interval()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if not exists (select 1 from private.google_calendar_busy_snapshots s
    where s.id=new.snapshot_id and s.semester_id=new.semester_id
      and s.coverage_start<=new.starts_at and s.coverage_end>=new.ends_at) then
    raise exception 'Google busy interval lies outside snapshot coverage' using errcode='22023';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.calendar_validate_mentor_settings()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION private.guard_mentor_booking_request()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
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
    if new.ends_at-new.starts_at <> interval '15 minutes' or new.starts_at<=now() then raise exception 'Booking requests must be a future 15-minute appointment' using errcode='22023'; end if;
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

CREATE OR REPLACE FUNCTION private.is_calendar_worker()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select (select auth.uid()) is not null and exists (
    select 1 from private.calendar_worker_identities w
    where w.auth_user_id=(select auth.uid()) and w.enabled
  )
$function$;

CREATE OR REPLACE FUNCTION private.member_deletion_impact (
  p_profile_id uuid
)
  RETURNS TABLE (
    counts   jsonb,
    blockers text[],
    version  text,
    impact   jsonb
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_profile public.profiles%rowtype;
  v_counts jsonb;
  v_blockers text[] := '{}'::text[];
  v_revision text;
  v_impact jsonb;
begin
  select * into v_profile from public.profiles where id=p_profile_id;
  if not found then raise exception 'Member profile not found' using errcode='P0002'; end if;
  select jsonb_build_object(
    'semesters', (select count(distinct semester_id) from public.semester_memberships where profile_id=p_profile_id),
    'memberships', (select count(*) from public.semester_memberships where profile_id=p_profile_id),
    'startupTeams', (select count(*) from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id where membership.profile_id=p_profile_id),
    'mentorMeetings', (select count(*) from public.sessions session join public.mentor_semesters term on term.id=session.mentor_semester_id join public.semester_memberships membership on membership.id=term.semester_membership_id where membership.profile_id=p_profile_id),
    'upcomingMentorMeetings', (
      (select count(*) from public.mentor_booking_requests request where request.mentor_profile_id=p_profile_id and request.starts_at>now() and request.status in ('pending','accepted'))
      + (select count(*) from public.sessions session join public.mentor_semesters term on term.id=session.mentor_semester_id
        join public.semester_memberships membership on membership.id=term.semester_membership_id
        join public.meetings meeting on meeting.id=session.meeting_id
        join public.semesters semester on semester.id=session.semester_id
        where membership.profile_id=p_profile_id
          and ((meeting.meeting_date + case session.slot when 2 then meeting.slot_2_starts_at else meeting.slot_1_starts_at end)
            at time zone coalesce(nullif(semester.configuration->>'timezone',''),'America/New_York'))>now()
          and session.status in ('requested','confirmed'))
    ),
    'startupBookings', (select count(*) from public.mentor_booking_requests request where request.requested_by_profile_id=p_profile_id),
    'profileFiles', (select count(*) from storage.objects object where object.bucket_id='profile-photos' and object.name like p_profile_id::text || '/%'),
    'historicalSessions', (select count(distinct session.id) from public.sessions session left join public.mentor_semesters term on term.id=session.mentor_semester_id left join public.semester_memberships mentor on mentor.id=term.semester_membership_id left join public.startup_team_memberships team on team.startup_semester_id=session.startup_semester_id left join public.semester_memberships startup on startup.id=team.semester_membership_id where mentor.profile_id=p_profile_id or startup.profile_id=p_profile_id)
  ) into v_counts;
  select jsonb_build_object(
    'semesters',coalesce((select jsonb_agg(semester.name order by semester.start_date,semester.id)
      from public.semesters semester where semester.id in (select membership.semester_id from public.semester_memberships membership where membership.profile_id=p_profile_id)),'[]'::jsonb),
    'sharedStartups',coalesce((select jsonb_agg(distinct organization.name)
      from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id
      join public.startup_semesters startup on startup.id=team.startup_semester_id
      join public.startup_organizations organization on organization.id=startup.startup_organization_id
      where membership.profile_id=p_profile_id),'[]'::jsonb),
    'upcomingMentorMeetings',coalesce((select jsonb_agg(impact_item.label order by impact_item.starts_at,impact_item.label)
      from (
        select request.starts_at, to_char(request.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') || ' — Independent booking' as label
        from public.mentor_booking_requests request
        where request.mentor_profile_id=p_profile_id and request.starts_at>now() and request.status in ('pending','accepted')
        union all
        select ((meeting.meeting_date + case session.slot when 2 then meeting.slot_2_starts_at else meeting.slot_1_starts_at end)
          at time zone coalesce(nullif(semester.configuration->>'timezone',''),'America/New_York')) as starts_at,
          to_char((meeting.meeting_date + case session.slot when 2 then meeting.slot_2_starts_at else meeting.slot_1_starts_at end)
            at time zone coalesce(nullif(semester.configuration->>'timezone',''),'America/New_York') at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS"Z"') || ' — Friday Program' as label
        from public.sessions session join public.mentor_semesters term on term.id=session.mentor_semester_id
        join public.semester_memberships membership on membership.id=term.semester_membership_id
        join public.meetings meeting on meeting.id=session.meeting_id
        join public.semesters semester on semester.id=session.semester_id
        where membership.profile_id=p_profile_id
          and ((meeting.meeting_date + case session.slot when 2 then meeting.slot_2_starts_at else meeting.slot_1_starts_at end)
            at time zone coalesce(nullif(semester.configuration->>'timezone',''),'America/New_York'))>now()
          and session.status in ('requested','confirmed')
      ) impact_item),'[]'::jsonb)
  ) into v_impact;

  if exists (select 1 from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id where membership.profile_id=p_profile_id and team.is_primary_contact
    and exists(select 1 from public.startup_team_memberships teammate where teammate.startup_semester_id=team.startup_semester_id and teammate.semester_membership_id<>team.semester_membership_id)) then
    v_blockers := array_append(v_blockers,'Transfer primary startup contact ownership before deletion.');
  end if;
  if (v_counts->>'memberships')::int=0 then
    v_blockers := array_append(v_blockers,'Only semester members can use this deletion workflow.');
  end if;
  if exists (select 1 from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id join public.startup_semesters startup on startup.id=team.startup_semester_id join public.startup_organizations organization on organization.id=startup.startup_organization_id where membership.profile_id=p_profile_id and (organization.durable_contact_data<>'{}'::jsonb or startup.goals<>'{}'::text[] or startup.mentorship_needs<>'{}'::text[] or nullif(btrim(startup.mentor_need_context),'') is not null)) then
    v_blockers := array_append(v_blockers,'Shared startup free text or contact data requires a privacy review.');
  end if;
  if exists (select 1 from public.sessions session join public.startup_team_memberships team on team.startup_semester_id=session.startup_semester_id join public.semester_memberships membership on membership.id=team.semester_membership_id where membership.profile_id=p_profile_id and (session.topic is not null or session.notes is not null or session.substitute_name is not null)) then
    v_blockers := array_append(v_blockers,'Shared startup session free text requires a privacy review.');
  end if;
  if exists (select 1 from public.outreach_contacts where email=lower(v_profile.email)) then
    v_blockers := array_append(v_blockers,'A matching outreach contact must be reviewed separately.');
  end if;
  if exists (select 1 from public.outreach_email_messages message where message.recipient_email=lower(v_profile.email)) then
    v_blockers := array_append(v_blockers,'An outreach email snapshot addressed to this member requires a privacy review.');
  end if;
  if exists (select 1 from public.outreach_opportunities opportunity
      where (opportunity.owner_profile_id=p_profile_id or opportunity.created_by=p_profile_id
        or opportunity.silenced_by=p_profile_id or opportunity.archived_by=p_profile_id)
        and (nullif(btrim(opportunity.semester_notes),'') is not null
          or nullif(btrim(opportunity.referred_by),'') is not null
          or nullif(btrim(opportunity.silence_reason),'') is not null
          or opportunity.source_context<>'{}'::jsonb))
    or exists (select 1 from public.outreach_companies company
      where company.created_by=p_profile_id and nullif(btrim(company.description),'') is not null)
    or exists (select 1 from public.outreach_contacts contact
      where contact.created_by=p_profile_id and (contact.notes is not null or contact.background_notes is not null or contact.biography is not null)) then
    v_blockers := array_append(v_blockers,'Target-linked outreach free text requires a privacy review.');
  end if;
  if exists (select 1 from public.outreach_imports where created_by=p_profile_id)
    or exists (select 1 from public.outreach_email_templates where created_by=p_profile_id)
    or exists (select 1 from public.outreach_email_messages where created_by=p_profile_id) then
    v_blockers := array_append(v_blockers,'Authored outreach payloads require a separate ownership and privacy review.');
  end if;
  if exists (select 1 from public.mentor_profiles where profile_id=p_profile_id and photo_url is not null) then
    v_blockers := array_append(v_blockers,'Legacy personal photo URL requires manual external cleanup.');
  end if;
  if exists (select 1 from storage.objects object where object.owner_id=v_profile.auth_user_id::text
    and (object.bucket_id<>'profile-photos' or object.name not like p_profile_id::text || '/%')) then
    v_blockers := array_append(v_blockers,'Other personally owned Storage objects require a separate cleanup policy.');
  end if;
  if exists (select 1 from public.invitations where email=lower(v_profile.email) and matched_profile_id is distinct from p_profile_id) then
    v_blockers := array_append(v_blockers,'An unlinked invitation with this email needs identity review.');
  end if;
  -- New direct profile references in later schemas are not silently ignored.
  if exists (
    select 1 from pg_catalog.pg_constraint foreign_key
    join pg_catalog.pg_class relation on relation.oid=foreign_key.conrelid
    where foreign_key.contype='f' and foreign_key.confrelid='public.profiles'::regclass
      and relation.relnamespace='public'::regnamespace
      and relation.relname <> all(array[
        'expertise_tags','friday_programs','invitations','mentor_booking_requests','mentor_booking_windows',
        'mentor_profiles','outreach_activities','outreach_companies','outreach_contacts','outreach_email_messages',
        'outreach_email_templates','outreach_imports','outreach_opportunities','participant_notification_reads',
        'platform_roles','program_audit_events','semester_memberships','member_deletion_operations',
        'google_calendar_connections'
      ])
  ) then
    v_blockers := array_append(v_blockers,'A new profile dependency needs a deletion policy.');
  end if;
  -- Calendar is optional during rollout. Its anonymization trigger removes local
  -- records, but provider holds must finish disconnect cleanup before credentials
  -- are forgotten. Do not block unrelated members merely because the table exists.
  if to_regclass('public.google_calendar_connections') is not null then
    if exists(select 1 from public.google_calendar_connections connection
      where connection.profile_id=p_profile_id and connection.status<>'disconnected') then
      v_blockers := array_append(v_blockers,'Disconnect Google Calendar and wait for hold cleanup before deleting this member.');
    end if;
    if exists(select 1 from private.google_calendar_oauth_transactions oauth_attempt
      where oauth_attempt.profile_id=p_profile_id and oauth_attempt.consumed_at is not null
        and oauth_attempt.completed_at is null and oauth_attempt.expires_at>now()) then
      v_blockers := array_append(v_blockers,'Wait for the Google Calendar connection attempt to finish before deleting this member.');
    end if;
  end if;
  select md5(concat_ws('|',to_jsonb(v_profile)::text,v_counts::text,v_impact::text,
    (select jsonb_agg(to_jsonb(membership) order by membership.id)::text
      from public.semester_memberships membership where membership.profile_id=p_profile_id),
    (select jsonb_agg(to_jsonb(request) order by request.id)::text
      from public.mentor_booking_requests request where request.mentor_profile_id=p_profile_id or request.requested_by_profile_id=p_profile_id),
    (select jsonb_agg(to_jsonb(booking_window) order by booking_window.id)::text
      from public.mentor_booking_windows booking_window where booking_window.mentor_profile_id=p_profile_id),
    (select jsonb_agg(to_jsonb(session) order by session.id)::text
      from public.sessions session join public.mentor_semesters term on term.id=session.mentor_semester_id
      join public.semester_memberships membership on membership.id=term.semester_membership_id where membership.profile_id=p_profile_id),
    (select jsonb_agg(to_jsonb(team) order by team.id)::text from public.startup_team_memberships team
      join public.semester_memberships membership on membership.id=team.semester_membership_id where membership.profile_id=p_profile_id),
    (select jsonb_agg(to_jsonb(invitation) order by invitation.id)::text from public.invitations invitation
      where invitation.matched_profile_id=p_profile_id or invitation.email=lower(v_profile.email)),
    (select jsonb_agg(to_jsonb(object) order by object.id)::text from storage.objects object
      where object.bucket_id='profile-photos' and object.name like p_profile_id::text || '/%')
  )) into v_revision;
  return query select v_counts,v_blockers,v_revision,v_impact;
end;
$function$;

CREATE OR REPLACE FUNCTION public.calendar_abort_oauth (
  p_transaction_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not private.is_calendar_worker() then raise exception 'Calendar worker required' using errcode='42501'; end if;
  perform 1 from public.profiles where id=(select t.profile_id
    from private.google_calendar_oauth_transactions t where t.id=p_transaction_id) for update;
  update private.google_calendar_oauth_transactions set expires_at=now()
    where id=p_transaction_id and consumed_at is not null and completed_at is null and expires_at>now();
  return found;
end $function$;

ALTER FUNCTION "public"."calendar_abort_oauth"(uuid) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_apply_sync_result (
  p_job_id                   uuid,
  p_lease_token              uuid,
  p_coverage_start           timestamp with time zone,
  p_coverage_end             timestamp with time zone,
  p_busy                     jsonb,
  p_refresh_token_ciphertext text                     DEFAULT NULL::text,
  p_access_token_ciphertext  text                     DEFAULT NULL::text,
  p_access_expires_at        timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_credential_generation    bigint                   DEFAULT NULL::bigint
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_apply_sync_result"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb, text, text, timestamp
  WITH time zone, bigint) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_begin_oauth (
  p_semester_id         uuid,
  p_profile_id          uuid,
  p_state_hash          text,
  p_verifier_ciphertext text,
  p_expires_at          timestamp with time zone
)
  RETURNS TABLE (
    transaction_id uuid,
    connection_id  uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_begin_oauth"(uuid, uuid, text, text, timestamp WITH time zone) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_complete_oauth (
  p_transaction_id           uuid,
  p_provider_subject         text,
  p_account_email            text,
  p_calendar_id              text,
  p_refresh_token_ciphertext text,
  p_access_token_ciphertext  text,
  p_access_expires_at        timestamp with time zone
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_complete_oauth"(uuid, text, text, text, text, text, timestamp WITH time zone) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_consume_oauth (
  p_state_hash  text,
  p_profile_id  uuid,
  p_semester_id uuid
)
  RETURNS TABLE (
    transaction_id      uuid,
    connection_id       uuid,
    verifier_ciphertext text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_consume_oauth"(text, uuid, uuid) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_disconnect (
  p_connection_id uuid,
  p_keep_manual   boolean DEFAULT false
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_disconnect"(uuid, boolean) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_effective_slots (
  p_semester_id        uuid,
  p_mentor_semester_id uuid,
  p_from               timestamp with time zone,
  p_until              timestamp with time zone
)
  RETURNS TABLE (
    starts_at timestamp with time zone,
    ends_at   timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.calendar_finish_disconnect_job (
  p_connection_id         uuid,
  p_lease_token           uuid,
  p_credential_generation bigint
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_finish_disconnect_job"(uuid, uuid, bigint) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_finish_hold_job (
  p_job_id                   uuid,
  p_lease_token              uuid,
  p_generation               bigint,
  p_success                  boolean,
  p_error                    text,
  p_refresh_token_ciphertext text                     DEFAULT NULL::text,
  p_access_token_ciphertext  text                     DEFAULT NULL::text,
  p_access_expires_at        timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_credential_generation    bigint                   DEFAULT NULL::bigint
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_finish_hold_job"(uuid, uuid, bigint, boolean, text, text, text, timestamp WITH time zone, bigint) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_finish_sync_job (
  p_job_id                   uuid,
  p_lease_token              uuid,
  p_success                  boolean,
  p_error                    text,
  p_credential_generation    bigint                   DEFAULT NULL::bigint,
  p_refresh_token_ciphertext text                     DEFAULT NULL::text,
  p_access_token_ciphertext  text                     DEFAULT NULL::text,
  p_access_expires_at        timestamp with time zone DEFAULT NULL::timestamp WITH time zone
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
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
  return true;
end $function$;

ALTER FUNCTION "public"."calendar_finish_sync_job"(uuid, uuid, boolean, text, bigint, text, text, timestamp WITH time zone) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_hold_status (
  p_semester_id uuid,
  p_request_id  uuid
)
  RETURNS TABLE (
    connection_id uuid,
    desired_state text,
    applied_state text,
    last_error    text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  return query select j.connection_id,j.desired_state,j.applied_state,j.last_error
    from private.google_calendar_hold_jobs j
    join public.profiles p on p.id=j.profile_id
    where j.semester_id=p_semester_id and j.request_id=p_request_id
      and p.auth_user_id=(select auth.uid());
end $function$;

ALTER FUNCTION "public"."calendar_hold_status"(uuid, uuid) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_hold_statuses (
  p_semester_id uuid,
  p_request_ids uuid[]
)
  RETURNS TABLE (
    request_id    uuid,
    desired_state text,
    applied_state text,
    last_error    text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_hold_statuses"(uuid, uuid[]) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_import_snapshot (
  p_semester_id        uuid,
  p_mentor_semester_id uuid,
  p_from               timestamp with time zone,
  p_until              timestamp with time zone
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_import_snapshot"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_lease_disconnect_jobs (
  p_limit integer DEFAULT 10
)
  RETURNS TABLE (
    connection_id         uuid,
    lease_token           uuid,
    credential_generation bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_lease_disconnect_jobs"(integer) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_lease_hold_jobs (
  p_limit integer DEFAULT 10
)
  RETURNS TABLE (
    job_id                   uuid,
    semester_id              uuid,
    request_id               uuid,
    connection_id            uuid,
    profile_id               uuid,
    desired_state            text,
    event_id                 text,
    generation               bigint,
    lease_token              uuid,
    refresh_token_ciphertext text,
    access_token_ciphertext  text,
    access_expires_at        timestamp with time zone,
    calendar_id              text,
    starts_at                timestamp with time zone,
    ends_at                  timestamp with time zone,
    credential_generation    bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_lease_hold_jobs"(integer) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_lease_sync_jobs (
  p_limit integer DEFAULT 10
)
  RETURNS TABLE (
    job_id                   uuid,
    semester_id              uuid,
    mentor_semester_id       uuid,
    connection_id            uuid,
    profile_id               uuid,
    lease_token              uuid,
    refresh_token_ciphertext text,
    access_token_ciphertext  text,
    access_expires_at        timestamp with time zone,
    calendar_id              text,
    semester_start_date      date,
    semester_end_date        date,
    program_time_zone        text,
    credential_generation    bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_lease_sync_jobs"(integer) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_request_sync (
  p_semester_id        uuid,
  p_mentor_semester_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_request_sync"(uuid, uuid) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_save_settings (
  p_semester_id        uuid,
  p_mentor_semester_id uuid,
  p_time_zone          text,
  p_working_hours      jsonb,
  p_mode               text,
  p_connection_id      uuid  DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_save_settings"(uuid, uuid, text, jsonb, text, uuid) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_set_override (
  p_semester_id        uuid,
  p_mentor_semester_id uuid,
  p_starts_at          timestamp with time zone,
  p_ends_at            timestamp with time zone,
  p_available          boolean
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "public"."calendar_set_override"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, boolean) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_slot_available (
  p_semester_id        uuid,
  p_mentor_semester_id uuid,
  p_starts_at          timestamp with time zone,
  p_ends_at            timestamp with time zone,
  p_exclude_request_id uuid                     DEFAULT NULL::uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_semester public.semesters%rowtype;
  v_settings public.mentor_calendar_settings%rowtype;
  v_local_start timestamp; v_local_end timestamp;
  v_program_start timestamp; v_program_end timestamp;
  v_program_zone text;
  v_working boolean; v_addition boolean;
begin
  if not private.calendar_can_read_mentor(p_semester_id,p_mentor_semester_id) then return false; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at-p_starts_at<>interval '15 minutes'
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

ALTER FUNCTION "public"."calendar_slot_available"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, uuid) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.replace_mentor_weekly_availability (
  p_semester_id  uuid,
  p_availability jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
$function$;

ALTER TABLE "private"."calendar_worker_identities"
  ADD CONSTRAINT "calendar_worker_identities_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "private"."google_calendar_busy_intervals"
  ADD CONSTRAINT "google_calendar_busy_intervals_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;

ALTER TABLE "private"."google_calendar_busy_snapshots"
  ADD CONSTRAINT "google_calendar_busy_snapshot_semester_id_mentor_semester__fkey" FOREIGN KEY (semester_id, mentor_semester_id) REFERENCES public.mentor_semesters(semester_id, id)
    ON DELETE CASCADE;

ALTER TABLE "private"."google_calendar_busy_snapshots"
  ADD CONSTRAINT "google_calendar_busy_snapshots_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;

ALTER TABLE "private"."google_calendar_busy_intervals"
  ADD CONSTRAINT "google_calendar_busy_intervals_semester_id_snapshot_id_fkey" FOREIGN KEY (semester_id, snapshot_id)
    REFERENCES private.google_calendar_busy_snapshots(semester_id, id) ON DELETE CASCADE;

ALTER TABLE "private"."google_calendar_hold_jobs"
  ADD CONSTRAINT "google_calendar_hold_jobs_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;

ALTER TABLE "private"."google_calendar_hold_jobs"
  ADD CONSTRAINT "google_calendar_hold_jobs_semester_id_request_id_fkey" FOREIGN KEY (semester_id, request_id) REFERENCES public.mentor_booking_requests(semester_id, id)
    ON DELETE CASCADE;

ALTER TABLE "private"."google_calendar_oauth_transactions"
  ADD CONSTRAINT "google_calendar_oauth_transactions_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "private"."google_calendar_oauth_transactions"
  ADD CONSTRAINT "google_calendar_oauth_transactions_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;

ALTER TABLE "private"."google_calendar_sync_jobs"
  ADD CONSTRAINT "google_calendar_sync_jobs_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;

ALTER TABLE "private"."google_calendar_sync_jobs"
  ADD CONSTRAINT "google_calendar_sync_jobs_semester_id_mentor_semester_id_fkey" FOREIGN KEY (semester_id, mentor_semester_id) REFERENCES public.mentor_semesters(semester_id, id)
    ON DELETE CASCADE;

ALTER TABLE "private"."google_calendar_hold_jobs"
  ADD CONSTRAINT "google_calendar_hold_jobs_connection_id_profile_id_fkey" FOREIGN KEY (connection_id, profile_id) REFERENCES public.google_calendar_connections(id, profile_id)
    ON DELETE CASCADE;

ALTER TABLE "private"."google_calendar_busy_snapshots"
  ADD CONSTRAINT "google_calendar_busy_snapshots_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES public.google_calendar_connections(id) ON DELETE CASCADE;

ALTER TABLE "private"."google_calendar_credentials"
  ADD CONSTRAINT "google_calendar_credentials_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES public.google_calendar_connections(id) ON DELETE CASCADE;

ALTER TABLE "private"."google_calendar_sync_jobs"
  ADD CONSTRAINT "google_calendar_sync_jobs_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES public.google_calendar_connections(id) ON DELETE CASCADE;

ALTER TABLE "public"."google_calendar_connections"
  ADD CONSTRAINT "google_calendar_connections_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE "public"."mentor_calendar_manual_slots"
  ADD CONSTRAINT "mentor_calendar_manual_slots_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;

ALTER TABLE "public"."mentor_calendar_manual_slots"
  ADD CONSTRAINT "mentor_calendar_manual_slots_semester_id_mentor_semester_i_fkey" FOREIGN KEY (semester_id, mentor_semester_id) REFERENCES public.mentor_semesters(semester_id, id)
    ON DELETE CASCADE;

ALTER TABLE "public"."mentor_calendar_overrides"
  ADD CONSTRAINT "mentor_calendar_overrides_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;

ALTER TABLE "public"."mentor_calendar_overrides"
  ADD CONSTRAINT "mentor_calendar_overrides_semester_id_mentor_semester_id_fkey" FOREIGN KEY (semester_id, mentor_semester_id) REFERENCES public.mentor_semesters(semester_id, id)
    ON DELETE CASCADE;

ALTER TABLE "public"."mentor_calendar_settings"
  ADD CONSTRAINT "mentor_calendar_settings_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES public.google_calendar_connections(id) ON DELETE SET NULL;

ALTER TABLE "public"."mentor_calendar_settings"
  ADD CONSTRAINT "mentor_calendar_settings_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;

ALTER TABLE "public"."mentor_calendar_settings"
  ADD CONSTRAINT "mentor_calendar_settings_semester_id_mentor_semester_id_fkey" FOREIGN KEY (semester_id, mentor_semester_id) REFERENCES public.mentor_semesters(semester_id, id)
    ON DELETE CASCADE;

CREATE INDEX google_calendar_busy_intervals_range_idx ON private.google_calendar_busy_intervals USING btree (snapshot_id, starts_at, ends_at);

CREATE INDEX google_calendar_due_hold_idx ON private.google_calendar_hold_jobs USING btree (run_after, leased_until);

CREATE INDEX google_calendar_due_sync_idx ON private.google_calendar_sync_jobs USING btree (run_after, leased_until);

CREATE INDEX google_calendar_oauth_profile_idx ON private.google_calendar_oauth_transactions USING btree (profile_id, semester_id, expires_at);

CREATE INDEX mentor_calendar_manual_range_idx ON public.mentor_calendar_manual_slots USING btree (semester_id, mentor_semester_id, starts_at, ends_at);

CREATE INDEX mentor_calendar_override_range_idx ON public.mentor_calendar_overrides USING btree (semester_id, mentor_semester_id, starts_at, ends_at);

CREATE TRIGGER validate_google_busy_interval
  BEFORE INSERT OR UPDATE ON private.google_calendar_busy_intervals
  FOR EACH ROW
  EXECUTE FUNCTION private.calendar_validate_busy_interval();

CREATE TRIGGER enqueue_existing_google_calendar_holds
  AFTER INSERT OR UPDATE OF status ON public.google_calendar_connections
  FOR EACH ROW
  EXECUTE FUNCTION private.calendar_enqueue_existing_holds();

CREATE TRIGGER enqueue_google_calendar_booking_holds
  AFTER INSERT OR UPDATE OF status, starts_at, ends_at ON public.mentor_booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.calendar_enqueue_booking_holds();

CREATE TRIGGER queue_mentor_calendar_sync
  AFTER INSERT OR UPDATE OF mode, connection_id ON public.mentor_calendar_settings
  FOR EACH ROW
  EXECUTE FUNCTION private.calendar_queue_sync_setting();

CREATE TRIGGER validate_mentor_calendar_settings
  BEFORE INSERT OR UPDATE ON public.mentor_calendar_settings
  FOR EACH ROW
  EXECUTE FUNCTION private.calendar_validate_mentor_settings();

CREATE TRIGGER forget_google_calendar_on_personal_deletion
  BEFORE UPDATE OF auth_user_id, is_active, status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.calendar_forget_profile_on_anonymization();

CREATE POLICY "calendar internal verifies worker registry" ON "private"."calendar_worker_identities"
  FOR SELECT
  TO "calendar_sql_internal"
  USING ((auth_user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "worker reads its registry entry" ON "private"."calendar_worker_identities"
  FOR SELECT
  TO "authenticated"
  USING ((auth_user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "calendar internal manages interval writes" ON "private"."google_calendar_busy_intervals"
  FOR INSERT
  TO "calendar_sql_internal"
  WITH CHECK (true);

CREATE POLICY "calendar internal reads and clears busy intervals" ON "private"."google_calendar_busy_intervals"
  FOR ALL
  TO "calendar_sql_internal"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "worker manages busy intervals" ON "private"."google_calendar_busy_intervals"
  FOR ALL
  TO "authenticated"
  USING (private.is_calendar_worker())
  WITH CHECK (private.is_calendar_worker());

CREATE POLICY "calendar internal manages snapshot writes" ON "private"."google_calendar_busy_snapshots"
  FOR INSERT
  TO "calendar_sql_internal"
  WITH CHECK (true);

CREATE POLICY "calendar internal reads and clears snapshots" ON "private"."google_calendar_busy_snapshots"
  FOR ALL
  TO "calendar_sql_internal"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "worker manages busy snapshots" ON "private"."google_calendar_busy_snapshots"
  FOR ALL
  TO "authenticated"
  USING (private.is_calendar_worker())
  WITH CHECK (private.is_calendar_worker());

CREATE POLICY "calendar internal manages credentials" ON "private"."google_calendar_credentials"
  FOR ALL
  TO "calendar_sql_internal"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "calendar internal removes credentials" ON "private"."google_calendar_credentials"
  FOR ALL
  TO "calendar_sql_internal"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "worker manages encrypted credentials" ON "private"."google_calendar_credentials"
  FOR ALL
  TO "authenticated"
  USING (private.is_calendar_worker())
  WITH CHECK (private.is_calendar_worker());

CREATE POLICY "calendar internal enqueues and clears holds" ON "private"."google_calendar_hold_jobs"
  FOR ALL
  TO "calendar_sql_internal"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "worker manages hold queue" ON "private"."google_calendar_hold_jobs"
  FOR ALL
  TO "authenticated"
  USING (private.is_calendar_worker())
  WITH CHECK (private.is_calendar_worker());

CREATE POLICY "calendar internal manages oauth state" ON "private"."google_calendar_oauth_transactions"
  FOR ALL
  TO "calendar_sql_internal"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "calendar internal removes oauth transactions" ON "private"."google_calendar_oauth_transactions"
  FOR ALL
  TO "calendar_sql_internal"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "worker manages oauth transactions" ON "private"."google_calendar_oauth_transactions"
  FOR ALL
  TO "authenticated"
  USING (private.is_calendar_worker())
  WITH CHECK (private.is_calendar_worker());

CREATE POLICY "calendar internal clears sync queue" ON "private"."google_calendar_sync_jobs"
  FOR DELETE
  TO "calendar_sql_internal"
  USING (true);

CREATE POLICY "calendar internal manages sync jobs" ON "private"."google_calendar_sync_jobs"
  FOR ALL
  TO "calendar_sql_internal"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "worker manages sync queue" ON "private"."google_calendar_sync_jobs"
  FOR ALL
  TO "authenticated"
  USING (private.is_calendar_worker())
  WITH CHECK (private.is_calendar_worker());

CREATE POLICY "calendar internal reads and changes connections" ON "public"."google_calendar_connections"
  FOR ALL
  TO "calendar_sql_internal"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "calendar worker manages connection status" ON "public"."google_calendar_connections"
  FOR ALL
  TO "authenticated"
  USING (private.is_calendar_worker())
  WITH CHECK (private.is_calendar_worker());

CREATE POLICY "connection owner sees own status" ON "public"."google_calendar_connections"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = google_calendar_connections.profile_id) AND (p.auth_user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "calendar internal reads occupancy" ON "public"."mentor_booking_accepted_occupancy"
  FOR SELECT
  TO "calendar_sql_internal"
  USING (true);

CREATE POLICY "calendar internal reads bookings" ON "public"."mentor_booking_requests"
  FOR SELECT
  TO "calendar_sql_internal"
  USING (true);

CREATE POLICY "calendar internal edits manual snapshot" ON "public"."mentor_calendar_manual_slots"
  FOR ALL
  TO "calendar_sql_internal"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "calendar internal reads manual slots" ON "public"."mentor_calendar_manual_slots"
  FOR SELECT
  TO "calendar_sql_internal"
  USING (true);

CREATE POLICY "mentor manages own manual slots" ON "public"."mentor_calendar_manual_slots"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM (public.mentor_semesters t
     JOIN public.semester_memberships m ON (((m.id = t.semester_membership_id) AND (m.semester_id = t.semester_id))))
  WHERE
    ((t.id = mentor_calendar_manual_slots.mentor_semester_id) AND (t.semester_id = mentor_calendar_manual_slots.semester_id) AND (m.profile_id = private.current_profile_id()) AND
    (m.role = 'mentor'::public.user_role) AND
    (m.status = ANY (ARRAY['active'::public.membership_lifecycle_status, 'invited'::public.membership_lifecycle_status, 'onboarding'::public.membership_lifecycle_status]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.mentor_semesters t
     JOIN public.semester_memberships m ON (((m.id = t.semester_membership_id) AND (m.semester_id = t.semester_id))))
  WHERE
    ((t.id = mentor_calendar_manual_slots.mentor_semester_id) AND (t.semester_id = mentor_calendar_manual_slots.semester_id) AND (m.profile_id = private.current_profile_id()) AND
    (m.role = 'mentor'::public.user_role) AND
    (m.status = ANY (ARRAY['active'::public.membership_lifecycle_status, 'invited'::public.membership_lifecycle_status, 'onboarding'::public.membership_lifecycle_status]))))));

CREATE POLICY "calendar internal deletes mentor overrides" ON "public"."mentor_calendar_overrides"
  FOR DELETE
  TO "calendar_sql_internal"
  USING (true);

CREATE POLICY "calendar internal reads overrides" ON "public"."mentor_calendar_overrides"
  FOR SELECT
  TO "calendar_sql_internal"
  USING (true);

CREATE POLICY "calendar owner command inserts overrides" ON "public"."mentor_calendar_overrides"
  FOR INSERT
  TO "calendar_sql_internal"
  WITH CHECK (private.calendar_owns_editable_mentor(semester_id, mentor_semester_id));

CREATE POLICY "mentor manages own dated overrides" ON "public"."mentor_calendar_overrides"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM (public.mentor_semesters t
     JOIN public.semester_memberships m ON (((m.id = t.semester_membership_id) AND (m.semester_id = t.semester_id))))
  WHERE
    ((t.id = mentor_calendar_overrides.mentor_semester_id) AND (t.semester_id = mentor_calendar_overrides.semester_id) AND (m.profile_id = private.current_profile_id()) AND (m.role
    = 'mentor'::public.user_role) AND
    (m.status = ANY (ARRAY['active'::public.membership_lifecycle_status, 'invited'::public.membership_lifecycle_status, 'onboarding'::public.membership_lifecycle_status]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.mentor_semesters t
     JOIN public.semester_memberships m ON (((m.id = t.semester_membership_id) AND (m.semester_id = t.semester_id))))
  WHERE
    ((t.id = mentor_calendar_overrides.mentor_semester_id) AND (t.semester_id = mentor_calendar_overrides.semester_id) AND (m.profile_id = private.current_profile_id()) AND (m.role
    = 'mentor'::public.user_role) AND
    (m.status = ANY (ARRAY['active'::public.membership_lifecycle_status, 'invited'::public.membership_lifecycle_status, 'onboarding'::public.membership_lifecycle_status]))))));

CREATE POLICY "calendar internal deletes mentor settings" ON "public"."mentor_calendar_settings"
  FOR DELETE
  TO "calendar_sql_internal"
  USING (true);

CREATE POLICY "calendar internal reads settings" ON "public"."mentor_calendar_settings"
  FOR SELECT
  TO "calendar_sql_internal"
  USING (true);

CREATE POLICY "calendar internal updates health" ON "public"."mentor_calendar_settings"
  FOR UPDATE
  TO "calendar_sql_internal"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "calendar owner command inserts settings" ON "public"."mentor_calendar_settings"
  FOR INSERT
  TO "calendar_sql_internal"
  WITH CHECK (private.calendar_owns_editable_mentor(semester_id, mentor_semester_id));

CREATE POLICY "mentor edits own calendar settings" ON "public"."mentor_calendar_settings"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM (public.mentor_semesters t
     JOIN public.semester_memberships m ON (((m.id = t.semester_membership_id) AND (m.semester_id = t.semester_id))))
  WHERE
    ((t.id = mentor_calendar_settings.mentor_semester_id) AND (t.semester_id = mentor_calendar_settings.semester_id) AND (m.profile_id = private.current_profile_id()) AND (m.role =
    'mentor'::public.user_role) AND
    (m.status = ANY (ARRAY['active'::public.membership_lifecycle_status, 'invited'::public.membership_lifecycle_status, 'onboarding'::public.membership_lifecycle_status]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.mentor_semesters t
     JOIN public.semester_memberships m ON (((m.id = t.semester_membership_id) AND (m.semester_id = t.semester_id))))
  WHERE
    ((t.id = mentor_calendar_settings.mentor_semester_id) AND (t.semester_id = mentor_calendar_settings.semester_id) AND (m.profile_id = private.current_profile_id()) AND (m.role =
    'mentor'::public.user_role) AND
    (m.status = ANY (ARRAY['active'::public.membership_lifecycle_status, 'invited'::public.membership_lifecycle_status, 'onboarding'::public.membership_lifecycle_status]))))));

CREATE POLICY "worker manages mentor calendar health" ON "public"."mentor_calendar_settings"
  FOR ALL
  TO "authenticated"
  USING (private.is_calendar_worker())
  WITH CHECK (private.is_calendar_worker());

CREATE POLICY "calendar internal reads mentor terms" ON "public"."mentor_semesters"
  FOR SELECT
  TO "calendar_sql_internal"
  USING (true);

CREATE POLICY "calendar internal reads weekly hours" ON "public"."mentor_weekly_availability"
  FOR SELECT
  TO "calendar_sql_internal"
  USING (true);

CREATE POLICY "calendar owner command deletes weekly hours" ON "public"."mentor_weekly_availability"
  FOR DELETE
  TO "calendar_sql_internal"
  USING (private.calendar_owns_editable_mentor(semester_id, mentor_semester_id));

CREATE POLICY "calendar owner command inserts weekly hours" ON "public"."mentor_weekly_availability"
  FOR INSERT
  TO "calendar_sql_internal"
  WITH CHECK (private.calendar_owns_editable_mentor(semester_id, mentor_semester_id));

CREATE POLICY "onboarding mentor reads own working hours" ON "public"."mentor_weekly_availability"
  FOR SELECT
  TO "authenticated"
  USING (private.calendar_owns_editable_mentor(semester_id, mentor_semester_id));

CREATE POLICY "calendar internal reads platform roles" ON "public"."platform_roles"
  FOR SELECT
  TO "calendar_sql_internal"
  USING (true);

CREATE POLICY "calendar internal reads profiles" ON "public"."profiles"
  FOR SELECT
  TO "calendar_sql_internal"
  USING (true);

CREATE POLICY "calendar internal reads memberships" ON "public"."semester_memberships"
  FOR SELECT
  TO "calendar_sql_internal"
  USING (true);

CREATE POLICY "calendar internal reads semesters" ON "public"."semesters"
  FOR SELECT
  TO "calendar_sql_internal"
  USING (true);

CREATE POLICY "calendar internal reads startup teams" ON "public"."startup_team_memberships"
  FOR SELECT
  TO "calendar_sql_internal"
  USING (true);



REVOKE ALL ON FUNCTION "private"."calendar_can_read_mentor"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."calendar_can_read_mentor"(uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."calendar_can_read_mentor"(uuid, uuid) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "private"."calendar_can_read_mentor"(uuid, uuid) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "private"."calendar_can_run_hold"(uuid, uuid, uuid, uuid, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."calendar_can_run_hold"(uuid, uuid, uuid, uuid, text) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "private"."calendar_can_run_hold"(uuid, uuid, uuid, uuid, text) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "private"."calendar_can_run_sync"(uuid, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."calendar_can_run_sync"(uuid, uuid, uuid) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "private"."calendar_can_run_sync"(uuid, uuid, uuid) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "private"."calendar_enqueue_booking_holds"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."calendar_enqueue_booking_holds"() FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "private"."calendar_enqueue_booking_holds"() TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "private"."calendar_enqueue_existing_holds"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."calendar_enqueue_existing_holds"() FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "private"."calendar_enqueue_existing_holds"() TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "private"."calendar_forget_profile"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."calendar_forget_profile"(uuid) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "private"."calendar_forget_profile"(uuid) TO "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "private"."calendar_forget_profile"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."calendar_forget_profile_on_anonymization"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."calendar_forget_profile_on_anonymization"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."calendar_hold_event_id"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."calendar_hold_event_id"(uuid, uuid) TO "calendar_sql_internal", "postgres";

REVOKE ALL ON FUNCTION "private"."calendar_owns_editable_mentor"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."calendar_owns_editable_mentor"(uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."calendar_owns_editable_mentor"(uuid, uuid) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "private"."calendar_owns_editable_mentor"(uuid, uuid) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "private"."calendar_queue_sync_setting"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."calendar_queue_sync_setting"() FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "private"."calendar_queue_sync_setting"() TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "private"."calendar_validate_busy_interval"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."calendar_validate_busy_interval"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."calendar_validate_mentor_settings"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."calendar_validate_mentor_settings"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."is_calendar_worker"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."is_calendar_worker"() TO "authenticated", "calendar_sql_internal", "postgres";

REVOKE ALL ON FUNCTION "private"."is_finalizing_member_deletion"(uuid) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "private"."is_finalizing_member_deletion"(uuid) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_abort_oauth"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_abort_oauth"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_abort_oauth"(uuid) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_abort_oauth"(uuid) TO "calendar_sql_internal";

REVOKE ALL
  ON FUNCTION "public"."calendar_apply_sync_result"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb, text, text, timestamp WITH time zone, bigint)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION "public"."calendar_apply_sync_result"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb, text, text, timestamp WITH time zone, bigint)
  TO "authenticated";

REVOKE ALL
  ON FUNCTION "public"."calendar_apply_sync_result"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb, text, text, timestamp WITH time zone, bigint)
  FROM "calendar_sql_internal";

GRANT EXECUTE
  ON FUNCTION "public"."calendar_apply_sync_result"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb, text, text, timestamp WITH time zone, bigint)
  TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_begin_oauth"(uuid, uuid, text, text, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_begin_oauth"(uuid, uuid, text, text, timestamp WITH time zone) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_begin_oauth"(uuid, uuid, text, text, timestamp WITH time zone) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_begin_oauth"(uuid, uuid, text, text, timestamp WITH time zone) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_complete_oauth"(uuid, text, text, text, text, text, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_complete_oauth"(uuid, text, text, text, text, text, timestamp WITH time zone) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_complete_oauth"(uuid, text, text, text, text, text, timestamp WITH time zone) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_complete_oauth"(uuid, text, text, text, text, text, timestamp WITH time zone) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_consume_oauth"(text, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_consume_oauth"(text, uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_consume_oauth"(text, uuid, uuid) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_consume_oauth"(text, uuid, uuid) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_disconnect"(uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_disconnect"(uuid, boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_disconnect"(uuid, boolean) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_disconnect"(uuid, boolean) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_effective_slots"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION "public"."calendar_effective_slots"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone)
  TO "authenticated", "calendar_sql_internal", "postgres";

REVOKE ALL ON FUNCTION "public"."calendar_finish_disconnect_job"(uuid, uuid, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_finish_disconnect_job"(uuid, uuid, bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_finish_disconnect_job"(uuid, uuid, bigint) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_finish_disconnect_job"(uuid, uuid, bigint) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_finish_hold_job"(uuid, uuid, bigint, boolean, text, text, text, timestamp WITH time zone, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_finish_hold_job"(uuid, uuid, bigint, boolean, text, text, text, timestamp WITH time zone, bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_finish_hold_job"(uuid, uuid, bigint, boolean, text, text, text, timestamp WITH time zone, bigint) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_finish_hold_job"(uuid, uuid, bigint, boolean, text, text, text, timestamp WITH time zone, bigint) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_finish_sync_job"(uuid, uuid, boolean, text, bigint, text, text, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_finish_sync_job"(uuid, uuid, boolean, text, bigint, text, text, timestamp WITH time zone) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_finish_sync_job"(uuid, uuid, boolean, text, bigint, text, text, timestamp WITH time zone) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_finish_sync_job"(uuid, uuid, boolean, text, bigint, text, text, timestamp WITH time zone) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_hold_status"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_hold_status"(uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_hold_status"(uuid, uuid) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_hold_status"(uuid, uuid) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_hold_statuses"(uuid, uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_hold_statuses"(uuid, uuid[]) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_hold_statuses"(uuid, uuid[]) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_hold_statuses"(uuid, uuid[]) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_import_snapshot"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_import_snapshot"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_import_snapshot"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_import_snapshot"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_lease_disconnect_jobs"(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_lease_disconnect_jobs"(integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_lease_disconnect_jobs"(integer) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_lease_disconnect_jobs"(integer) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_lease_hold_jobs"(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_lease_hold_jobs"(integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_lease_hold_jobs"(integer) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_lease_hold_jobs"(integer) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_lease_sync_jobs"(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_lease_sync_jobs"(integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_lease_sync_jobs"(integer) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_lease_sync_jobs"(integer) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_request_sync"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_request_sync"(uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_request_sync"(uuid, uuid) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_request_sync"(uuid, uuid) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_save_settings"(uuid, uuid, text, jsonb, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_save_settings"(uuid, uuid, text, jsonb, text, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_save_settings"(uuid, uuid, text, jsonb, text, uuid) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_save_settings"(uuid, uuid, text, jsonb, text, uuid) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_set_override"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_set_override"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_set_override"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, boolean) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_set_override"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, boolean) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_slot_available"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_slot_available"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_slot_available"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, uuid) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_slot_available"(uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, uuid) TO "calendar_sql_internal";

REVOKE ALL ON SCHEMA "private" FROM "calendar_sql_internal";

GRANT USAGE ON SCHEMA "private" TO "calendar_sql_internal";

REVOKE ALL ON SCHEMA "public" FROM "calendar_sql_internal";

GRANT USAGE ON SCHEMA "public" TO "calendar_sql_internal";

GRANT SELECT ON TABLE "private"."calendar_worker_identities" TO "authenticated", "calendar_sql_internal";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."calendar_worker_identities" TO "postgres";

GRANT DELETE, INSERT, SELECT ON TABLE "private"."google_calendar_busy_intervals" TO "calendar_sql_internal";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."google_calendar_busy_intervals" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "private"."google_calendar_busy_snapshots" TO "calendar_sql_internal";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."google_calendar_busy_snapshots" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "private"."google_calendar_credentials" TO "calendar_sql_internal";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."google_calendar_credentials" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "private"."google_calendar_hold_jobs" TO "calendar_sql_internal";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."google_calendar_hold_jobs" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "private"."google_calendar_oauth_transactions" TO "calendar_sql_internal";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."google_calendar_oauth_transactions" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "private"."google_calendar_sync_jobs" TO "calendar_sql_internal";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."google_calendar_sync_jobs" TO "postgres";

GRANT SELECT ON TABLE "public"."google_calendar_connections" TO "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."google_calendar_connections" TO "calendar_sql_internal";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."google_calendar_connections" TO "postgres";

REVOKE ALL ON TABLE "public"."mentor_booking_accepted_occupancy" FROM "calendar_sql_internal";

GRANT SELECT ON TABLE "public"."mentor_booking_accepted_occupancy" TO "calendar_sql_internal";

REVOKE ALL ON TABLE "public"."mentor_booking_requests" FROM "calendar_sql_internal";

GRANT SELECT ON TABLE "public"."mentor_booking_requests" TO "calendar_sql_internal";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."mentor_calendar_manual_slots" TO "authenticated";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."mentor_calendar_manual_slots" TO "calendar_sql_internal";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."mentor_calendar_manual_slots" TO "postgres";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."mentor_calendar_overrides" TO "authenticated";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."mentor_calendar_overrides" TO "calendar_sql_internal";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."mentor_calendar_overrides" TO "postgres";

GRANT INSERT ("connection_id"), UPDATE ("connection_id") ON TABLE "public"."mentor_calendar_settings" TO "authenticated";

GRANT INSERT ("mentor_semester_id") ON TABLE "public"."mentor_calendar_settings" TO "authenticated";

GRANT INSERT ("mode"), UPDATE ("mode") ON TABLE "public"."mentor_calendar_settings" TO "authenticated";

GRANT INSERT ("semester_id") ON TABLE "public"."mentor_calendar_settings" TO "authenticated";

GRANT INSERT ("time_zone"), UPDATE ("time_zone") ON TABLE "public"."mentor_calendar_settings" TO "authenticated";

GRANT SELECT ON TABLE "public"."mentor_calendar_settings" TO "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."mentor_calendar_settings" TO "calendar_sql_internal";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."mentor_calendar_settings" TO "postgres";

REVOKE ALL ON TABLE "public"."mentor_semesters" FROM "calendar_sql_internal";

GRANT SELECT ON TABLE "public"."mentor_semesters" TO "calendar_sql_internal";

REVOKE ALL ON TABLE "public"."mentor_weekly_availability" FROM "calendar_sql_internal";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."mentor_weekly_availability" TO "calendar_sql_internal";

REVOKE ALL ON TABLE "public"."platform_roles" FROM "calendar_sql_internal";

GRANT SELECT ON TABLE "public"."platform_roles" TO "calendar_sql_internal";

REVOKE ALL ON TABLE "public"."profiles" FROM "calendar_sql_internal";

GRANT SELECT ON TABLE "public"."profiles" TO "calendar_sql_internal";

REVOKE ALL ON TABLE "public"."semester_memberships" FROM "calendar_sql_internal";

GRANT SELECT ON TABLE "public"."semester_memberships" TO "calendar_sql_internal";

REVOKE ALL ON TABLE "public"."semesters" FROM "calendar_sql_internal";

GRANT SELECT ON TABLE "public"."semesters" TO "calendar_sql_internal";

REVOKE ALL ON TABLE "public"."startup_team_memberships" FROM "calendar_sql_internal";

GRANT SELECT ON TABLE "public"."startup_team_memberships" TO "calendar_sql_internal";


-- Generated booking freshness and first-connection follow-up.
-- Ownership transfers need temporary schema CREATE; remove it at transaction end.
GRANT CREATE ON SCHEMA public, private TO calendar_sql_internal;
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.calendar_initialize_connected_mentor()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

ALTER FUNCTION "private"."calendar_initialize_connected_mentor"() OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION private.guard_calendar_booking_freshness()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if tg_op='INSERT' or (new.status='accepted' and old.status='pending') then
    if public.calendar_booking_refresh_required(new.semester_id,new.mentor_semester_id) then
      raise exception 'Refresh Calendar before requesting or accepting this time' using errcode='55000';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.calendar_booking_refresh_required (
  p_semester_id        uuid,
  p_mentor_semester_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not private.calendar_can_read_mentor(p_semester_id,p_mentor_semester_id) then
    raise exception 'Current cohort access required' using errcode='42501'; end if;
  return exists(select 1 from public.mentor_calendar_settings settings
    where settings.semester_id=p_semester_id and settings.mentor_semester_id=p_mentor_semester_id
      and settings.mode='synced' and (settings.sync_unavailable or settings.last_success_at is null
        or settings.last_success_at>now() or settings.last_success_at<now()-interval '30 seconds'));
end $function$;

ALTER FUNCTION "public"."calendar_booking_refresh_required"(uuid, uuid) OWNER TO "calendar_sql_internal";

CREATE OR REPLACE FUNCTION public.calendar_lease_booking_sync (
  p_semester_id        uuid,
  p_mentor_semester_id uuid
)
  RETURNS TABLE (
    job_id                   uuid,
    lease_token              uuid,
    profile_id               uuid,
    connection_id            uuid,
    credential_generation    bigint,
    calendar_id              text,
    refresh_token_ciphertext text,
    access_token_ciphertext  text,
    access_expires_at        timestamp with time zone
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not private.is_calendar_worker() then raise exception 'Calendar worker required' using errcode='42501'; end if;
  return query with due as (
    select j.id from private.google_calendar_sync_jobs j
    join public.google_calendar_connections c on c.id=j.connection_id
    join private.google_calendar_credentials cred on cred.connection_id=c.id
    where j.semester_id=p_semester_id and j.mentor_semester_id=p_mentor_semester_id
      and (j.leased_until is null or j.leased_until<now())
      and (cred.disconnect_leased_until is null or cred.disconnect_leased_until<now())
      and private.calendar_can_run_sync(j.semester_id,j.mentor_semester_id,j.connection_id)
      and not exists(select 1 from private.google_calendar_sync_jobs other
        where other.connection_id=j.connection_id and other.id<>j.id and other.leased_until>now())
      and not exists(select 1 from private.google_calendar_hold_jobs hold
        where hold.connection_id=j.connection_id and hold.leased_until>now())
    limit 1 for update of j,c skip locked
  ), leased as (
    update private.google_calendar_sync_jobs j set lease_token=gen_random_uuid(),
      leased_until=now()+interval '2 minutes',attempts=1,updated_at=now()
      from due where j.id=due.id returning j.id,j.connection_id,j.lease_token
  ) select l.id,l.lease_token,c.profile_id,l.connection_id,cred.generation,c.calendar_id,
    cred.refresh_token_ciphertext,cred.access_token_ciphertext,cred.access_expires_at
    from leased l join public.google_calendar_connections c on c.id=l.connection_id
    join private.google_calendar_credentials cred on cred.connection_id=l.connection_id;
end $function$;

ALTER FUNCTION "public"."calendar_lease_booking_sync"(uuid, uuid) OWNER TO "calendar_sql_internal";

CREATE TRIGGER initialize_connected_mentor_calendar
  AFTER UPDATE OF completed_at ON private.google_calendar_oauth_transactions
  FOR EACH ROW
  EXECUTE FUNCTION private.calendar_initialize_connected_mentor();

CREATE TRIGGER z_calendar_booking_freshness
  BEFORE INSERT OR UPDATE OF status ON public.mentor_booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_calendar_booking_freshness();

REVOKE ALL ON FUNCTION "private"."calendar_initialize_connected_mentor"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."calendar_initialize_connected_mentor"() FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "private"."calendar_initialize_connected_mentor"() TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "private"."guard_calendar_booking_freshness"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."guard_calendar_booking_freshness"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."calendar_booking_refresh_required"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_booking_refresh_required"(uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_booking_refresh_required"(uuid, uuid) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_booking_refresh_required"(uuid, uuid) TO "calendar_sql_internal";

REVOKE ALL ON FUNCTION "public"."calendar_lease_booking_sync"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."calendar_lease_booking_sync"(uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."calendar_lease_booking_sync"(uuid, uuid) FROM "calendar_sql_internal";

GRANT EXECUTE ON FUNCTION "public"."calendar_lease_booking_sync"(uuid, uuid) TO "calendar_sql_internal";

REVOKE CREATE ON SCHEMA public, private FROM calendar_sql_internal;
