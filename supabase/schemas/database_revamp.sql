-- Canonical Almaworks schema after the 2026 database revamp.
-- This file is the declarative target. Migrations are generated with `supabase db diff`.

-- canonical table manifest
create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  lifecycle_status text not null default 'draft' check (lifecycle_status in ('draft', 'active', 'closed', 'archived')),
  is_active boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  closed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('super_admin')),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (profile_id, role)
);

create table public.semester_memberships (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'mentor', 'startup')),
  status text not null default 'invited' check (status in ('invited', 'onboarding', 'active', 'alumni', 'suspended')),
  onboarding_data jsonb not null default '{}'::jsonb,
  onboarding_started_at timestamptz,
  onboarding_completed_at timestamptz,
  invited_at timestamptz,
  activated_at timestamptz,
  alumni_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, profile_id),
  unique (semester_id, id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null check (role in ('admin', 'mentor', 'startup')),
  startup_semester_id uuid,
  matched_profile_id uuid references public.profiles(id) on delete set null,
  invited_by uuid not null references public.profiles(id),
  status text not null default 'draft' check (status in ('draft', 'queued', 'sent', 'accepted', 'expired', 'revoked', 'failed')),
  delivery_provider text,
  delivery_message_id text,
  delivery_attempts integer not null default 0,
  last_delivery_at timestamptz,
  last_error_code text,
  last_error_message text,
  expires_at timestamptz not null,
  sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mentor_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  biography text,
  company text,
  title text,
  linkedin_url text,
  website_url text,
  photo_url text,
  expertise_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mentor_semesters (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  semester_membership_id uuid not null,
  mentorship_goals text,
  preferred_format text,
  general_availability text,
  per_week_availability jsonb not null default '{}'::jsonb,
  opening_talk text,
  capacity integer not null default 4 check (capacity >= 0),
  readiness_status text not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, semester_membership_id),
  unique (semester_id, id),
  foreign key (semester_id, semester_membership_id) references public.semester_memberships(semester_id, id) on delete cascade
);

create table public.startup_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  industry text,
  website_url text,
  logo_url text,
  durable_contact_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.startup_semesters (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  startup_organization_id uuid not null references public.startup_organizations(id) on delete cascade,
  company_snapshot text,
  stage text,
  goals text[] not null default '{}',
  mentorship_needs text[] not null default '{}',
  mentor_need_context text,
  mentor_need_no_preference boolean not null default false,
  preferred_expertise_tags text[] not null default '{}',
  readiness_status text not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, startup_organization_id),
  unique (semester_id, id)
);

create table public.startup_team_memberships (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  startup_semester_id uuid not null,
  semester_membership_id uuid not null,
  is_primary_contact boolean not null default false,
  created_at timestamptz not null default now(),
  unique (startup_semester_id, semester_membership_id),
  foreign key (semester_id, startup_semester_id) references public.startup_semesters(semester_id, id) on delete cascade,
  foreign key (semester_id, semester_membership_id) references public.semester_memberships(semester_id, id) on delete cascade
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  meeting_date date not null,
  label text,
  slot_1_starts_at time not null default '15:30',
  slot_1_ends_at time not null default '16:15',
  slot_2_starts_at time not null default '16:15',
  slot_2_ends_at time not null default '17:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, meeting_date),
  unique (semester_id, id),
  check (extract(isodow from meeting_date) = 5),
  check (slot_1_starts_at < slot_1_ends_at and slot_1_ends_at <= slot_2_starts_at and slot_2_starts_at < slot_2_ends_at)
);

create table public.meeting_availability (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  meeting_id uuid not null,
  semester_membership_id uuid not null,
  slot smallint not null check (slot in (1, 2)),
  is_available boolean not null default true,
  source text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id, semester_membership_id, slot),
  foreign key (semester_id, meeting_id) references public.meetings(semester_id, id) on delete cascade,
  foreign key (semester_id, semester_membership_id) references public.semester_memberships(semester_id, id) on delete cascade
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  meeting_id uuid not null,
  mentor_semester_id uuid not null,
  startup_semester_id uuid not null,
  slot smallint not null check (slot in (1, 2)),
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'declined', 'cancelled')),
  topic text,
  notes text,
  format text,
  startup_absent boolean not null default false,
  substitute_name text,
  idempotency_key text,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (semester_id, meeting_id) references public.meetings(semester_id, id),
  foreign key (semester_id, mentor_semester_id) references public.mentor_semesters(semester_id, id),
  foreign key (semester_id, startup_semester_id) references public.startup_semesters(semester_id, id),
  unique (meeting_id, slot, mentor_semester_id),
  unique (meeting_id, slot, startup_semester_id)
);

create table public.program_audit_events (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  subject_type text not null,
  subject_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  primary_email text,
  linkedin_url text,
  phone text,
  title text,
  location text,
  expertise_tags text[] not null default '{}',
  relationship_types text[] not null default '{}',
  background_notes text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.outreach_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  website_url text,
  linkedin_url text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.outreach_contact_companies (
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  company_id uuid not null references public.outreach_companies(id) on delete cascade,
  relationship_type text not null default 'employee',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (contact_id, company_id, relationship_type)
);

create table public.outreach_opportunities (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  relationship_types text[] not null default array['mentor']::text[],
  stage text not null default 'not_contacted' check (stage in ('not_contacted', 'researching', 'contacted', 'replied', 'conversation_scheduled', 'ready', 'declined', 'closed')),
  owner_profile_id uuid references public.profiles(id) on delete set null,
  next_follow_up_at timestamptz,
  snoozed_until timestamptz,
  silenced_at timestamptz,
  silence_reason text,
  semester_notes text,
  source_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, contact_id),
  unique (semester_id, id),
  check (cardinality(relationship_types) > 0)
);

create table public.outreach_activities (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  opportunity_id uuid not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  activity_type text not null,
  channel text,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (semester_id, opportunity_id) references public.outreach_opportunities(semester_id, id) on delete cascade
);

create table public.outreach_imports (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  source_name text not null,
  idempotency_key text not null,
  status text not null default 'preview' check (status in ('preview', 'committing', 'committed', 'failed')),
  rows jsonb not null default '[]'::jsonb,
  result jsonb not null default '{}'::jsonb,
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, idempotency_key),
  check (jsonb_typeof(rows) = 'array')
);
-- end canonical table manifest

create unique index semesters_one_active_idx on public.semesters (is_active) where is_active;
create index semester_memberships_profile_idx on public.semester_memberships (profile_id, semester_id);
create index mentor_semesters_membership_idx on public.mentor_semesters (semester_membership_id);
create index startup_semesters_organization_idx on public.startup_semesters (startup_organization_id);
create index meeting_availability_member_idx on public.meeting_availability (semester_membership_id, meeting_id);
create index sessions_mentor_idx on public.sessions (mentor_semester_id, meeting_id);
create index sessions_startup_idx on public.sessions (startup_semester_id, meeting_id);
create unique index sessions_semester_idempotency_key on public.sessions (semester_id, idempotency_key) where idempotency_key is not null;
create index outreach_opportunities_owner_idx on public.outreach_opportunities (semester_id, owner_profile_id);
create index outreach_activities_timeline_idx on public.outreach_activities (opportunity_id, occurred_at desc);

alter table public.invitations
  add foreign key (semester_id, startup_semester_id)
  references public.startup_semesters(semester_id, id) on delete set null;

alter table public.semesters enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_roles enable row level security;
alter table public.semester_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.mentor_profiles enable row level security;
alter table public.mentor_semesters enable row level security;
alter table public.startup_organizations enable row level security;
alter table public.startup_semesters enable row level security;
alter table public.startup_team_memberships enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_availability enable row level security;
alter table public.sessions enable row level security;
alter table public.program_audit_events enable row level security;
alter table public.outreach_contacts enable row level security;
alter table public.outreach_companies enable row level security;
alter table public.outreach_contact_companies enable row level security;
alter table public.outreach_opportunities enable row level security;
alter table public.outreach_activities enable row level security;
alter table public.outreach_imports enable row level security;

create or replace function public.carry_forward_outreach_contacts(
  p_source_semester_id uuid,
  p_target_semester_id uuid,
  p_contact_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if auth.uid() is null
     or not public.can_manage_semester(p_source_semester_id, auth.uid())
     or not public.can_manage_semester(p_target_semester_id, auth.uid()) then
    raise exception 'Not authorized to carry outreach contacts between semesters';
  end if;

  insert into public.outreach_opportunities (
    semester_id,
    contact_id,
    relationship_types,
    stage,
    owner_profile_id,
    next_follow_up_at,
    snoozed_until,
    silenced_at,
    silence_reason,
    semester_notes,
    source_context
  )
  select
    p_target_semester_id,
    source.contact_id,
    source.relationship_types,
    'not_contacted',
    null,
    null,
    null,
    null,
    null,
    null,
    jsonb_build_object('carried_from_semester_id', p_source_semester_id, 'carried_from_opportunity_id', source.id)
  from public.outreach_opportunities source
  where source.semester_id = p_source_semester_id
    and source.contact_id = any(p_contact_ids)
  on conflict (semester_id, contact_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke execute on function public.carry_forward_outreach_contacts(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.carry_forward_outreach_contacts(uuid, uuid, uuid[]) to authenticated;

create or replace function public.reset_outreach_opportunities(
  p_semester_id uuid,
  p_opportunity_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reset_count integer;
begin
  if auth.uid() is null or not public.can_manage_semester(p_semester_id, auth.uid()) then
    raise exception 'Not authorized to reset outreach opportunities';
  end if;

  with reset_rows as (
    update public.outreach_opportunities
    set stage = 'not_contacted',
        next_follow_up_at = null,
        snoozed_until = null,
        silenced_at = null,
        silence_reason = null,
        updated_at = now()
    where semester_id = p_semester_id
      and id = any(p_opportunity_ids)
    returning id
  ), logged as (
    insert into public.outreach_activities (
      semester_id, opportunity_id, actor_profile_id, activity_type, body, metadata
    )
    select p_semester_id, id, auth.uid(), 'status_reset', 'Outreach status reset for a new semester review.', '{}'::jsonb
    from reset_rows
    returning id
  )
  select count(*) into reset_count from logged;

  return reset_count;
end;
$$;

revoke execute on function public.reset_outreach_opportunities(uuid, uuid[]) from public, anon;
grant execute on function public.reset_outreach_opportunities(uuid, uuid[]) to authenticated;
