-- Desired v2 lifecycle schema. Generate the migration from this file with
-- `supabase db diff -f semester_lifecycle_v2`; never copy it into migrations by hand.

do $$ begin
  create type public.semester_lifecycle_status as enum ('draft', 'active', 'closed', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_lifecycle_status as enum ('invited', 'onboarding', 'active', 'alumni', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invitation_lifecycle_status as enum ('draft', 'queued', 'sent', 'failed', 'accepted', 'expired', 'revoked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.access_request_status as enum ('pending', 'approved', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.platform_role as enum ('super_admin');
exception when duplicate_object then null; end $$;

alter table public.semesters
  add column if not exists lifecycle_status public.semester_lifecycle_status not null default 'draft',
  add column if not exists configuration jsonb not null default '{}'::jsonb,
  add column if not exists configuration_template_version integer,
  add column if not exists closed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.semesters
  add constraint semesters_active_lifecycle_status_check
  check (not is_active or lifecycle_status = 'active') not valid;

create table public.platform_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.platform_role not null,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (profile_id, role)
);

create table public.lifecycle_configuration_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version integer not null check (version > 0),
  configuration jsonb not null,
  is_recommended boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (name, version)
);

create table public.startup_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  industry text,
  website_url text,
  logo_url text,
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

create table public.semester_memberships (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.user_role not null,
  status public.membership_lifecycle_status not null default 'invited',
  invited_at timestamptz,
  activated_at timestamptz,
  alumni_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, profile_id, role)
);

create table public.startup_semesters (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  startup_organization_id uuid not null references public.startup_organizations(id) on delete cascade,
  company_snapshot text,
  stage public.startup_stage,
  goals text[] not null default '{}',
  mentorship_needs text[] not null default '{}',
  mentor_need_context text,
  mentor_need_no_preference boolean not null default false,
  preferred_expertise_tags text[] not null default '{}',
  readiness_status text not null default 'not_started' check (readiness_status in ('not_started', 'in_progress', 'ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, startup_organization_id)
);

create table public.startup_team_memberships (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  startup_semester_id uuid not null references public.startup_semesters(id) on delete cascade,
  semester_membership_id uuid not null references public.semester_memberships(id) on delete cascade,
  is_primary_contact boolean not null default false,
  created_at timestamptz not null default now(),
  unique (startup_semester_id, semester_membership_id)
);

create table public.mentor_semesters (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  semester_membership_id uuid not null references public.semester_memberships(id) on delete cascade,
  mentorship_goals text,
  preferred_format text,
  capacity integer not null default 4 check (capacity between 0 and 50),
  readiness_status text not null default 'not_started' check (readiness_status in ('not_started', 'in_progress', 'ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, semester_membership_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  full_name text not null,
  role public.user_role not null,
  startup_semester_id uuid references public.startup_semesters(id) on delete set null,
  matched_profile_id uuid references public.profiles(id) on delete set null,
  invited_by uuid not null references public.profiles(id),
  status public.invitation_lifecycle_status not null default 'draft',
  expires_at timestamptz not null,
  sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  last_error_code text,
  last_error_message text,
  send_attempts integer not null default 0 check (send_attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((role = 'startup' and startup_semester_id is not null) or (role <> 'startup' and startup_semester_id is null))
);

create unique index invitations_open_identity_idx
  on public.invitations (semester_id, email, role)
  where status in ('draft', 'queued', 'sent');

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  requester_profile_id uuid references public.profiles(id) on delete set null,
  email text not null check (email = lower(trim(email))),
  full_name text not null,
  requested_role public.user_role not null,
  startup_name text,
  reason text,
  status public.access_request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index access_requests_open_identity_idx
  on public.access_requests (semester_id, email)
  where status = 'pending';

create table public.onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  semester_membership_id uuid not null references public.semester_memberships(id) on delete cascade,
  item_key text not null,
  is_required boolean not null,
  completed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_membership_id, item_key)
);

create table public.availability_windows (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  startup_semester_id uuid references public.startup_semesters(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  source text not null default 'user' check (source in ('default', 'user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((profile_id is not null)::integer + (startup_semester_id is not null)::integer = 1)
);

create table public.lifecycle_audit_events (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  subject_type text not null,
  subject_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.invitation_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  provider text not null,
  provider_message_id text,
  outcome text not null check (outcome in ('accepted', 'failed')),
  error_code text,
  error_message text,
  attempted_at timestamptz not null default now()
);

create index semester_memberships_profile_idx on public.semester_memberships (profile_id, semester_id);
create index semester_memberships_operations_idx on public.semester_memberships (semester_id, status, role);
create index startup_team_memberships_profile_idx on public.startup_team_memberships (semester_membership_id);
create index invitations_operations_idx on public.invitations (semester_id, status, created_at desc);
create index access_requests_operations_idx on public.access_requests (semester_id, status, created_at desc);
create index onboarding_progress_membership_idx on public.onboarding_progress (semester_membership_id);
create index availability_windows_profile_idx on public.availability_windows (semester_id, profile_id);
create index availability_windows_startup_idx on public.availability_windows (semester_id, startup_semester_id);
create index lifecycle_audit_events_subject_idx on public.lifecycle_audit_events (semester_id, subject_type, subject_id);

create or replace function public.is_super_admin(candidate_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_roles
    where profile_id = candidate_id and role = 'super_admin'
  );
$$;

create or replace function public.has_semester_role(
  target_semester_id uuid,
  allowed_roles public.user_role[],
  candidate_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.semester_memberships
    where semester_id = target_semester_id
      and profile_id = candidate_id
      and role = any(allowed_roles)
      and status in ('onboarding', 'active', 'alumni')
  );
$$;

create or replace function public.can_manage_semester(
  target_semester_id uuid,
  candidate_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin(candidate_id)
    or exists (
      select 1
      from public.semester_memberships
      where semester_id = target_semester_id
        and profile_id = candidate_id
        and role = 'admin'
        and status in ('onboarding', 'active')
    );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.bulk_set_membership_activity(
  p_semester_id uuid,
  p_membership_ids uuid[],
  p_is_active boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.import_prior_semester_memberships(
  p_source_semester_id uuid,
  p_target_semester_id uuid,
  p_membership_ids uuid[] default null
)
returns table (source_count integer, imported_count integer, skipped_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_count integer;
  v_requested_count integer;
  v_imported_ids uuid[];
  v_imported_count integer;
begin
  if p_source_semester_id = p_target_semester_id then
    raise exception 'Source and target semesters must differ' using errcode = '22023';
  end if;
  if auth.uid() is null
    or not public.can_manage_semester(p_source_semester_id, auth.uid())
    or not public.can_manage_semester(p_target_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required for both cohorts' using errcode = '42501';
  end if;

  v_requested_count := cardinality(p_membership_ids);
  if p_membership_ids is not null and (v_requested_count < 1 or v_requested_count > 200) then
    raise exception 'Between 1 and 200 membership ids are required' using errcode = '22023';
  end if;

  select count(*)
  into v_source_count
  from public.semester_memberships as source
  where source.semester_id = p_source_semester_id
    and (p_membership_ids is null or source.id = any(p_membership_ids));

  if p_membership_ids is not null and v_source_count <> v_requested_count then
    raise exception 'Every selected membership must belong to the source semester' using errcode = '22023';
  end if;

  with inserted as (
    insert into public.semester_memberships (
      semester_id, profile_id, role, status, invited_at
    )
    select p_target_semester_id, source.profile_id, source.role, 'invited', now()
    from public.semester_memberships as source
    where source.semester_id = p_source_semester_id
      and (p_membership_ids is null or source.id = any(p_membership_ids))
    on conflict (semester_id, profile_id, role) do nothing
    returning id
  )
  select coalesce(array_agg(inserted.id), '{}'::uuid[])
  into v_imported_ids
  from inserted;

  v_imported_count := cardinality(v_imported_ids);

  insert into public.startup_semesters (
    semester_id,
    startup_organization_id,
    company_snapshot,
    stage,
    goals,
    mentorship_needs,
    preferred_expertise_tags,
    readiness_status
  )
  select distinct
    p_target_semester_id,
    source_startup.startup_organization_id,
    source_startup.company_snapshot,
    source_startup.stage,
    source_startup.goals,
    source_startup.mentorship_needs,
    source_startup.preferred_expertise_tags,
    'not_started'
  from public.semester_memberships as source_membership
  join public.startup_team_memberships as source_team
    on source_team.semester_membership_id = source_membership.id
  join public.startup_semesters as source_startup
    on source_startup.id = source_team.startup_semester_id
  where source_membership.semester_id = p_source_semester_id
    and (p_membership_ids is null or source_membership.id = any(p_membership_ids))
  on conflict (semester_id, startup_organization_id) do nothing;

  insert into public.startup_team_memberships (
    semester_id, startup_semester_id, semester_membership_id, is_primary_contact
  )
  select
    p_target_semester_id,
    target_startup.id,
    target_membership.id,
    source_team.is_primary_contact
  from public.semester_memberships as source_membership
  join public.startup_team_memberships as source_team
    on source_team.semester_membership_id = source_membership.id
  join public.startup_semesters as source_startup
    on source_startup.id = source_team.startup_semester_id
  join public.startup_semesters as target_startup
    on target_startup.semester_id = p_target_semester_id
   and target_startup.startup_organization_id = source_startup.startup_organization_id
  join public.semester_memberships as target_membership
    on target_membership.semester_id = p_target_semester_id
   and target_membership.profile_id = source_membership.profile_id
   and target_membership.role = source_membership.role
  where source_membership.semester_id = p_source_semester_id
    and (p_membership_ids is null or source_membership.id = any(p_membership_ids))
  on conflict (startup_semester_id, semester_membership_id) do nothing;

  insert into public.mentor_semesters (
    semester_id,
    semester_membership_id,
    mentorship_goals,
    preferred_format,
    capacity,
    readiness_status
  )
  select
    p_target_semester_id,
    target_membership.id,
    source_mentor.mentorship_goals,
    source_mentor.preferred_format,
    source_mentor.capacity,
    'not_started'
  from public.semester_memberships as source_membership
  join public.mentor_semesters as source_mentor
    on source_mentor.semester_membership_id = source_membership.id
  join public.semester_memberships as target_membership
    on target_membership.semester_id = p_target_semester_id
   and target_membership.profile_id = source_membership.profile_id
   and target_membership.role = source_membership.role
  where source_membership.semester_id = p_source_semester_id
    and (p_membership_ids is null or source_membership.id = any(p_membership_ids))
  on conflict (semester_id, semester_membership_id) do nothing;

  insert into public.lifecycle_audit_events (
    semester_id, actor_profile_id, action, subject_type, subject_id, details
  )
  select p_target_semester_id,
         auth.uid(),
         'membership.imported',
         'semester_membership',
         imported_id,
         jsonb_build_object('source_semester_id', p_source_semester_id)
  from unnest(v_imported_ids) as imported_id;

  return query select v_source_count, v_imported_count, v_source_count - v_imported_count;
end;
$$;

create or replace function public.create_semester_draft(
  p_source_semester_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_configuration jsonb
)
returns table (semester_id uuid, semester_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semester_id uuid;
begin
  if auth.uid() is null or not public.can_manage_semester(p_source_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Semester name is required' using errcode = '22023';
  end if;
  if p_end_date <= p_start_date then
    raise exception 'Semester end date must be after its start date' using errcode = '22023';
  end if;
  if exists (select 1 from public.semesters where lower(name) = lower(trim(p_name))) then
    raise exception 'A semester with this name already exists' using errcode = '23505';
  end if;

  insert into public.semesters (
    name, start_date, end_date, is_active, lifecycle_status, configuration
  ) values (
    trim(p_name), p_start_date, p_end_date, false, 'draft', coalesce(p_configuration, '{}'::jsonb)
  )
  returning id into v_semester_id;

  insert into public.semester_memberships (
    semester_id, profile_id, role, status, activated_at
  ) values (
    v_semester_id, auth.uid(), 'admin', 'active', now()
  );

  insert into public.lifecycle_audit_events (
    semester_id, actor_profile_id, action, subject_type, subject_id, details
  ) values (
    v_semester_id,
    auth.uid(),
    'semester.draft_created',
    'semester',
    v_semester_id,
    jsonb_build_object('source_semester_id', p_source_semester_id, 'name', trim(p_name))
  );

  return query select v_semester_id, trim(p_name);
end;
$$;

create or replace function public.activate_semester_transition(
  p_source_semester_id uuid,
  p_target_semester_id uuid
)
returns table (closed_semester_id uuid, active_semester_id uuid, alumni_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alumni_count integer;
  v_source_active boolean;
  v_target_status public.semester_lifecycle_status;
begin
  if p_source_semester_id = p_target_semester_id then
    raise exception 'Source and target semesters must differ' using errcode = '22023';
  end if;
  if auth.uid() is null
    or not public.can_manage_semester(p_source_semester_id, auth.uid())
    or not public.can_manage_semester(p_target_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required for both semesters' using errcode = '42501';
  end if;

  select is_active into v_source_active
  from public.semesters
  where id = p_source_semester_id
  for update;
  select lifecycle_status into v_target_status
  from public.semesters
  where id = p_target_semester_id
  for update;

  if v_source_active is distinct from true then
    raise exception 'Source semester must be the active semester' using errcode = '22023';
  end if;
  if v_target_status is distinct from 'draft' then
    raise exception 'Target semester must be a draft' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.semester_memberships
    where semester_id = p_target_semester_id
      and role = 'admin'
      and status in ('onboarding', 'active')
  ) then
    raise exception 'Target semester requires an administrator' using errcode = '22023';
  end if;

  update public.semester_memberships
  set status = 'alumni', alumni_at = now(), updated_at = now()
  where semester_id = p_source_semester_id
    and role <> 'admin'
    and status in ('onboarding', 'active');
  get diagnostics v_alumni_count = row_count;

  update public.semesters
  set is_active = false, lifecycle_status = 'closed', closed_at = now(), updated_at = now()
  where id = p_source_semester_id;

  update public.semesters
  set is_active = true, lifecycle_status = 'active', closed_at = null, updated_at = now()
  where id = p_target_semester_id;

  insert into public.lifecycle_audit_events (
    semester_id, actor_profile_id, action, subject_type, subject_id, details
  ) values
    (
      p_source_semester_id,
      auth.uid(),
      'semester.closed',
      'semester',
      p_source_semester_id,
      jsonb_build_object('next_semester_id', p_target_semester_id, 'alumni_count', v_alumni_count)
    ),
    (
      p_target_semester_id,
      auth.uid(),
      'semester.activated',
      'semester',
      p_target_semester_id,
      jsonb_build_object('previous_semester_id', p_source_semester_id)
    );

  return query select p_source_semester_id, p_target_semester_id, v_alumni_count;
end;
$$;

create or replace function public.replace_draft_meetings(
  p_semester_id uuid,
  p_meetings jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semester_start date;
  v_semester_end date;
  v_meeting_count integer;
  v_inserted_count integer;
begin
  if auth.uid() is null or not public.can_manage_semester(p_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  select start_date, end_date
  into v_semester_start, v_semester_end
  from public.semesters
  where id = p_semester_id and lifecycle_status = 'draft'
  for update;
  if v_semester_start is null then
    raise exception 'Meetings can only be changed for a draft semester' using errcode = '22023';
  end if;
  if jsonb_typeof(p_meetings) is distinct from 'array' then
    raise exception 'Meetings must be a JSON array' using errcode = '22023';
  end if;

  v_meeting_count := jsonb_array_length(p_meetings);
  if v_meeting_count < 1 or v_meeting_count > 30 then
    raise exception 'Between 1 and 30 meetings are required' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_meetings) as proposed(date date, label text)
    where proposed.date is null
      or proposed.date < v_semester_start
      or proposed.date > v_semester_end
      or extract(isodow from proposed.date) <> 5
      or nullif(trim(proposed.label), '') is null
  ) then
    raise exception 'Every meeting must be a labeled Friday inside the semester' using errcode = '22023';
  end if;
  if (
    select count(distinct proposed.date)
    from jsonb_to_recordset(p_meetings) as proposed(date date, label text)
  ) <> v_meeting_count then
    raise exception 'Meeting dates must be unique' using errcode = '22023';
  end if;

  delete from public.meetings where semester_id = p_semester_id;
  insert into public.meetings (semester_id, meeting_date, label)
  select p_semester_id, proposed.date, trim(proposed.label)
  from jsonb_to_recordset(p_meetings) as proposed(date date, label text);
  get diagnostics v_inserted_count = row_count;

  insert into public.lifecycle_audit_events (
    semester_id, actor_profile_id, action, subject_type, subject_id, details
  ) values (
    p_semester_id,
    auth.uid(),
    'semester.meetings_replaced',
    'semester',
    p_semester_id,
    jsonb_build_object('meeting_count', v_inserted_count)
  );

  return v_inserted_count;
end;
$$;

alter table public.platform_roles enable row level security;
alter table public.lifecycle_configuration_templates enable row level security;
alter table public.startup_organizations enable row level security;
alter table public.mentor_profiles enable row level security;
alter table public.semester_memberships enable row level security;
alter table public.startup_semesters enable row level security;
alter table public.startup_team_memberships enable row level security;
alter table public.mentor_semesters enable row level security;
alter table public.invitations enable row level security;
alter table public.access_requests enable row level security;
alter table public.onboarding_progress enable row level security;
alter table public.availability_windows enable row level security;
alter table public.lifecycle_audit_events enable row level security;
alter table public.invitation_delivery_attempts enable row level security;

create policy "platform roles visible to owner" on public.platform_roles
  for select to authenticated using (profile_id = auth.uid() or public.is_super_admin());

create policy "super admins manage platform roles" on public.platform_roles
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy "authenticated users read configuration templates" on public.lifecycle_configuration_templates
  for select to authenticated using (true);

create policy "super admins manage configuration templates" on public.lifecycle_configuration_templates
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy "members read startup organizations" on public.startup_organizations
  for select to authenticated using (exists (
    select 1 from public.startup_semesters ss
    where ss.startup_organization_id = startup_organizations.id
      and public.has_semester_role(ss.semester_id, array['mentor', 'startup', 'admin']::public.user_role[])
  ));

create policy "semester admins manage startup organizations" on public.startup_organizations
  for all to authenticated using (exists (
    select 1 from public.startup_semesters ss
    where ss.startup_organization_id = startup_organizations.id and public.can_manage_semester(ss.semester_id)
  ));

create policy "authenticated members read mentor profiles" on public.mentor_profiles
  for select to authenticated using (exists (
    select 1 from public.semester_memberships sm
    where sm.profile_id = mentor_profiles.profile_id
      and public.has_semester_role(sm.semester_id, array['mentor', 'startup', 'admin']::public.user_role[])
  ));

create policy "mentors update own mentor profile" on public.mentor_profiles
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "members read own semester memberships" on public.semester_memberships
  for select to authenticated using (profile_id = auth.uid() or public.can_manage_semester(semester_id));

create policy "semester admins manage semester memberships" on public.semester_memberships
  for all to authenticated using (public.can_manage_semester(semester_id)) with check (public.can_manage_semester(semester_id));

create policy "cohort reads startup semesters" on public.startup_semesters
  for select to authenticated using (public.has_semester_role(semester_id, array['mentor', 'startup', 'admin']::public.user_role[]));

create policy "startup teams update startup semester" on public.startup_semesters
  for update to authenticated using (exists (
    select 1
    from public.startup_team_memberships stm
    join public.semester_memberships sm on sm.id = stm.semester_membership_id
    where stm.startup_semester_id = startup_semesters.id
      and sm.profile_id = auth.uid()
      and sm.status in ('onboarding', 'active')
  )) with check (semester_id = semester_id);

create policy "startup teams read their memberships" on public.startup_team_memberships
  for select to authenticated using (exists (
    select 1 from public.semester_memberships sm
    where sm.id = startup_team_memberships.semester_membership_id
      and (sm.profile_id = auth.uid() or public.can_manage_semester(startup_team_memberships.semester_id))
  ));

create policy "semester admins manage startup team memberships" on public.startup_team_memberships
  for all to authenticated using (public.can_manage_semester(semester_id)) with check (public.can_manage_semester(semester_id));

create policy "mentors read own semester profile" on public.mentor_semesters
  for select to authenticated using (exists (
    select 1 from public.semester_memberships sm
    where sm.id = mentor_semesters.semester_membership_id
      and (sm.profile_id = auth.uid() or public.can_manage_semester(mentor_semesters.semester_id))
  ));

create policy "mentors update own semester profile" on public.mentor_semesters
  for update to authenticated using (exists (
    select 1 from public.semester_memberships sm
    where sm.id = mentor_semesters.semester_membership_id
      and sm.profile_id = auth.uid()
      and sm.status in ('onboarding', 'active')
  ));

create policy "semester admins manage invitations" on public.invitations
  for all to authenticated using (public.can_manage_semester(semester_id)) with check (public.can_manage_semester(semester_id));

create policy "requesters read own access requests" on public.access_requests
  for select to authenticated using (requester_profile_id = auth.uid() or public.can_manage_semester(semester_id));

create policy "semester admins review access requests" on public.access_requests
  for update to authenticated using (public.can_manage_semester(semester_id)) with check (public.can_manage_semester(semester_id));

create policy "members manage own onboarding progress" on public.onboarding_progress
  for all to authenticated using (exists (
    select 1 from public.semester_memberships sm
    where sm.id = onboarding_progress.semester_membership_id
      and (sm.profile_id = auth.uid() or public.can_manage_semester(onboarding_progress.semester_id))
  )) with check (exists (
    select 1 from public.semester_memberships sm
    where sm.id = onboarding_progress.semester_membership_id
      and (sm.profile_id = auth.uid() or public.can_manage_semester(onboarding_progress.semester_id))
  ));

create policy "owners manage availability" on public.availability_windows
  for all to authenticated using (
    profile_id = auth.uid()
    or exists (
      select 1
      from public.startup_team_memberships stm
      join public.semester_memberships sm on sm.id = stm.semester_membership_id
      where stm.startup_semester_id = availability_windows.startup_semester_id and sm.profile_id = auth.uid()
    )
    or public.can_manage_semester(semester_id)
  ) with check (
    profile_id = auth.uid()
    or exists (
      select 1
      from public.startup_team_memberships stm
      join public.semester_memberships sm on sm.id = stm.semester_membership_id
      where stm.startup_semester_id = availability_windows.startup_semester_id and sm.profile_id = auth.uid()
    )
    or public.can_manage_semester(semester_id)
  );

create policy "semester admins read lifecycle audit" on public.lifecycle_audit_events
  for select to authenticated using (public.can_manage_semester(semester_id));

create policy "semester admins read delivery attempts" on public.invitation_delivery_attempts
  for select to authenticated using (public.can_manage_semester(semester_id));

revoke all on public.profiles from anon, authenticated;

revoke all on public.platform_roles from anon, authenticated;
revoke all on public.lifecycle_configuration_templates from anon, authenticated;
revoke all on public.startup_organizations from anon, authenticated;
revoke all on public.mentor_profiles from anon, authenticated;
revoke all on public.semester_memberships from anon, authenticated;
revoke all on public.startup_semesters from anon, authenticated;
revoke all on public.startup_team_memberships from anon, authenticated;
revoke all on public.mentor_semesters from anon, authenticated;
revoke all on public.invitations from anon, authenticated;
revoke all on public.access_requests from anon, authenticated;
revoke all on public.onboarding_progress from anon, authenticated;
revoke all on public.availability_windows from anon, authenticated;
revoke all on public.lifecycle_audit_events from anon, authenticated;
revoke all on public.invitation_delivery_attempts from anon, authenticated;

drop policy if exists "users can update own profile" on public.profiles;
create policy "users update own safe profile fields" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select on public.platform_roles to authenticated;
grant select on public.lifecycle_configuration_templates to authenticated;
grant select on public.startup_organizations to authenticated;
grant select, update on public.mentor_profiles to authenticated;
grant select on public.semester_memberships to authenticated;
grant select, update on public.startup_semesters to authenticated;
grant select on public.startup_team_memberships to authenticated;
grant select, update on public.mentor_semesters to authenticated;
grant select on public.invitations to authenticated;
grant select, update on public.access_requests to authenticated;
grant select, insert, update, delete on public.onboarding_progress to authenticated;
grant select, insert, update, delete on public.availability_windows to authenticated;
grant select on public.lifecycle_audit_events to authenticated;
grant select on public.invitation_delivery_attempts to authenticated;

revoke execute on function public.is_super_admin(uuid) from public, anon;
revoke execute on function public.has_semester_role(uuid, public.user_role[], uuid) from public, anon;
revoke execute on function public.can_manage_semester(uuid, uuid) from public, anon;
revoke execute on function public.bulk_set_membership_activity(uuid, uuid[], boolean) from public, anon;
revoke execute on function public.import_prior_semester_memberships(uuid, uuid, uuid[]) from public, anon;
revoke execute on function public.create_semester_draft(uuid, text, date, date, jsonb) from public, anon;
revoke execute on function public.activate_semester_transition(uuid, uuid) from public, anon;
revoke execute on function public.replace_draft_meetings(uuid, jsonb) from public, anon;

grant execute on function public.is_super_admin(uuid) to authenticated;
grant execute on function public.has_semester_role(uuid, public.user_role[], uuid) to authenticated;
grant execute on function public.can_manage_semester(uuid, uuid) to authenticated;
grant execute on function public.bulk_set_membership_activity(uuid, uuid[], boolean) to authenticated;
grant execute on function public.import_prior_semester_memberships(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.create_semester_draft(uuid, text, date, date, jsonb) to authenticated;
grant execute on function public.activate_semester_transition(uuid, uuid) to authenticated;
grant execute on function public.replace_draft_meetings(uuid, jsonb) to authenticated;

grant all on all tables in schema public to service_role;
