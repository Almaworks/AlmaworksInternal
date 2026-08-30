-- Desired unified outreach CRM schema. Generate migrations from this file with
-- `supabase db diff -f outreach_crm`; never copy it into migrations by hand.

do $$ begin
  create type public.outreach_stage as enum (
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
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.outreach_channel as enum (
    'email',
    'linkedin',
    'warm_intro',
    'referral',
    'event',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.outreach_activity_kind as enum (
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
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.outreach_import_status as enum (
    'preview',
    'reviewing',
    'ready',
    'committing',
    'committed',
    'failed',
    'rolled_back'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.outreach_import_match_decision as enum (
    'create_new',
    'exact_email',
    'exact_linkedin',
    'review_required',
    'merge',
    'exclude'
  );
exception when duplicate_object then null; end $$;

create table public.outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) > 0),
  email text check (email is null or email = lower(btrim(email))),
  linkedin_url text,
  canonical_linkedin_url text,
  phone text,
  biography text,
  expertise_tags text[] not null default '{}',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (canonical_linkedin_url is null or length(btrim(canonical_linkedin_url)) > 0)
);

create unique index outreach_contacts_email_key
  on public.outreach_contacts (email)
  where email is not null;
create unique index outreach_contacts_linkedin_key
  on public.outreach_contacts (canonical_linkedin_url)
  where canonical_linkedin_url is not null;
create index outreach_contacts_created_by_idx
  on public.outreach_contacts (created_by)
  where created_by is not null;

create table public.outreach_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  normalized_name text not null check (normalized_name = lower(btrim(normalized_name))),
  domain text check (domain is null or domain = lower(btrim(domain))),
  website_url text,
  description text,
  sector text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index outreach_companies_domain_key
  on public.outreach_companies (domain)
  where domain is not null;
create index outreach_companies_normalized_name_idx
  on public.outreach_companies (normalized_name);
create index outreach_companies_created_by_idx
  on public.outreach_companies (created_by)
  where created_by is not null;

create table public.outreach_contact_companies (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  company_id uuid not null references public.outreach_companies(id) on delete cascade,
  title text,
  started_on date,
  ended_on date,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);

create unique index outreach_contact_companies_identity_key
  on public.outreach_contact_companies (
    contact_id,
    company_id,
    coalesce(started_on, '-infinity'::date)
  );
create unique index outreach_contact_companies_primary_key
  on public.outreach_contact_companies (contact_id)
  where is_primary and ended_on is null;
create index outreach_contact_companies_company_idx
  on public.outreach_contact_companies (company_id, contact_id);

create table public.outreach_relationship_labels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = lower(btrim(slug)) and length(slug) > 0),
  name text not null unique check (length(btrim(name)) > 0),
  description text,
  color_token text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outreach_relationship_labels_created_by_idx
  on public.outreach_relationship_labels (created_by)
  where created_by is not null;

create table public.outreach_import_jobs (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  source text not null check (source in ('csv', 'excel', 'legacy')),
  source_filename text,
  status public.outreach_import_status not null default 'preview',
  idempotency_key text,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  committed_by uuid references public.profiles(id),
  committed_at timestamptz,
  rolled_back_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, id),
  check (idempotency_key is null or length(btrim(idempotency_key)) > 0),
  check ((status = 'committed') = (committed_at is not null)),
  check (rolled_back_at is null or status = 'rolled_back')
);

create unique index outreach_import_jobs_idempotency_key
  on public.outreach_import_jobs (semester_id, idempotency_key)
  where idempotency_key is not null;
create index outreach_import_jobs_operations_idx
  on public.outreach_import_jobs (semester_id, status, created_at desc, id);
create index outreach_import_jobs_created_by_idx
  on public.outreach_import_jobs (created_by);
create index outreach_import_jobs_committed_by_idx
  on public.outreach_import_jobs (committed_by)
  where committed_by is not null;

create table public.outreach_opportunities (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  contact_id uuid not null references public.outreach_contacts(id) on delete restrict,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  stage public.outreach_stage not null default 'prospect',
  cadence_days smallint not null default 7 check (cadence_days between 1 and 365),
  next_follow_up_at timestamptz,
  snoozed_until timestamptz,
  is_silenced boolean not null default false,
  silenced_at timestamptz,
  silenced_by uuid references public.profiles(id) on delete restrict,
  silence_reason text,
  latest_inbound_activity_at timestamptz,
  latest_outbound_activity_at timestamptz,
  source_channel public.outreach_channel,
  referred_by text,
  priority smallint not null default 50 check (priority between 0 and 100),
  notes text,
  converted_mentor_profile_id uuid references public.mentor_profiles(profile_id) on delete set null,
  converted_startup_semester_id uuid references public.startup_semesters(id) on delete set null,
  conversion_details jsonb not null default '{}'::jsonb,
  source_import_job_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, id),
  foreign key (semester_id, source_import_job_id)
    references public.outreach_import_jobs(semester_id, id)
    on delete set null (source_import_job_id),
  check (
    (
      is_silenced
      and silenced_at is not null
      and silenced_by is not null
      and silence_reason is not null
      and length(btrim(silence_reason)) > 0
    )
    or (
      not is_silenced
      and silenced_at is null
      and silenced_by is null
      and silence_reason is null
    )
  )
);

create unique index outreach_opportunities_one_open_contact_key
  on public.outreach_opportunities (semester_id, contact_id)
  where stage not in ('converted', 'closed');
create index outreach_opportunities_queue_cursor_idx
  on public.outreach_opportunities (semester_id, next_follow_up_at, id)
  where stage not in ('converted', 'closed') and not is_silenced;
create index outreach_opportunities_owner_queue_idx
  on public.outreach_opportunities (semester_id, owner_profile_id, next_follow_up_at, id)
  where stage not in ('converted', 'closed') and not is_silenced;
create index outreach_opportunities_contact_idx
  on public.outreach_opportunities (contact_id, semester_id);
create index outreach_opportunities_owner_idx
  on public.outreach_opportunities (owner_profile_id, semester_id)
  where owner_profile_id is not null;
create index outreach_opportunities_silenced_by_idx
  on public.outreach_opportunities (silenced_by)
  where silenced_by is not null;
create index outreach_opportunities_converted_mentor_idx
  on public.outreach_opportunities (converted_mentor_profile_id)
  where converted_mentor_profile_id is not null;
create index outreach_opportunities_converted_startup_idx
  on public.outreach_opportunities (converted_startup_semester_id)
  where converted_startup_semester_id is not null;
create index outreach_opportunities_import_job_idx
  on public.outreach_opportunities (semester_id, source_import_job_id)
  where source_import_job_id is not null;
create index outreach_opportunities_created_by_idx
  on public.outreach_opportunities (created_by)
  where created_by is not null;

create table public.outreach_opportunity_labels (
  semester_id uuid not null references public.semesters(id) on delete cascade,
  opportunity_id uuid not null,
  relationship_label_id uuid not null references public.outreach_relationship_labels(id) on delete restrict,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (opportunity_id, relationship_label_id),
  foreign key (semester_id, opportunity_id)
    references public.outreach_opportunities(semester_id, id) on delete cascade
);

create index outreach_opportunity_labels_semester_idx
  on public.outreach_opportunity_labels (semester_id, relationship_label_id);
create index outreach_opportunity_labels_label_idx
  on public.outreach_opportunity_labels (relationship_label_id, opportunity_id);
create index outreach_opportunity_labels_added_by_idx
  on public.outreach_opportunity_labels (added_by)
  where added_by is not null;

create table public.outreach_activities (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  opportunity_id uuid not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  activity_kind public.outreach_activity_kind not null,
  channel public.outreach_channel,
  occurred_at timestamptz not null default now(),
  summary text,
  details jsonb not null default '{}'::jsonb,
  previous_owner_profile_id uuid references public.profiles(id) on delete set null,
  new_owner_profile_id uuid references public.profiles(id) on delete set null,
  supersedes_activity_id uuid,
  external_message_id text,
  import_job_id uuid,
  created_at timestamptz not null default now(),
  unique (semester_id, opportunity_id, id),
  foreign key (semester_id, opportunity_id)
    references public.outreach_opportunities(semester_id, id) on delete cascade,
  foreign key (semester_id, import_job_id)
    references public.outreach_import_jobs(semester_id, id)
    on delete set null (import_job_id),
  foreign key (semester_id, opportunity_id, supersedes_activity_id)
    references public.outreach_activities(semester_id, opportunity_id, id) on delete restrict,
  check (activity_kind not in ('email', 'call', 'linkedin') or channel is not null),
  check (external_message_id is null or length(btrim(external_message_id)) > 0)
);

create index outreach_activities_timeline_idx
  on public.outreach_activities (semester_id, opportunity_id, occurred_at desc, id desc);
create index outreach_activities_actor_idx
  on public.outreach_activities (actor_profile_id)
  where actor_profile_id is not null;
create index outreach_activities_previous_owner_idx
  on public.outreach_activities (previous_owner_profile_id)
  where previous_owner_profile_id is not null;
create index outreach_activities_new_owner_idx
  on public.outreach_activities (new_owner_profile_id)
  where new_owner_profile_id is not null;
create index outreach_activities_supersedes_idx
  on public.outreach_activities (semester_id, opportunity_id, supersedes_activity_id)
  where supersedes_activity_id is not null;
create index outreach_activities_import_job_idx
  on public.outreach_activities (semester_id, import_job_id)
  where import_job_id is not null;

create table public.outreach_import_rows (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  import_job_id uuid not null,
  row_number integer not null check (row_number > 0),
  raw_payload jsonb not null,
  normalized_payload jsonb not null default '{}'::jsonb,
  issue_codes text[] not null default '{}',
  match_decision public.outreach_import_match_decision not null default 'review_required',
  matched_contact_id uuid references public.outreach_contacts(id) on delete set null,
  matched_company_id uuid references public.outreach_companies(id) on delete set null,
  selected boolean not null default true,
  excluded boolean not null default false,
  excluded_reason text,
  committed_opportunity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_job_id, row_number),
  foreign key (semester_id, import_job_id)
    references public.outreach_import_jobs(semester_id, id) on delete cascade,
  foreign key (semester_id, committed_opportunity_id)
    references public.outreach_opportunities(semester_id, id) on delete set null,
  check (not (selected and excluded)),
  check (not excluded or excluded_reason is not null),
  check (match_decision <> 'exclude' or excluded)
);

create index outreach_import_rows_semester_idx
  on public.outreach_import_rows (semester_id, import_job_id, row_number);
create index outreach_import_rows_contact_idx
  on public.outreach_import_rows (matched_contact_id)
  where matched_contact_id is not null;
create index outreach_import_rows_company_idx
  on public.outreach_import_rows (matched_company_id)
  where matched_company_id is not null;
create index outreach_import_rows_opportunity_idx
  on public.outreach_import_rows (committed_opportunity_id)
  where committed_opportunity_id is not null;

create or replace function public.can_manage_any_outreach(
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
    from public.semesters
    where public.can_manage_semester(public.semesters.id, candidate_id)
  );
$$;

create or replace function public.can_read_outreach_relationship_labels(
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
      where public.semester_memberships.profile_id = candidate_id
        and public.semester_memberships.role = 'admin'
        and public.semester_memberships.status = 'active'
    );
$$;

create or replace function public.has_outreach_contact_access(
  target_contact_id uuid,
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
    from public.outreach_opportunities
    where public.outreach_opportunities.contact_id = target_contact_id
      and public.can_manage_semester(public.outreach_opportunities.semester_id, candidate_id)
  );
$$;

create or replace function public.has_outreach_company_access(
  target_company_id uuid,
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
    from public.outreach_contact_companies
    join public.outreach_opportunities
      on public.outreach_opportunities.contact_id = public.outreach_contact_companies.contact_id
    where public.outreach_contact_companies.company_id = target_company_id
      and public.can_manage_semester(public.outreach_opportunities.semester_id, candidate_id)
  );
$$;

create or replace function public.validate_outreach_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create trigger validate_outreach_owner_membership
before insert or update of semester_id, owner_profile_id, stage
on public.outreach_opportunities
for each row execute function public.validate_outreach_owner_membership();

create or replace function public.prevent_outreach_activity_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Outreach activities are append-only' using errcode = '55000';
end;
$$;

create trigger prevent_outreach_activity_mutation
before update or delete on public.outreach_activities
for each row execute function public.prevent_outreach_activity_mutation();

create or replace function public.log_outreach_activity(
  p_opportunity_id uuid,
  p_activity_kind public.outreach_activity_kind,
  p_occurred_at timestamptz default now(),
  p_channel public.outreach_channel default null,
  p_summary text default null,
  p_details jsonb default '{}'::jsonb,
  p_next_follow_up_at timestamptz default null,
  p_stage public.outreach_stage default null,
  p_expected_updated_at timestamptz default null
)
returns public.outreach_activities
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.transfer_outreach_owner(
  p_opportunity_id uuid,
  p_new_owner_profile_id uuid,
  p_reason text default null,
  p_expected_updated_at timestamptz default null
)
returns public.outreach_opportunities
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.set_outreach_snooze(
  p_opportunity_id uuid,
  p_snoozed_until timestamptz,
  p_reason text default null,
  p_expected_updated_at timestamptz default null
)
returns public.outreach_opportunities
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.set_outreach_silence(
  p_opportunity_id uuid,
  p_is_silenced boolean,
  p_reason text default null,
  p_next_follow_up_at timestamptz default null,
  p_expected_updated_at timestamptz default null
)
returns public.outreach_opportunities
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.release_inactive_owner_work(
  p_owner_profile_id uuid
)
returns table (opportunity_id uuid)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.suspend_outreach_membership(
  p_semester_id uuid,
  p_profile_id uuid,
  p_reason text,
  p_expected_updated_at timestamptz
)
returns table (
  membership_id uuid,
  membership_status public.membership_lifecycle_status,
  membership_updated_at timestamptz,
  released_opportunity_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

alter table public.outreach_contacts enable row level security;
alter table public.outreach_companies enable row level security;
alter table public.outreach_contact_companies enable row level security;
alter table public.outreach_relationship_labels enable row level security;
alter table public.outreach_opportunities enable row level security;
alter table public.outreach_opportunity_labels enable row level security;
alter table public.outreach_activities enable row level security;
alter table public.outreach_import_jobs enable row level security;
alter table public.outreach_import_rows enable row level security;

create policy "semester managers read outreach contacts" on public.outreach_contacts
  for select to authenticated
  using (public.has_outreach_contact_access(id));
create policy "semester managers create outreach contacts" on public.outreach_contacts
  for insert to authenticated
  with check (public.can_manage_any_outreach());
create policy "semester managers update outreach contacts" on public.outreach_contacts
  for update to authenticated
  using (public.has_outreach_contact_access(id))
  with check (public.has_outreach_contact_access(id));
create policy "semester managers delete outreach contacts" on public.outreach_contacts
  for delete to authenticated
  using (public.has_outreach_contact_access(id));

create policy "semester managers read outreach companies" on public.outreach_companies
  for select to authenticated
  using (public.has_outreach_company_access(id));
create policy "semester managers create outreach companies" on public.outreach_companies
  for insert to authenticated
  with check (public.can_manage_any_outreach());
create policy "semester managers update outreach companies" on public.outreach_companies
  for update to authenticated
  using (public.has_outreach_company_access(id))
  with check (public.has_outreach_company_access(id));
create policy "semester managers delete outreach companies" on public.outreach_companies
  for delete to authenticated
  using (public.has_outreach_company_access(id));

create policy "semester managers read outreach contact companies" on public.outreach_contact_companies
  for select to authenticated
  using (
    public.has_outreach_contact_access(contact_id)
    and public.has_outreach_company_access(company_id)
  );
create policy "semester managers create outreach contact companies" on public.outreach_contact_companies
  for insert to authenticated
  with check (
    public.has_outreach_contact_access(contact_id)
    and public.has_outreach_company_access(company_id)
  );
create policy "semester managers update outreach contact companies" on public.outreach_contact_companies
  for update to authenticated
  using (
    public.has_outreach_contact_access(contact_id)
    and public.has_outreach_company_access(company_id)
  )
  with check (
    public.has_outreach_contact_access(contact_id)
    and public.has_outreach_company_access(company_id)
  );
create policy "semester managers delete outreach contact companies" on public.outreach_contact_companies
  for delete to authenticated
  using (
    public.has_outreach_contact_access(contact_id)
    and public.has_outreach_company_access(company_id)
  );

create policy "active outreach administrators read relationship labels" on public.outreach_relationship_labels
  for select to authenticated
  using (public.can_read_outreach_relationship_labels());
create policy "super administrators create relationship labels" on public.outreach_relationship_labels
  for insert to authenticated
  with check (public.is_super_admin());
create policy "super administrators update relationship labels" on public.outreach_relationship_labels
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
create policy "super administrators delete relationship labels" on public.outreach_relationship_labels
  for delete to authenticated
  using (public.is_super_admin());

create policy "semester managers read outreach opportunities" on public.outreach_opportunities
  for select to authenticated
  using (public.can_manage_semester(semester_id));
create policy "semester managers create outreach opportunities" on public.outreach_opportunities
  for insert to authenticated
  with check (public.can_manage_semester(semester_id));

create policy "semester managers manage outreach opportunity labels" on public.outreach_opportunity_labels
  for all to authenticated
  using (public.can_manage_semester(semester_id))
  with check (public.can_manage_semester(semester_id));

create policy "semester managers read outreach activities" on public.outreach_activities
  for select to authenticated
  using (public.can_manage_semester(semester_id));

create policy "semester managers manage outreach import jobs" on public.outreach_import_jobs
  for all to authenticated
  using (public.can_manage_semester(semester_id))
  with check (public.can_manage_semester(semester_id));

create policy "semester managers manage outreach import rows" on public.outreach_import_rows
  for all to authenticated
  using (public.can_manage_semester(semester_id))
  with check (public.can_manage_semester(semester_id));

revoke all on public.outreach_contacts from anon, authenticated, service_role;
revoke all on public.outreach_companies from anon, authenticated, service_role;
revoke all on public.outreach_contact_companies from anon, authenticated, service_role;
revoke all on public.outreach_relationship_labels from anon, authenticated, service_role;
revoke all on public.outreach_opportunities from anon, authenticated, service_role;
revoke all on public.outreach_opportunity_labels from anon, authenticated, service_role;
revoke all on public.outreach_activities from anon, authenticated, service_role;
revoke all on public.outreach_import_jobs from anon, authenticated, service_role;
revoke all on public.outreach_import_rows from anon, authenticated, service_role;

grant select, insert, update, delete on public.outreach_contacts to authenticated;
grant select, insert, update, delete on public.outreach_companies to authenticated;
grant select, insert, update, delete on public.outreach_contact_companies to authenticated;
grant select, insert, update, delete on public.outreach_relationship_labels to authenticated;
grant select, insert on public.outreach_opportunities to authenticated;
grant select, insert, update, delete on public.outreach_opportunity_labels to authenticated;
grant select on public.outreach_activities to authenticated;
grant select, insert, update, delete on public.outreach_import_jobs to authenticated;
grant select, insert, update, delete on public.outreach_import_rows to authenticated;

grant all on public.outreach_contacts to service_role;
grant all on public.outreach_companies to service_role;
grant all on public.outreach_contact_companies to service_role;
grant all on public.outreach_relationship_labels to service_role;
grant all on public.outreach_opportunities to service_role;
grant all on public.outreach_opportunity_labels to service_role;
grant select, insert on public.outreach_activities to service_role;
grant all on public.outreach_import_jobs to service_role;
grant all on public.outreach_import_rows to service_role;

revoke execute on function public.can_manage_any_outreach(uuid) from public, anon;
revoke execute on function public.can_read_outreach_relationship_labels(uuid) from public, anon;
revoke execute on function public.has_outreach_contact_access(uuid, uuid) from public, anon;
revoke execute on function public.has_outreach_company_access(uuid, uuid) from public, anon;
revoke execute on function public.validate_outreach_owner_membership() from public, anon, authenticated;
revoke execute on function public.prevent_outreach_activity_mutation() from public, anon, authenticated;
revoke execute on function public.log_outreach_activity(
  uuid,
  public.outreach_activity_kind,
  timestamptz,
  public.outreach_channel,
  text,
  jsonb,
  timestamptz,
  public.outreach_stage,
  timestamptz
) from public, anon;
revoke execute on function public.transfer_outreach_owner(uuid, uuid, text, timestamptz) from public, anon;
revoke execute on function public.set_outreach_snooze(uuid, timestamptz, text, timestamptz) from public, anon;
revoke execute on function public.set_outreach_silence(uuid, boolean, text, timestamptz, timestamptz) from public, anon;
revoke execute on function public.release_inactive_owner_work(uuid) from public, anon;
revoke execute on function public.suspend_outreach_membership(uuid, uuid, text, timestamptz) from public, anon;

grant execute on function public.can_manage_any_outreach(uuid) to authenticated;
grant execute on function public.can_read_outreach_relationship_labels(uuid) to authenticated;
grant execute on function public.has_outreach_contact_access(uuid, uuid) to authenticated;
grant execute on function public.has_outreach_company_access(uuid, uuid) to authenticated;
grant execute on function public.log_outreach_activity(
  uuid,
  public.outreach_activity_kind,
  timestamptz,
  public.outreach_channel,
  text,
  jsonb,
  timestamptz,
  public.outreach_stage,
  timestamptz
) to authenticated;
grant execute on function public.transfer_outreach_owner(uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.set_outreach_snooze(uuid, timestamptz, text, timestamptz) to authenticated;
grant execute on function public.set_outreach_silence(uuid, boolean, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.release_inactive_owner_work(uuid) to authenticated;
grant execute on function public.suspend_outreach_membership(uuid, uuid, text, timestamptz) to authenticated;
