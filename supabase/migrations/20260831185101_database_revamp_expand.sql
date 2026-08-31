set local check_function_bodies = off;

alter table "public"."profiles"
  drop constraint "profiles_id_fkey";

create table "public"."meeting_availability" (
  "id"                     uuid                     not null default gen_random_uuid(),
  "semester_id"            uuid                     not null,
  "meeting_id"             uuid                     not null,
  "semester_membership_id" uuid                     not null,
  "slot"                   smallint                 not null,
  "is_available"           boolean                  not null default true,
  "source"                 text                     not null default 'user'::text,
  "created_at"             timestamp with time zone not null default now(),
  "updated_at"             timestamp with time zone not null default now(),
  constraint "meeting_availability_meeting_id_semester_membership_id_slot_key" unique (meeting_id, semester_membership_id, slot),
  constraint "meeting_availability_pkey" primary key (id),
  constraint "meeting_availability_slot_check" check ((slot = ANY (ARRAY[1, 2])))
);

alter table "public"."meeting_availability"
  enable row level security;

create table "public"."meetings" (
  "id"               uuid                     not null default gen_random_uuid(),
  "semester_id"      uuid                     not null,
  "meeting_date"     date                     not null,
  "label"            text,
  "slot_1_starts_at" time without time zone   not null default '15:30:00'::time without time zone,
  "slot_1_ends_at"   time without time zone   not null default '16:15:00'::time without time zone,
  "slot_2_starts_at" time without time zone   not null default '16:15:00'::time without time zone,
  "slot_2_ends_at"   time without time zone   not null default '17:00:00'::time without time zone,
  "created_at"       timestamp with time zone not null default now(),
  "updated_at"       timestamp with time zone not null default now(),
  constraint "meetings_check" check (((slot_1_starts_at < slot_1_ends_at) AND (slot_1_ends_at <= slot_2_starts_at) AND (slot_2_starts_at < slot_2_ends_at))),
  constraint "meetings_meeting_date_check" check ((EXTRACT(isodow FROM meeting_date) = (5)::numeric)),
  constraint "meetings_pkey" primary key (id),
  constraint "meetings_semester_id_id_key" unique (semester_id, id),
  constraint "meetings_semester_id_meeting_date_key" unique (semester_id, meeting_date)
);

alter table "public"."meetings"
  enable row level security;

create table "public"."outreach_imports" (
  "id"              uuid                     not null default gen_random_uuid(),
  "semester_id"     uuid                     not null,
  "created_by"      uuid                     not null,
  "source_name"     text                     not null,
  "idempotency_key" text                     not null,
  "status"          text                     not null default 'preview'::text,
  "rows"            jsonb                    not null default '[]'::jsonb,
  "result"          jsonb                    not null default '{}'::jsonb,
  "committed_at"    timestamp with time zone,
  "created_at"      timestamp with time zone not null default now(),
  "updated_at"      timestamp with time zone not null default now(),
  constraint "outreach_imports_pkey" primary key (id),
  constraint "outreach_imports_rows_check" check ((jsonb_typeof(rows) = 'array'::text)),
  constraint "outreach_imports_semester_id_idempotency_key_key" unique (semester_id, idempotency_key),
  constraint "outreach_imports_status_check" check ((status = ANY (ARRAY['preview'::text, 'committing'::text, 'committed'::text, 'failed'::text])))
);

alter table "public"."outreach_imports"
  enable row level security;

create table "public"."program_audit_events" (
  "id"               uuid                     not null default gen_random_uuid(),
  "semester_id"      uuid                     not null,
  "actor_profile_id" uuid,
  "action"           text                     not null,
  "subject_type"     text                     not null,
  "subject_id"       uuid,
  "details"          jsonb                    not null default '{}'::jsonb,
  "created_at"       timestamp with time zone not null default now(),
  constraint "program_audit_events_pkey" primary key (id)
);

alter table "public"."program_audit_events"
  enable row level security;

alter table "public"."mentor_semesters"
  add column "general_availability" text;

alter table "public"."mentor_semesters"
  add column "per_week_availability" jsonb not null default '{}'::jsonb;

alter table "public"."mentor_semesters"
  add column "opening_talk" text;

alter table "public"."outreach_contacts"
  add column "relationship_types" text[] not null default '{}'::text[];

alter table "public"."outreach_contacts"
  add column "background_notes" text;

alter table "public"."outreach_opportunities"
  add column "relationship_types" text[] not null default '{}'::text[];

alter table "public"."outreach_opportunities"
  add column "canonical_stage" text;

alter table "public"."outreach_opportunities"
  add column "semester_notes" text;

alter table "public"."outreach_opportunities"
  add column "source_context" jsonb not null default '{}'::jsonb;

alter table "public"."profiles"
  add column "auth_user_id" uuid;

alter table "public"."semester_memberships"
  add column "onboarding_data" jsonb not null default '{}'::jsonb;

alter table "public"."semester_memberships"
  add column "onboarding_started_at" timestamp with time zone;

alter table "public"."semester_memberships"
  add column "onboarding_completed_at" timestamp with time zone;

alter table "public"."sessions"
  add column "meeting_id" uuid;

alter table "public"."sessions"
  add column "mentor_semester_id" uuid;

alter table "public"."sessions"
  add column "startup_semester_id" uuid;

alter table "public"."sessions"
  add column "slot" smallint;

alter table "public"."sessions"
  add column "canonical_status" text;

alter table "public"."startup_organizations"
  add column "durable_contact_data" jsonb not null default '{}'::jsonb;

create or replace function public.run_database_revamp_backfill()
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  result jsonb;
begin
  if current_user not in ('postgres', 'service_role') and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Database revamp backfill requires service role';
  end if;

  insert into public.profiles (id, auth_user_id, email, role, semester_id, full_name, status, is_active, created_at, updated_at)
  select
    coalesce(mentor.user_id, mentor.id),
    mentor.user_id,
    coalesce(nullif(lower(btrim(mentor.email)), ''), 'mentor+' || mentor.id::text || '@almaworks.invalid'),
    'mentor'::public.user_role,
    mentor.semester_id,
    mentor.full_name,
    'approved',
    mentor.is_active,
    mentor.created_at,
    mentor.updated_at
  from public.mentors mentor
  on conflict (id) do update
    set full_name = coalesce(public.profiles.full_name, excluded.full_name),
        auth_user_id = coalesce(public.profiles.auth_user_id, excluded.auth_user_id),
        updated_at = greatest(public.profiles.updated_at, excluded.updated_at);

  insert into public.semester_memberships (
    semester_id, profile_id, role, status, invited_at, activated_at, created_at, updated_at
  )
  select
    mentor.semester_id,
    coalesce(mentor.user_id, mentor.id),
    'mentor'::public.user_role,
    case when mentor.is_active then 'active'::public.membership_lifecycle_status else 'alumni'::public.membership_lifecycle_status end,
    mentor.created_at,
    case when mentor.is_active then mentor.created_at else null end,
    mentor.created_at,
    mentor.updated_at
  from public.mentors mentor
  on conflict (semester_id, profile_id, role) do update
    set status = excluded.status,
        updated_at = greatest(public.semester_memberships.updated_at, excluded.updated_at);

  insert into public.mentor_profiles (
    profile_id, biography, company, title, linkedin_url, website_url, photo_url, expertise_tags, created_at, updated_at
  )
  select
    coalesce(mentor.user_id, mentor.id), mentor.bio, mentor.company, mentor.role_title,
    mentor.linkedin_url, mentor.website_url, mentor.photo_url, mentor.expertise_tags,
    mentor.created_at, mentor.updated_at
  from public.mentors mentor
  on conflict (profile_id) do update
    set biography = coalesce(excluded.biography, public.mentor_profiles.biography),
        company = coalesce(excluded.company, public.mentor_profiles.company),
        title = coalesce(excluded.title, public.mentor_profiles.title),
        linkedin_url = coalesce(excluded.linkedin_url, public.mentor_profiles.linkedin_url),
        website_url = coalesce(excluded.website_url, public.mentor_profiles.website_url),
        photo_url = coalesce(excluded.photo_url, public.mentor_profiles.photo_url),
        expertise_tags = case when cardinality(excluded.expertise_tags) > 0 then excluded.expertise_tags else public.mentor_profiles.expertise_tags end,
        updated_at = greatest(public.mentor_profiles.updated_at, excluded.updated_at);

  insert into public.mentor_semesters (
    id, semester_id, semester_membership_id, mentorship_goals, preferred_format,
    general_availability, per_week_availability, opening_talk, capacity, readiness_status,
    created_at, updated_at
  )
  select
    mentor.id, mentor.semester_id, membership.id, mentor.mentorship_goals, mentor.preferred_format,
    mentor.general_availability, mentor.per_week_availability, mentor.opening_talk, 4,
    case when mentor.is_active then 'ready' else 'not_started' end,
    mentor.created_at, mentor.updated_at
  from public.mentors mentor
  join public.semester_memberships membership
    on membership.semester_id = mentor.semester_id
   and membership.profile_id = coalesce(mentor.user_id, mentor.id)
   and membership.role = 'mentor'
  on conflict (id) do update
    set semester_membership_id = excluded.semester_membership_id,
        mentorship_goals = excluded.mentorship_goals,
        preferred_format = excluded.preferred_format,
        general_availability = excluded.general_availability,
        per_week_availability = excluded.per_week_availability,
        opening_talk = excluded.opening_talk,
        readiness_status = excluded.readiness_status,
        updated_at = greatest(public.mentor_semesters.updated_at, excluded.updated_at);

  insert into public.startup_organizations (
    id, name, slug, description, industry, website_url, logo_url, durable_contact_data, created_at, updated_at
  )
  select
    startup.id,
    startup.name,
    coalesce(nullif(startup.slug, ''), lower(regexp_replace(startup.name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || left(startup.id::text, 8)),
    startup.description,
    startup.industry,
    startup.website,
    startup.logo_url,
    jsonb_build_object('founder_name', startup.founder_name, 'founders', startup.founders),
    startup.created_at,
    startup.updated_at
  from public.startups startup
  on conflict (id) do update
    set name = excluded.name,
        description = coalesce(excluded.description, public.startup_organizations.description),
        industry = coalesce(excluded.industry, public.startup_organizations.industry),
        website_url = coalesce(excluded.website_url, public.startup_organizations.website_url),
        logo_url = coalesce(excluded.logo_url, public.startup_organizations.logo_url),
        durable_contact_data = excluded.durable_contact_data,
        updated_at = greatest(public.startup_organizations.updated_at, excluded.updated_at);

  insert into public.startup_semesters (
    id, semester_id, startup_organization_id, company_snapshot, stage, goals,
    mentorship_needs, preferred_expertise_tags, readiness_status, created_at, updated_at
  )
  select
    startup.id, startup.semester_id, startup.id, startup.description, startup.stage,
    startup.semester_goals, startup.mentorship_needs, startup.preferred_tags,
    case when startup.is_active then 'ready' else 'not_started' end,
    startup.created_at, startup.updated_at
  from public.startups startup
  on conflict (id) do update
    set company_snapshot = excluded.company_snapshot,
        stage = excluded.stage,
        goals = excluded.goals,
        mentorship_needs = excluded.mentorship_needs,
        preferred_expertise_tags = excluded.preferred_expertise_tags,
        readiness_status = excluded.readiness_status,
        updated_at = greatest(public.startup_semesters.updated_at, excluded.updated_at);

  insert into public.semester_memberships (
    semester_id, profile_id, role, status, invited_at, activated_at, created_at, updated_at
  )
  select startup.semester_id, startup.user_id, 'startup'::public.user_role,
    case when startup.is_active then 'active'::public.membership_lifecycle_status else 'alumni'::public.membership_lifecycle_status end,
    startup.created_at, case when startup.is_active then startup.created_at else null end,
    startup.created_at, startup.updated_at
  from public.startups startup
  where startup.user_id is not null
  on conflict (semester_id, profile_id, role) do update
    set status = excluded.status,
        updated_at = greatest(public.semester_memberships.updated_at, excluded.updated_at);

  insert into public.startup_team_memberships (
    semester_id, startup_semester_id, semester_membership_id, is_primary_contact, created_at
  )
  select startup.semester_id, startup.id, membership.id, true, startup.created_at
  from public.startups startup
  join public.semester_memberships membership
    on membership.semester_id = startup.semester_id
   and membership.profile_id = startup.user_id
   and membership.role = 'startup'
  where startup.user_id is not null
  on conflict (startup_semester_id, semester_membership_id) do update
    set is_primary_contact = true;

  insert into public.meetings (id, semester_id, meeting_date, label, created_at, updated_at)
  select id, semester_id, date, label, created_at, created_at
  from public.session_dates
  on conflict (id) do update
    set meeting_date = excluded.meeting_date,
        label = excluded.label,
        updated_at = excluded.updated_at;

  insert into public.meeting_availability (
    semester_id, meeting_id, semester_membership_id, slot, is_available, source, created_at, updated_at
  )
  select date.semester_id, available.session_date_id, membership.id, slot.number,
    available.is_available, 'legacy_availability', available.created_at, available.created_at
  from public.availability available
  join public.session_dates date on date.id = available.session_date_id
  join public.semester_memberships membership
    on membership.semester_id = date.semester_id
   and membership.profile_id = available.user_id
  cross join (values (1::smallint), (2::smallint)) slot(number)
  on conflict (meeting_id, semester_membership_id, slot) do update
    set is_available = excluded.is_available,
        source = excluded.source,
        updated_at = greatest(public.meeting_availability.updated_at, excluded.updated_at);

  update public.sessions session
  set meeting_id = session.session_date_id,
      mentor_semester_id = session.mentor_id,
      startup_semester_id = session.startup_id,
      slot = case
        when session.time_slot ~* '(^|[^0-9])3:30|15:30|slot\s*1' then 1
        when session.time_slot ~* '(^|[^0-9])4:15|16:15|slot\s*2' then 2
        else 1
      end,
      canonical_status = case
        when session.status::text = 'declined' then 'declined'
        when session.status::text = 'confirmed' or session.is_confirmed then 'confirmed'
        else 'requested'
      end;

  with duplicate_startups as (
    select id, row_number() over (
      partition by meeting_id, slot, startup_semester_id order by created_at, id
    ) as occurrence
    from public.sessions
    where startup_semester_id is not null
  )
  update public.sessions session
  set canonical_status = 'cancelled'
  from duplicate_startups duplicate
  where duplicate.id = session.id and duplicate.occurrence > 1;

  insert into public.program_audit_events (id, semester_id, actor_profile_id, action, subject_type, subject_id, details, created_at)
  select id, semester_id, actor_profile_id, action, subject_type, subject_id, details, created_at
  from public.lifecycle_audit_events
  on conflict (id) do nothing;

  insert into public.program_audit_events (id, semester_id, actor_profile_id, action, subject_type, subject_id, details, created_at)
  select id, semester_id, actor_profile_id, action, 'session', session_id,
    jsonb_build_object('request_id', request_id, 'override_types', override_types, 'override_reason', override_reason, 'ranking_context', ranking_context),
    created_at
  from public.mentor_assignment_audit
  on conflict (id) do nothing;

  update public.semester_memberships membership
  set onboarding_data = source.data,
      onboarding_started_at = source.started_at,
      onboarding_completed_at = source.completed_at
  from (
    select progress.semester_membership_id,
      jsonb_object_agg(progress.item_key, jsonb_build_object('completed', progress.completed_at is not null, 'data', progress.payload)) as data,
      min(progress.created_at) as started_at,
      case when bool_and((not progress.is_required) or progress.completed_at is not null) then max(progress.completed_at) end as completed_at
    from public.onboarding_progress progress
    group by progress.semester_membership_id
  ) source
  where membership.id = source.semester_membership_id;

  update public.outreach_contacts contact
  set background_notes = coalesce(contact.background_notes, contact.notes),
      relationship_types = source.relationship_types
  from (
    select opportunity.contact_id, array_agg(distinct label.slug order by label.slug) as relationship_types
    from public.outreach_opportunities opportunity
    join public.outreach_opportunity_labels opportunity_label on opportunity_label.opportunity_id = opportunity.id
    join public.outreach_relationship_labels label on label.id = opportunity_label.relationship_label_id
    group by opportunity.contact_id
  ) source
  where contact.id = source.contact_id;

  update public.outreach_opportunities opportunity
  set relationship_types = coalesce(source.relationship_types, case when cardinality(opportunity.relationship_types) = 0 then array['mentor']::text[] else opportunity.relationship_types end),
      canonical_stage = case opportunity.stage::text
        when 'prospect' then 'not_contacted'
        when 'responded' then 'replied'
        when 'meeting' then 'conversation_scheduled'
        when 'nurture' then 'ready'
        when 'converted' then 'closed'
        else opportunity.stage::text
      end,
      semester_notes = coalesce(opportunity.semester_notes, opportunity.notes),
      source_context = opportunity.conversion_details || jsonb_build_object('legacy_source_channel', opportunity.source_channel)
  from (
    select opportunity_label.opportunity_id, array_agg(distinct label.slug order by label.slug) as relationship_types
    from public.outreach_opportunity_labels opportunity_label
    join public.outreach_relationship_labels label on label.id = opportunity_label.relationship_label_id
    group by opportunity_label.opportunity_id
  ) source
  where opportunity.id = source.opportunity_id;

  update public.outreach_opportunities opportunity
  set relationship_types = array['mentor']::text[]
  where cardinality(opportunity.relationship_types) = 0;

  insert into public.outreach_imports (
    id, semester_id, created_by, source_name, idempotency_key, status, rows, result,
    committed_at, created_at, updated_at
  )
  select job.id, job.semester_id, job.created_by,
    coalesce(job.source_filename, job.source),
    coalesce(job.idempotency_key, 'legacy-' || job.id::text),
    case job.status::text when 'committed' then 'committed' when 'committing' then 'committing' when 'failed' then 'failed' else 'preview' end,
    coalesce(rows.payload, '[]'::jsonb),
    job.summary,
    job.committed_at,
    job.created_at,
    job.updated_at
  from public.outreach_import_jobs job
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'row_number', row.row_number,
      'raw_payload', row.raw_payload,
      'normalized_payload', row.normalized_payload,
      'issue_codes', row.issue_codes,
      'match_decision', row.match_decision,
      'committed_opportunity_id', row.committed_opportunity_id
    ) order by row.row_number) as payload
    from public.outreach_import_rows row
    where row.import_job_id = job.id
  ) rows on true
  on conflict (id) do update
    set status = excluded.status,
        rows = excluded.rows,
        result = excluded.result,
        committed_at = excluded.committed_at,
        updated_at = greatest(public.outreach_imports.updated_at, excluded.updated_at);

  select jsonb_build_object(
    'profiles', (select count(*) from public.profiles),
    'mentor_profiles', (select count(*) from public.mentor_profiles),
    'mentor_semesters', (select count(*) from public.mentor_semesters),
    'startup_organizations', (select count(*) from public.startup_organizations),
    'startup_semesters', (select count(*) from public.startup_semesters),
    'meetings', (select count(*) from public.meetings),
    'sessions_total', (select count(*) from public.sessions),
    'sessions_backfilled', (select count(*) from public.sessions where meeting_id is not null and mentor_semester_id is not null and canonical_status is not null),
    'sessions_missing_startup', (select count(*) from public.sessions where startup_semester_id is null),
    'cancelled_duplicate_sessions', (select count(*) from public.sessions where canonical_status = 'cancelled'),
    'outreach_contacts', (select count(*) from public.outreach_contacts),
    'outreach_opportunities', (select count(*) from public.outreach_opportunities),
    'outreach_imports', (select count(*) from public.outreach_imports)
  ) into result;

  return result;
end;
$function$;

alter table "public"."meeting_availability"
  add constraint "meeting_availability_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."meetings"
  add constraint "meetings_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."meeting_availability"
  add constraint "meeting_availability_semester_id_meeting_id_fkey" foreign key (semester_id, meeting_id) references public.meetings(semester_id, id) on delete cascade;

alter table "public"."mentor_semesters"
  add constraint "mentor_semesters_semester_id_id_key" unique (semester_id, id);

alter table "public"."outreach_imports"
  add constraint "outreach_imports_created_by_fkey" foreign key (created_by) references public.profiles(id);

alter table "public"."outreach_imports"
  add constraint "outreach_imports_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."profiles"
  add constraint "profiles_auth_user_id_fkey" foreign key (auth_user_id) references auth.users(id) on delete set null;

alter table "public"."program_audit_events"
  add constraint "program_audit_events_actor_profile_id_fkey" foreign key (actor_profile_id) references public.profiles(id) on delete set null;

alter table "public"."program_audit_events"
  add constraint "program_audit_events_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."semester_memberships"
  add constraint "semester_memberships_semester_id_id_key" unique (semester_id, id);

alter table "public"."meeting_availability"
  add constraint "meeting_availability_semester_id_semester_membership_id_fkey" foreign key (semester_id, semester_membership_id)
    references public.semester_memberships(semester_id, id) on delete cascade;

alter table "public"."startup_semesters"
  add constraint "startup_semesters_semester_id_id_key" unique (semester_id, id);

create unique index profiles_auth_user_id_key on public.profiles using btree (auth_user_id)
  where (auth_user_id is not null);

create policy "members manage own meeting availability" on "public"."meeting_availability"
  for all
  to "authenticated"
  using (((exists ( select 1
   from public.semester_memberships membership
  where ((membership.id = meeting_availability.semester_membership_id) AND (membership.profile_id = auth.uid())))) or public.can_manage_semester(semester_id, auth.uid())))
  with check (((EXISTS ( SELECT 1
   FROM public.semester_memberships membership
  WHERE ((membership.id = meeting_availability.semester_membership_id) AND (membership.profile_id = auth.uid())))) OR public.can_manage_semester(semester_id, auth.uid())));

create policy "admins manage meetings" on "public"."meetings"
  for all
  to "authenticated"
  using (public.can_manage_semester(semester_id, auth.uid()))
  with check (public.can_manage_semester(semester_id, auth.uid()));

create policy "meetings visible to semester members" on "public"."meetings"
  for select
  to "authenticated"
  using (public.has_semester_role(semester_id, ARRAY['admin'::public.user_role, 'mentor'::public.user_role, 'startup'::public.user_role], auth.uid()));

create policy "admins manage outreach imports" on "public"."outreach_imports"
  for all
  to "authenticated"
  using (public.can_manage_semester(semester_id, auth.uid()))
  with check (public.can_manage_semester(semester_id, auth.uid()));

create policy "admins view program audit" on "public"."program_audit_events"
  for select
  to "authenticated"
  using (public.can_manage_semester(semester_id, auth.uid()));

revoke all on function "public"."run_database_revamp_backfill"() from public;

grant execute on function "public"."run_database_revamp_backfill"() to "postgres", "service_role";

grant maintain, references, trigger, truncate on table "public"."meeting_availability" to "anon", "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."meeting_availability" to "postgres";

grant maintain, references, trigger, truncate on table "public"."meeting_availability" to "service_role";

grant maintain, references, trigger, truncate on table "public"."meetings" to "anon", "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."meetings" to "postgres";

grant maintain, references, trigger, truncate on table "public"."meetings" to "service_role";

grant maintain, references, trigger, truncate on table "public"."outreach_imports" to "anon", "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_imports" to "postgres";

grant maintain, references, trigger, truncate on table "public"."outreach_imports" to "service_role";

grant maintain, references, trigger, truncate on table "public"."program_audit_events" to "anon", "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."program_audit_events" to "postgres";

grant maintain, references, trigger, truncate on table "public"."program_audit_events" to "service_role";
