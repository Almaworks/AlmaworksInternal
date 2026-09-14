set local check_function_bodies = off;

drop trigger "sync_mentor_booking_request_claim" on "public"."mentor_booking_requests";

drop index "public"."mentor_booking_requests_live_window_idx";

alter table "public"."mentor_booking_requests"
  drop constraint "mentor_booking_requests_semester_window_fkey";

alter table "public"."mentor_booking_window_claims"
  drop constraint "mentor_booking_window_claims_request_id_fkey";

alter table "public"."mentor_booking_window_claims"
  drop constraint "mentor_booking_window_claims_semester_window_fkey";

drop table "public"."mentor_booking_window_claims";

create table "public"."mentor_weekly_availability" (
  "id"                 uuid                     not null default gen_random_uuid(),
  "semester_id"        uuid                     not null,
  "mentor_semester_id" uuid                     not null,
  "weekday"            smallint                 not null,
  "starts_at"          time without time zone   not null,
  "ends_at"            time without time zone   not null,
  "created_at"         timestamp with time zone not null default now(),
  "updated_at"         timestamp with time zone not null default now(),
  constraint "mentor_weekly_availability_interval_check" check ((ends_at > starts_at)),
  constraint "mentor_weekly_availability_pkey" primary key (id),
  constraint "mentor_weekly_availability_quarter_hour_check"
    check
    (((((EXTRACT(minute FROM starts_at))::integer % 15) = 0) AND ((EXTRACT(second FROM starts_at))::integer = 0) AND (((EXTRACT(minute FROM ends_at))::integer % 15) = 0) AND
    ((EXTRACT(second FROM ends_at))::integer = 0))),
  constraint "mentor_weekly_availability_unique_range" unique (mentor_semester_id, weekday, starts_at, ends_at),
  constraint "mentor_weekly_availability_weekday_check" check (((weekday >= 0) AND (weekday <= 6)))
);

alter table "public"."mentor_weekly_availability"
  enable row level security;

alter table "public"."mentor_booking_requests"
  alter column "window_id" drop not null;

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
    local_end := new.ends_at at time zone canonical_mentor.timezone;
    if local_start::date <> local_end::date or local_start::date < canonical_mentor.start_date or local_start::date > canonical_mentor.end_date then raise exception 'Booking must occur during one semester day' using errcode='22023'; end if;
    if extract(minute from local_start)::integer % 15 <> 0 or extract(second from local_start)::integer <> 0 then raise exception 'Booking start must align to 15 minutes' using errcode='22023'; end if;
    if extract(dow from local_start)=5 and local_start::time < time '17:00' and local_end::time > time '15:00' then raise exception 'Independent mentor bookings cannot overlap the Friday Program from 3:00 PM to 5:00 PM' using errcode='22023'; end if;
    if not exists(select 1 from public.mentor_weekly_availability availability where availability.semester_id=new.semester_id and availability.mentor_semester_id=canonical_mentor.mentor_semester_id and availability.weekday=extract(dow from local_start)::smallint and availability.starts_at<=local_start::time and availability.ends_at>=local_end::time) then raise exception 'Selected time is outside this mentor''s weekly availability' using errcode='22023'; end if;
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
    if row(old.id,old.semester_id,old.window_id,old.mentor_semester_id,old.mentor_profile_id,old.mentor_name,old.startup_semester_id,old.startup_organization_id,old.startup_name,old.requested_by_profile_id,old.topic,old.starts_at,old.ends_at,old.requested_at) is distinct from row(new.id,new.semester_id,new.window_id,new.mentor_semester_id,new.mentor_profile_id,new.mentor_name,new.startup_semester_id,new.startup_organization_id,new.startup_name,new.requested_by_profile_id,new.topic,new.starts_at,new.ends_at,new.requested_at) then raise exception 'Booking identity, topic, and interval are immutable' using errcode='42501'; end if;
    if new.status=old.status then if row(new.responded_at,new.cancelled_at) is distinct from row(old.responded_at,old.cancelled_at) then raise exception 'Booking timestamps are protected' using errcode='42501'; end if; return old; end if;
    if old.status='pending' and new.status in ('accepted','declined') then if actor_profile is distinct from old.mentor_profile_id then raise exception 'Only the owning mentor can respond' using errcode='42501'; end if; new.responded_at:=now(); new.cancelled_at:=null;
    elsif old.status in ('pending','accepted') and new.status='cancelled' then if actor_profile is distinct from old.mentor_profile_id and not exists(select 1 from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id where team.semester_id=old.semester_id and team.startup_semester_id=old.startup_semester_id and membership.profile_id=actor_profile and membership.status='active' and membership.role='startup') then raise exception 'Only either booking party can cancel' using errcode='42501'; end if; new.cancelled_at:=now(); new.responded_at:=old.responded_at;
    else raise exception 'Invalid booking status transition' using errcode='55000'; end if;
    new.updated_at:=now(); return new;
  end if;
  raise exception 'Booking history cannot be deleted' using errcode='42501';
end;
$function$;

create or replace function public.replace_mentor_weekly_availability (
  p_semester_id  uuid,
  p_availability jsonb
)
  returns void
  language plpgsql
  set search_path to ''
  AS $function$
declare own_mentor uuid;
begin
  select term.id into own_mentor from public.mentor_semesters term join public.semester_memberships membership on membership.id=term.semester_membership_id and membership.semester_id=term.semester_id join public.semesters semester on semester.id=term.semester_id where term.semester_id=p_semester_id and membership.profile_id=private.current_profile_id() and membership.role='mentor' and membership.status='active' and semester.is_active;
  if own_mentor is null then raise exception 'Active owning mentor required' using errcode='42501'; end if;
  if jsonb_typeof(p_availability) <> 'array' then raise exception 'Availability must be an array' using errcode='22023'; end if;
  delete from public.mentor_weekly_availability where semester_id=p_semester_id and mentor_semester_id=own_mentor;
  insert into public.mentor_weekly_availability(semester_id,mentor_semester_id,weekday,starts_at,ends_at)
  select p_semester_id,own_mentor,entry.weekday,entry.starts_at,entry.ends_at from jsonb_to_recordset(p_availability) as entry(weekday smallint, starts_at time, ends_at time);
end;
$function$;

create or replace function public.request_mentor_booking (
  p_semester_id        uuid,
  p_mentor_semester_id uuid,
  p_starts_at          timestamp with time zone,
  p_ends_at            timestamp with time zone,
  p_topic              text
)
  returns uuid
  language plpgsql
  set search_path to ''
  AS $function$
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
$function$;

alter table "public"."mentor_weekly_availability"
  add constraint "mentor_weekly_availability_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete restrict;

alter table "public"."mentor_weekly_availability"
  add constraint "mentor_weekly_availability_semester_mentor_fkey" foreign key (semester_id, mentor_semester_id) references public.mentor_semesters(semester_id, id)
    on delete restrict;

create unique index mentor_booking_requests_live_selected_time_idx on public.mentor_booking_requests using btree (mentor_semester_id, startup_semester_id, starts_at, ends_at)
  where (status = ANY (ARRAY['pending'::text, 'accepted'::text]));

create index mentor_weekly_availability_semester_mentor_idx on public.mentor_weekly_availability using btree (semester_id, mentor_semester_id, weekday, starts_at);

create policy "active participants and admins read mentor weekly availability" on "public"."mentor_weekly_availability"
  for select
  to "authenticated"
  using ((private.can_manage_semester(semester_id, auth.uid()) or (exists ( select 1
   from public.semester_memberships membership
  where
    ((membership.semester_id = mentor_weekly_availability.semester_id) AND (membership.profile_id = private.current_profile_id()) AND (membership.role = ANY
    (ARRAY['mentor'::public.user_role, 'startup'::public.user_role])) AND (membership.status = 'active'::public.membership_lifecycle_status))))));

create policy "owning mentors manage weekly availability" on "public"."mentor_weekly_availability"
  for all
  to "authenticated"
  using ((mentor_semester_id in ( select term.id
   from (public.mentor_semesters term
     JOIN public.semester_memberships membership on ((membership.id = term.semester_membership_id)))
  where
    ((term.semester_id = mentor_weekly_availability.semester_id) AND (membership.profile_id = private.current_profile_id()) AND (membership.role = 'mentor'::public.user_role) AND
    (membership.status = 'active'::public.membership_lifecycle_status)))))
  with check ((mentor_semester_id IN ( SELECT term.id
   FROM (public.mentor_semesters term
     JOIN public.semester_memberships membership ON ((membership.id = term.semester_membership_id)))
  WHERE
    ((term.semester_id = mentor_weekly_availability.semester_id) AND (membership.profile_id = private.current_profile_id()) AND (membership.role = 'mentor'::public.user_role) AND
    (membership.status = 'active'::public.membership_lifecycle_status)))));

revoke all on function "public"."replace_mentor_weekly_availability"(uuid, jsonb) from public;

grant execute on function "public"."replace_mentor_weekly_availability"(uuid, jsonb) to "authenticated", "postgres";

revoke all on function "public"."request_mentor_booking"(uuid, uuid, timestamp with time zone, timestamp with time zone, text) from public;

grant execute on function "public"."request_mentor_booking"(uuid, uuid, timestamp with time zone, timestamp with time zone, text) to "authenticated", "postgres";

grant delete, insert, select on table "public"."mentor_weekly_availability" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."mentor_weekly_availability" to "postgres";
