set local check_function_bodies = off;

revoke all on table "public"."profiles" from "anon";

drop policy "users can update own profile" on "public"."profiles";

create table "public"."access_requests" (
  "id"                   uuid                     not null default gen_random_uuid(),
  "semester_id"          uuid                     not null,
  "requester_profile_id" uuid,
  "email"                text                     not null,
  "full_name"            text                     not null,
  "requested_role"       public.user_role         not null,
  "startup_name"         text,
  "reason"               text,
  "reviewed_by"          uuid,
  "reviewed_at"          timestamp with time zone,
  "review_note"          text,
  "created_at"           timestamp with time zone not null default now(),
  "updated_at"           timestamp with time zone not null default now(),
  constraint "access_requests_email_check" check ((email = lower(TRIM(BOTH FROM email)))),
  constraint "access_requests_pkey" primary key (id)
);

alter table "public"."access_requests"
  enable row level security;

create table "public"."availability_windows" (
  "id"                  uuid                     not null default gen_random_uuid(),
  "semester_id"         uuid                     not null,
  "profile_id"          uuid,
  "startup_semester_id" uuid,
  "starts_at"           timestamp with time zone not null,
  "ends_at"             timestamp with time zone not null,
  "timezone"            text                     not null,
  "source"              text                     not null default 'user'::text,
  "created_at"          timestamp with time zone not null default now(),
  "updated_at"          timestamp with time zone not null default now(),
  constraint "availability_windows_check1" check (((((profile_id IS NOT NULL))::integer + ((startup_semester_id IS NOT NULL))::integer) = 1)),
  constraint "availability_windows_check" check ((ends_at > starts_at)),
  constraint "availability_windows_pkey" primary key (id),
  constraint "availability_windows_source_check" check ((source = ANY (ARRAY['default'::text, 'user'::text, 'admin'::text])))
);

alter table "public"."availability_windows"
  enable row level security;

create table "public"."invitation_delivery_attempts" (
  "id"                  uuid                     not null default gen_random_uuid(),
  "semester_id"         uuid                     not null,
  "invitation_id"       uuid                     not null,
  "provider"            text                     not null,
  "provider_message_id" text,
  "outcome"             text                     not null,
  "error_code"          text,
  "error_message"       text,
  "attempted_at"        timestamp with time zone not null default now(),
  constraint "invitation_delivery_attempts_outcome_check" check ((outcome = ANY (ARRAY['accepted'::text, 'failed'::text]))),
  constraint "invitation_delivery_attempts_pkey" primary key (id)
);

alter table "public"."invitation_delivery_attempts"
  enable row level security;

create table "public"."invitations" (
  "id"                  uuid                     not null default gen_random_uuid(),
  "semester_id"         uuid                     not null,
  "email"               text                     not null,
  "full_name"           text                     not null,
  "role"                public.user_role         not null,
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
  constraint "invitations_check" check ((((role = 'startup'::public.user_role) AND (startup_semester_id IS
    NOT NULL)) OR ((role <> 'startup'::public.user_role) AND (startup_semester_id IS NULL)))),
  constraint "invitations_email_check" check ((email = lower(TRIM(BOTH FROM email)))),
  constraint "invitations_pkey" primary key (id),
  constraint "invitations_send_attempts_check" check ((send_attempts >= 0))
);

alter table "public"."invitations"
  enable row level security;

create table "public"."lifecycle_audit_events" (
  "id"               uuid                     not null default gen_random_uuid(),
  "semester_id"      uuid                     not null,
  "actor_profile_id" uuid,
  "action"           text                     not null,
  "subject_type"     text                     not null,
  "subject_id"       uuid,
  "details"          jsonb                    not null default '{}'::jsonb,
  "created_at"       timestamp with time zone not null default now(),
  constraint "lifecycle_audit_events_pkey" primary key (id)
);

alter table "public"."lifecycle_audit_events"
  enable row level security;

create table "public"."lifecycle_configuration_templates" (
  "id"             uuid                     not null default gen_random_uuid(),
  "name"           text                     not null,
  "version"        integer                  not null,
  "configuration"  jsonb                    not null,
  "is_recommended" boolean                  not null default false,
  "created_by"     uuid,
  "created_at"     timestamp with time zone not null default now(),
  constraint "lifecycle_configuration_templates_name_version_key" unique (name, version),
  constraint "lifecycle_configuration_templates_pkey" primary key (id),
  constraint "lifecycle_configuration_templates_version_check" check ((version > 0))
);

alter table "public"."lifecycle_configuration_templates"
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
  constraint "mentor_semesters_capacity_check" check (((capacity >= 0) AND (capacity <= 50))),
  constraint "mentor_semesters_pkey" primary key (id),
  constraint "mentor_semesters_readiness_status_check" check ((readiness_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'ready'::text]))),
  constraint "mentor_semesters_semester_id_semester_membership_id_key" unique (semester_id, semester_membership_id)
);

alter table "public"."mentor_semesters"
  enable row level security;

create table "public"."onboarding_progress" (
  "id"                     uuid                     not null default gen_random_uuid(),
  "semester_id"            uuid                     not null,
  "semester_membership_id" uuid                     not null,
  "item_key"               text                     not null,
  "is_required"            boolean                  not null,
  "completed_at"           timestamp with time zone,
  "payload"                jsonb                    not null default '{}'::jsonb,
  "created_at"             timestamp with time zone not null default now(),
  "updated_at"             timestamp with time zone not null default now(),
  constraint "onboarding_progress_pkey" primary key (id),
  constraint "onboarding_progress_semester_membership_id_item_key_key" unique (semester_membership_id, item_key)
);

alter table "public"."onboarding_progress"
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
  "import_job_id"             uuid,
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
  constraint "outreach_contacts_canonical_linkedin_url_check" check (((canonical_linkedin_url IS NULL) OR (length(btrim(canonical_linkedin_url)) > 0))),
  constraint "outreach_contacts_email_check" check (((email IS NULL) OR (email = lower(btrim(email))))),
  constraint "outreach_contacts_full_name_check" check ((length(btrim(full_name)) > 0)),
  constraint "outreach_contacts_pkey" primary key (id)
);

alter table "public"."outreach_contacts"
  enable row level security;

create table "public"."outreach_import_jobs" (
  "id"              uuid                     not null default gen_random_uuid(),
  "semester_id"     uuid                     not null,
  "source"          text                     not null,
  "source_filename" text,
  "idempotency_key" text,
  "summary"         jsonb                    not null default '{}'::jsonb,
  "created_by"      uuid                     not null,
  "committed_by"    uuid,
  "committed_at"    timestamp with time zone,
  "rolled_back_at"  timestamp with time zone,
  "last_error"      text,
  "created_at"      timestamp with time zone not null default now(),
  "updated_at"      timestamp with time zone not null default now(),
  constraint "outreach_import_jobs_idempotency_key_check" check (((idempotency_key IS NULL) OR (length(btrim(idempotency_key)) > 0))),
  constraint "outreach_import_jobs_pkey" primary key (id),
  constraint "outreach_import_jobs_semester_id_id_key" unique (semester_id, id),
  constraint "outreach_import_jobs_source_check" check ((source = ANY (ARRAY['csv'::text, 'excel'::text, 'legacy'::text])))
);

alter table "public"."outreach_import_jobs"
  enable row level security;

create table "public"."outreach_import_rows" (
  "id"                       uuid                     not null default gen_random_uuid(),
  "semester_id"              uuid                     not null,
  "import_job_id"            uuid                     not null,
  "row_number"               integer                  not null,
  "raw_payload"              jsonb                    not null,
  "normalized_payload"       jsonb                    not null default '{}'::jsonb,
  "issue_codes"              text[]                   not null default '{}'::text[],
  "matched_contact_id"       uuid,
  "matched_company_id"       uuid,
  "selected"                 boolean                  not null default true,
  "excluded"                 boolean                  not null default false,
  "excluded_reason"          text,
  "committed_opportunity_id" uuid,
  "created_at"               timestamp with time zone not null default now(),
  "updated_at"               timestamp with time zone not null default now(),
  constraint "outreach_import_rows_check1" check (((NOT excluded) OR (excluded_reason IS NOT NULL))),
  constraint "outreach_import_rows_check" check ((NOT (selected AND excluded))),
  constraint "outreach_import_rows_import_job_id_row_number_key" unique (import_job_id, row_number),
  constraint "outreach_import_rows_pkey" primary key (id),
  constraint "outreach_import_rows_row_number_check" check ((row_number > 0))
);

alter table "public"."outreach_import_rows"
  enable row level security;

create table "public"."outreach_opportunities" (
  "id"                            uuid                     not null default gen_random_uuid(),
  "semester_id"                   uuid                     not null,
  "contact_id"                    uuid                     not null,
  "owner_profile_id"              uuid,
  "cadence_days"                  smallint                 not null default 7,
  "next_follow_up_at"             timestamp with time zone,
  "snoozed_until"                 timestamp with time zone,
  "is_silenced"                   boolean                  not null default false,
  "silenced_at"                   timestamp with time zone,
  "silenced_by"                   uuid,
  "silence_reason"                text,
  "latest_inbound_activity_at"    timestamp with time zone,
  "latest_outbound_activity_at"   timestamp with time zone,
  "referred_by"                   text,
  "priority"                      smallint                 not null default 50,
  "notes"                         text,
  "converted_mentor_profile_id"   uuid,
  "converted_startup_semester_id" uuid,
  "conversion_details"            jsonb                    not null default '{}'::jsonb,
  "source_import_job_id"          uuid,
  "created_by"                    uuid,
  "created_at"                    timestamp with time zone not null default now(),
  "updated_at"                    timestamp with time zone not null default now(),
  constraint "outreach_opportunities_cadence_days_check" check (((cadence_days >= 1) AND (cadence_days <= 365))),
  constraint "outreach_opportunities_check" check (((is_silenced AND (silenced_at IS NOT NULL) AND (silenced_by IS NOT NULL) AND (silence_reason IS
    NOT NULL) AND (length(btrim(silence_reason)) > 0)) OR ((NOT is_silenced) AND (silenced_at IS NULL) AND (silenced_by IS NULL) AND (silence_reason IS NULL)))),
  constraint "outreach_opportunities_pkey" primary key (id),
  constraint "outreach_opportunities_priority_check" check (((priority >= 0) AND (priority <= 100))),
  constraint "outreach_opportunities_semester_id_id_key" unique (semester_id, id)
);

alter table "public"."outreach_opportunities"
  enable row level security;

create table "public"."outreach_opportunity_labels" (
  "semester_id"           uuid                     not null,
  "opportunity_id"        uuid                     not null,
  "relationship_label_id" uuid                     not null,
  "added_by"              uuid,
  "added_at"              timestamp with time zone not null default now(),
  constraint "outreach_opportunity_labels_pkey" primary key (opportunity_id, relationship_label_id)
);

alter table "public"."outreach_opportunity_labels"
  enable row level security;

create table "public"."outreach_relationship_labels" (
  "id"          uuid                     not null default gen_random_uuid(),
  "slug"        text                     not null,
  "name"        text                     not null,
  "description" text,
  "color_token" text,
  "created_by"  uuid,
  "created_at"  timestamp with time zone not null default now(),
  "updated_at"  timestamp with time zone not null default now(),
  constraint "outreach_relationship_labels_name_check" check ((length(btrim(name)) > 0)),
  constraint "outreach_relationship_labels_name_key" unique (name),
  constraint "outreach_relationship_labels_pkey" primary key (id),
  constraint "outreach_relationship_labels_slug_check" check (((slug = lower(btrim(slug))) AND (length(slug) > 0))),
  constraint "outreach_relationship_labels_slug_key" unique (slug)
);

alter table "public"."outreach_relationship_labels"
  enable row level security;

create table "public"."platform_roles" (
  "profile_id" uuid                     not null,
  "granted_by" uuid,
  "granted_at" timestamp with time zone not null default now()
);

alter table "public"."platform_roles"
  enable row level security;

create table "public"."semester_memberships" (
  "id"           uuid                     not null default gen_random_uuid(),
  "semester_id"  uuid                     not null,
  "profile_id"   uuid                     not null,
  "role"         public.user_role         not null,
  "invited_at"   timestamp with time zone,
  "activated_at" timestamp with time zone,
  "alumni_at"    timestamp with time zone,
  "suspended_at" timestamp with time zone,
  "created_at"   timestamp with time zone not null default now(),
  "updated_at"   timestamp with time zone not null default now(),
  constraint "semester_memberships_pkey" primary key (id),
  constraint "semester_memberships_semester_id_profile_id_role_key" unique (semester_id, profile_id, role)
);

alter table "public"."semester_memberships"
  enable row level security;

create table "public"."startup_organizations" (
  "id"          uuid                     not null default gen_random_uuid(),
  "name"        text                     not null,
  "slug"        text                     not null,
  "description" text,
  "industry"    text,
  "website_url" text,
  "logo_url"    text,
  "created_at"  timestamp with time zone not null default now(),
  "updated_at"  timestamp with time zone not null default now(),
  constraint "startup_organizations_pkey" primary key (id),
  constraint "startup_organizations_slug_key" unique (slug)
);

alter table "public"."startup_organizations"
  enable row level security;

create table "public"."startup_semesters" (
  "id"                       uuid                     not null default gen_random_uuid(),
  "semester_id"              uuid                     not null,
  "startup_organization_id"  uuid                     not null,
  "company_snapshot"         text,
  "stage"                    public.startup_stage,
  "goals"                    text[]                   not null default '{}'::text[],
  "mentorship_needs"         text[]                   not null default '{}'::text[],
  "preferred_expertise_tags" text[]                   not null default '{}'::text[],
  "readiness_status"         text                     not null default 'not_started'::text,
  "created_at"               timestamp with time zone not null default now(),
  "updated_at"               timestamp with time zone not null default now(),
  constraint "startup_semesters_pkey" primary key (id),
  constraint "startup_semesters_readiness_status_check" check ((readiness_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'ready'::text]))),
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

alter table "public"."semesters"
  add column "configuration" jsonb not null default '{}'::jsonb;

alter table "public"."semesters"
  add column "configuration_template_version" integer;

alter table "public"."semesters"
  add column "closed_at" timestamp with time zone;

alter table "public"."semesters"
  add column "archived_at" timestamp with time zone;

alter table "public"."semesters"
  add column "updated_at" timestamp with time zone not null default now();

create type "public"."access_request_status" as enum (
  'pending',
  'approved',
  'rejected',
  'withdrawn'
);

alter table "public"."access_requests"
  add column "status" public.access_request_status not null default 'pending'::public.access_request_status;

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

alter table "public"."outreach_import_rows"
  add column "match_decision" public.outreach_import_match_decision not null default 'review_required'::public.outreach_import_match_decision;

create type "public"."outreach_import_status" as enum (
  'preview',
  'reviewing',
  'ready',
  'committing',
  'committed',
  'failed',
  'rolled_back'
);

alter table "public"."outreach_import_jobs"
  add column "status" public.outreach_import_status not null default 'preview'::public.outreach_import_status;

create type "public"."outreach_stage" as enum (
  'prospect',
  'researching',
  'ready',
  'contacted',
  'responded',
  'meeting',
  'nurture',
  'converted',
  'closed'
);

alter table "public"."outreach_opportunities"
  add column "stage" public.outreach_stage not null default 'prospect'::public.outreach_stage;

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

alter table "public"."access_requests"
  add constraint "access_requests_requester_profile_id_fkey" foreign key (requester_profile_id) references public.profiles(id) on delete set null;

alter table "public"."access_requests"
  add constraint "access_requests_reviewed_by_fkey" foreign key (reviewed_by) references public.profiles(id);

alter table "public"."access_requests"
  add constraint "access_requests_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."availability_windows"
  add constraint "availability_windows_profile_id_fkey" foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table "public"."availability_windows"
  add constraint "availability_windows_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."invitation_delivery_attempts"
  add constraint "invitation_delivery_attempts_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."invitations"
  add constraint "invitations_invited_by_fkey" foreign key (invited_by) references public.profiles(id);

alter table "public"."invitations"
  add constraint "invitations_matched_profile_id_fkey" foreign key (matched_profile_id) references public.profiles(id) on delete set null;

alter table "public"."invitation_delivery_attempts"
  add constraint "invitation_delivery_attempts_invitation_id_fkey" foreign key (invitation_id) references public.invitations(id) on delete cascade;

alter table "public"."invitations"
  add constraint "invitations_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."lifecycle_audit_events"
  add constraint "lifecycle_audit_events_actor_profile_id_fkey" foreign key (actor_profile_id) references public.profiles(id) on delete set null;

alter table "public"."lifecycle_audit_events"
  add constraint "lifecycle_audit_events_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."lifecycle_configuration_templates"
  add constraint "lifecycle_configuration_templates_created_by_fkey" foreign key (created_by) references public.profiles(id);

alter table "public"."mentor_profiles"
  add constraint "mentor_profiles_profile_id_fkey" foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table "public"."mentor_semesters"
  add constraint "mentor_semesters_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."onboarding_progress"
  add constraint "onboarding_progress_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."outreach_activities"
  add constraint "outreach_activities_actor_profile_id_fkey" foreign key (actor_profile_id) references public.profiles(id) on delete set null;

alter table "public"."outreach_activities"
  add constraint "outreach_activities_check"
    check (((activity_kind <> ALL (ARRAY['email'::public.outreach_activity_kind, 'call'::public.outreach_activity_kind, 'linkedin'::public.outreach_activity_kind])) OR (channel IS
    NOT NULL)));

alter table "public"."outreach_activities"
  add constraint "outreach_activities_new_owner_profile_id_fkey" foreign key (new_owner_profile_id) references public.profiles(id) on delete set null;

alter table "public"."outreach_activities"
  add constraint "outreach_activities_previous_owner_profile_id_fkey" foreign key (previous_owner_profile_id) references public.profiles(id) on delete set null;

alter table "public"."outreach_activities"
  add constraint "outreach_activities_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."outreach_activities"
  add constraint "outreach_activities_semester_id_opportunity_id_supersedes__fkey" foreign key (semester_id, opportunity_id, supersedes_activity_id)
    references public.outreach_activities(semester_id, opportunity_id, id) on delete restrict;

alter table "public"."outreach_companies"
  add constraint "outreach_companies_created_by_fkey" foreign key (created_by) references public.profiles(id) on delete set null;

alter table "public"."outreach_contact_companies"
  add constraint "outreach_contact_companies_company_id_fkey" foreign key (company_id) references public.outreach_companies(id) on delete cascade;

alter table "public"."outreach_contacts"
  add constraint "outreach_contacts_created_by_fkey" foreign key (created_by) references public.profiles(id) on delete set null;

alter table "public"."outreach_contact_companies"
  add constraint "outreach_contact_companies_contact_id_fkey" foreign key (contact_id) references public.outreach_contacts(id) on delete cascade;

alter table "public"."outreach_import_jobs"
  add constraint "outreach_import_jobs_check1" check (((rolled_back_at IS NULL) OR (status = 'rolled_back'::public.outreach_import_status)));

alter table "public"."outreach_import_jobs"
  add constraint "outreach_import_jobs_check" check (((status = 'committed'::public.outreach_import_status) = (committed_at IS NOT NULL)));

alter table "public"."outreach_import_jobs"
  add constraint "outreach_import_jobs_committed_by_fkey" foreign key (committed_by) references public.profiles(id);

alter table "public"."outreach_import_jobs"
  add constraint "outreach_import_jobs_created_by_fkey" foreign key (created_by) references public.profiles(id);

alter table "public"."outreach_import_jobs"
  add constraint "outreach_import_jobs_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."outreach_activities"
  add constraint "outreach_activities_semester_id_import_job_id_fkey" foreign key (semester_id, import_job_id) references public.outreach_import_jobs(semester_id, id) on delete
    set null (import_job_id);

alter table "public"."outreach_import_rows"
  add constraint "outreach_import_rows_check2" check (((match_decision <> 'exclude'::public.outreach_import_match_decision) OR excluded));

alter table "public"."outreach_import_rows"
  add constraint "outreach_import_rows_matched_company_id_fkey" foreign key (matched_company_id) references public.outreach_companies(id) on delete set null;

alter table "public"."outreach_import_rows"
  add constraint "outreach_import_rows_matched_contact_id_fkey" foreign key (matched_contact_id) references public.outreach_contacts(id) on delete set null;

alter table "public"."outreach_import_rows"
  add constraint "outreach_import_rows_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."outreach_import_rows"
  add constraint "outreach_import_rows_semester_id_import_job_id_fkey" foreign key (semester_id, import_job_id) references public.outreach_import_jobs(semester_id, id)
    on delete cascade;

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_contact_id_fkey" foreign key (contact_id) references public.outreach_contacts(id) on delete restrict;

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_converted_mentor_profile_id_fkey" foreign key (converted_mentor_profile_id) references public.mentor_profiles(profile_id) on delete
    set null;

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_created_by_fkey" foreign key (created_by) references public.profiles(id) on delete set null;

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_owner_profile_id_fkey" foreign key (owner_profile_id) references public.profiles(id) on delete set null;

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."outreach_activities"
  add constraint "outreach_activities_semester_id_opportunity_id_fkey" foreign key (semester_id, opportunity_id) references public.outreach_opportunities(semester_id, id)
    on delete cascade;

alter table "public"."outreach_import_rows"
  add constraint "outreach_import_rows_semester_id_committed_opportunity_id_fkey" foreign key (semester_id, committed_opportunity_id)
    references public.outreach_opportunities(semester_id, id) on delete set null;

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_semester_id_source_import_job_id_fkey" foreign key (semester_id, source_import_job_id)
    references public.outreach_import_jobs(semester_id, id) on delete set null (source_import_job_id);

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_silenced_by_fkey" foreign key (silenced_by) references public.profiles(id) on delete restrict;

alter table "public"."outreach_opportunity_labels"
  add constraint "outreach_opportunity_labels_added_by_fkey" foreign key (added_by) references public.profiles(id) on delete set null;

alter table "public"."outreach_opportunity_labels"
  add constraint "outreach_opportunity_labels_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."outreach_opportunity_labels"
  add constraint "outreach_opportunity_labels_semester_id_opportunity_id_fkey" foreign key (semester_id, opportunity_id) references public.outreach_opportunities(semester_id, id)
    on delete cascade;

alter table "public"."outreach_relationship_labels"
  add constraint "outreach_relationship_labels_created_by_fkey" foreign key (created_by) references public.profiles(id) on delete set null;

alter table "public"."outreach_opportunity_labels"
  add constraint "outreach_opportunity_labels_relationship_label_id_fkey" foreign key (relationship_label_id) references public.outreach_relationship_labels(id) on delete restrict;

alter table "public"."platform_roles"
  add constraint "platform_roles_granted_by_fkey" foreign key (granted_by) references public.profiles(id);

alter table "public"."platform_roles"
  add constraint "platform_roles_pkey" primary key (profile_id, role);

alter table "public"."platform_roles"
  add constraint "platform_roles_profile_id_fkey" foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table "public"."mentor_semesters"
  add constraint "mentor_semesters_semester_membership_id_fkey" foreign key (semester_membership_id) references public.semester_memberships(id) on delete cascade;

alter table "public"."onboarding_progress"
  add constraint "onboarding_progress_semester_membership_id_fkey" foreign key (semester_membership_id) references public.semester_memberships(id) on delete cascade;

alter table "public"."semester_memberships"
  add constraint "semester_memberships_profile_id_fkey" foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table "public"."semester_memberships"
  add constraint "semester_memberships_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."availability_windows"
  add constraint "availability_windows_startup_semester_id_fkey" foreign key (startup_semester_id) references public.startup_semesters(id) on delete cascade;

alter table "public"."invitations"
  add constraint "invitations_startup_semester_id_fkey" foreign key (startup_semester_id) references public.startup_semesters(id) on delete set null;

alter table "public"."outreach_opportunities"
  add constraint "outreach_opportunities_converted_startup_semester_id_fkey" foreign key (converted_startup_semester_id) references public.startup_semesters(id) on delete set null;

alter table "public"."startup_semesters"
  add constraint "startup_semesters_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."startup_semesters"
  add constraint "startup_semesters_startup_organization_id_fkey" foreign key (startup_organization_id) references public.startup_organizations(id) on delete cascade;

alter table "public"."startup_team_memberships"
  add constraint "startup_team_memberships_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."startup_team_memberships"
  add constraint "startup_team_memberships_semester_membership_id_fkey" foreign key (semester_membership_id) references public.semester_memberships(id) on delete cascade;

alter table "public"."startup_team_memberships"
  add constraint "startup_team_memberships_startup_semester_id_fkey" foreign key (startup_semester_id) references public.startup_semesters(id) on delete cascade;

create unique index access_requests_open_identity_idx on public.access_requests using btree (semester_id, email)
  where (status = 'pending'::public.access_request_status);

create index access_requests_operations_idx on public.access_requests using btree (semester_id, status, created_at desc);

create index availability_windows_profile_idx on public.availability_windows using btree (semester_id, profile_id);

create index availability_windows_startup_idx on public.availability_windows using btree (semester_id, startup_semester_id);

create unique index invitations_open_identity_idx on public.invitations using btree (semester_id, email, role)
  where (status = ANY (ARRAY['draft'::public.invitation_lifecycle_status, 'queued'::public.invitation_lifecycle_status, 'sent'::public.invitation_lifecycle_status]));

create index invitations_operations_idx on public.invitations using btree (semester_id, status, created_at desc);

create index lifecycle_audit_events_subject_idx on public.lifecycle_audit_events using btree (semester_id, subject_type, subject_id);

create index onboarding_progress_membership_idx on public.onboarding_progress using btree (semester_membership_id);

create index outreach_activities_actor_idx on public.outreach_activities using btree (actor_profile_id)
  where (actor_profile_id is not null);

create index outreach_activities_import_job_idx on public.outreach_activities using btree (semester_id, import_job_id)
  where (import_job_id is not null);

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

create index outreach_import_jobs_committed_by_idx on public.outreach_import_jobs using btree (committed_by)
  where (committed_by is not null);

create index outreach_import_jobs_created_by_idx on public.outreach_import_jobs using btree (created_by);

create unique index outreach_import_jobs_idempotency_key on public.outreach_import_jobs using btree (semester_id, idempotency_key)
  where (idempotency_key is not null);

create index outreach_import_jobs_operations_idx on public.outreach_import_jobs using btree (semester_id, status, created_at desc, id);

create index outreach_import_rows_company_idx on public.outreach_import_rows using btree (matched_company_id)
  where (matched_company_id is not null);

create index outreach_import_rows_contact_idx on public.outreach_import_rows using btree (matched_contact_id)
  where (matched_contact_id is not null);

create index outreach_import_rows_opportunity_idx on public.outreach_import_rows using btree (committed_opportunity_id)
  where (committed_opportunity_id is not null);

create index outreach_import_rows_semester_idx on public.outreach_import_rows using btree (semester_id, import_job_id, row_number);

create index outreach_opportunities_contact_idx on public.outreach_opportunities using btree (contact_id, semester_id);

create index outreach_opportunities_converted_mentor_idx on public.outreach_opportunities using btree (converted_mentor_profile_id)
  where (converted_mentor_profile_id is not null);

create index outreach_opportunities_converted_startup_idx on public.outreach_opportunities using btree (converted_startup_semester_id)
  where (converted_startup_semester_id is not null);

create index outreach_opportunities_created_by_idx on public.outreach_opportunities using btree (created_by)
  where (created_by is not null);

create index outreach_opportunities_import_job_idx on public.outreach_opportunities using btree (semester_id, source_import_job_id)
  where (source_import_job_id is not null);

create unique index outreach_opportunities_one_open_contact_key on public.outreach_opportunities using btree (semester_id, contact_id)
  where (stage <> all (ARRAY['converted'::public.outreach_stage, 'closed'::public.outreach_stage]));

create index outreach_opportunities_owner_idx on public.outreach_opportunities using btree (owner_profile_id, semester_id)
  where (owner_profile_id is not null);

create index outreach_opportunities_owner_queue_idx on public.outreach_opportunities using btree (semester_id, owner_profile_id, next_follow_up_at, id)
  where ((stage <> all (ARRAY['converted'::public.outreach_stage, 'closed'::public.outreach_stage])) AND (not is_silenced));

create index outreach_opportunities_queue_cursor_idx on public.outreach_opportunities using btree (semester_id, next_follow_up_at, id)
  where ((stage <> all (ARRAY['converted'::public.outreach_stage, 'closed'::public.outreach_stage])) AND (not is_silenced));

create index outreach_opportunities_silenced_by_idx on public.outreach_opportunities using btree (silenced_by)
  where (silenced_by is not null);

create index outreach_opportunity_labels_added_by_idx on public.outreach_opportunity_labels using btree (added_by)
  where (added_by is not null);

create index outreach_opportunity_labels_label_idx on public.outreach_opportunity_labels using btree (relationship_label_id, opportunity_id);

create index outreach_opportunity_labels_semester_idx on public.outreach_opportunity_labels using btree (semester_id, relationship_label_id);

create index outreach_relationship_labels_created_by_idx on public.outreach_relationship_labels using btree (created_by)
  where (created_by is not null);

create index semester_memberships_operations_idx on public.semester_memberships using btree (semester_id, status, role);

create index semester_memberships_profile_idx on public.semester_memberships using btree (profile_id, semester_id);

create index startup_team_memberships_profile_idx on public.startup_team_memberships using btree (semester_membership_id);

create trigger prevent_outreach_activity_mutation
  before delete or update on public.outreach_activities
  for each row
  execute function public.prevent_outreach_activity_mutation();

create trigger validate_outreach_owner_membership
  before insert or update of semester_id, owner_profile_id, stage on public.outreach_opportunities
  for each row
  execute function public.validate_outreach_owner_membership();

create policy "requesters read own access requests" on "public"."access_requests"
  for select
  to "authenticated"
  using (((requester_profile_id = auth.uid()) or public.can_manage_semester(semester_id)));

create policy "semester admins review access requests" on "public"."access_requests"
  for update
  to "authenticated"
  using (public.can_manage_semester(semester_id))
  with check (public.can_manage_semester(semester_id));

create policy "owners manage availability" on "public"."availability_windows"
  for all
  to "authenticated"
  using (((profile_id = auth.uid()) or (exists ( select 1
   from (public.startup_team_memberships stm
     JOIN public.semester_memberships sm on ((sm.id = stm.semester_membership_id)))
  where ((stm.startup_semester_id = availability_windows.startup_semester_id) AND (sm.profile_id = auth.uid())))) or public.can_manage_semester(semester_id)))
  with check (((profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.startup_team_memberships stm
     JOIN public.semester_memberships sm ON ((sm.id = stm.semester_membership_id)))
  WHERE ((stm.startup_semester_id = availability_windows.startup_semester_id) AND (sm.profile_id = auth.uid())))) OR public.can_manage_semester(semester_id)));

create policy "semester admins read delivery attempts" on "public"."invitation_delivery_attempts"
  for select
  to "authenticated"
  using (public.can_manage_semester(semester_id));

create policy "semester admins manage invitations" on "public"."invitations"
  for all
  to "authenticated"
  using (public.can_manage_semester(semester_id))
  with check (public.can_manage_semester(semester_id));

create policy "semester admins read lifecycle audit" on "public"."lifecycle_audit_events"
  for select
  to "authenticated"
  using (public.can_manage_semester(semester_id));

create policy "authenticated users read configuration templates" on "public"."lifecycle_configuration_templates"
  for select
  to "authenticated"
  using (true);

create policy "super admins manage configuration templates" on "public"."lifecycle_configuration_templates"
  for all
  to "authenticated"
  using (public.is_super_admin())
  with check (public.is_super_admin());

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

create policy "members manage own onboarding progress" on "public"."onboarding_progress"
  for all
  to "authenticated"
  using ((exists ( select 1
   from public.semester_memberships sm
  where ((sm.id = onboarding_progress.semester_membership_id) AND ((sm.profile_id = auth.uid()) or public.can_manage_semester(onboarding_progress.semester_id))))))
  with check ((EXISTS ( SELECT 1
   FROM public.semester_memberships sm
  WHERE ((sm.id = onboarding_progress.semester_membership_id) AND ((sm.profile_id = auth.uid()) OR public.can_manage_semester(onboarding_progress.semester_id))))));

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
  with check ((public.has_outreach_contact_access(contact_id) AND public.has_outreach_company_access(company_id)));

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

create policy "semester managers manage outreach import jobs" on "public"."outreach_import_jobs"
  for all
  to "authenticated"
  using (public.can_manage_semester(semester_id))
  with check (public.can_manage_semester(semester_id));

create policy "semester managers manage outreach import rows" on "public"."outreach_import_rows"
  for all
  to "authenticated"
  using (public.can_manage_semester(semester_id))
  with check (public.can_manage_semester(semester_id));

create policy "semester managers create outreach opportunities" on "public"."outreach_opportunities"
  for insert
  to "authenticated"
  with check (public.can_manage_semester(semester_id));

create policy "semester managers read outreach opportunities" on "public"."outreach_opportunities"
  for select
  to "authenticated"
  using (public.can_manage_semester(semester_id));

create policy "semester managers manage outreach opportunity labels" on "public"."outreach_opportunity_labels"
  for all
  to "authenticated"
  using (public.can_manage_semester(semester_id))
  with check (public.can_manage_semester(semester_id));

create policy "active outreach administrators read relationship labels" on "public"."outreach_relationship_labels"
  for select
  to "authenticated"
  using (public.can_read_outreach_relationship_labels());

create policy "super administrators create relationship labels" on "public"."outreach_relationship_labels"
  for insert
  to "authenticated"
  with check (public.is_super_admin());

create policy "super administrators delete relationship labels" on "public"."outreach_relationship_labels"
  for delete
  to "authenticated"
  using (public.is_super_admin());

create policy "super administrators update relationship labels" on "public"."outreach_relationship_labels"
  for update
  to "authenticated"
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "platform roles visible to owner" on "public"."platform_roles"
  for select
  to "authenticated"
  using (((profile_id = auth.uid()) or public.is_super_admin()));

create policy "super admins manage platform roles" on "public"."platform_roles"
  for all
  to "authenticated"
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "users update own safe profile fields" on "public"."profiles"
  for update
  to "authenticated"
  using ((id = auth.uid()))
  with check ((id = auth.uid()));

create policy "members read own semester memberships" on "public"."semester_memberships"
  for select
  to "authenticated"
  using (((profile_id = auth.uid()) or public.can_manage_semester(semester_id)));

create policy "semester admins manage semester memberships" on "public"."semester_memberships"
  for all
  to "authenticated"
  using (public.can_manage_semester(semester_id))
  with check (public.can_manage_semester(semester_id));

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

revoke all on function "public"."can_manage_any_outreach"(uuid) from public;

grant execute on function "public"."can_manage_any_outreach"(uuid) to "authenticated", "postgres";

revoke all on function "public"."can_manage_semester"(uuid, uuid) from public;

grant execute on function "public"."can_manage_semester"(uuid, uuid) to "authenticated", "postgres";

revoke all on function "public"."can_read_outreach_relationship_labels"(uuid) from public;

grant execute on function "public"."can_read_outreach_relationship_labels"(uuid) to "authenticated", "postgres";

revoke all on function "public"."has_outreach_company_access"(uuid, uuid) from public;

grant execute on function "public"."has_outreach_company_access"(uuid, uuid) to "authenticated", "postgres";

revoke all on function "public"."has_outreach_contact_access"(uuid, uuid) from public;

grant execute on function "public"."has_outreach_contact_access"(uuid, uuid) to "authenticated", "postgres";

revoke all on function "public"."has_semester_role"(uuid, public.user_role[], uuid) from public;

grant execute on function "public"."has_semester_role"(uuid, public.user_role[], uuid) to "authenticated", "postgres";

revoke all on function "public"."is_super_admin"(uuid) from public;

grant execute on function "public"."is_super_admin"(uuid) to "authenticated", "postgres";

revoke all
  on function "public"."log_outreach_activity"(uuid, public.outreach_activity_kind, timestamp with time zone, public.outreach_channel, text, jsonb, timestamp
    with time zone, public.outreach_stage, timestamp with time zone)
  from public;

grant execute
  on function "public"."log_outreach_activity"(uuid, public.outreach_activity_kind, timestamp with time zone, public.outreach_channel, text, jsonb, timestamp
    with time zone, public.outreach_stage, timestamp with time zone)
  to "authenticated", "postgres";

revoke all on function "public"."prevent_outreach_activity_mutation"() from public;

grant execute on function "public"."prevent_outreach_activity_mutation"() to "postgres";

revoke all on function "public"."release_inactive_owner_work"(uuid) from public;

grant execute on function "public"."release_inactive_owner_work"(uuid) to "authenticated", "postgres";

revoke all on function "public"."set_outreach_silence"(uuid, boolean, text, timestamp with time zone, timestamp with time zone) from public;

grant execute on function "public"."set_outreach_silence"(uuid, boolean, text, timestamp with time zone, timestamp with time zone) to "authenticated", "postgres";

revoke all on function "public"."set_outreach_snooze"(uuid, timestamp with time zone, text, timestamp with time zone) from public;

grant execute on function "public"."set_outreach_snooze"(uuid, timestamp with time zone, text, timestamp with time zone) to "authenticated", "postgres";

revoke all on function "public"."suspend_outreach_membership"(uuid, uuid, text, timestamp with time zone) from public;

grant execute on function "public"."suspend_outreach_membership"(uuid, uuid, text, timestamp with time zone) to "authenticated", "postgres";

revoke all on function "public"."transfer_outreach_owner"(uuid, uuid, text, timestamp with time zone) from public;

grant execute on function "public"."transfer_outreach_owner"(uuid, uuid, text, timestamp with time zone) to "authenticated", "postgres";

revoke all on function "public"."validate_outreach_owner_membership"() from public;

grant execute on function "public"."validate_outreach_owner_membership"() to "postgres";

revoke all on table "public"."access_requests" from "authenticated";

grant select, update on table "public"."access_requests" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."access_requests" to "postgres", "service_role";

revoke all on table "public"."availability_windows" from "authenticated";

grant delete, insert, select, update on table "public"."availability_windows" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."availability_windows" to "postgres", "service_role";

revoke all on table "public"."invitation_delivery_attempts" from "authenticated";

grant select on table "public"."invitation_delivery_attempts" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."invitation_delivery_attempts" to "postgres", "service_role";

revoke all on table "public"."invitations" from "authenticated";

grant select on table "public"."invitations" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."invitations" to "postgres", "service_role";

revoke all on table "public"."lifecycle_audit_events" from "authenticated";

grant select on table "public"."lifecycle_audit_events" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."lifecycle_audit_events" to "postgres", "service_role";

revoke all on table "public"."lifecycle_configuration_templates" from "authenticated";

grant select on table "public"."lifecycle_configuration_templates" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."lifecycle_configuration_templates" to "postgres", "service_role";

revoke all on table "public"."mentor_profiles" from "authenticated";

grant select, update on table "public"."mentor_profiles" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."mentor_profiles" to "postgres", "service_role";

revoke all on table "public"."mentor_semesters" from "authenticated";

grant select, update on table "public"."mentor_semesters" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."mentor_semesters" to "postgres", "service_role";

revoke all on table "public"."onboarding_progress" from "authenticated";

grant delete, insert, select, update on table "public"."onboarding_progress" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."onboarding_progress" to "postgres", "service_role";

revoke all on table "public"."outreach_activities" from "authenticated";

grant select on table "public"."outreach_activities" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_activities" to "postgres";

revoke all on table "public"."outreach_activities" from "service_role";

grant insert, select on table "public"."outreach_activities" to "service_role";

revoke all on table "public"."outreach_activity_log" from "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_activity_log" to "service_role";

revoke all on table "public"."outreach_companies" from "authenticated";

grant delete, insert, select, update on table "public"."outreach_companies" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_companies" to "postgres", "service_role";

revoke all on table "public"."outreach_contact_companies" from "authenticated";

grant delete, insert, select, update on table "public"."outreach_contact_companies" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_contact_companies" to "postgres", "service_role";

revoke all on table "public"."outreach_contacts" from "authenticated";

grant delete, insert, select, update on table "public"."outreach_contacts" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_contacts" to "postgres", "service_role";

revoke all on table "public"."outreach_import_jobs" from "authenticated";

grant delete, insert, select, update on table "public"."outreach_import_jobs" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_import_jobs" to "postgres", "service_role";

revoke all on table "public"."outreach_import_rows" from "authenticated";

grant delete, insert, select, update on table "public"."outreach_import_rows" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_import_rows" to "postgres", "service_role";

revoke all on table "public"."outreach_opportunities" from "authenticated";

grant insert, select on table "public"."outreach_opportunities" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_opportunities" to "postgres", "service_role";

revoke all on table "public"."outreach_opportunity_labels" from "authenticated";

grant delete, insert, select, update on table "public"."outreach_opportunity_labels" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_opportunity_labels" to "postgres", "service_role";

revoke all on table "public"."outreach_relationship_labels" from "authenticated";

grant delete, insert, select, update on table "public"."outreach_relationship_labels" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_relationship_labels" to "postgres", "service_role";

revoke all on table "public"."platform_roles" from "authenticated";

grant select on table "public"."platform_roles" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."platform_roles" to "postgres", "service_role";

revoke all ("full_name") on table "public"."profiles" from "authenticated";

grant update ("full_name") on table "public"."profiles" to "authenticated";

revoke all on table "public"."profiles" from "authenticated";

grant select on table "public"."profiles" to "authenticated";

revoke all on table "public"."semester_memberships" from "authenticated";

grant select on table "public"."semester_memberships" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."semester_memberships" to "postgres", "service_role";

revoke all on table "public"."startup_organizations" from "authenticated";

grant select on table "public"."startup_organizations" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."startup_organizations" to "postgres", "service_role";

revoke all on table "public"."startup_semesters" from "authenticated";

grant select, update on table "public"."startup_semesters" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."startup_semesters" to "postgres", "service_role";

revoke all on table "public"."startup_team_memberships" from "authenticated";

grant select on table "public"."startup_team_memberships" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."startup_team_memberships" to "postgres", "service_role";

grant usage on type "public"."access_request_status" to "postgres";

grant usage on type "public"."invitation_lifecycle_status" to "postgres";

grant usage on type "public"."membership_lifecycle_status" to "postgres";

grant usage on type "public"."outreach_activity_kind" to "postgres";

grant usage on type "public"."outreach_channel" to "postgres";

grant usage on type "public"."outreach_import_match_decision" to "postgres";

grant usage on type "public"."outreach_import_status" to "postgres";

grant usage on type "public"."outreach_stage" to "postgres";

grant usage on type "public"."platform_role" to "postgres";

grant usage on type "public"."semester_lifecycle_status" to "postgres";
