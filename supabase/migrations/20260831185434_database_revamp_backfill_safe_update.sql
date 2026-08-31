set local check_function_bodies = off;

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
      end
  where session.meeting_id is distinct from session.session_date_id
     or session.mentor_semester_id is distinct from session.mentor_id
     or session.startup_semester_id is distinct from session.startup_id
     or session.slot is null
     or session.canonical_status is null;

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
