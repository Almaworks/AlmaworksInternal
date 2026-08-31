set local check_function_bodies = off;

drop policy "mentors can view own sessions" on "public"."sessions";

drop policy "startups can insert session requests" on "public"."sessions";

drop policy "startups can view own sessions" on "public"."sessions";

drop trigger "validate_outreach_owner_membership" on "public"."outreach_opportunities";

drop index "public"."outreach_activities_import_job_idx";

drop index "public"."outreach_opportunities_converted_mentor_idx";

drop index "public"."outreach_opportunities_converted_startup_idx";

drop index "public"."outreach_opportunities_import_job_idx";

drop index "public"."outreach_opportunities_one_open_contact_key";

drop index "public"."outreach_opportunities_owner_queue_idx";

drop index "public"."outreach_opportunities_queue_cursor_idx";

drop index "public"."sessions_mentor_idx";

drop index "public"."sessions_startup_idx";

drop index "public"."sessions_status_idx";

alter table "public"."access_requests"
  drop constraint "access_requests_requester_profile_id_fkey";

alter table "public"."access_requests"
  drop constraint "access_requests_reviewed_by_fkey";

alter table "public"."access_requests"
  drop constraint "access_requests_semester_id_fkey";

alter table "public"."availability"
  drop constraint "availability_session_date_id_fkey";

alter table "public"."availability"
  drop constraint "availability_user_id_fkey";

alter table "public"."availability_windows"
  drop constraint "availability_windows_profile_id_fkey";

alter table "public"."availability_windows"
  drop constraint "availability_windows_semester_id_fkey";

alter table "public"."availability_windows"
  drop constraint "availability_windows_startup_semester_id_fkey";

alter table "public"."invitation_delivery_attempts"
  drop constraint "invitation_delivery_attempts_invitation_id_fkey";

alter table "public"."invitation_delivery_attempts"
  drop constraint "invitation_delivery_attempts_semester_id_fkey";

alter table "public"."lifecycle_audit_events"
  drop constraint "lifecycle_audit_events_actor_profile_id_fkey";

alter table "public"."lifecycle_audit_events"
  drop constraint "lifecycle_audit_events_semester_id_fkey";

alter table "public"."lifecycle_configuration_templates"
  drop constraint "lifecycle_configuration_templates_created_by_fkey";

alter table "public"."mentor_assignment_audit"
  drop constraint "mentor_assignment_audit_actor_profile_id_fkey";

alter table "public"."mentor_assignment_audit"
  drop constraint "mentor_assignment_audit_mentor_profile_id_fkey";

alter table "public"."mentor_assignment_audit"
  drop constraint "mentor_assignment_audit_request_id_fkey";

alter table "public"."mentor_assignment_audit"
  drop constraint "mentor_assignment_audit_semester_id_fkey";

alter table "public"."mentor_assignment_audit"
  drop constraint "mentor_assignment_audit_session_date_id_fkey";

alter table "public"."mentor_assignment_audit"
  drop constraint "mentor_assignment_audit_session_id_fkey";

alter table "public"."mentor_assignment_audit"
  drop constraint "mentor_assignment_audit_startup_semester_id_fkey";

alter table "public"."mentor_assignment_requests"
  drop constraint "mentor_assignment_requests_actor_profile_id_fkey";

alter table "public"."mentor_assignment_requests"
  drop constraint "mentor_assignment_requests_mentor_profile_id_fkey";

alter table "public"."mentor_assignment_requests"
  drop constraint "mentor_assignment_requests_semester_id_fkey";

alter table "public"."mentor_assignment_requests"
  drop constraint "mentor_assignment_requests_session_date_id_fkey";

alter table "public"."mentor_assignment_requests"
  drop constraint "mentor_assignment_requests_session_id_fkey";

alter table "public"."mentor_assignment_requests"
  drop constraint "mentor_assignment_requests_startup_semester_id_fkey";

alter table "public"."mentors"
  drop constraint "mentors_semester_id_fkey";

alter table "public"."mentors"
  drop constraint "mentors_user_id_fkey";

alter table "public"."onboarding_progress"
  drop constraint "onboarding_progress_semester_id_fkey";

alter table "public"."onboarding_progress"
  drop constraint "onboarding_progress_semester_membership_id_fkey";

alter table "public"."outreach"
  drop constraint "outreach_converted_mentor_id_fkey";

alter table "public"."outreach"
  drop constraint "outreach_semester_id_fkey";

alter table "public"."outreach_activities"
  drop constraint "outreach_activities_semester_id_import_job_id_fkey";

alter table "public"."outreach_import_jobs"
  drop constraint "outreach_import_jobs_committed_by_fkey";

alter table "public"."outreach_import_jobs"
  drop constraint "outreach_import_jobs_created_by_fkey";

alter table "public"."outreach_import_jobs"
  drop constraint "outreach_import_jobs_semester_id_fkey";

alter table "public"."outreach_import_rows"
  drop constraint "outreach_import_rows_matched_company_id_fkey";

alter table "public"."outreach_import_rows"
  drop constraint "outreach_import_rows_matched_contact_id_fkey";

alter table "public"."outreach_import_rows"
  drop constraint "outreach_import_rows_semester_id_committed_opportunity_id_fkey";

alter table "public"."outreach_import_rows"
  drop constraint "outreach_import_rows_semester_id_fkey";

alter table "public"."outreach_import_rows"
  drop constraint "outreach_import_rows_semester_id_import_job_id_fkey";

alter table "public"."outreach_opportunities"
  drop constraint "outreach_opportunities_converted_mentor_profile_id_fkey";

alter table "public"."outreach_opportunities"
  drop constraint "outreach_opportunities_converted_startup_semester_id_fkey";

alter table "public"."outreach_opportunities"
  drop constraint "outreach_opportunities_semester_id_source_import_job_id_fkey";

alter table "public"."outreach_opportunity_labels"
  drop constraint "outreach_opportunity_labels_added_by_fkey";

alter table "public"."outreach_opportunity_labels"
  drop constraint "outreach_opportunity_labels_relationship_label_id_fkey";

alter table "public"."outreach_opportunity_labels"
  drop constraint "outreach_opportunity_labels_semester_id_fkey";

alter table "public"."outreach_opportunity_labels"
  drop constraint "outreach_opportunity_labels_semester_id_opportunity_id_fkey";

alter table "public"."outreach_relationship_labels"
  drop constraint "outreach_relationship_labels_created_by_fkey";

alter table "public"."semester_memberships"
  drop constraint "semester_memberships_semester_id_profile_id_role_key";

alter table "public"."session_dates"
  drop constraint "session_dates_semester_id_fkey";

alter table "public"."sessions"
  drop constraint "sessions_mentor_id_fkey";

alter table "public"."sessions"
  drop constraint "sessions_session_date_id_fkey";

alter table "public"."sessions"
  drop constraint "sessions_startup_id_fkey";

alter table "public"."startups"
  drop constraint "startups_semester_id_fkey";

alter table "public"."startups"
  drop constraint "startups_user_id_fkey";

drop function "public"."run_database_revamp_backfill"();

alter table "public"."outreach_activities"
  drop column "import_job_id";

alter table "public"."outreach_opportunities"
  drop column "canonical_stage";

alter table "public"."outreach_opportunities"
  drop column "conversion_details";

alter table "public"."outreach_opportunities"
  drop column "converted_mentor_profile_id";

alter table "public"."outreach_opportunities"
  drop column "converted_startup_semester_id";

alter table "public"."outreach_opportunities"
  drop column "notes";

alter table "public"."outreach_opportunities"
  drop column "source_import_job_id";

alter table "public"."sessions"
  drop column "canonical_status";

alter table "public"."sessions"
  drop column "is_confirmed";

alter table "public"."sessions"
  drop column "mentor_id";

alter table "public"."sessions"
  drop column "session_date_id";

alter table "public"."sessions"
  drop column "startup_id";

alter table "public"."sessions"
  drop column "time_slot";

drop table "public"."access_requests";

drop table "public"."availability_windows";

drop table "public"."availability";

drop table "public"."invitation_delivery_attempts";

drop table "public"."lifecycle_audit_events";

drop table "public"."lifecycle_configuration_templates";

drop table "public"."mentor_assignment_audit";

drop table "public"."mentor_assignment_requests";

drop table "public"."mentors";

drop table "public"."onboarding_progress";

drop table "public"."outreach_activity_log";

drop table "public"."outreach_import_jobs";

drop table "public"."outreach_import_rows";

drop table "public"."outreach_opportunity_labels";

drop table "public"."outreach_relationship_labels";

drop table "public"."outreach";

drop table "public"."session_dates";

drop table "public"."startups";

alter table "public"."outreach_opportunities"
  alter column "stage" drop default;

alter table "public"."outreach_opportunities"
  alter column "stage" type text using "stage"::text;

alter table "public"."outreach_opportunities"
  alter column "stage" set default 'not_contacted'::text;

alter table "public"."sessions"
  alter column "meeting_id" set not null;

alter table "public"."sessions"
  alter column "mentor_semester_id" set not null;

alter table "public"."sessions"
  alter column "slot" set not null;

alter table "public"."sessions"
  alter column "startup_semester_id" set not null;

alter table "public"."sessions"
  alter column "status" drop default;

alter table "public"."sessions"
  alter column "status" type text using "status"::text;

alter table "public"."sessions"
  alter column "status" set default 'requested'::text;

alter table "public"."outreach_opportunities"
  alter column "stage" set default 'not_contacted'::text;

alter table "public"."sessions"
  alter column "status" set default 'requested'::text;

create or replace function public.carry_forward_outreach_contacts (
  p_source_semester_id uuid,
  p_target_semester_id uuid,
  p_contact_ids        uuid[]
)
  returns integer
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare inserted_count integer;
begin
  if auth.uid() is null
    or not public.can_manage_semester(p_source_semester_id, auth.uid())
    or not public.can_manage_semester(p_target_semester_id, auth.uid()) then
    raise exception 'Not authorized to carry outreach contacts between semesters';
  end if;
  insert into public.outreach_opportunities (
    semester_id, contact_id, relationship_types, stage, owner_profile_id,
    next_follow_up_at, snoozed_until, is_silenced, silenced_at, silenced_by,
    silence_reason, semester_notes, source_context, created_by
  )
  select p_target_semester_id, source.contact_id, source.relationship_types, 'not_contacted', null,
    null, null, false, null, null, null, null,
    jsonb_build_object('carried_from_semester_id', p_source_semester_id, 'carried_from_opportunity_id', source.id),
    auth.uid()
  from public.outreach_opportunities source
  where source.semester_id = p_source_semester_id and source.contact_id = any(p_contact_ids)
  on conflict (semester_id, contact_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$function$;

create or replace function public.reset_outreach_opportunities (
  p_semester_id     uuid,
  p_opportunity_ids uuid[]
)
  returns integer
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare reset_count integer;
begin
  if auth.uid() is null or not public.can_manage_semester(p_semester_id, auth.uid()) then
    raise exception 'Not authorized to reset outreach opportunities';
  end if;
  with reset_rows as (
    update public.outreach_opportunities
    set stage = 'not_contacted', next_follow_up_at = null, snoozed_until = null,
        is_silenced = false, silenced_at = null, silenced_by = null, silence_reason = null,
        updated_at = now()
    where semester_id = p_semester_id and id = any(p_opportunity_ids)
    returning id
  ), logged as (
    insert into public.outreach_activities (
      semester_id, opportunity_id, actor_profile_id, activity_kind, summary, details
    )
    select p_semester_id, id, auth.uid(), 'stage_change', 'Outreach status reset',
      jsonb_build_object('stage', 'not_contacted', 'reason', 'new_semester_review')
    from reset_rows returning id
  )
  select count(*) into reset_count from logged;
  return reset_count;
end;
$function$;

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_relationship_types_check" check ((cardinality(relationship_types) > 0));

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_stage_check"
    check
    ((stage = ANY (ARRAY['not_contacted'::text, 'researching'::text, 'contacted'::text, 'replied'::text, 'conversation_scheduled'::text, 'ready'::text, 'declined'::text,
    'closed'::text])));

alter table "public"."semester_memberships"
  add constraint "semester_memberships_semester_profile_key" unique (semester_id, profile_id);

alter table "public"."sessions"
  add constraint "sessions_semester_meeting_fkey" foreign key (semester_id, meeting_id) references public.meetings(semester_id, id);

alter table "public"."sessions"
  add constraint "sessions_semester_mentor_fkey" foreign key (semester_id, mentor_semester_id) references public.mentor_semesters(semester_id, id);

alter table "public"."sessions"
  add constraint "sessions_semester_startup_fkey" foreign key (semester_id, startup_semester_id) references public.startup_semesters(semester_id, id);

alter table "public"."sessions"
  add constraint "sessions_slot_check" check ((slot = ANY (ARRAY[1, 2])));

alter table "public"."sessions"
  add constraint "sessions_status_check" check ((status = ANY (ARRAY['requested'::text, 'confirmed'::text, 'declined'::text, 'cancelled'::text])));

create view "public"."availability" with (security_invoker=true) AS  SELECT availability.id,
    membership.profile_id AS user_id,
    availability.meeting_id AS session_date_id,
    availability.is_available,
    availability.created_at
   FROM (public.meeting_availability availability
     JOIN public.semester_memberships membership ON ((membership.id = availability.semester_membership_id)));

create view "public"."mentors" with (security_invoker=true) AS  SELECT mentor_term.id,
    membership.profile_id AS user_id,
    mentor_term.semester_id,
    COALESCE(profile.full_name, profile.email) AS full_name,
    mentor.company,
    mentor.title AS role_title,
    mentor.biography AS bio,
    mentor.linkedin_url,
    mentor.website_url,
    mentor.photo_url,
    mentor.expertise_tags,
    mentor_term.mentorship_goals,
    (membership.status = 'active'::public.membership_lifecycle_status) AS is_active,
    mentor_term.created_at,
    mentor_term.updated_at,
    ((lower(regexp_replace(COALESCE(profile.full_name, profile.email), '[^a-zA-Z0-9]+'::text, '-'::text, 'g'::text)) || '-'::text) || "left"((mentor_term.id)::text, 8)) AS slug,
    profile.email,
    mentor_term.general_availability,
    mentor_term.preferred_format,
    mentor_term.per_week_availability,
    mentor_term.opening_talk
   FROM (((public.mentor_semesters mentor_term
     JOIN public.semester_memberships membership ON ((membership.id = mentor_term.semester_membership_id)))
     JOIN public.profiles profile ON ((profile.id = membership.profile_id)))
     JOIN public.mentor_profiles mentor ON ((mentor.profile_id = membership.profile_id)));

create or replace function public.mentors (
  public .sessions
)
  returns SETOF public.mentors
  language sql
  stable
  rows 1
  set search_path to ''
  AS $function$ select * from public.mentors where id = $1.mentor_semester_id $function$;

create view "public"."session_dates" with (security_invoker=true) AS  SELECT id,
    semester_id,
    meeting_date AS date,
    label,
    created_at
   FROM public.meetings;

create or replace function public.session_dates (
  public .sessions
)
  returns SETOF public.session_dates
  language sql
  stable
  rows 1
  set search_path to ''
  AS $function$ select * from public.session_dates where id = $1.meeting_id $function$;

create view "public"."startups" with (security_invoker=true) AS  SELECT startup_term.id,
    primary_member.profile_id AS user_id,
    startup_term.semester_id,
    organization.name,
    organization.description,
    organization.industry,
    startup_term.stage,
    organization.logo_url,
    organization.website_url AS website,
    (organization.durable_contact_data ->> 'founder_name'::text) AS founder_name,
    NULL::text AS mentor_preferences,
    startup_term.preferred_expertise_tags AS preferred_tags,
    startup_term.goals AS semester_goals,
    (startup_term.readiness_status = 'ready'::text) AS is_active,
    startup_term.created_at,
    startup_term.updated_at,
    organization.slug,
    COALESCE((organization.durable_contact_data -> 'founders'::text), '[]'::jsonb) AS founders,
    startup_term.mentorship_needs
   FROM ((public.startup_semesters startup_term
     JOIN public.startup_organizations organization ON ((organization.id = startup_term.startup_organization_id)))
     LEFT JOIN LATERAL ( SELECT membership.profile_id
           FROM (public.startup_team_memberships team
             JOIN public.semester_memberships membership ON ((membership.id = team.semester_membership_id)))
          WHERE (team.startup_semester_id = startup_term.id)
          ORDER BY team.is_primary_contact DESC, team.created_at
         LIMIT 1) primary_member ON (true));

create or replace function public.startups (
  public .sessions
)
  returns SETOF public.startups
  language sql
  stable
  rows 1
  set search_path to ''
  AS $function$ select * from public.startups where id = $1.startup_semester_id $function$;

create unique index outreach_opportunities_semester_contact_key on public.outreach_opportunities using btree (semester_id, contact_id);

create unique index sessions_active_mentor_slot_key on public.sessions using btree (meeting_id, slot, mentor_semester_id)
  where (status <> 'cancelled'::text);

create unique index sessions_active_startup_slot_key on public.sessions using btree (meeting_id, slot, startup_semester_id)
  where (status <> 'cancelled'::text);

create trigger validate_canonical_outreach_owner_membership
  before insert or update of semester_id, owner_profile_id, stage on public.outreach_opportunities
  for each row
  execute function public.validate_outreach_owner_membership();

create policy "admins manage sessions" on "public"."sessions"
  for all
  to "authenticated"
  using (public.can_manage_semester(semester_id, auth.uid()))
  with check (public.can_manage_semester(semester_id, auth.uid()));

create policy "mentors respond to own sessions" on "public"."sessions"
  for update
  to "authenticated"
  using ((exists ( select 1
   from (public.mentor_semesters mentor_term
     JOIN public.semester_memberships membership on ((membership.id = mentor_term.semester_membership_id)))
  where ((mentor_term.id = sessions.mentor_semester_id) AND (membership.profile_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM (public.mentor_semesters mentor_term
     JOIN public.semester_memberships membership ON ((membership.id = mentor_term.semester_membership_id)))
  WHERE ((mentor_term.id = sessions.mentor_semester_id) AND (membership.profile_id = auth.uid())))));

create policy "sessions visible to semester participants" on "public"."sessions"
  for select
  to "authenticated"
  using ((public.can_manage_semester(semester_id, auth.uid()) or (exists ( select 1
   from (public.mentor_semesters mentor_term
     JOIN public.semester_memberships membership on ((membership.id = mentor_term.semester_membership_id)))
  where ((mentor_term.id = sessions.mentor_semester_id) AND (membership.profile_id = auth.uid())))) or (exists ( select 1
   from (public.startup_team_memberships team
     JOIN public.semester_memberships membership on ((membership.id = team.semester_membership_id)))
  where ((team.startup_semester_id = sessions.startup_semester_id) AND (membership.profile_id = auth.uid()))))));

create policy "startups request sessions" on "public"."sessions"
  for insert
  to "authenticated"
  with check ((EXISTS ( SELECT 1
   FROM (public.startup_team_memberships team
     JOIN public.semester_memberships membership ON ((membership.id = team.semester_membership_id)))
  WHERE ((team.startup_semester_id = sessions.startup_semester_id) AND (membership.profile_id = auth.uid())))));

revoke all on function "public"."carry_forward_outreach_contacts"(uuid, uuid, uuid[]) from public;

grant execute on function "public"."carry_forward_outreach_contacts"(uuid, uuid, uuid[]) to "authenticated", "postgres";

grant execute on function "public"."mentors"(public.sessions) to public, "postgres";

revoke all on function "public"."reset_outreach_opportunities"(uuid, uuid[]) from public;

grant execute on function "public"."reset_outreach_opportunities"(uuid, uuid[]) to "authenticated", "postgres";

grant execute on function "public"."session_dates"(public.sessions) to public, "postgres";

grant execute on function "public"."startups"(public.sessions) to public, "postgres";

grant maintain, references, trigger, truncate on table "public"."availability" to "anon", "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."availability" to "postgres";

grant maintain, references, trigger, truncate on table "public"."availability" to "service_role";

grant maintain, references, trigger, truncate on table "public"."mentors" to "anon", "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."mentors" to "postgres";

grant maintain, references, trigger, truncate on table "public"."mentors" to "service_role";

grant maintain, references, trigger, truncate on table "public"."session_dates" to "anon", "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."session_dates" to "postgres";

grant maintain, references, trigger, truncate on table "public"."session_dates" to "service_role";

grant maintain, references, trigger, truncate on table "public"."startups" to "anon", "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."startups" to "postgres";

grant maintain, references, trigger, truncate on table "public"."startups" to "service_role";
