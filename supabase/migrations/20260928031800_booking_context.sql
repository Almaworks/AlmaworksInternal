set local check_function_bodies = off;

create table "public"."mentor_booking_decision_notes" (
  "id"                uuid                     not null default gen_random_uuid(),
  "semester_id"       uuid                     not null,
  "request_id"        uuid                     not null,
  "kind"              text                     not null,
  "note"              text                     not null,
  "alternative_text"  text,
  "author_profile_id" uuid                     not null,
  "created_at"        timestamp with time zone not null default now(),
  constraint "mentor_booking_decision_notes_alternative_text_check"
    check (((alternative_text IS NULL) OR ((length(btrim(alternative_text)) >= 1) AND (length(btrim(alternative_text)) <= 1000)))),
  constraint "mentor_booking_decision_notes_kind_check" check ((kind = ANY (ARRAY['declined'::text, 'cancelled'::text]))),
  constraint "mentor_booking_decision_notes_note_check" check (((length(btrim(note)) >= 1) AND (length(btrim(note)) <= 2000))),
  constraint "mentor_booking_decision_notes_pkey" primary key (id),
  constraint "mentor_booking_decision_notes_request_key" unique (semester_id, request_id)
);

alter table "public"."mentor_booking_decision_notes"
  enable row level security;

create table "public"."mentor_booking_meeting_details" (
  "id"                    uuid                     not null default gen_random_uuid(),
  "semester_id"           uuid                     not null,
  "request_id"            uuid                     not null,
  "location"              text,
  "video_url"             text,
  "updated_by_profile_id" uuid                     not null,
  "created_at"            timestamp with time zone not null default now(),
  "updated_at"            timestamp with time zone not null default now(),
  constraint "mentor_booking_meeting_details_location_check" check (((location IS NULL) OR ((length(btrim(location)) >= 1) AND (length(btrim(location)) <= 500)))),
  constraint "mentor_booking_meeting_details_pkey" primary key (id),
  constraint "mentor_booking_meeting_details_request_key" unique (semester_id, request_id),
  constraint "mentor_booking_meeting_details_video_url_check"
    check (((video_url IS NULL) OR (((length(video_url) >= 8) AND (length(video_url) <= 2000)) AND (video_url ~* '^https?://[^[:space:]/?#@]+([/?#]|$)'::text))))
);

alter table "public"."mentor_booking_meeting_details"
  enable row level security;

create table "public"."mentor_booking_outcomes" (
  "id"                  uuid                     not null default gen_random_uuid(),
  "semester_id"         uuid                     not null,
  "request_id"          uuid                     not null,
  "reporter_profile_id" uuid                     not null,
  "attendance"          text                     not null,
  "feedback"            text,
  "created_at"          timestamp with time zone not null default now(),
  "updated_at"          timestamp with time zone not null default now(),
  constraint "mentor_booking_outcomes_attendance_check" check ((attendance = ANY (ARRAY['attended'::text, 'missed'::text]))),
  constraint "mentor_booking_outcomes_feedback_check" check (((feedback IS NULL) OR ((length(btrim(feedback)) >= 1) AND (length(btrim(feedback)) <= 2000)))),
  constraint "mentor_booking_outcomes_pkey" primary key (id),
  constraint "mentor_booking_outcomes_reporter_key" unique (semester_id, request_id, reporter_profile_id)
);

alter table "public"."mentor_booking_outcomes"
  enable row level security;

create or replace function public.transition_mentor_booking_with_note (
  p_semester_id      uuid,
  p_request_id       uuid,
  p_transition       text,
  p_note             text,
  p_alternative_text text default null::text
)
  returns text
  language plpgsql
  set search_path to ''
  AS $function$
declare result text; existing_note public.mentor_booking_decision_notes%rowtype;
begin
  if p_transition not in ('declined','cancelled') or length(btrim(coalesce(p_note,''))) not between 1 and 2000
    or (p_alternative_text is not null and length(btrim(p_alternative_text)) not between 1 and 1000)
  then raise exception 'Invalid decision note' using errcode='22023'; end if;
  if p_transition='declined' then
    result:=public.respond_to_mentor_booking_request(p_semester_id,p_request_id,'declined');
  else
    result:=public.cancel_mentor_booking_request(p_semester_id,p_request_id);
  end if;
  insert into public.mentor_booking_decision_notes(semester_id,request_id,kind,note,alternative_text,author_profile_id)
    values(p_semester_id,p_request_id,p_transition,btrim(p_note),nullif(btrim(p_alternative_text),''),private.current_profile_id())
    on conflict (semester_id,request_id) do nothing;
  select * into existing_note from public.mentor_booking_decision_notes
    where semester_id=p_semester_id and request_id=p_request_id;
  if existing_note.note is distinct from btrim(p_note) or existing_note.kind is distinct from p_transition
    or existing_note.alternative_text is distinct from nullif(btrim(p_alternative_text),'')
  then raise exception 'A different decision note already exists' using errcode='55000'; end if;
  return result;
end;
$function$;

alter table "public"."mentor_booking_decision_notes"
  add constraint "mentor_booking_decision_notes_author_profile_id_fkey" foreign key (author_profile_id) references public.profiles(id) on delete restrict;

alter table "public"."mentor_booking_decision_notes"
  add constraint "mentor_booking_decision_notes_request_fkey" foreign key (semester_id, request_id) references public.mentor_booking_requests(semester_id, id) on delete restrict;

alter table "public"."mentor_booking_decision_notes"
  add constraint "mentor_booking_decision_notes_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete restrict;

alter table "public"."mentor_booking_meeting_details"
  add constraint "mentor_booking_meeting_details_request_fkey" foreign key (semester_id, request_id) references public.mentor_booking_requests(semester_id, id) on delete restrict;

alter table "public"."mentor_booking_meeting_details"
  add constraint "mentor_booking_meeting_details_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete restrict;

alter table "public"."mentor_booking_meeting_details"
  add constraint "mentor_booking_meeting_details_updated_by_profile_id_fkey" foreign key (updated_by_profile_id) references public.profiles(id) on delete restrict;

alter table "public"."mentor_booking_outcomes"
  add constraint "mentor_booking_outcomes_reporter_profile_id_fkey" foreign key (reporter_profile_id) references public.profiles(id) on delete restrict;

alter table "public"."mentor_booking_outcomes"
  add constraint "mentor_booking_outcomes_request_fkey" foreign key (semester_id, request_id) references public.mentor_booking_requests(semester_id, id) on delete restrict;

alter table "public"."mentor_booking_outcomes"
  add constraint "mentor_booking_outcomes_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete restrict;

create index mentor_booking_outcomes_request_idx on public.mentor_booking_outcomes using btree (semester_id, request_id);

create policy "booking actors write decision notes" on "public"."mentor_booking_decision_notes"
  for insert
  to "authenticated"
  with check (((author_profile_id = private.current_profile_id()) AND (EXISTS ( SELECT 1
   FROM public.mentor_booking_requests b
  WHERE
    ((b.semester_id = mentor_booking_decision_notes.semester_id) AND (b.id = mentor_booking_decision_notes.request_id) AND (b.status = mentor_booking_decision_notes.kind) AND
    ((b.mentor_profile_id = private.current_profile_id()) OR ((mentor_booking_decision_notes.kind = 'cancelled'::text) AND (EXISTS ( SELECT 1
           FROM (public.startup_team_memberships t
             JOIN public.semester_memberships m ON (((m.id = t.semester_membership_id) AND (m.semester_id = t.semester_id))))
          WHERE
            ((t.semester_id = b.semester_id) AND (t.startup_semester_id = b.startup_semester_id) AND (m.profile_id = private.current_profile_id()) AND (m.role =
            'startup'::public.user_role) AND (m.status = 'active'::public.membership_lifecycle_status)))))))))));

create policy "booking readers see decision notes" on "public"."mentor_booking_decision_notes"
  for select
  to "authenticated"
  using ((exists ( select 1
   from public.mentor_booking_requests b
  where ((b.semester_id = mentor_booking_decision_notes.semester_id) AND (b.id = mentor_booking_decision_notes.request_id)))));

create policy "booking parties and admins create meeting details" on "public"."mentor_booking_meeting_details"
  for insert
  to "authenticated"
  with check (((updated_by_profile_id = private.current_profile_id()) AND (EXISTS ( SELECT 1
   FROM public.mentor_booking_requests b
  WHERE
    ((b.semester_id = mentor_booking_meeting_details.semester_id) AND (b.id = mentor_booking_meeting_details.request_id) AND (b.status = 'accepted'::text) AND
    (private.can_manage_semester(b.semester_id, auth.uid()) OR (b.mentor_profile_id = private.current_profile_id()) OR (EXISTS ( SELECT 1
           FROM (public.startup_team_memberships t
             JOIN public.semester_memberships m ON (((m.id = t.semester_membership_id) AND (m.semester_id = t.semester_id))))
          WHERE
            ((t.semester_id = b.semester_id) AND (t.startup_semester_id = b.startup_semester_id) AND (m.profile_id = private.current_profile_id()) AND (m.role =
            'startup'::public.user_role) AND (m.status = 'active'::public.membership_lifecycle_status))))))))));

create policy "booking parties and admins edit meeting details" on "public"."mentor_booking_meeting_details"
  for update
  to "authenticated"
  using ((exists ( select 1
   from public.mentor_booking_requests b
  where
    ((b.semester_id = mentor_booking_meeting_details.semester_id) AND (b.id = mentor_booking_meeting_details.request_id) AND (b.status = 'accepted'::text) AND
    (private.can_manage_semester(b.semester_id, auth.uid()) or (b.mentor_profile_id = private.current_profile_id()) or (exists ( select 1
           from (public.startup_team_memberships t
             JOIN public.semester_memberships m on (((m.id = t.semester_membership_id) AND (m.semester_id = t.semester_id))))
          where
            ((t.semester_id = b.semester_id) AND (t.startup_semester_id = b.startup_semester_id) AND (m.profile_id = private.current_profile_id()) AND (m.role =
            'startup'::public.user_role) AND (m.status = 'active'::public.membership_lifecycle_status)))))))))
  with check ((updated_by_profile_id = private.current_profile_id()));

create policy "booking readers see meeting details" on "public"."mentor_booking_meeting_details"
  for select
  to "authenticated"
  using ((exists ( select 1
   from public.mentor_booking_requests b
  where ((b.semester_id = mentor_booking_meeting_details.semester_id) AND (b.id = mentor_booking_meeting_details.request_id)))));

create policy "booking readers see outcomes" on "public"."mentor_booking_outcomes"
  for select
  to "authenticated"
  using ((exists ( select 1
   from public.mentor_booking_requests b
  where ((b.semester_id = mentor_booking_outcomes.semester_id) AND (b.id = mentor_booking_outcomes.request_id)))));

create policy "own reports for accepted past bookings" on "public"."mentor_booking_outcomes"
  for insert
  to "authenticated"
  with check (((reporter_profile_id = private.current_profile_id()) AND (EXISTS ( SELECT 1
   FROM public.mentor_booking_requests b
  WHERE
    ((b.semester_id = mentor_booking_outcomes.semester_id) AND (b.id = mentor_booking_outcomes.request_id) AND (b.status = 'accepted'::text) AND (b.ends_at < now()) AND
    (private.can_manage_semester(b.semester_id, auth.uid()) OR (b.mentor_profile_id = private.current_profile_id()) OR (EXISTS ( SELECT 1
           FROM (public.startup_team_memberships t
             JOIN public.semester_memberships m ON (((m.id = t.semester_membership_id) AND (m.semester_id = t.semester_id))))
          WHERE
            ((t.semester_id = b.semester_id) AND (t.startup_semester_id = b.startup_semester_id) AND (m.profile_id = private.current_profile_id()) AND (m.role =
            'startup'::public.user_role) AND (m.status = 'active'::public.membership_lifecycle_status))))))))));

create policy "reporters edit their own outcomes" on "public"."mentor_booking_outcomes"
  for update
  to "authenticated"
  using (((reporter_profile_id = private.current_profile_id()) AND (exists ( select 1
   from public.mentor_booking_requests b
  where ((b.semester_id = mentor_booking_outcomes.semester_id) AND (b.id = mentor_booking_outcomes.request_id) AND (b.status = 'accepted'::text) AND (b.ends_at < now()))))))
  with check (((reporter_profile_id = private.current_profile_id()) AND (EXISTS ( SELECT 1
   FROM public.mentor_booking_requests b
  WHERE ((b.semester_id = mentor_booking_outcomes.semester_id) AND (b.id = mentor_booking_outcomes.request_id) AND (b.status = 'accepted'::text) AND (b.ends_at < now()))))));

revoke all on function "public"."transition_mentor_booking_with_note"(uuid, uuid, text, text, text) from public;

grant execute on function "public"."transition_mentor_booking_with_note"(uuid, uuid, text, text, text) to "authenticated", "postgres";

revoke all on schema "public" from "calendar_sql_internal";

grant usage on schema "public" to "calendar_sql_internal";

grant insert ("alternative_text") on table "public"."mentor_booking_decision_notes" to "authenticated";

grant insert ("author_profile_id") on table "public"."mentor_booking_decision_notes" to "authenticated";

grant insert ("kind") on table "public"."mentor_booking_decision_notes" to "authenticated";

grant insert ("note") on table "public"."mentor_booking_decision_notes" to "authenticated";

grant insert ("request_id") on table "public"."mentor_booking_decision_notes" to "authenticated";

grant insert ("semester_id") on table "public"."mentor_booking_decision_notes" to "authenticated";

grant select on table "public"."mentor_booking_decision_notes" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."mentor_booking_decision_notes" to "postgres";

grant insert ("location"), update ("location") on table "public"."mentor_booking_meeting_details" to "authenticated";

grant insert ("request_id") on table "public"."mentor_booking_meeting_details" to "authenticated";

grant insert ("semester_id") on table "public"."mentor_booking_meeting_details" to "authenticated";

grant update ("updated_at") on table "public"."mentor_booking_meeting_details" to "authenticated";

grant insert ("updated_by_profile_id"), update ("updated_by_profile_id") on table "public"."mentor_booking_meeting_details" to "authenticated";

grant insert ("video_url"), update ("video_url") on table "public"."mentor_booking_meeting_details" to "authenticated";

grant select on table "public"."mentor_booking_meeting_details" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."mentor_booking_meeting_details" to "postgres";

grant insert ("attendance"), update ("attendance") on table "public"."mentor_booking_outcomes" to "authenticated";

grant insert ("feedback"), update ("feedback") on table "public"."mentor_booking_outcomes" to "authenticated";

grant insert ("reporter_profile_id") on table "public"."mentor_booking_outcomes" to "authenticated";

grant insert ("request_id") on table "public"."mentor_booking_outcomes" to "authenticated";

grant insert ("semester_id") on table "public"."mentor_booking_outcomes" to "authenticated";

grant update ("updated_at") on table "public"."mentor_booking_outcomes" to "authenticated";

grant select on table "public"."mentor_booking_outcomes" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."mentor_booking_outcomes" to "postgres";
