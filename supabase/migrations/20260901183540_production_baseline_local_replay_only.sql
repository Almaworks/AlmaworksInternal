set local check_function_bodies = off;

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "anon";

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "authenticated";

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "service_role";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "anon";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "authenticated";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "service_role";

create table "public"."invitations" (
  "id"                  uuid                     not null default gen_random_uuid(),
  "semester_id"         uuid                     not null,
  "email"               text                     not null,
  "full_name"           text                     not null,
  "startup_semester_id" uuid,
  "matched_profile_id"  uuid,
  "invited_by"          uuid                     not null,
  "expires_at"          timestamp with time zone not null,
  "sent_at"             timestamp with time zone,
  "accepted_at"         timestamp with time zone,
  "revoked_at"          timestamp with time zone,
  "last_error_code"     text,
  "last_error_message"  text,
  "send_attempts"       integer                  not null default 0,
  "created_at"          timestamp with time zone not null default now(),
  "updated_at"          timestamp with time zone not null default now(),
  constraint "invitations_email_check" check ((email = lower(TRIM(BOTH FROM email)))),
  constraint "invitations_pkey" primary key (id),
  constraint "invitations_send_attempts_check" check ((send_attempts >= 0))
);

alter table "public"."invitations"
  enable row level security;

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

create table "public"."mentor_profiles" (
  "profile_id"     uuid                     not null,
  "biography"      text,
  "company"        text,
  "title"          text,
  "linkedin_url"   text,
  "website_url"    text,
  "photo_url"      text,
  "expertise_tags" text[]                   not null default '{}'::text[],
  "created_at"     timestamp with time zone not null default now(),
  "updated_at"     timestamp with time zone not null default now(),
  constraint "mentor_profiles_pkey" primary key (profile_id)
);

alter table "public"."mentor_profiles"
  enable row level security;

create table "public"."mentor_semesters" (
  "id"                     uuid                     not null default gen_random_uuid(),
  "semester_id"            uuid                     not null,
  "semester_membership_id" uuid                     not null,
  "mentorship_goals"       text,
  "preferred_format"       text,
  "capacity"               integer                  not null default 4,
  "readiness_status"       text                     not null default 'not_started'::text,
  "created_at"             timestamp with time zone not null default now(),
  "updated_at"             timestamp with time zone not null default now(),
  "general_availability"   text,
  "per_week_availability"  jsonb                    not null default '{}'::jsonb,
  "opening_talk"           text,
  constraint "mentor_semesters_capacity_check" check (((capacity >= 0) AND (capacity <= 50))),
  constraint "mentor_semesters_pkey" primary key (id),
  constraint "mentor_semesters_readiness_status_check" check ((readiness_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'ready'::text]))),
  constraint "mentor_semesters_semester_id_id_key" unique (semester_id, id),
  constraint "mentor_semesters_semester_id_semester_membership_id_key" unique (semester_id, semester_membership_id)
);

alter table "public"."mentor_semesters"
  enable row level security;

create table "public"."outreach_activities" (
  "id"                        uuid                     not null default gen_random_uuid(),
  "semester_id"               uuid                     not null,
  "opportunity_id"            uuid                     not null,
  "actor_profile_id"          uuid,
  "occurred_at"               timestamp with time zone not null default now(),
  "summary"                   text,
  "details"                   jsonb                    not null default '{}'::jsonb,
  "previous_owner_profile_id" uuid,
  "new_owner_profile_id"      uuid,
  "supersedes_activity_id"    uuid,
  "external_message_id"       text,
  "created_at"                timestamp with time zone not null default now(),
  constraint "outreach_activities_external_message_id_check" check (((external_message_id IS NULL) OR (length(btrim(external_message_id)) > 0))),
  constraint "outreach_activities_pkey" primary key (id),
  constraint "outreach_activities_semester_id_opportunity_id_id_key" unique (semester_id, opportunity_id, id)
);

alter table "public"."outreach_activities"
  enable row level security;

create table "public"."outreach_companies" (
  "id"              uuid                     not null default gen_random_uuid(),
  "name"            text                     not null,
  "normalized_name" text                     not null,
  "domain"          text,
  "website_url"     text,
  "description"     text,
  "sector"          text,
  "created_by"      uuid,
  "created_at"      timestamp with time zone not null default now(),
  "updated_at"      timestamp with time zone not null default now(),
  constraint "outreach_companies_domain_check" check (((domain IS NULL) OR (domain = lower(btrim(domain))))),
  constraint "outreach_companies_name_check" check ((length(btrim(name)) > 0)),
  constraint "outreach_companies_normalized_name_check" check ((normalized_name = lower(btrim(normalized_name)))),
  constraint "outreach_companies_pkey" primary key (id)
);

alter table "public"."outreach_companies"
  enable row level security;

create table "public"."outreach_contact_companies" (
  "id"         uuid                     not null default gen_random_uuid(),
  "contact_id" uuid                     not null,
  "company_id" uuid                     not null,
  "title"      text,
  "started_on" date,
  "ended_on"   date,
  "is_primary" boolean                  not null default false,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "outreach_contact_companies_check" check (((ended_on IS NULL) OR (started_on IS NULL) OR (ended_on >= started_on))),
  constraint "outreach_contact_companies_pkey" primary key (id)
);

alter table "public"."outreach_contact_companies"
  enable row level security;

create table "public"."outreach_contacts" (
  "id"                     uuid                     not null default gen_random_uuid(),
  "full_name"              text                     not null,
  "email"                  text,
  "linkedin_url"           text,
  "canonical_linkedin_url" text,
  "phone"                  text,
  "biography"              text,
  "expertise_tags"         text[]                   not null default '{}'::text[],
  "notes"                  text,
  "created_by"             uuid,
  "created_at"             timestamp with time zone not null default now(),
  "updated_at"             timestamp with time zone not null default now(),
  "relationship_types"     text[]                   not null default '{}'::text[],
  "background_notes"       text,
  constraint "outreach_contacts_canonical_linkedin_url_check" check (((canonical_linkedin_url IS NULL) OR (length(btrim(canonical_linkedin_url)) > 0))),
  constraint "outreach_contacts_email_check" check (((email IS NULL) OR (email = lower(btrim(email))))),
  constraint "outreach_contacts_full_name_check" check ((length(btrim(full_name)) > 0)),
  constraint "outreach_contacts_pkey" primary key (id)
);

alter table "public"."outreach_contacts"
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

create table "public"."outreach_opportunities" (
  "id"                          uuid                     not null default gen_random_uuid(),
  "semester_id"                 uuid                     not null,
  "contact_id"                  uuid                     not null,
  "owner_profile_id"            uuid,
  "cadence_days"                smallint                 not null default 7,
  "next_follow_up_at"           timestamp with time zone,
  "snoozed_until"               timestamp with time zone,
  "is_silenced"                 boolean                  not null default false,
  "silenced_at"                 timestamp with time zone,
  "silenced_by"                 uuid,
  "silence_reason"              text,
  "latest_inbound_activity_at"  timestamp with time zone,
  "latest_outbound_activity_at" timestamp with time zone,
  "referred_by"                 text,
  "priority"                    smallint                 not null default 50,
  "created_by"                  uuid,
  "created_at"                  timestamp with time zone not null default now(),
  "updated_at"                  timestamp with time zone not null default now(),
  "stage"                       text                     not null default 'not_contacted'::text,
  "relationship_types"          text[]                   not null default '{}'::text[],
  "semester_notes"              text,
  "source_context"              jsonb                    not null default '{}'::jsonb,
  constraint "outreach_opportunities_cadence_days_check" check (((cadence_days >= 1) AND (cadence_days <= 365))),
  constraint "outreach_opportunities_check" check (((is_silenced AND (silenced_at IS NOT NULL) AND (silenced_by IS NOT NULL) AND (silence_reason IS
    NOT NULL) AND (length(btrim(silence_reason)) > 0)) OR ((NOT is_silenced) AND (silenced_at IS NULL) AND (silenced_by IS NULL) AND (silence_reason IS NULL)))),
  constraint "outreach_opportunities_pkey" primary key (id),
  constraint "outreach_opportunities_priority_check" check (((priority >= 0) AND (priority <= 100))),
  constraint "outreach_opportunities_relationship_types_check" check ((cardinality(relationship_types) > 0)),
  constraint "outreach_opportunities_semester_id_id_key" unique (semester_id, id),
  constraint "outreach_opportunities_stage_check"
    check
    ((stage = ANY (ARRAY['not_contacted'::text, 'researching'::text, 'contacted'::text, 'replied'::text, 'conversation_scheduled'::text, 'ready'::text, 'declined'::text,
    'closed'::text])))
);

alter table "public"."outreach_opportunities"
  enable row level security;

create table "public"."platform_roles" (
  "profile_id" uuid                     not null,
  "granted_by" uuid,
  "granted_at" timestamp with time zone not null default now()
);

alter table "public"."platform_roles"
  enable row level security;

create table "public"."profiles" (
  "id"           uuid                     not null,
  "email"        text                     not null,
  "semester_id"  uuid,
  "created_at"   timestamp with time zone not null default now(),
  "updated_at"   timestamp with time zone not null default now(),
  "full_name"    text,
  "status"       text                     not null default 'pending'::text,
  "is_active"    boolean                  not null default true,
  "auth_user_id" uuid,
  constraint "profiles_pkey" primary key (id),
  constraint "profiles_status_check" check ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

alter table "public"."profiles"
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

create table "public"."semester_memberships" (
  "id"                      uuid                     not null default gen_random_uuid(),
  "semester_id"             uuid                     not null,
  "profile_id"              uuid                     not null,
  "invited_at"              timestamp with time zone,
  "activated_at"            timestamp with time zone,
  "alumni_at"               timestamp with time zone,
  "suspended_at"            timestamp with time zone,
  "created_at"              timestamp with time zone not null default now(),
  "updated_at"              timestamp with time zone not null default now(),
  "onboarding_data"         jsonb                    not null default '{}'::jsonb,
  "onboarding_started_at"   timestamp with time zone,
  "onboarding_completed_at" timestamp with time zone,
  constraint "semester_memberships_pkey" primary key (id),
  constraint "semester_memberships_semester_id_id_key" unique (semester_id, id),
  constraint "semester_memberships_semester_profile_key" unique (semester_id, profile_id)
);

alter table "public"."semester_memberships"
  enable row level security;

create table "public"."semesters" (
  "id"                             uuid                     not null default gen_random_uuid(),
  "name"                           text                     not null,
  "start_date"                     date                     not null,
  "end_date"                       date                     not null,
  "is_active"                      boolean                  not null default false,
  "created_at"                     timestamp with time zone not null default now(),
  "configuration"                  jsonb                    not null default '{}'::jsonb,
  "configuration_template_version" integer,
  "closed_at"                      timestamp with time zone,
  "archived_at"                    timestamp with time zone,
  "updated_at"                     timestamp with time zone not null default now(),
  constraint "semesters_pkey" primary key (id)
);

alter table "public"."semesters"
  enable row level security;

create table "public"."sessions" (
  "id"                  uuid                     not null default gen_random_uuid(),
  "semester_id"         uuid                     not null,
  "topic"               text,
  "status"              text                     not null default 'requested'::text,
  "notes"               text,
  "requested_at"        timestamp with time zone not null default now(),
  "confirmed_at"        timestamp with time zone,
  "created_at"          timestamp with time zone not null default now(),
  "updated_at"          timestamp with time zone not null default now(),
  "format"              text,
  "startup_absent"      boolean                  not null default false,
  "substitute_name"     text,
  "meeting_id"          uuid                     not null,
  "mentor_semester_id"  uuid                     not null,
  "startup_semester_id" uuid                     not null,
  "slot"                smallint                 not null,
  "idempotency_key"     text,
  "mentor_id"           uuid,
  "startup_id"          uuid,
  "session_date_id"     uuid,
  "session_date"        date,
  "time_slot"           text,
  "is_confirmed"        boolean,
  constraint "sessions_pkey" primary key (id),
  constraint "sessions_slot_check" check ((slot = ANY (ARRAY[1, 2]))),
  constraint "sessions_status_check" check ((status = ANY (ARRAY['requested'::text, 'confirmed'::text, 'declined'::text, 'cancelled'::text])))
);

alter table "public"."sessions"
  enable row level security;

create table "public"."startup_organizations" (
  "id"                   uuid                     not null default gen_random_uuid(),
  "name"                 text                     not null,
  "slug"                 text                     not null,
  "description"          text,
  "industry"             text,
  "website_url"          text,
  "logo_url"             text,
  "created_at"           timestamp with time zone not null default now(),
  "updated_at"           timestamp with time zone not null default now(),
  "durable_contact_data" jsonb                    not null default '{}'::jsonb,
  constraint "startup_organizations_pkey" primary key (id),
  constraint "startup_organizations_slug_key" unique (slug)
);

alter table "public"."startup_organizations"
  enable row level security;

create table "public"."startup_semesters" (
  "id"                        uuid                     not null default gen_random_uuid(),
  "semester_id"               uuid                     not null,
  "startup_organization_id"   uuid                     not null,
  "company_snapshot"          text,
  "goals"                     text[]                   not null default '{}'::text[],
  "mentorship_needs"          text[]                   not null default '{}'::text[],
  "preferred_expertise_tags"  text[]                   not null default '{}'::text[],
  "readiness_status"          text                     not null default 'not_started'::text,
  "created_at"                timestamp with time zone not null default now(),
  "updated_at"                timestamp with time zone not null default now(),
  "mentor_need_context"       text,
  "mentor_need_no_preference" boolean                  not null default false,
  constraint "startup_semesters_pkey" primary key (id),
  constraint "startup_semesters_readiness_status_check" check ((readiness_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'ready'::text]))),
  constraint "startup_semesters_semester_id_id_key" unique (semester_id, id),
  constraint "startup_semesters_semester_id_startup_organization_id_key" unique (semester_id, startup_organization_id)
);

alter table "public"."startup_semesters"
  enable row level security;

create table "public"."startup_team_memberships" (
  "id"                     uuid                     not null default gen_random_uuid(),
  "semester_id"            uuid                     not null,
  "startup_semester_id"    uuid                     not null,
  "semester_membership_id" uuid                     not null,
  "is_primary_contact"     boolean                  not null default false,
  "created_at"             timestamp with time zone not null default now(),
  constraint "startup_team_memberships_pkey" primary key (id),
  constraint "startup_team_memberships_startup_semester_id_semester_membe_key" unique (startup_semester_id, semester_membership_id)
);

alter table "public"."startup_team_memberships"
  enable row level security;

create type "public"."access_request_status" as enum (
  'pending',
  'approved',
  'rejected',
  'withdrawn'
);

create type "public"."invitation_lifecycle_status" as enum (
  'draft',
  'queued',
  'sent',
  'failed',
  'accepted',
  'expired',
  'revoked'
);

alter table "public"."invitations"
  add column "status" public.invitation_lifecycle_status not null default 'draft'::public.invitation_lifecycle_status;

create type "public"."membership_lifecycle_status" as enum (
  'invited',
  'onboarding',
  'active',
  'alumni',
  'suspended'
);

alter table "public"."semester_memberships"
  add column "status" public.membership_lifecycle_status not null default 'invited'::public.membership_lifecycle_status;

create type "public"."outreach_activity_kind" as enum (
  'email',
  'call',
  'linkedin',
  'meeting',
  'reply',
  'note',
  'stage_change',
  'owner_transfer',
  'owner_release',
  'snooze',
  'silence',
  'unsilence'
);

alter table "public"."outreach_activities"
  add column "activity_kind" public.outreach_activity_kind not null;

create type "public"."outreach_channel" as enum (
  'email',
  'linkedin',
  'warm_intro',
  'referral',
  'event',
  'other'
);

alter table "public"."outreach_activities"
  add column "channel" public.outreach_channel;

alter table "public"."outreach_opportunities"
  add column "source_channel" public.outreach_channel;

create type "public"."outreach_import_match_decision" as enum (
  'create_new',
  'exact_email',
  'exact_linkedin',
  'review_required',
  'merge',
  'exclude'
);

create type "public"."outreach_import_status" as enum (
  'preview',
  'reviewing',
  'ready',
  'committing',
  'committed',
  'failed',
  'rolled_back'
);

create type "public"."outreach_stage" as enum (
  'prospect',
  'researching',
  'ready',
  'contacted',
  'responded',
  'meeting',
  'nurture',
  'converted',
  'closed',
  'not_contacted',
  'replied',
  'conversation_scheduled',
  'declined'
);

create type "public"."outreach_status" as enum (
  'prospect',
  'contacted',
  'responded',
  'onboarded'
);

create type "public"."platform_role" as enum (
  'super_admin'
);

alter table "public"."platform_roles"
  add column "role" public.platform_role not null;

create type "public"."semester_lifecycle_status" as enum (
  'draft',
  'active',
  'closed',
  'archived'
);

alter table "public"."semesters"
  add column "lifecycle_status" public.semester_lifecycle_status not null default 'draft'::public.semester_lifecycle_status;

create type "public"."session_status" as enum (
  'pending',
  'confirmed',
  'declined',
  'requested',
  'cancelled'
);

create type "public"."startup_stage" as enum (
  'idea',
  'mvp',
  'growth'
);

alter table "public"."startup_semesters"
  add column "stage" public.startup_stage;

create type "public"."user_role" as enum (
  'mentor',
  'startup',
  'admin'
);

alter table "public"."invitations"
  add column "role" public.user_role not null;

alter table "public"."profiles"
  add column "role" public.user_role not null;

alter table "public"."semester_memberships"
  add column "role" public.user_role not null;

create or replace function public.activate_semester_transition (
  p_source_semester_id uuid,
  p_target_semester_id uuid
)
  returns table (
    closed_semester_id uuid,
    active_semester_id uuid,
    alumni_count       integer
  )
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_alumni_count integer;
begin
  if p_source_semester_id=p_target_semester_id then raise exception 'Source and target semesters must differ' using errcode='22023'; end if;
  if auth.uid() is null or not public.can_manage_semester(p_source_semester_id,auth.uid()) or not public.can_manage_semester(p_target_semester_id,auth.uid()) then raise exception 'Semester administrator access required for both semesters' using errcode='42501'; end if;
  if not exists(select 1 from public.semesters where id=p_source_semester_id and is_active) or not exists(select 1 from public.semesters where id=p_target_semester_id and lifecycle_status='draft') then raise exception 'Transition requires an active source and draft target semester' using errcode='22023'; end if;
  update public.semester_memberships set status='alumni',alumni_at=now(),updated_at=now() where semester_id=p_source_semester_id and role<>'admin' and status in('onboarding','active');
  get diagnostics v_alumni_count=row_count;
  update public.semesters set is_active=false,lifecycle_status='closed',closed_at=now(),updated_at=now() where id=p_source_semester_id;
  update public.semesters set is_active=true,lifecycle_status='active',closed_at=null,updated_at=now() where id=p_target_semester_id;
  insert into public.program_audit_events(semester_id,actor_profile_id,action,subject_type,subject_id,details) values
    (p_source_semester_id,auth.uid(),'semester.closed','semester',p_source_semester_id,jsonb_build_object('next_semester_id',p_target_semester_id,'alumni_count',v_alumni_count)),
    (p_target_semester_id,auth.uid(),'semester.activated','semester',p_target_semester_id,jsonb_build_object('previous_semester_id',p_source_semester_id));
  return query select p_source_semester_id,p_target_semester_id,v_alumni_count;
end;
$function$;

create or replace function public.bulk_set_membership_activity (
  p_semester_id    uuid,
  p_membership_ids uuid[],
  p_is_active      boolean
)
  returns integer
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
declare
  v_requested_count integer;
  v_matching_count integer;
  v_updated_count integer;
  v_status public.membership_lifecycle_status;
begin
  if auth.uid() is null or not public.can_manage_semester(p_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;

  v_requested_count := coalesce(cardinality(p_membership_ids), 0);
  if v_requested_count < 1 or v_requested_count > 200 then
    raise exception 'Between 1 and 200 membership ids are required' using errcode = '22023';
  end if;

  select count(*)
  into v_matching_count
  from public.semester_memberships as target
  where target.semester_id = p_semester_id
    and target.id = any(p_membership_ids);

  if v_matching_count <> v_requested_count then
    raise exception 'Every selected membership must belong to the target semester' using errcode = '22023';
  end if;

  v_status := case when p_is_active then 'active' else 'suspended' end;
  update public.semester_memberships as target
  set status = v_status,
      activated_at = case when p_is_active then coalesce(target.activated_at, now()) else target.activated_at end,
      suspended_at = case when p_is_active then null else now() end,
      updated_at = now()
  where target.semester_id = p_semester_id
    and target.id = any(p_membership_ids);
  get diagnostics v_updated_count = row_count;

  insert into public.lifecycle_audit_events (
    semester_id, actor_profile_id, action, subject_type, subject_id, details
  )
  select p_semester_id,
         auth.uid(),
         case when p_is_active then 'membership.activated' else 'membership.suspended' end,
         'semester_membership',
         membership_id,
         jsonb_build_object('bulk', true, 'status', v_status)
  from unnest(p_membership_ids) as membership_id;

  return v_updated_count;
end;
$function$;

create or replace function public.can_manage_any_outreach (
  candidate_id uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
  select exists (
    select 1
    from public.semesters
    where public.can_manage_semester(public.semesters.id, candidate_id)
  );
$function$;

create or replace function public.can_manage_semester (
  target_semester_id uuid,
  candidate_id       uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
  select public.is_super_admin(candidate_id)
    or exists (
      select 1
      from public.semester_memberships
      where semester_id = target_semester_id
        and profile_id = candidate_id
        and role = 'admin'
        and status in ('onboarding', 'active')
    );
$function$;

create or replace function public.can_read_outreach_relationship_labels (
  candidate_id uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
  select public.is_super_admin(candidate_id)
    or exists (
      select 1
      from public.semester_memberships
      where public.semester_memberships.profile_id = candidate_id
        and public.semester_memberships.role = 'admin'
        and public.semester_memberships.status = 'active'
    );
$function$;

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

create or replace function public.commit_legacy_outreach_migration (
  p_semester_id     uuid,
  p_idempotency_key text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_key text := nullif(pg_catalog.btrim(p_idempotency_key), '');
  v_job public.outreach_import_jobs%rowtype;
  v_job_count integer;
  v_row public.outreach_import_rows%rowtype;
  v_payload jsonb;
  v_legacy jsonb;
  v_contact_id uuid;
  v_company_id uuid;
  v_opportunity_id uuid;
  v_converted_profile_id uuid;
  v_legacy_mentor_id uuid;
  v_existing_opportunity boolean;
  v_company_name text;
  v_company_normalized text;
  v_stage public.outreach_stage;
  v_source_channel public.outreach_channel;
  v_last_contacted_at timestamptz;
  v_label_slug text;
  v_label_id uuid;
  v_activity public.outreach_activity_log%rowtype;
  v_activity_kind public.outreach_activity_kind;
  v_activity_actor_id uuid;
  v_activity_summary text;
  v_summary jsonb;
  v_committed_rows integer := 0;
  v_created_contacts integer := 0;
  v_created_opportunities integer := 0;
  v_merged_opportunities integer := 0;
  v_replayed_activities integer := 0;
  v_conversion_issues integer := 0;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if p_semester_id is null then
    raise exception 'Semester is required' using errcode = '22023';
  end if;

  if v_key is null then
    raise exception 'Idempotency key is required' using errcode = '22023';
  end if;

  if not public.can_manage_semester(p_semester_id, v_actor_id) then
    raise exception 'Not authorized to manage this semester' using errcode = '42501';
  end if;

  -- Serialize commits for one semester so preview selection and idempotency
  -- checks cannot race another legacy commit.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('legacy-outreach:' || p_semester_id::text, 0)
  );

  select pg_catalog.count(*)
  into v_job_count
  from public.outreach_import_jobs as candidate
  where candidate.semester_id = p_semester_id
    and candidate.source = 'legacy'
    and candidate.status in ('preview', 'reviewing', 'ready', 'committing', 'committed');

  if v_job_count <> 1 then
    raise exception 'Exactly one reviewed legacy migration preview is required before committing it'
      using errcode = 'P0002';
  end if;

  select candidate.*
  into v_job
  from public.outreach_import_jobs as candidate
  where candidate.semester_id = p_semester_id
    and candidate.source = 'legacy'
    and candidate.status in ('preview', 'reviewing', 'ready', 'committing', 'committed')
  for update;

  if v_job.idempotency_key is not null and v_job.idempotency_key <> v_key then
    raise exception 'Legacy migration preview is already bound to another idempotency key'
      using errcode = '23505';
  end if;

  if v_job.status = 'committed' then
    return pg_catalog.jsonb_build_object(
      'importId', v_job.id,
      'status', 'committed',
      'summary', v_job.summary
    );
  end if;

  update public.outreach_import_jobs
  set status = 'committing',
      idempotency_key = v_key,
      updated_at = pg_catalog.now(),
      last_error = null
  where id = v_job.id;

  for v_row in
    select staged.*
    from public.outreach_import_rows as staged
    where staged.import_job_id = v_job.id
      and staged.semester_id = p_semester_id
      and staged.selected
      and not staged.excluded
    order by staged.row_number, staged.id
    for update
  loop
    v_payload := coalesce(v_row.normalized_payload, '{}'::jsonb);
    v_legacy := coalesce(v_payload -> 'legacy', '{}'::jsonb);
    v_contact_id := v_row.matched_contact_id;
    v_company_id := v_row.matched_company_id;
    v_opportunity_id := null;
    v_converted_profile_id := null;
    v_existing_opportunity := false;
    v_legacy_mentor_id := null;

    if v_contact_id is not null and not exists (
      select 1 from public.outreach_contacts where id = v_contact_id
    ) then
      raise exception 'Matched contact for import row % does not exist', v_row.row_number
        using errcode = '23503';
    end if;

    if v_contact_id is null then
      insert into public.outreach_contacts (
        full_name,
        email,
        linkedin_url,
        canonical_linkedin_url,
        expertise_tags,
        created_by
      ) values (
        coalesce(nullif(pg_catalog.btrim(v_payload ->> 'fullName'), ''), 'Unnamed contact'),
        nullif(pg_catalog.lower(pg_catalog.btrim(v_payload ->> 'email')), ''),
        nullif(pg_catalog.btrim(v_payload ->> 'linkedinUrl'), ''),
        nullif(pg_catalog.btrim(v_payload ->> 'linkedinUrl'), ''),
        case
          when pg_catalog.jsonb_typeof(v_legacy -> 'expertiseTags') = 'array' then
            array(select pg_catalog.jsonb_array_elements_text(v_legacy -> 'expertiseTags'))
          else '{}'::text[]
        end,
        v_actor_id
      )
      returning id into v_contact_id;
      v_created_contacts := v_created_contacts + 1;
    else
      update public.outreach_contacts as contact
      set expertise_tags = (
            select coalesce(pg_catalog.array_agg(distinct tag), '{}'::text[])
            from pg_catalog.unnest(
              contact.expertise_tags || case
                when pg_catalog.jsonb_typeof(v_legacy -> 'expertiseTags') = 'array' then
                  array(select pg_catalog.jsonb_array_elements_text(v_legacy -> 'expertiseTags'))
                else '{}'::text[]
              end
            ) as tag
          ),
          updated_at = pg_catalog.now()
      where contact.id = v_contact_id;
    end if;

    v_company_name := nullif(pg_catalog.btrim(v_payload ->> 'company'), '');
    if v_company_id is not null and not exists (
      select 1 from public.outreach_companies where id = v_company_id
    ) then
      raise exception 'Matched company for import row % does not exist', v_row.row_number
        using errcode = '23503';
    end if;

    if v_company_id is null and v_company_name is not null then
      v_company_normalized := pg_catalog.btrim(
        pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(
            pg_catalog.lower(v_company_name),
            '\m(incorporated|inc|llc|ltd|limited|corp|corporation|co)\M\.?',
            '',
            'g'
          ),
          '[^[:alnum:]]+',
          ' ',
          'g'
        )
      );

      select company.id
      into v_company_id
      from public.outreach_companies as company
      where company.normalized_name = v_company_normalized
      order by company.id
      limit 1;

      if v_company_id is null then
        insert into public.outreach_companies (name, normalized_name, domain, created_by)
        values (
          v_company_name,
          v_company_normalized,
          nullif(pg_catalog.lower(pg_catalog.btrim(v_payload ->> 'companyDomain')), ''),
          v_actor_id
        )
        returning id into v_company_id;
      end if;
    end if;

    if v_company_id is not null and not exists (
      select 1
      from public.outreach_contact_companies as link
      where link.contact_id = v_contact_id
        and link.company_id = v_company_id
        and link.ended_on is null
    ) then
      insert into public.outreach_contact_companies (
        contact_id,
        company_id,
        is_primary
      ) values (
        v_contact_id,
        v_company_id,
        not exists (
          select 1
          from public.outreach_contact_companies as current_link
          where current_link.contact_id = v_contact_id
            and current_link.is_primary
            and current_link.ended_on is null
        )
      );
    end if;

    v_stage := coalesce(
      nullif(v_payload ->> 'stage', '')::public.outreach_stage,
      'prospect'::public.outreach_stage
    );
    v_source_channel := case pg_catalog.lower(pg_catalog.replace(v_legacy ->> 'sourceChannel', ' ', '_'))
      when 'email' then 'email'::public.outreach_channel
      when 'linkedin' then 'linkedin'::public.outreach_channel
      when 'warm_intro' then 'warm_intro'::public.outreach_channel
      when 'referral' then 'referral'::public.outreach_channel
      when 'event' then 'event'::public.outreach_channel
      when 'other' then 'other'::public.outreach_channel
      else null
    end;
    v_last_contacted_at := nullif(v_legacy ->> 'lastContactedAt', '')::timestamptz;

    begin
      v_legacy_mentor_id := nullif(
        v_legacy #>> '{conversionDetails,legacyConvertedMentorId}',
        ''
      )::uuid;
    exception when invalid_text_representation then
      v_legacy_mentor_id := null;
    end;

    if v_legacy_mentor_id is not null then
      select mentor.user_id
      into v_converted_profile_id
      from public.mentors as mentor
      join public.mentor_profiles as mentor_profile
        on mentor_profile.profile_id = mentor.user_id
      where mentor.id = v_legacy_mentor_id
      limit 1;

      if v_converted_profile_id is null then
        v_conversion_issues := v_conversion_issues + 1;
        update public.outreach_import_rows as issue_row
        set issue_codes = case
              when 'converted_mentor_unresolved' = any(issue_row.issue_codes) then issue_row.issue_codes
              else pg_catalog.array_append(issue_row.issue_codes, 'converted_mentor_unresolved')
            end,
            updated_at = pg_catalog.now()
        where issue_row.id = v_row.id;
      end if;
    elsif nullif(
      v_legacy #>> '{conversionDetails,legacyConvertedMentorId}',
      ''
    ) is not null then
      v_conversion_issues := v_conversion_issues + 1;
      update public.outreach_import_rows as issue_row
      set issue_codes = case
            when 'converted_mentor_unresolved' = any(issue_row.issue_codes) then issue_row.issue_codes
            else pg_catalog.array_append(issue_row.issue_codes, 'converted_mentor_unresolved')
          end,
          updated_at = pg_catalog.now()
      where issue_row.id = v_row.id;
    end if;

    select opportunity.id
    into v_opportunity_id
    from public.outreach_opportunities as opportunity
    where opportunity.semester_id = p_semester_id
      and opportunity.contact_id = v_contact_id
      and opportunity.stage not in ('converted', 'closed')
    for update;

    v_existing_opportunity := v_opportunity_id is not null;
    if v_existing_opportunity then
      update public.outreach_opportunities as opportunity
      set owner_profile_id = coalesce(
            opportunity.owner_profile_id,
            nullif(v_payload ->> 'ownerId', '')::uuid
          ),
          stage = case
            when v_stage in ('converted', 'closed') then v_stage
            else opportunity.stage
          end,
          notes = case
            when nullif(pg_catalog.btrim(v_legacy ->> 'notes'), '') is null then opportunity.notes
            when opportunity.notes is null then pg_catalog.btrim(v_legacy ->> 'notes')
            when pg_catalog.strpos(opportunity.notes, pg_catalog.btrim(v_legacy ->> 'notes')) > 0 then opportunity.notes
            else opportunity.notes || E'\n\n' || pg_catalog.btrim(v_legacy ->> 'notes')
          end,
          source_channel = coalesce(opportunity.source_channel, v_source_channel),
          referred_by = coalesce(
            opportunity.referred_by,
            nullif(pg_catalog.btrim(v_legacy ->> 'referredBy'), '')
          ),
          converted_mentor_profile_id = coalesce(
            opportunity.converted_mentor_profile_id,
            v_converted_profile_id
          ),
          conversion_details = opportunity.conversion_details
            || coalesce(v_legacy -> 'conversionDetails', '{}'::jsonb)
            || pg_catalog.jsonb_build_object(
              'legacyImportJobId', v_job.id,
              'legacyImportRowId', v_row.id
            ),
          latest_outbound_activity_at = greatest(
            opportunity.latest_outbound_activity_at,
            v_last_contacted_at
          ),
          next_follow_up_at = case
            when v_last_contacted_at is not null
              and (
                opportunity.latest_outbound_activity_at is null
                or v_last_contacted_at >= opportunity.latest_outbound_activity_at
              )
              then v_last_contacted_at + pg_catalog.make_interval(days => opportunity.cadence_days)
            else opportunity.next_follow_up_at
          end,
          updated_at = pg_catalog.now()
      where opportunity.id = v_opportunity_id;
      v_merged_opportunities := v_merged_opportunities + 1;
    else
      insert into public.outreach_opportunities (
        semester_id,
        contact_id,
        owner_profile_id,
        stage,
        next_follow_up_at,
        latest_outbound_activity_at,
        source_channel,
        referred_by,
        notes,
        converted_mentor_profile_id,
        conversion_details,
        source_import_job_id,
        created_by
      ) values (
        p_semester_id,
        v_contact_id,
        nullif(v_payload ->> 'ownerId', '')::uuid,
        v_stage,
        case when v_last_contacted_at is null then null
          else v_last_contacted_at + pg_catalog.make_interval(days => 7)
        end,
        v_last_contacted_at,
        v_source_channel,
        nullif(pg_catalog.btrim(v_legacy ->> 'referredBy'), ''),
        nullif(pg_catalog.btrim(v_legacy ->> 'notes'), ''),
        v_converted_profile_id,
        coalesce(v_legacy -> 'conversionDetails', '{}'::jsonb)
          || pg_catalog.jsonb_build_object(
            'legacyImportJobId', v_job.id,
            'legacyImportRowId', v_row.id
          ),
        v_job.id,
        v_actor_id
      )
      returning id into v_opportunity_id;
      v_created_opportunities := v_created_opportunities + 1;
    end if;

    if pg_catalog.jsonb_typeof(v_payload -> 'relationshipLabels') = 'array' then
      for v_label_slug in
        select pg_catalog.jsonb_array_elements_text(v_payload -> 'relationshipLabels')
      loop
        select label.id
        into v_label_id
        from public.outreach_relationship_labels as label
        where label.slug = pg_catalog.lower(pg_catalog.btrim(v_label_slug));

        if v_label_id is not null then
          insert into public.outreach_opportunity_labels (
            semester_id,
            opportunity_id,
            relationship_label_id,
            added_by
          ) values (
            p_semester_id,
            v_opportunity_id,
            v_label_id,
            v_actor_id
          )
          on conflict (opportunity_id, relationship_label_id) do nothing;
        end if;
      end loop;
    end if;

    if v_last_contacted_at is not null then
      insert into public.outreach_activities (
        semester_id,
        opportunity_id,
        actor_profile_id,
        activity_kind,
        channel,
        occurred_at,
        summary,
        details,
        import_job_id
      ) values (
        p_semester_id,
        v_opportunity_id,
        v_actor_id,
        'email',
        coalesce(v_source_channel, 'other'::public.outreach_channel),
        v_last_contacted_at,
        'Legacy last-contacted timestamp',
        pg_catalog.jsonb_build_object(
          'legacy', pg_catalog.jsonb_build_object(
            'outreachId', v_row.raw_payload ->> 'id',
            'source', 'outreach.last_contacted_at'
          )
        ),
        v_job.id
      );
      v_replayed_activities := v_replayed_activities + 1;
    end if;

    for v_activity in
      select legacy_activity.*
      from public.outreach_activity_log as legacy_activity
      where legacy_activity.outreach_id::text = v_row.raw_payload ->> 'id'
        and legacy_activity.semester_id = p_semester_id
      order by legacy_activity.created_at, legacy_activity.id
    loop
      v_activity_kind := case v_activity.action_type
        when 'note_added' then 'note'::public.outreach_activity_kind
        when 'status_changed' then 'stage_change'::public.outreach_activity_kind
        else 'note'::public.outreach_activity_kind
      end;
      v_activity_summary := case v_activity.action_type
        when 'note_added' then nullif(pg_catalog.btrim(v_activity.detail ->> 'text'), '')
        when 'status_changed' then 'Legacy status changed'
        else 'Legacy activity: ' || v_activity.action_type
      end;
      select profile.id
      into v_activity_actor_id
      from public.profiles as profile
      where profile.id = v_activity.admin_id;

      insert into public.outreach_activities (
        semester_id,
        opportunity_id,
        actor_profile_id,
        activity_kind,
        occurred_at,
        summary,
        details,
        import_job_id
      ) values (
        p_semester_id,
        v_opportunity_id,
        v_activity_actor_id,
        v_activity_kind,
        v_activity.created_at,
        v_activity_summary,
        pg_catalog.jsonb_build_object(
          'legacy', pg_catalog.to_jsonb(v_activity),
          'importedByProfileId', v_actor_id
        ),
        v_job.id
      );
      v_replayed_activities := v_replayed_activities + 1;
    end loop;

    update public.outreach_import_rows
    set committed_opportunity_id = v_opportunity_id,
        match_decision = case
          when v_existing_opportunity then 'merge'::public.outreach_import_match_decision
          else match_decision
        end,
        updated_at = pg_catalog.now()
    where id = v_row.id;

    v_committed_rows := v_committed_rows + 1;
  end loop;

  v_summary := v_job.summary || pg_catalog.jsonb_build_object(
    'committedRows', v_committed_rows,
    'createdContacts', v_created_contacts,
    'createdOpportunities', v_created_opportunities,
    'mergedOpportunities', v_merged_opportunities,
    'replayedActivities', v_replayed_activities,
    'conversionIssues', v_conversion_issues
  );

  update public.outreach_import_jobs
  set status = 'committed',
      idempotency_key = v_key,
      committed_by = v_actor_id,
      committed_at = pg_catalog.now(),
      summary = v_summary,
      last_error = null,
      updated_at = pg_catalog.now()
  where id = v_job.id;

  return pg_catalog.jsonb_build_object(
    'importId', v_job.id,
    'status', 'committed',
    'summary', v_summary
  );
end;
$function$;

create or replace function public.commit_mentor_assignment (
  p_semester_id         uuid,
  p_session_date_id     uuid,
  p_time_slot           text,
  p_startup_semester_id uuid,
  p_mentor_profile_id   uuid,
  p_idempotency_key     text,
  p_format              text   default 'online'::text,
  p_topic               text   default null::text,
  p_override_types      text[] default '{}'::text[],
  p_override_reason     text   default null::text,
  p_ranking_context     jsonb  default '{}'::jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_session_id uuid; v_mentor_semester_id uuid; v_slot integer;
begin
  if auth.uid() is null or not public.can_manage_semester(p_semester_id, auth.uid()) then raise exception 'Semester administrator access required' using errcode = '42501'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required' using errcode = '22023'; end if;
  v_slot := case p_time_slot when '3:30-4:15' then 1 when '4:15-5:00' then 2 else null end;
  if v_slot is null then raise exception 'Unsupported assignment time slot' using errcode = '22023'; end if;
  select term.id into v_mentor_semester_id
  from public.mentor_semesters term join public.semester_memberships membership on membership.id = term.semester_membership_id
  where term.semester_id = p_semester_id and (term.id = p_mentor_profile_id or membership.profile_id = p_mentor_profile_id)
    and membership.status = 'active' limit 1;
  if v_mentor_semester_id is null then raise exception 'Mentor must be active in the target semester' using errcode = '22023'; end if;
  select id into v_session_id from public.sessions where semester_id = p_semester_id and idempotency_key = p_idempotency_key;
  if v_session_id is not null then return jsonb_build_object('sessionId', v_session_id, 'replayed', true); end if;
  insert into public.sessions(semester_id, meeting_id, mentor_semester_id, startup_semester_id, slot, status, format, topic, notes, idempotency_key)
  values(p_semester_id, p_session_date_id, v_mentor_semester_id, p_startup_semester_id, v_slot, 'confirmed', p_format, p_topic,
    case when cardinality(p_override_types) > 0 then concat('Assignment override: ', p_override_reason) end, p_idempotency_key)
  returning id into v_session_id;
  insert into public.program_audit_events(semester_id, actor_profile_id, action, subject_type, subject_id, details)
  values(p_semester_id, auth.uid(), 'session.assigned', 'session', v_session_id, jsonb_build_object('override_types', p_override_types, 'ranking_context', p_ranking_context));
  return jsonb_build_object('sessionId', v_session_id, 'replayed', false);
end;
$function$;

create or replace function public.create_semester_draft (
  p_source_semester_id uuid,
  p_name               text,
  p_start_date         date,
  p_end_date           date,
  p_configuration      jsonb
)
  returns table (
    semester_id   uuid,
    semester_name text
  )
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_semester_id uuid;
begin
  if auth.uid() is null or not public.can_manage_semester(p_source_semester_id, auth.uid()) then raise exception 'Semester administrator access required' using errcode = '42501'; end if;
  if nullif(trim(p_name), '') is null or p_end_date <= p_start_date then raise exception 'Valid semester name and date range are required' using errcode = '22023'; end if;
  insert into public.semesters(name,start_date,end_date,is_active,lifecycle_status,configuration) values(trim(p_name),p_start_date,p_end_date,false,'draft',coalesce(p_configuration,'{}')) returning id into v_semester_id;
  insert into public.semester_memberships(semester_id,profile_id,role,status,activated_at) values(v_semester_id,auth.uid(),'admin','active',now());
  insert into public.program_audit_events(semester_id,actor_profile_id,action,subject_type,subject_id,details) values(v_semester_id,auth.uid(),'semester.draft_created','semester',v_semester_id,jsonb_build_object('source_semester_id',p_source_semester_id));
  return query select v_semester_id, trim(p_name);
end;
$function$;

create or replace function public.get_my_role()
  returns public.user_role
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$function$;

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
begin
  insert into public.profiles (id, email, role, status, full_name)
  values (
    new.id,
    lower(new.email),
    'startup'::public.user_role,
    'pending',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        updated_at = now();
  return new;
end;
$function$;

create or replace function public.has_outreach_company_access (
  target_company_id uuid,
  candidate_id      uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
  select exists (
    select 1
    from public.outreach_contact_companies
    join public.outreach_opportunities
      on public.outreach_opportunities.contact_id = public.outreach_contact_companies.contact_id
    where public.outreach_contact_companies.company_id = target_company_id
      and public.can_manage_semester(public.outreach_opportunities.semester_id, candidate_id)
  );
$function$;

create or replace function public.has_outreach_contact_access (
  target_contact_id uuid,
  candidate_id      uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
  select exists (
    select 1
    from public.outreach_opportunities
    where public.outreach_opportunities.contact_id = target_contact_id
      and public.can_manage_semester(public.outreach_opportunities.semester_id, candidate_id)
  );
$function$;

create or replace function public.has_semester_role (
  target_semester_id uuid,
  allowed_roles      public.user_role[],
  candidate_id       uuid               default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
  select exists (
    select 1
    from public.semester_memberships
    where semester_id = target_semester_id
      and profile_id = candidate_id
      and role = any(allowed_roles)
      and status in ('onboarding', 'active', 'alumni')
  );
$function$;

create or replace function public.import_prior_semester_memberships (
  p_source_semester_id uuid,
  p_target_semester_id uuid,
  p_membership_ids     uuid[] default null::uuid[]
)
  returns table (
    source_count   integer,
    imported_count integer,
    skipped_count  integer
  )
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_source_count integer; v_before integer; v_after integer;
begin
  if auth.uid() is null or not public.can_manage_semester(p_source_semester_id,auth.uid()) or not public.can_manage_semester(p_target_semester_id,auth.uid()) then raise exception 'Semester administrator access required for both semesters' using errcode='42501'; end if;
  select count(*) into v_source_count from public.semester_memberships membership where membership.semester_id=p_source_semester_id and (p_membership_ids is null or membership.id=any(p_membership_ids));
  select count(*) into v_before from public.semester_memberships where semester_id=p_target_semester_id;
  insert into public.semester_memberships(semester_id,profile_id,role,status,invited_at,onboarding_data)
  select p_target_semester_id,source.profile_id,source.role,'invited',now(),source.onboarding_data from public.semester_memberships source
  where source.semester_id=p_source_semester_id and (p_membership_ids is null or source.id=any(p_membership_ids))
  on conflict(semester_id,profile_id) do nothing;
  select count(*) into v_after from public.semester_memberships where semester_id=p_target_semester_id;

  insert into public.mentor_semesters(semester_id,semester_membership_id,mentorship_goals,preferred_format,capacity,general_availability,per_week_availability,opening_talk,readiness_status)
  select p_target_semester_id,target.id,source_term.mentorship_goals,source_term.preferred_format,source_term.capacity,source_term.general_availability,source_term.per_week_availability,source_term.opening_talk,'not_started'
  from public.semester_memberships source join public.mentor_semesters source_term on source_term.semester_membership_id=source.id
  join public.semester_memberships target on target.semester_id=p_target_semester_id and target.profile_id=source.profile_id
  where source.semester_id=p_source_semester_id and (p_membership_ids is null or source.id=any(p_membership_ids))
  on conflict(semester_id,semester_membership_id) do nothing;

  insert into public.startup_semesters(semester_id,startup_organization_id,stage,goals,mentorship_needs,preferred_expertise_tags,mentor_need_context,mentor_need_no_preference,readiness_status)
  select distinct p_target_semester_id,source_term.startup_organization_id,source_term.stage,source_term.goals,source_term.mentorship_needs,source_term.preferred_expertise_tags,source_term.mentor_need_context,source_term.mentor_need_no_preference,'not_started'
  from public.semester_memberships source join public.startup_team_memberships source_team on source_team.semester_membership_id=source.id
  join public.startup_semesters source_term on source_term.id=source_team.startup_semester_id
  where source.semester_id=p_source_semester_id and (p_membership_ids is null or source.id=any(p_membership_ids))
  on conflict(semester_id,startup_organization_id) do nothing;

  insert into public.startup_team_memberships(semester_id,semester_membership_id,startup_semester_id,is_primary_contact)
  select p_target_semester_id,target.id,target_term.id,source_team.is_primary_contact
  from public.semester_memberships source join public.startup_team_memberships source_team on source_team.semester_membership_id=source.id
  join public.startup_semesters source_term on source_term.id=source_team.startup_semester_id
  join public.semester_memberships target on target.semester_id=p_target_semester_id and target.profile_id=source.profile_id
  join public.startup_semesters target_term on target_term.semester_id=p_target_semester_id and target_term.startup_organization_id=source_term.startup_organization_id
  where source.semester_id=p_source_semester_id and (p_membership_ids is null or source.id=any(p_membership_ids))
  on conflict do nothing;

  insert into public.program_audit_events(semester_id,actor_profile_id,action,subject_type,details) values(p_target_semester_id,auth.uid(),'membership.imported','semester_membership',jsonb_build_object('source_semester_id',p_source_semester_id,'imported_count',v_after-v_before));
  return query select v_source_count,v_after-v_before,v_source_count-(v_after-v_before);
end;
$function$;

create or replace function public.is_super_admin (
  candidate_id uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
  select exists (
    select 1 from public.platform_roles
    where profile_id = candidate_id and role = 'super_admin'
  );
$function$;

create or replace function public.log_outreach_activity (
  p_opportunity_id      uuid,
  p_activity_kind       public.outreach_activity_kind,
  p_occurred_at         timestamp with time zone      default now(),
  p_channel             public.outreach_channel       default null::public.outreach_channel,
  p_summary             text                          default null::text,
  p_details             jsonb                         default '{}'::jsonb,
  p_next_follow_up_at   timestamp with time zone      default null::timestamp with time zone,
  p_stage               public.outreach_stage         default null::public.outreach_stage,
  p_expected_updated_at timestamp with time zone      default null::timestamp with time zone
)
  returns public.outreach_activities
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_opportunity public.outreach_opportunities%rowtype;
  v_activity public.outreach_activities%rowtype;
  v_next_follow_up_at timestamptz;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if p_activity_kind not in ('email', 'call', 'linkedin', 'meeting', 'reply', 'note') then
    raise exception 'Activity kind % must be recorded by its dedicated command', p_activity_kind
      using errcode = '22023';
  end if;

  select *
  into v_opportunity
  from public.outreach_opportunities
  where public.outreach_opportunities.id = p_opportunity_id
  for update;

  if not found then
    raise exception 'Outreach opportunity not found' using errcode = 'P0002';
  end if;

  if not public.can_manage_semester(v_opportunity.semester_id, v_actor_id) then
    raise exception 'Not authorized to manage this semester' using errcode = '42501';
  end if;

  if p_expected_updated_at is not null and v_opportunity.updated_at <> p_expected_updated_at then
    raise exception 'Outreach opportunity is stale' using errcode = '40001';
  end if;

  if p_activity_kind in ('email', 'call', 'linkedin') and p_channel is null then
    raise exception 'Outbound activities require a channel' using errcode = '23514';
  end if;

  if p_activity_kind in ('email', 'call', 'linkedin') then
    v_next_follow_up_at := coalesce(
      p_next_follow_up_at,
      p_occurred_at + make_interval(days => v_opportunity.cadence_days)
    );

    update public.outreach_opportunities
    set latest_outbound_activity_at = greatest(latest_outbound_activity_at, p_occurred_at),
        next_follow_up_at = case
          when latest_outbound_activity_at is null or p_occurred_at >= latest_outbound_activity_at
            then v_next_follow_up_at
          else next_follow_up_at
        end,
        stage = coalesce(p_stage, stage),
        updated_at = now()
    where public.outreach_opportunities.id = p_opportunity_id;
  elsif p_activity_kind = 'reply' then
    update public.outreach_opportunities
    set latest_inbound_activity_at = greatest(latest_inbound_activity_at, p_occurred_at),
        next_follow_up_at = case
          when latest_inbound_activity_at is null or p_occurred_at >= latest_inbound_activity_at
            then p_next_follow_up_at
          else next_follow_up_at
        end,
        stage = coalesce(p_stage, 'responded'::public.outreach_stage),
        updated_at = now()
    where public.outreach_opportunities.id = p_opportunity_id;
  else
    update public.outreach_opportunities
    set next_follow_up_at = coalesce(p_next_follow_up_at, next_follow_up_at),
        stage = coalesce(p_stage, stage),
        updated_at = now()
    where public.outreach_opportunities.id = p_opportunity_id;
  end if;

  insert into public.outreach_activities (
    semester_id,
    opportunity_id,
    actor_profile_id,
    activity_kind,
    channel,
    occurred_at,
    summary,
    details
  )
  values (
    v_opportunity.semester_id,
    p_opportunity_id,
    v_actor_id,
    p_activity_kind,
    p_channel,
    p_occurred_at,
    p_summary,
    coalesce(p_details, '{}'::jsonb)
  )
  returning * into v_activity;

  return v_activity;
end;
$function$;

create or replace function public.mentors_view_write()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_membership_id uuid; v_profile_id uuid;
begin
  if tg_op = 'UPDATE' then
    select membership.profile_id into v_profile_id from public.mentor_semesters term join public.semester_memberships membership on membership.id=term.semester_membership_id where term.id=old.id;
    update public.profiles set full_name=new.full_name,email=coalesce(new.email,email),updated_at=now() where id=v_profile_id;
    update public.mentor_profiles set company=new.company,title=new.role_title,biography=new.bio,linkedin_url=new.linkedin_url,website_url=new.website_url,photo_url=new.photo_url,expertise_tags=coalesce(new.expertise_tags,'{}'),updated_at=now() where profile_id=v_profile_id;
    update public.mentor_semesters set mentorship_goals=new.mentorship_goals,general_availability=new.general_availability,preferred_format=new.preferred_format,per_week_availability=coalesce(new.per_week_availability,'{}'),opening_talk=new.opening_talk,updated_at=now() where id=old.id;
    update public.semester_memberships set status=case when new.is_active then 'active'::public.membership_lifecycle_status else 'suspended'::public.membership_lifecycle_status end,updated_at=now() where id=(select semester_membership_id from public.mentor_semesters where id=old.id);
    return new;
  elsif tg_op = 'INSERT' then
    v_profile_id := new.user_id;
    insert into public.semester_memberships(semester_id,profile_id,role,status,activated_at) values(new.semester_id,v_profile_id,'mentor',case when coalesce(new.is_active,true) then 'active' else 'suspended' end,case when coalesce(new.is_active,true) then now() end)
      on conflict(semester_id,profile_id) do update set role='mentor',status=excluded.status returning id into v_membership_id;
    insert into public.mentor_profiles(profile_id,company,title,biography,linkedin_url,website_url,photo_url,expertise_tags) values(v_profile_id,new.company,new.role_title,new.bio,new.linkedin_url,new.website_url,new.photo_url,coalesce(new.expertise_tags,'{}')) on conflict(profile_id) do update set company=excluded.company,title=excluded.title,biography=excluded.biography,linkedin_url=excluded.linkedin_url,expertise_tags=excluded.expertise_tags;
    insert into public.mentor_semesters(id,semester_id,semester_membership_id,mentorship_goals,general_availability,preferred_format,per_week_availability,opening_talk,readiness_status) values(coalesce(new.id,gen_random_uuid()),new.semester_id,v_membership_id,new.mentorship_goals,new.general_availability,new.preferred_format,coalesce(new.per_week_availability,'{}'),new.opening_talk,'ready') returning id into new.id;
    return new;
  end if;
  return old;
end;
$function$;

create or replace function public.prevent_outreach_activity_mutation()
  returns trigger
  language plpgsql
  set search_path to 'public'
  AS $function$
begin
  raise exception 'Outreach activities are append-only' using errcode = '55000';
end;
$function$;

create or replace function public.release_inactive_owner_work (
  p_owner_profile_id uuid
)
  returns table (
    opportunity_id uuid
  )
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_candidate record;
  v_released record;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  for v_candidate in
    select
      candidate.id,
      candidate.semester_id
    from public.outreach_opportunities as candidate
    where candidate.owner_profile_id = p_owner_profile_id
      and candidate.stage not in ('converted', 'closed')
      and not exists (
        select 1
        from public.semester_memberships as owner_membership
        where owner_membership.semester_id = candidate.semester_id
          and owner_membership.profile_id = p_owner_profile_id
          and owner_membership.role = 'admin'
          and owner_membership.status = 'active'
      )
    order by candidate.semester_id, candidate.id
    for update of candidate
  loop
    if not public.can_manage_semester(v_candidate.semester_id, v_actor_id) then
      raise exception 'Not authorized to release work in semester %', v_candidate.semester_id
        using errcode = '42501';
    end if;

    update public.outreach_opportunities
    set owner_profile_id = null,
        updated_at = now()
    where public.outreach_opportunities.id = v_candidate.id
      and public.outreach_opportunities.owner_profile_id = p_owner_profile_id
      and public.outreach_opportunities.stage not in ('converted', 'closed')
      and public.can_manage_semester(public.outreach_opportunities.semester_id, v_actor_id)
      and not exists (
        select 1
        from public.semester_memberships as owner_membership
        where owner_membership.semester_id = public.outreach_opportunities.semester_id
          and owner_membership.profile_id = p_owner_profile_id
          and owner_membership.role = 'admin'
          and owner_membership.status = 'active'
      )
    returning public.outreach_opportunities.id, public.outreach_opportunities.semester_id
    into v_released;

    if found then
      insert into public.outreach_activities (
        semester_id,
        opportunity_id,
        actor_profile_id,
        activity_kind,
        summary,
        details,
        previous_owner_profile_id,
        new_owner_profile_id
      )
      values (
        v_released.semester_id,
        v_released.id,
        v_actor_id,
        'owner_release',
        'Owner released during offboarding',
        jsonb_build_object('previous_owner_profile_id', p_owner_profile_id),
        p_owner_profile_id,
        null
      );

      opportunity_id := v_released.id;
      return next;
    end if;
  end loop;
end;
$function$;

create or replace function public.replace_draft_session_dates (
  p_semester_id uuid,
  p_dates       jsonb
)
  returns integer
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_count integer;
begin
  if auth.uid() is null or not public.can_manage_semester(p_semester_id, auth.uid()) then raise exception 'Semester administrator access required' using errcode = '42501'; end if;
  if jsonb_typeof(p_dates) is distinct from 'array' then raise exception 'Meeting dates must be a JSON array' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_to_recordset(p_dates) proposed(date date,label text) where extract(isodow from proposed.date) <> 5) then raise exception 'Every meeting date must be a Friday' using errcode = '22023'; end if;
  delete from public.meetings where semester_id = p_semester_id;
  insert into public.meetings(semester_id,meeting_date,label) select p_semester_id,proposed.date,trim(proposed.label) from jsonb_to_recordset(p_dates) proposed(date date,label text);
  get diagnostics v_count = row_count;
  return v_count;
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

create or replace function public.set_outreach_silence (
  p_opportunity_id      uuid,
  p_is_silenced         boolean,
  p_reason              text                     default null::text,
  p_next_follow_up_at   timestamp with time zone default null::timestamp with time zone,
  p_expected_updated_at timestamp with time zone default null::timestamp with time zone
)
  returns public.outreach_opportunities
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_opportunity public.outreach_opportunities%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select *
  into v_opportunity
  from public.outreach_opportunities
  where public.outreach_opportunities.id = p_opportunity_id
  for update;

  if not found then
    raise exception 'Outreach opportunity not found' using errcode = 'P0002';
  end if;

  if not public.can_manage_semester(v_opportunity.semester_id, v_actor_id) then
    raise exception 'Not authorized to manage this semester' using errcode = '42501';
  end if;

  if p_expected_updated_at is not null and v_opportunity.updated_at <> p_expected_updated_at then
    raise exception 'Outreach opportunity is stale' using errcode = '40001';
  end if;

  if p_is_silenced and (p_reason is null or length(btrim(p_reason)) = 0) then
    raise exception 'Silencing requires a non-empty reason' using errcode = '23514';
  end if;

  if not p_is_silenced and p_next_follow_up_at is null then
    raise exception 'Restoring a silenced opportunity requires a next follow-up'
      using errcode = '23514';

  end if;

  update public.outreach_opportunities
  set is_silenced = p_is_silenced,
      silenced_at = case when p_is_silenced then now() else null end,
      silenced_by = case when p_is_silenced then v_actor_id else null end,
      silence_reason = case when p_is_silenced then btrim(p_reason) else null end,
      next_follow_up_at = case
        when p_is_silenced then next_follow_up_at
        else p_next_follow_up_at
      end,
      snoozed_until = case when p_is_silenced then snoozed_until else null end,
      updated_at = now()
  where public.outreach_opportunities.id = p_opportunity_id
  returning * into v_opportunity;

  insert into public.outreach_activities (
    semester_id,
    opportunity_id,
    actor_profile_id,
    activity_kind,
    summary,
    details
  )
  values (
    v_opportunity.semester_id,
    p_opportunity_id,
    v_actor_id,
    case
      when p_is_silenced then 'silence'::public.outreach_activity_kind
      else 'unsilence'::public.outreach_activity_kind
    end,
    nullif(btrim(p_reason), ''),
    jsonb_build_object(
      'is_silenced', p_is_silenced,
      'next_follow_up_at', p_next_follow_up_at
    )
  );

  return v_opportunity;
end;
$function$;

create or replace function public.set_outreach_snooze (
  p_opportunity_id      uuid,
  p_snoozed_until       timestamp with time zone,
  p_reason              text                     default null::text,
  p_expected_updated_at timestamp with time zone default null::timestamp with time zone
)
  returns public.outreach_opportunities
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_opportunity public.outreach_opportunities%rowtype;
  v_previous_snoozed_until timestamptz;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select *
  into v_opportunity
  from public.outreach_opportunities
  where public.outreach_opportunities.id = p_opportunity_id
  for update;

  if not found then
    raise exception 'Outreach opportunity not found' using errcode = 'P0002';
  end if;

  if not public.can_manage_semester(v_opportunity.semester_id, v_actor_id) then
    raise exception 'Not authorized to manage this semester' using errcode = '42501';
  end if;

  if p_expected_updated_at is not null and v_opportunity.updated_at <> p_expected_updated_at then
    raise exception 'Outreach opportunity is stale' using errcode = '40001';
  end if;

  if p_snoozed_until is not null and p_snoozed_until <= now() then
    raise exception 'Snooze must end in the future' using errcode = '23514';
  end if;

  v_previous_snoozed_until := v_opportunity.snoozed_until;

  update public.outreach_opportunities
  set snoozed_until = p_snoozed_until,
      updated_at = now()
  where public.outreach_opportunities.id = p_opportunity_id
  returning * into v_opportunity;

  insert into public.outreach_activities (
    semester_id,
    opportunity_id,
    actor_profile_id,
    activity_kind,
    summary,
    details
  )
  values (
    v_opportunity.semester_id,
    p_opportunity_id,
    v_actor_id,
    'snooze',
    nullif(btrim(p_reason), ''),
    jsonb_build_object(
      'previous_snoozed_until', v_previous_snoozed_until,
      'snoozed_until', p_snoozed_until
    )
  );

  return v_opportunity;
end;
$function$;

create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.startups_view_write()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_organization_id uuid; v_membership_id uuid;
begin
  if tg_op = 'UPDATE' then
    select startup_organization_id into v_organization_id from public.startup_semesters where id=old.id;
    update public.startup_organizations set name=new.name,description=new.description,industry=new.industry,logo_url=new.logo_url,website_url=new.website,slug=coalesce(new.slug,slug),durable_contact_data=jsonb_set(jsonb_set(durable_contact_data,'{founder_name}',to_jsonb(new.founder_name),true),'{founders}',coalesce(new.founders,'[]'),true),updated_at=now() where id=v_organization_id;
    update public.startup_semesters set stage=new.stage,preferred_expertise_tags=coalesce(new.preferred_tags,'{}'),goals=coalesce(new.semester_goals,'{}'),mentorship_needs=coalesce(new.mentorship_needs,'{}'),readiness_status=case when new.is_active then 'ready' else 'not_started' end,updated_at=now() where id=old.id;
    if new.user_id is not null and new.user_id is distinct from old.user_id then
      insert into public.semester_memberships(semester_id,profile_id,role,status,activated_at) values(new.semester_id,new.user_id,'startup','active',now()) on conflict(semester_id,profile_id) do update set role='startup',status='active' returning id into v_membership_id;
      insert into public.startup_team_memberships(semester_id,semester_membership_id,startup_semester_id,is_primary_contact) values(new.semester_id,v_membership_id,old.id,true) on conflict do nothing;
    end if;
    return new;
  elsif tg_op = 'INSERT' then
    insert into public.startup_organizations(name,description,industry,logo_url,website_url,slug,durable_contact_data) values(new.name,new.description,new.industry,new.logo_url,new.website,new.slug,jsonb_build_object('founder_name',new.founder_name,'founders',coalesce(new.founders,'[]'))) returning id into v_organization_id;
    insert into public.startup_semesters(id,semester_id,startup_organization_id,stage,preferred_expertise_tags,goals,mentorship_needs,readiness_status) values(coalesce(new.id,gen_random_uuid()),new.semester_id,v_organization_id,coalesce(new.stage,'idea'),coalesce(new.preferred_tags,'{}'),coalesce(new.semester_goals,'{}'),coalesce(new.mentorship_needs,'{}'),case when coalesce(new.is_active,true) then 'ready' else 'not_started' end) returning id into new.id;
    return new;
  end if;
  return old;
end;
$function$;

create or replace function public.suspend_outreach_membership (
  p_semester_id         uuid,
  p_profile_id          uuid,
  p_reason              text,
  p_expected_updated_at timestamp with time zone
)
  returns table (
    membership_id            uuid,
    membership_status        public.membership_lifecycle_status,
    membership_updated_at    timestamp with time zone,
    released_opportunity_ids uuid[]
  )
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership public.semester_memberships%rowtype;
  v_now timestamptz := now();
  v_released_opportunity_ids uuid[];
begin
  if v_actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Outreach membership suspension requires a non-empty reason'
      using errcode = '23514';
  end if;

  if not public.can_manage_semester(p_semester_id, v_actor_id) then
    raise exception 'Not authorized to suspend membership in this semester'
      using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'Expected membership updated_at is required'
      using errcode = '22004';
  end if;

  select *
  into v_membership
  from public.semester_memberships as target_membership
  where target_membership.semester_id = p_semester_id
    and target_membership.profile_id = p_profile_id
    and target_membership.role = 'admin'
  for update;

  if not found then
    raise exception 'Semester membership not found' using errcode = 'P0002';
  end if;

  if v_membership.role <> 'admin' or v_membership.status <> 'active' then
    raise exception 'Only active outreach administrator memberships may be suspended'
      using errcode = '23514';
  end if;

  if v_membership.updated_at <> p_expected_updated_at then
    raise exception 'Semester membership is stale' using errcode = '40001';
  end if;

  update public.semester_memberships as target_membership
  set status = 'suspended',
      suspended_at = v_now,
      updated_at = v_now
  where target_membership.id = v_membership.id
    and target_membership.semester_id = p_semester_id
    and target_membership.profile_id = p_profile_id
    and target_membership.role = 'admin'
    and target_membership.status = 'active'
    and target_membership.updated_at = p_expected_updated_at
  returning target_membership.* into v_membership;

  if not found then
    raise exception 'Semester membership is stale' using errcode = '40001';
  end if;

  with released as (
    update public.outreach_opportunities as opportunity
    set owner_profile_id = null,
        updated_at = v_now
    where opportunity.semester_id = p_semester_id
      and opportunity.owner_profile_id = p_profile_id
      and opportunity.stage not in ('converted', 'closed')
    returning opportunity.id, opportunity.semester_id
  ), recorded as (
    insert into public.outreach_activities (
      semester_id,
      opportunity_id,
      actor_profile_id,
      activity_kind,
      summary,
      details,
      previous_owner_profile_id,
      new_owner_profile_id
    )
    select
      released.semester_id,
      released.id,
      v_actor_id,
      'owner_release',
      btrim(p_reason),
      jsonb_build_object(
        'previous_owner_profile_id', p_profile_id,
        'membership_id', v_membership.id,
        'reason', btrim(p_reason)
      ),
      p_profile_id,
      null
    from released
    returning public.outreach_activities.opportunity_id
  )
  select coalesce(
    array_agg(recorded.opportunity_id order by recorded.opportunity_id),
    '{}'::uuid[]
  )
  into v_released_opportunity_ids
  from recorded;

  membership_id := v_membership.id;
  membership_status := v_membership.status;
  membership_updated_at := v_membership.updated_at;
  released_opportunity_ids := v_released_opportunity_ids;
  return next;
end;
$function$;

create or replace function public.sync_session_compatibility_columns()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin
  if tg_op = 'INSERT' then
    new.meeting_id := coalesce(new.meeting_id, new.session_date_id);
    new.mentor_semester_id := coalesce(new.mentor_semester_id, new.mentor_id);
    new.startup_semester_id := coalesce(new.startup_semester_id, new.startup_id);
    new.slot := coalesce(new.slot, case new.time_slot when '3:30-4:15' then 1 when '4:15-5:00' then 2 end);
    if new.status in ('pending', 'requested') then new.status := 'requested'; end if;
    if new.status = 'confirmed' or new.is_confirmed is true then new.status := 'confirmed'; end if;
  else
    if new.mentor_id is distinct from old.mentor_id then new.mentor_semester_id := new.mentor_id; end if;
    if new.startup_id is distinct from old.startup_id then new.startup_semester_id := new.startup_id; end if;
    if new.session_date_id is distinct from old.session_date_id then new.meeting_id := new.session_date_id; end if;
    if new.time_slot is distinct from old.time_slot then new.slot := case new.time_slot when '3:30-4:15' then 1 when '4:15-5:00' then 2 else new.slot end; end if;
    if new.is_confirmed is distinct from old.is_confirmed then new.status := case when new.is_confirmed then 'confirmed' else 'requested' end; end if;
  end if;
  select meeting.semester_id, meeting.meeting_date into new.semester_id, new.session_date from public.meetings meeting where meeting.id = new.meeting_id;
  new.mentor_id := new.mentor_semester_id;
  new.startup_id := new.startup_semester_id;
  new.session_date_id := new.meeting_id;
  new.time_slot := case new.slot when 1 then '3:30-4:15' when 2 then '4:15-5:00' end;
  new.is_confirmed := new.status = 'confirmed';
  return new;
end;
$function$;

create or replace function public.transfer_outreach_owner (
  p_opportunity_id       uuid,
  p_new_owner_profile_id uuid,
  p_reason               text                     default null::text,
  p_expected_updated_at  timestamp with time zone default null::timestamp with time zone
)
  returns public.outreach_opportunities
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_opportunity_semester_id uuid;
  v_opportunity public.outreach_opportunities%rowtype;
  v_new_owner_status public.membership_lifecycle_status;
  v_previous_owner_profile_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select public.outreach_opportunities.semester_id
  into v_opportunity_semester_id
  from public.outreach_opportunities
  where public.outreach_opportunities.id = p_opportunity_id;

  if not found then
    raise exception 'Outreach opportunity not found' using errcode = 'P0002';
  end if;

  if not public.can_manage_semester(v_opportunity_semester_id, v_actor_id) then
    raise exception 'Not authorized to manage this semester' using errcode = '42501';
  end if;

  if p_new_owner_profile_id is not null then
    select new_owner_membership.status
    into v_new_owner_status
    from public.semester_memberships as new_owner_membership
    where new_owner_membership.semester_id = v_opportunity_semester_id
      and new_owner_membership.profile_id = p_new_owner_profile_id
      and new_owner_membership.role = 'admin'
    for key share;

    if not found or v_new_owner_status <> 'active' then
      raise exception 'New outreach owner must be an active administrator in the opportunity semester'
        using errcode = '23514';
    end if;
  end if;

  select *
  into v_opportunity
  from public.outreach_opportunities
  where public.outreach_opportunities.id = p_opportunity_id
  for update;

  if not found then
    raise exception 'Outreach opportunity not found' using errcode = 'P0002';
  end if;

  if v_opportunity.semester_id <> v_opportunity_semester_id then
    raise exception 'Outreach opportunity is stale' using errcode = '40001';
  end if;

  if not public.can_manage_semester(v_opportunity.semester_id, v_actor_id) then
    raise exception 'Not authorized to manage this semester' using errcode = '42501';
  end if;

  if p_expected_updated_at is not null and v_opportunity.updated_at <> p_expected_updated_at then
    raise exception 'Outreach opportunity is stale' using errcode = '40001';
  end if;

  v_previous_owner_profile_id := v_opportunity.owner_profile_id;

  update public.outreach_opportunities
  set owner_profile_id = p_new_owner_profile_id,
      updated_at = now()
  where public.outreach_opportunities.id = p_opportunity_id
  returning * into v_opportunity;

  insert into public.outreach_activities (
    semester_id,
    opportunity_id,
    actor_profile_id,
    activity_kind,
    summary,
    details,
    previous_owner_profile_id,
    new_owner_profile_id
  )
  values (
    v_opportunity.semester_id,
    p_opportunity_id,
    v_actor_id,
    'owner_transfer',
    nullif(btrim(p_reason), ''),
    jsonb_build_object(
      'previous_owner_profile_id', v_previous_owner_profile_id,
      'new_owner_profile_id', p_new_owner_profile_id
    ),
    v_previous_owner_profile_id,
    p_new_owner_profile_id
  );

  return v_opportunity;
end;
$function$;

create or replace function public.update_updated_at()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin new.updated_at = now(); return new; end;
$function$;

create or replace function public.validate_outreach_owner_membership()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
declare
  v_owner_status public.membership_lifecycle_status;
begin
  if new.owner_profile_id is not null
     and new.stage not in ('converted', 'closed') then
    select owner_membership.status
    into v_owner_status
    from public.semester_memberships as owner_membership
    where owner_membership.semester_id = new.semester_id
      and owner_membership.profile_id = new.owner_profile_id
      and owner_membership.role = 'admin'
    for key share;

    if not found or v_owner_status <> 'active' then
      raise exception 'Outreach owner must be an active administrator in the opportunity semester'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

alter table "public"."invitations"
  add constraint "invitations_check" check ((((role = 'startup'::public.user_role) AND (startup_semester_id IS
    NOT NULL)) OR ((role <> 'startup'::public.user_role) AND (startup_semester_id IS NULL))));

alter table "public"."meeting_availability"
  add constraint "meeting_availability_semester_id_meeting_id_fkey" foreign key (semester_id, meeting_id) references public.meetings(semester_id, id) on delete cascade;

alter table "public"."outreach_activities"
  add constraint "outreach_activities_check"
    check (((activity_kind <> ALL (ARRAY['email'::public.outreach_activity_kind, 'call'::public.outreach_activity_kind, 'linkedin'::public.outreach_activity_kind])) OR (channel IS
    NOT NULL)));

alter table "public"."outreach_activities"
  add constraint "outreach_activities_semester_id_opportunity_id_supersedes__fkey" foreign key (semester_id, opportunity_id, supersedes_activity_id)
    references public.outreach_activities(semester_id, opportunity_id, id) on delete restrict;

alter table "public"."outreach_contact_companies"
  add constraint "outreach_contact_companies_company_id_fkey" foreign key (company_id) references public.outreach_companies(id) on delete cascade;

alter table "public"."outreach_contact_companies"
  add constraint "outreach_contact_companies_contact_id_fkey" foreign key (contact_id) references public.outreach_contacts(id) on delete cascade;

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_contact_id_fkey" foreign key (contact_id) references public.outreach_contacts(id) on delete restrict;

alter table "public"."outreach_activities"
  add constraint "outreach_activities_semester_id_opportunity_id_fkey" foreign key (semester_id, opportunity_id) references public.outreach_opportunities(semester_id, id)
    on delete cascade;

alter table "public"."platform_roles"
  add constraint "platform_roles_pkey" primary key (profile_id, role);

alter table "public"."profiles"
  add constraint "profiles_auth_user_id_fkey" foreign key (auth_user_id) references auth.users(id) on delete set null;

alter table "public"."invitations"
  add constraint "invitations_invited_by_fkey" foreign key (invited_by) references public.profiles(id);

alter table "public"."invitations"
  add constraint "invitations_matched_profile_id_fkey" foreign key (matched_profile_id) references public.profiles(id) on delete set null;

alter table "public"."mentor_profiles"
  add constraint "mentor_profiles_profile_id_fkey" foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table "public"."outreach_activities"
  add constraint "outreach_activities_actor_profile_id_fkey" foreign key (actor_profile_id) references public.profiles(id) on delete set null;

alter table "public"."outreach_activities"
  add constraint "outreach_activities_new_owner_profile_id_fkey" foreign key (new_owner_profile_id) references public.profiles(id) on delete set null;

alter table "public"."outreach_activities"
  add constraint "outreach_activities_previous_owner_profile_id_fkey" foreign key (previous_owner_profile_id) references public.profiles(id) on delete set null;

alter table "public"."outreach_companies"
  add constraint "outreach_companies_created_by_fkey" foreign key (created_by) references public.profiles(id) on delete set null;

alter table "public"."outreach_contacts"
  add constraint "outreach_contacts_created_by_fkey" foreign key (created_by) references public.profiles(id) on delete set null;

alter table "public"."outreach_imports"
  add constraint "outreach_imports_created_by_fkey" foreign key (created_by) references public.profiles(id);

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_created_by_fkey" foreign key (created_by) references public.profiles(id) on delete set null;

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_owner_profile_id_fkey" foreign key (owner_profile_id) references public.profiles(id) on delete set null;

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_silenced_by_fkey" foreign key (silenced_by) references public.profiles(id) on delete restrict;

alter table "public"."platform_roles"
  add constraint "platform_roles_granted_by_fkey" foreign key (granted_by) references public.profiles(id);

alter table "public"."platform_roles"
  add constraint "platform_roles_profile_id_fkey" foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table "public"."program_audit_events"
  add constraint "program_audit_events_actor_profile_id_fkey" foreign key (actor_profile_id) references public.profiles(id) on delete set null;

alter table "public"."mentor_semesters"
  add constraint "mentor_semesters_semester_membership_id_fkey" foreign key (semester_membership_id) references public.semester_memberships(id) on delete cascade;

alter table "public"."semester_memberships"
  add constraint "semester_memberships_profile_id_fkey" foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table "public"."meeting_availability"
  add constraint "meeting_availability_semester_id_semester_membership_id_fkey" foreign key (semester_id, semester_membership_id)
    references public.semester_memberships(semester_id, id) on delete cascade;

alter table "public"."semesters"
  add constraint "semesters_active_lifecycle_status_check" check (((NOT is_active) OR (lifecycle_status = 'active'::public.semester_lifecycle_status)));

alter table "public"."invitations"
  add constraint "invitations_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."meeting_availability"
  add constraint "meeting_availability_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."meetings"
  add constraint "meetings_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."mentor_semesters"
  add constraint "mentor_semesters_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."outreach_activities"
  add constraint "outreach_activities_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."outreach_imports"
  add constraint "outreach_imports_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."profiles"
  add constraint "profiles_semester_id_fkey" foreign key (semester_id) references public.semesters(id);

alter table "public"."program_audit_events"
  add constraint "program_audit_events_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."semester_memberships"
  add constraint "semester_memberships_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."sessions"
  add constraint "sessions_semester_id_fkey" foreign key (semester_id) references public.semesters(id);

alter table "public"."sessions"
  add constraint "sessions_semester_meeting_fkey" foreign key (semester_id, meeting_id) references public.meetings(semester_id, id);

alter table "public"."sessions"
  add constraint "sessions_semester_mentor_fkey" foreign key (semester_id, mentor_semester_id) references public.mentor_semesters(semester_id, id);

alter table "public"."invitations"
  add constraint "invitations_startup_semester_id_fkey" foreign key (startup_semester_id) references public.startup_semesters(id) on delete set null;

alter table "public"."startup_semesters"
  add constraint "startup_semesters_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."sessions"
  add constraint "sessions_semester_startup_fkey" foreign key (semester_id, startup_semester_id) references public.startup_semesters(semester_id, id);

alter table "public"."startup_semesters"
  add constraint "startup_semesters_startup_organization_id_fkey" foreign key (startup_organization_id) references public.startup_organizations(id) on delete cascade;

alter table "public"."startup_team_memberships"
  add constraint "startup_team_memberships_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."startup_team_memberships"
  add constraint "startup_team_memberships_semester_membership_id_fkey" foreign key (semester_membership_id) references public.semester_memberships(id) on delete cascade;

alter table "public"."startup_team_memberships"
  add constraint "startup_team_memberships_startup_semester_id_fkey" foreign key (startup_semester_id) references public.startup_semesters(id) on delete cascade;

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

create or replace function public.semesters (
  public .mentors
)
  returns SETOF public.semesters
  language sql
  stable
  rows 1
  set search_path to ''
  AS $function$ select * from public.semesters where id=$1.semester_id $function$;

create view "public"."session_dates" with (security_invoker=true) AS  SELECT id,
    semester_id,
    meeting_date AS date,
    label,
    created_at
   FROM public.meetings;

create or replace function public.semesters (
  public .session_dates
)
  returns SETOF public.semesters
  language sql
  stable
  rows 1
  set search_path to ''
  AS $function$ select * from public.semesters where id=$1.semester_id $function$;

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

create or replace function public.semesters (
  public .startups
)
  returns SETOF public.semesters
  language sql
  stable
  rows 1
  set search_path to ''
  AS $function$ select * from public.semesters where id=$1.semester_id $function$;

create or replace function public.startups (
  public .sessions
)
  returns SETOF public.startups
  language sql
  stable
  rows 1
  set search_path to ''
  AS $function$ select * from public.startups where id = $1.startup_semester_id $function$;

create unique index invitations_open_identity_idx on public.invitations using btree (semester_id, email, role)
  where (status = ANY (ARRAY['draft'::public.invitation_lifecycle_status, 'queued'::public.invitation_lifecycle_status, 'sent'::public.invitation_lifecycle_status]));

create index invitations_operations_idx on public.invitations using btree (semester_id, status, created_at desc);

create unique index one_active_semester on public.semesters using btree (is_active)
  where (is_active = true);

create index outreach_activities_actor_idx on public.outreach_activities using btree (actor_profile_id)
  where (actor_profile_id is not null);

create index outreach_activities_new_owner_idx on public.outreach_activities using btree (new_owner_profile_id)
  where (new_owner_profile_id is not null);

create index outreach_activities_previous_owner_idx on public.outreach_activities using btree (previous_owner_profile_id)
  where (previous_owner_profile_id is not null);

create index outreach_activities_supersedes_idx on public.outreach_activities using btree (semester_id, opportunity_id, supersedes_activity_id)
  where (supersedes_activity_id is not null);

create index outreach_activities_timeline_idx on public.outreach_activities using btree (semester_id, opportunity_id, occurred_at desc, id desc);

create index outreach_companies_created_by_idx on public.outreach_companies using btree (created_by)
  where (created_by is not null);

create unique index outreach_companies_domain_key on public.outreach_companies using btree (domain)
  where (domain is not null);

create index outreach_companies_normalized_name_idx on public.outreach_companies using btree (normalized_name);

create index outreach_contact_companies_company_idx on public.outreach_contact_companies using btree (company_id, contact_id);

create unique index outreach_contact_companies_identity_key on public.outreach_contact_companies using btree (contact_id, company_id, COALESCE(started_on, '-infinity'::date));

create unique index outreach_contact_companies_primary_key on public.outreach_contact_companies using btree (contact_id)
  where (is_primary AND (ended_on is null));

create index outreach_contacts_created_by_idx on public.outreach_contacts using btree (created_by)
  where (created_by is not null);

create unique index outreach_contacts_email_key on public.outreach_contacts using btree (email)
  where (email is not null);

create unique index outreach_contacts_linkedin_key on public.outreach_contacts using btree (canonical_linkedin_url)
  where (canonical_linkedin_url is not null);

create index outreach_opportunities_contact_idx on public.outreach_opportunities using btree (contact_id, semester_id);

create index outreach_opportunities_created_by_idx on public.outreach_opportunities using btree (created_by)
  where (created_by is not null);

create index outreach_opportunities_owner_idx on public.outreach_opportunities using btree (owner_profile_id, semester_id)
  where (owner_profile_id is not null);

create unique index outreach_opportunities_semester_contact_key on public.outreach_opportunities using btree (semester_id, contact_id);

create index outreach_opportunities_silenced_by_idx on public.outreach_opportunities using btree (silenced_by)
  where (silenced_by is not null);

create unique index profiles_auth_user_id_key on public.profiles using btree (auth_user_id)
  where (auth_user_id is not null);

create index semester_memberships_operations_idx on public.semester_memberships using btree (semester_id, status, role);

create index semester_memberships_profile_idx on public.semester_memberships using btree (profile_id, semester_id);

create unique index sessions_active_mentor_slot_key on public.sessions using btree (meeting_id, slot, mentor_semester_id)
  where (status <> 'cancelled'::text);

create unique index sessions_active_startup_slot_key on public.sessions using btree (meeting_id, slot, startup_semester_id)
  where (status <> 'cancelled'::text);

create unique index sessions_semester_idempotency_key on public.sessions using btree (semester_id, idempotency_key)
  where (idempotency_key is not null);

create index sessions_semester_idx on public.sessions using btree (semester_id);

create index startup_team_memberships_profile_idx on public.startup_team_memberships using btree (semester_membership_id);

create trigger mentors_view_write
  instead of insert or delete or update on public.mentors
  for each row
  execute function public.mentors_view_write();

create trigger prevent_outreach_activity_mutation
  before delete or update on public.outreach_activities
  for each row
  execute function public.prevent_outreach_activity_mutation();

create trigger validate_canonical_outreach_owner_membership
  before insert or update of semester_id, owner_profile_id, stage on public.outreach_opportunities
  for each row
  execute function public.validate_outreach_owner_membership();

create trigger profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.update_updated_at();

create trigger sessions_updated_at
  before update on public.sessions
  for each row
  execute function public.update_updated_at();

create trigger sync_session_compatibility_columns
  before insert or update on public.sessions
  for each row
  execute function public.sync_session_compatibility_columns();

create trigger startups_view_write
  instead of insert or delete or update on public.startups
  for each row
  execute function public.startups_view_write();

create policy "semester admins manage invitations" on "public"."invitations"
  for all
  to "authenticated"
  using (public.can_manage_semester(semester_id))
  with check (public.can_manage_semester(semester_id));

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

create policy "authenticated members read mentor profiles" on "public"."mentor_profiles"
  for select
  to "authenticated"
  using ((exists ( select 1
   from public.semester_memberships sm
  where
    ((sm.profile_id = mentor_profiles.profile_id) AND public.has_semester_role(sm.semester_id, ARRAY['mentor'::public.user_role, 'startup'::public.user_role,
    'admin'::public.user_role])))));

create policy "mentors update own mentor profile" on "public"."mentor_profiles"
  for update
  to "authenticated"
  using ((profile_id = auth.uid()))
  with check ((profile_id = auth.uid()));

create policy "mentors read own semester profile" on "public"."mentor_semesters"
  for select
  to "authenticated"
  using ((exists ( select 1
   from public.semester_memberships sm
  where ((sm.id = mentor_semesters.semester_membership_id) AND ((sm.profile_id = auth.uid()) or public.can_manage_semester(mentor_semesters.semester_id))))));

create policy "mentors update own semester profile" on "public"."mentor_semesters"
  for update
  to "authenticated"
  using ((exists ( select 1
   from public.semester_memberships sm
  where
    ((sm.id = mentor_semesters.semester_membership_id) AND (sm.profile_id = auth.uid()) AND (sm.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status,
    'active'::public.membership_lifecycle_status]))))));

create policy "semester managers read outreach activities" on "public"."outreach_activities"
  for select
  to "authenticated"
  using (public.can_manage_semester(semester_id));

create policy "semester managers create outreach companies" on "public"."outreach_companies"
  for insert
  to "authenticated"
  with check (public.can_manage_any_outreach());

create policy "semester managers delete outreach companies" on "public"."outreach_companies"
  for delete
  to "authenticated"
  using (public.has_outreach_company_access(id));

create policy "semester managers read outreach companies" on "public"."outreach_companies"
  for select
  to "authenticated"
  using (public.has_outreach_company_access(id));

create policy "semester managers update outreach companies" on "public"."outreach_companies"
  for update
  to "authenticated"
  using (public.has_outreach_company_access(id))
  with check (public.has_outreach_company_access(id));

create policy "semester managers create outreach contact companies" on "public"."outreach_contact_companies"
  for insert
  to "authenticated"
  with check ((public.has_outreach_contact_access(contact_id) AND (public.has_outreach_company_access(company_id) OR public.can_manage_any_outreach())));

create policy "semester managers delete outreach contact companies" on "public"."outreach_contact_companies"
  for delete
  to "authenticated"
  using ((public.has_outreach_contact_access(contact_id) AND public.has_outreach_company_access(company_id)));

create policy "semester managers read outreach contact companies" on "public"."outreach_contact_companies"
  for select
  to "authenticated"
  using ((public.has_outreach_contact_access(contact_id) AND public.has_outreach_company_access(company_id)));

create policy "semester managers update outreach contact companies" on "public"."outreach_contact_companies"
  for update
  to "authenticated"
  using ((public.has_outreach_contact_access(contact_id) AND public.has_outreach_company_access(company_id)))
  with check ((public.has_outreach_contact_access(contact_id) AND public.has_outreach_company_access(company_id)));

create policy "semester managers create outreach contacts" on "public"."outreach_contacts"
  for insert
  to "authenticated"
  with check (public.can_manage_any_outreach());

create policy "semester managers delete outreach contacts" on "public"."outreach_contacts"
  for delete
  to "authenticated"
  using (public.has_outreach_contact_access(id));

create policy "semester managers read outreach contacts" on "public"."outreach_contacts"
  for select
  to "authenticated"
  using (public.has_outreach_contact_access(id));

create policy "semester managers update outreach contacts" on "public"."outreach_contacts"
  for update
  to "authenticated"
  using (public.has_outreach_contact_access(id))
  with check (public.has_outreach_contact_access(id));

create policy "admins manage outreach imports" on "public"."outreach_imports"
  for all
  to "authenticated"
  using (public.can_manage_semester(semester_id, auth.uid()))
  with check (public.can_manage_semester(semester_id, auth.uid()));

create policy "semester managers create outreach opportunities" on "public"."outreach_opportunities"
  for insert
  to "authenticated"
  with check (public.can_manage_semester(semester_id));

create policy "semester managers read outreach opportunities" on "public"."outreach_opportunities"
  for select
  to "authenticated"
  using (public.can_manage_semester(semester_id));

create policy "platform roles visible to owner" on "public"."platform_roles"
  for select
  to "authenticated"
  using (((profile_id = auth.uid()) or public.is_super_admin()));

create policy "super admins manage platform roles" on "public"."platform_roles"
  for all
  to "authenticated"
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "admins can insert profiles" on "public"."profiles"
  for insert
  to PUBLIC
  with check ((public.get_my_role() = 'admin'::public.user_role));

create policy "admins can update all profiles" on "public"."profiles"
  for update
  to PUBLIC
  using ((public.get_my_role() = 'admin'::public.user_role));

create policy "admins can view all profiles" on "public"."profiles"
  for select
  to PUBLIC
  using ((public.get_my_role() = 'admin'::public.user_role));

create policy "users can view own profile" on "public"."profiles"
  for select
  to PUBLIC
  using ((auth.uid() = id));

create policy "users update own safe profile fields" on "public"."profiles"
  for update
  to "authenticated"
  using ((id = auth.uid()))
  with check ((id = auth.uid()));

create policy "admins view program audit" on "public"."program_audit_events"
  for select
  to "authenticated"
  using (public.can_manage_semester(semester_id, auth.uid()));

create policy "members read own semester memberships" on "public"."semester_memberships"
  for select
  to "authenticated"
  using (((profile_id = auth.uid()) or public.can_manage_semester(semester_id)));

create policy "semester admins manage semester memberships" on "public"."semester_memberships"
  for all
  to "authenticated"
  using (public.can_manage_semester(semester_id))
  with check (public.can_manage_semester(semester_id));

create policy "authenticated users read semesters" on "public"."semesters"
  for select
  to "authenticated"
  using (true);

create policy "admins can delete sessions" on "public"."sessions"
  for delete
  to PUBLIC
  using ((public.get_my_role() = 'admin'::public.user_role));

create policy "admins can insert sessions" on "public"."sessions"
  for insert
  to PUBLIC
  with check ((public.get_my_role() = 'admin'::public.user_role));

create policy "admins can update sessions" on "public"."sessions"
  for update
  to PUBLIC
  using ((public.get_my_role() = 'admin'::public.user_role));

create policy "admins can view all sessions" on "public"."sessions"
  for select
  to PUBLIC
  using ((public.get_my_role() = 'admin'::public.user_role));

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

create policy "members read startup organizations" on "public"."startup_organizations"
  for select
  to "authenticated"
  using ((exists ( select 1
   from public.startup_semesters ss
  where
    ((ss.startup_organization_id = startup_organizations.id) AND public.has_semester_role(ss.semester_id, ARRAY['mentor'::public.user_role, 'startup'::public.user_role,
    'admin'::public.user_role])))));

create policy "semester admins manage startup organizations" on "public"."startup_organizations"
  for all
  to "authenticated"
  using ((exists ( select 1
   from public.startup_semesters ss
  where ((ss.startup_organization_id = startup_organizations.id) AND public.can_manage_semester(ss.semester_id)))));

create policy "cohort reads startup semesters" on "public"."startup_semesters"
  for select
  to "authenticated"
  using (public.has_semester_role(semester_id, ARRAY['mentor'::public.user_role, 'startup'::public.user_role, 'admin'::public.user_role]));

create policy "startup teams update startup semester" on "public"."startup_semesters"
  for update
  to "authenticated"
  using ((exists ( select 1
   from (public.startup_team_memberships stm
     JOIN public.semester_memberships sm on ((sm.id = stm.semester_membership_id)))
  where
    ((stm.startup_semester_id = startup_semesters.id) AND (sm.profile_id = auth.uid()) AND (sm.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status,
    'active'::public.membership_lifecycle_status]))))))
  with check ((semester_id = semester_id));

create policy "semester admins manage startup team memberships" on "public"."startup_team_memberships"
  for all
  to "authenticated"
  using (public.can_manage_semester(semester_id))
  with check (public.can_manage_semester(semester_id));

create policy "startup teams read their memberships" on "public"."startup_team_memberships"
  for select
  to "authenticated"
  using ((exists ( select 1
   from public.semester_memberships sm
  where ((sm.id = startup_team_memberships.semester_membership_id) AND ((sm.profile_id = auth.uid()) or public.can_manage_semester(startup_team_memberships.semester_id))))));

revoke all on function "public"."activate_semester_transition"(uuid, uuid) from public;

grant execute on function "public"."activate_semester_transition"(uuid, uuid) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."bulk_set_membership_activity"(uuid, uuid[], boolean) from public;

grant execute on function "public"."bulk_set_membership_activity"(uuid, uuid[], boolean) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."can_manage_any_outreach"(uuid) from public;

grant execute on function "public"."can_manage_any_outreach"(uuid) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."can_manage_semester"(uuid, uuid) from public;

grant execute on function "public"."can_manage_semester"(uuid, uuid) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."can_read_outreach_relationship_labels"(uuid) from public;

grant execute on function "public"."can_read_outreach_relationship_labels"(uuid) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."carry_forward_outreach_contacts"(uuid, uuid, uuid[]) from public;

grant execute on function "public"."carry_forward_outreach_contacts"(uuid, uuid, uuid[]) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."commit_legacy_outreach_migration"(uuid, text) from public;

grant execute on function "public"."commit_legacy_outreach_migration"(uuid, text) to "authenticated", "postgres", "service_role";

revoke all on function "public"."commit_mentor_assignment"(uuid, uuid, text, uuid, uuid, text, text, text, text[], text, jsonb) from public;

grant execute
  on function "public"."commit_mentor_assignment"(uuid, uuid, text, uuid, uuid, text, text, text, text[], text, jsonb)
  to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."create_semester_draft"(uuid, text, date, date, jsonb) from public;

grant execute on function "public"."create_semester_draft"(uuid, text, date, date, jsonb) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."get_my_role"() from public;

grant execute on function "public"."get_my_role"() to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."handle_new_user"() from public;

grant execute on function "public"."handle_new_user"() to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."has_outreach_company_access"(uuid, uuid) from public;

grant execute on function "public"."has_outreach_company_access"(uuid, uuid) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."has_outreach_contact_access"(uuid, uuid) from public;

grant execute on function "public"."has_outreach_contact_access"(uuid, uuid) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."has_semester_role"(uuid, public.user_role[], uuid) from public;

grant execute on function "public"."has_semester_role"(uuid, public.user_role[], uuid) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."import_prior_semester_memberships"(uuid, uuid, uuid[]) from public;

grant execute on function "public"."import_prior_semester_memberships"(uuid, uuid, uuid[]) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."is_super_admin"(uuid) from public;

grant execute on function "public"."is_super_admin"(uuid) to "anon", "authenticated", "postgres", "service_role";

revoke all
  on function "public"."log_outreach_activity"(uuid, public.outreach_activity_kind, timestamp with time zone, public.outreach_channel, text, jsonb, timestamp
    with time zone, public.outreach_stage, timestamp with time zone)
  from public;

grant execute
  on function "public"."log_outreach_activity"(uuid, public.outreach_activity_kind, timestamp with time zone, public.outreach_channel, text, jsonb, timestamp
    with time zone, public.outreach_stage, timestamp with time zone)
  to "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."mentors"(public.sessions) to public, "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."mentors_view_write"() from public;

grant execute on function "public"."mentors_view_write"() to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."prevent_outreach_activity_mutation"() from public;

grant execute on function "public"."prevent_outreach_activity_mutation"() to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."release_inactive_owner_work"(uuid) from public;

grant execute on function "public"."release_inactive_owner_work"(uuid) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."replace_draft_session_dates"(uuid, jsonb) from public;

grant execute on function "public"."replace_draft_session_dates"(uuid, jsonb) to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."reset_outreach_opportunities"(uuid, uuid[]) from public;

grant execute on function "public"."reset_outreach_opportunities"(uuid, uuid[]) to "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."semesters"(public.mentors) to public, "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."semesters"(public.session_dates) to public, "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."semesters"(public.startups) to public, "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."session_dates"(public.sessions) to public, "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."set_outreach_silence"(uuid, boolean, text, timestamp with time zone, timestamp with time zone) from public;

grant execute
  on function "public"."set_outreach_silence"(uuid, boolean, text, timestamp with time zone, timestamp with time zone)
  to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."set_outreach_snooze"(uuid, timestamp with time zone, text, timestamp with time zone) from public;

grant execute on function "public"."set_outreach_snooze"(uuid, timestamp with time zone, text, timestamp with time zone) to "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."set_updated_at"() to public, "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."startups"(public.sessions) to public, "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."startups_view_write"() from public;

grant execute on function "public"."startups_view_write"() to "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."suspend_outreach_membership"(uuid, uuid, text, timestamp with time zone) from public;

grant execute on function "public"."suspend_outreach_membership"(uuid, uuid, text, timestamp with time zone) to "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."sync_session_compatibility_columns"() to public, "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."transfer_outreach_owner"(uuid, uuid, text, timestamp with time zone) from public;

grant execute on function "public"."transfer_outreach_owner"(uuid, uuid, text, timestamp with time zone) to "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."update_updated_at"() to public, "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."validate_outreach_owner_membership"() from public;

grant execute on function "public"."validate_outreach_owner_membership"() to "anon", "authenticated", "postgres", "service_role";

revoke all on table "public"."invitations" from "anon";

grant maintain, references, trigger, truncate on table "public"."invitations" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."invitations" to "authenticated", "postgres", "service_role";

revoke all on table "public"."meeting_availability" from "anon";

grant maintain, references, trigger, truncate on table "public"."meeting_availability" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."meeting_availability" to "authenticated", "postgres", "service_role";

revoke all on table "public"."meetings" from "anon";

grant maintain, references, trigger, truncate on table "public"."meetings" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."meetings" to "authenticated", "postgres", "service_role";

revoke all on table "public"."mentor_profiles" from "anon";

grant maintain, references, trigger, truncate on table "public"."mentor_profiles" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."mentor_profiles" to "authenticated", "postgres", "service_role";

revoke all on table "public"."mentor_semesters" from "anon";

grant maintain, references, trigger, truncate on table "public"."mentor_semesters" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."mentor_semesters" to "authenticated", "postgres", "service_role";

revoke all on table "public"."outreach_activities" from "anon";

grant maintain, references, trigger, truncate on table "public"."outreach_activities" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_activities" to "authenticated", "postgres";

revoke all on table "public"."outreach_activities" from "service_role";

grant insert, maintain, references, select, trigger, truncate on table "public"."outreach_activities" to "service_role";

revoke all on table "public"."outreach_companies" from "anon";

grant maintain, references, trigger, truncate on table "public"."outreach_companies" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_companies" to "authenticated", "postgres", "service_role";

revoke all on table "public"."outreach_contact_companies" from "anon";

grant maintain, references, trigger, truncate on table "public"."outreach_contact_companies" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_contact_companies" to "authenticated", "postgres", "service_role";

revoke all on table "public"."outreach_contacts" from "anon";

grant maintain, references, trigger, truncate on table "public"."outreach_contacts" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_contacts" to "authenticated", "postgres", "service_role";

revoke all on table "public"."outreach_imports" from "anon";

grant maintain, references, trigger, truncate on table "public"."outreach_imports" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_imports" to "authenticated", "postgres", "service_role";

revoke all on table "public"."outreach_opportunities" from "anon";

grant maintain, references, trigger, truncate on table "public"."outreach_opportunities" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_opportunities" to "authenticated", "postgres", "service_role";

revoke all on table "public"."platform_roles" from "anon";

grant maintain, references, trigger, truncate on table "public"."platform_roles" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."platform_roles" to "authenticated", "postgres", "service_role";

revoke all on table "public"."profiles" from "anon";

grant maintain, references, trigger, truncate on table "public"."profiles" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."profiles" to "authenticated", "postgres", "service_role";

revoke all on table "public"."program_audit_events" from "anon";

grant maintain, references, trigger, truncate on table "public"."program_audit_events" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."program_audit_events" to "authenticated", "postgres", "service_role";

revoke all on table "public"."semester_memberships" from "anon";

grant maintain, references, trigger, truncate on table "public"."semester_memberships" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."semester_memberships" to "authenticated", "postgres", "service_role";

revoke all on table "public"."semesters" from "anon";

grant maintain, references, trigger, truncate on table "public"."semesters" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."semesters" to "authenticated", "postgres", "service_role";

revoke all on table "public"."sessions" from "anon";

grant maintain, references, trigger, truncate on table "public"."sessions" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."sessions" to "authenticated", "postgres", "service_role";

revoke all on table "public"."startup_organizations" from "anon";

grant maintain, references, trigger, truncate on table "public"."startup_organizations" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."startup_organizations" to "authenticated", "postgres", "service_role";

revoke all on table "public"."startup_semesters" from "anon";

grant maintain, references, trigger, truncate on table "public"."startup_semesters" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."startup_semesters" to "authenticated", "postgres", "service_role";

revoke all on table "public"."startup_team_memberships" from "anon";

grant maintain, references, trigger, truncate on table "public"."startup_team_memberships" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."startup_team_memberships" to "authenticated", "postgres", "service_role";

grant usage on type "public"."access_request_status" to "postgres";

grant usage on type "public"."invitation_lifecycle_status" to "postgres";

grant usage on type "public"."membership_lifecycle_status" to "postgres";

grant usage on type "public"."outreach_activity_kind" to "postgres";

grant usage on type "public"."outreach_channel" to "postgres";

grant usage on type "public"."outreach_import_match_decision" to "postgres";

grant usage on type "public"."outreach_import_status" to "postgres";

grant usage on type "public"."outreach_stage" to "postgres";

grant usage on type "public"."outreach_status" to "postgres";

grant usage on type "public"."platform_role" to "postgres";

grant usage on type "public"."semester_lifecycle_status" to "postgres";

grant usage on type "public"."session_status" to "postgres";

grant usage on type "public"."startup_stage" to "postgres";

grant usage on type "public"."user_role" to "postgres";

revoke all on table "public"."availability" from "anon";

grant maintain, references, trigger, truncate on table "public"."availability" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."availability" to "authenticated", "postgres", "service_role";

revoke all on table "public"."mentors" from "anon";

grant maintain, references, trigger, truncate on table "public"."mentors" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."mentors" to "authenticated", "postgres", "service_role";

revoke all on table "public"."session_dates" from "anon";

grant maintain, references, trigger, truncate on table "public"."session_dates" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."session_dates" to "authenticated", "postgres", "service_role";

revoke all on table "public"."startups" from "anon";

grant maintain, references, trigger, truncate on table "public"."startups" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."startups" to "authenticated", "postgres", "service_role";

alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "anon";

alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "authenticated";

alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "service_role";

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "anon";

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "authenticated";

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "service_role";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "anon";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "authenticated";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "service_role";
