set local check_function_bodies = off;

create table "public"."session_rsvps" (
  "id"                     uuid                     not null default gen_random_uuid(),
  "semester_id"            uuid                     not null,
  "session_id"             uuid                     not null,
  "semester_membership_id" uuid                     not null,
  "response"               text                     not null,
  "responded_at"           timestamp with time zone not null default now(),
  "created_at"             timestamp with time zone not null default now(),
  "updated_at"             timestamp with time zone not null default now(),
  constraint "session_rsvps_pkey" primary key (id),
  constraint "session_rsvps_response_check" check ((response = ANY (ARRAY['attending'::text, 'not_attending'::text]))),
  constraint "session_rsvps_session_membership_key" unique (session_id, semester_membership_id)
);

alter table "public"."session_rsvps"
  enable row level security;

create or replace function private.can_read_session_rsvp (
  target_session_id  uuid,
  target_semester_id uuid,
  candidate_id       uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$
  select candidate_id is not null
    and candidate_id is not distinct from auth.uid()
    and (
      private.can_manage_semester(target_semester_id, candidate_id)
      or exists (
        select 1
        from public.sessions session
        join public.mentor_semesters mentor_term
          on mentor_term.id = session.mentor_semester_id
         and mentor_term.semester_id = session.semester_id
        join public.semester_memberships membership
          on membership.id = mentor_term.semester_membership_id
         and membership.semester_id = mentor_term.semester_id
        where session.id = target_session_id
          and session.semester_id = target_semester_id
          and membership.profile_id = private.current_profile_id(candidate_id)
          and membership.role = 'mentor'
          and membership.status in ('onboarding', 'active')
      )
      or exists (
        select 1
        from public.sessions session
        join public.startup_team_memberships team
          on team.startup_semester_id = session.startup_semester_id
         and team.semester_id = session.semester_id
        join public.semester_memberships membership
          on membership.id = team.semester_membership_id
         and membership.semester_id = team.semester_id
        where session.id = target_session_id
          and session.semester_id = target_semester_id
          and membership.profile_id = private.current_profile_id(candidate_id)
          and membership.role = 'startup'
          and membership.status in ('onboarding', 'active')
      )
    )
$function$;

create or replace function private.can_write_session_rsvp (
  target_session_id    uuid,
  target_semester_id   uuid,
  target_membership_id uuid,
  candidate_id         uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$
  select candidate_id is not null
    and candidate_id is not distinct from auth.uid()
    and exists (
      select 1
      from public.sessions session
      join public.meetings meeting
        on meeting.id = session.meeting_id
       and meeting.semester_id = session.semester_id
      join public.semesters semester on semester.id = session.semester_id
      join public.semester_memberships membership
        on membership.id = target_membership_id
       and membership.semester_id = session.semester_id
      where session.id = target_session_id
        and session.semester_id = target_semester_id
        and session.status = 'confirmed'
        and membership.profile_id = private.current_profile_id(candidate_id)
        and membership.status in ('onboarding', 'active')
        and now() < (
          meeting.meeting_date
          + case session.slot when 2 then meeting.slot_2_starts_at else meeting.slot_1_starts_at end
        ) at time zone coalesce(nullif(semester.configuration ->> 'timezone', ''), 'America/New_York')
        and (
          (
            membership.role = 'mentor'
            and exists (
              select 1
              from public.mentor_semesters mentor_term
              where mentor_term.id = session.mentor_semester_id
                and mentor_term.semester_id = session.semester_id
                and mentor_term.semester_membership_id = membership.id
            )
          )
          or (
            membership.role = 'startup'
            and exists (
              select 1
              from public.startup_team_memberships team
              where team.startup_semester_id = session.startup_semester_id
                and team.semester_id = session.semester_id
                and team.semester_membership_id = membership.id
            )
          )
        )
    )
$function$;

create or replace function public.touch_session_rsvp_response()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin
  new.responded_at = now();
  new.updated_at = now();
  return new;
end;
$function$;

alter table "public"."session_rsvps"
  add constraint "session_rsvps_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."session_rsvps"
  add constraint "session_rsvps_semester_membership_fkey" foreign key (semester_id, semester_membership_id) references public.semester_memberships(semester_id, id)
    on delete cascade;

alter table "public"."sessions"
  add constraint "sessions_semester_id_id_key" unique (semester_id, id);

alter table "public"."session_rsvps"
  add constraint "session_rsvps_semester_session_fkey" foreign key (semester_id, session_id) references public.sessions(semester_id, id) on delete cascade;

create index session_rsvps_membership_idx on public.session_rsvps using btree (semester_membership_id, session_id);

create index session_rsvps_semester_session_idx on public.session_rsvps using btree (semester_id, session_id);

create trigger session_rsvps_response_updated_at
  before update of response on public.session_rsvps
  for each row
  execute function public.touch_session_rsvp_response();

create policy "participants insert own session rsvps" on "public"."session_rsvps"
  for insert
  to "authenticated"
  with check (private.can_write_session_rsvp(session_id, semester_id, semester_membership_id, ( SELECT auth.uid() AS uid)));

create policy "participants read assigned session rsvps" on "public"."session_rsvps"
  for select
  to "authenticated"
  using (private.can_read_session_rsvp(session_id, semester_id, ( select auth.uid() as uid)));

create policy "participants update own session rsvps" on "public"."session_rsvps"
  for update
  to "authenticated"
  using (private.can_write_session_rsvp(session_id, semester_id, semester_membership_id, ( select auth.uid() as uid)))
  with check (private.can_write_session_rsvp(session_id, semester_id, semester_membership_id, ( SELECT auth.uid() AS uid)));

revoke all on function "private"."can_read_session_rsvp"(uuid, uuid, uuid) from public;

grant execute on function "private"."can_read_session_rsvp"(uuid, uuid, uuid) to "authenticated", "postgres";

revoke all on function "private"."can_write_session_rsvp"(uuid, uuid, uuid, uuid) from public;

grant execute on function "private"."can_write_session_rsvp"(uuid, uuid, uuid, uuid) to "authenticated", "postgres";

revoke all on function "public"."touch_session_rsvp_response"() from public;

grant execute on function "public"."touch_session_rsvp_response"() to "postgres";

grant insert ("response"), update ("response") on table "public"."session_rsvps" to "authenticated";

grant insert ("semester_id") on table "public"."session_rsvps" to "authenticated";

grant insert ("semester_membership_id") on table "public"."session_rsvps" to "authenticated";

grant insert ("session_id") on table "public"."session_rsvps" to "authenticated";

grant select on table "public"."session_rsvps" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."session_rsvps" to "postgres";
