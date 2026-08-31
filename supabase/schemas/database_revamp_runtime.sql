-- Runtime support for the canonical 20-table model.

create or replace function public.commit_mentor_assignment(
  p_semester_id uuid, p_meeting_id uuid, p_slot smallint,
  p_startup_semester_id uuid, p_mentor_semester_id uuid, p_idempotency_key text,
  p_format text default 'online', p_topic text default null,
  p_override_types text[] default '{}'::text[], p_override_reason text default null,
  p_ranking_context jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session_id uuid;
begin
  if auth.uid() is null or not public.can_manage_semester(p_semester_id, auth.uid()) then raise exception 'Semester administrator access required' using errcode = '42501'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required' using errcode = '22023'; end if;
  if p_slot not in (1, 2) then raise exception 'Assignment slot must be 1 or 2' using errcode = '22023'; end if;
  if not exists (
    select 1
  from public.mentor_semesters term join public.semester_memberships membership on membership.id = term.semester_membership_id
    where term.id = p_mentor_semester_id and term.semester_id = p_semester_id
      and membership.role = 'mentor' and membership.status = 'active'
  ) then raise exception 'Mentor must be active in the target semester' using errcode = '22023'; end if;
  select id into v_session_id from public.sessions where semester_id = p_semester_id and idempotency_key = p_idempotency_key;
  if v_session_id is not null then return jsonb_build_object('sessionId', v_session_id, 'replayed', true); end if;
  insert into public.sessions(semester_id, meeting_id, mentor_semester_id, startup_semester_id, slot, status, format, topic, notes, idempotency_key)
  values(p_semester_id, p_meeting_id, p_mentor_semester_id, p_startup_semester_id, p_slot, 'confirmed', p_format, p_topic,
    case when cardinality(p_override_types) > 0 then concat('Assignment override: ', p_override_reason) end, p_idempotency_key)
  returning id into v_session_id;
  insert into public.program_audit_events(semester_id, actor_profile_id, action, subject_type, subject_id, details)
  values(p_semester_id, auth.uid(), 'session.assigned', 'session', v_session_id, jsonb_build_object('override_types', p_override_types, 'ranking_context', p_ranking_context));
  return jsonb_build_object('sessionId', v_session_id, 'replayed', false);
end;
$$;

create or replace function public.create_semester_draft(p_source_semester_id uuid, p_name text, p_start_date date, p_end_date date, p_configuration jsonb)
returns table (semester_id uuid, semester_name text) language plpgsql security definer set search_path = '' as $$
declare v_semester_id uuid;
begin
  if auth.uid() is null or not public.can_manage_semester(p_source_semester_id, auth.uid()) then raise exception 'Semester administrator access required' using errcode = '42501'; end if;
  if nullif(trim(p_name), '') is null or p_end_date <= p_start_date then raise exception 'Valid semester name and date range are required' using errcode = '22023'; end if;
  insert into public.semesters(name,start_date,end_date,is_active,lifecycle_status,configuration) values(trim(p_name),p_start_date,p_end_date,false,'draft',coalesce(p_configuration,'{}')) returning id into v_semester_id;
  insert into public.semester_memberships(semester_id,profile_id,role,status,activated_at) values(v_semester_id,auth.uid(),'admin','active',now());
  insert into public.program_audit_events(semester_id,actor_profile_id,action,subject_type,subject_id,details) values(v_semester_id,auth.uid(),'semester.draft_created','semester',v_semester_id,jsonb_build_object('source_semester_id',p_source_semester_id));
  return query select v_semester_id, trim(p_name);
end;
$$;

create or replace function public.replace_draft_meetings(p_semester_id uuid, p_meetings jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.uid() is null or not public.can_manage_semester(p_semester_id, auth.uid()) then raise exception 'Semester administrator access required' using errcode = '42501'; end if;
  if jsonb_typeof(p_meetings) is distinct from 'array' then raise exception 'Meetings must be a JSON array' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_to_recordset(p_meetings) proposed(date date,label text) where extract(isodow from proposed.date) <> 5) then raise exception 'Every meeting date must be a Friday' using errcode = '22023'; end if;
  delete from public.meetings where semester_id = p_semester_id;
  insert into public.meetings(semester_id,meeting_date,label) select p_semester_id,proposed.date,trim(proposed.label) from jsonb_to_recordset(p_meetings) proposed(date date,label text);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.import_prior_semester_memberships(p_source_semester_id uuid, p_target_semester_id uuid, p_membership_ids uuid[] default null)
returns table(source_count integer, imported_count integer, skipped_count integer) language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function public.activate_semester_transition(p_source_semester_id uuid,p_target_semester_id uuid)
returns table(closed_semester_id uuid,active_semester_id uuid,alumni_count integer) language plpgsql security definer set search_path='' as $$
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
$$;

create or replace function public.move_startup_team_membership(
  p_from_startup_semester_id uuid,
  p_profile_id uuid,
  p_to_startup_semester_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_semester_id uuid;
  v_to_semester_id uuid;
  v_membership_id uuid;
  v_team_membership_id uuid;
begin
  if p_from_startup_semester_id = p_to_startup_semester_id then
    raise exception 'Source and destination startups must differ' using errcode = '22023';
  end if;
  select semester_id into v_semester_id from public.startup_semesters where id = p_from_startup_semester_id;
  select semester_id into v_to_semester_id from public.startup_semesters where id = p_to_startup_semester_id;
  if v_semester_id is null or v_to_semester_id is null or v_semester_id <> v_to_semester_id then
    raise exception 'Founders can only move between startups in the same semester' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.can_manage_semester(v_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  select id into v_membership_id
  from public.semester_memberships
  where semester_id = v_semester_id and profile_id = p_profile_id and role = 'startup';
  if v_membership_id is null or not exists (
    select 1 from public.startup_team_memberships
    where startup_semester_id = p_from_startup_semester_id
      and semester_membership_id = v_membership_id
  ) then
    raise exception 'Source founder membership not found' using errcode = 'P0002';
  end if;

  insert into public.startup_team_memberships (
    semester_id, startup_semester_id, semester_membership_id, is_primary_contact
  ) values (
    v_semester_id, p_to_startup_semester_id, v_membership_id, false
  )
  on conflict (startup_semester_id, semester_membership_id)
  do update set semester_id = excluded.semester_id
  returning id into v_team_membership_id;

  delete from public.startup_team_memberships
  where startup_semester_id = p_from_startup_semester_id
    and semester_membership_id = v_membership_id;
  return v_team_membership_id;
end;
$$;

create or replace function public.update_startup_records(
  p_startup_semester_id uuid,
  p_name text,
  p_slug text,
  p_industry text,
  p_description text,
  p_stage text,
  p_preferred_expertise_tags text[],
  p_mentorship_needs text[]
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_semester_id uuid;
  v_organization_id uuid;
begin
  select semester_id, startup_organization_id
  into v_semester_id, v_organization_id
  from public.startup_semesters
  where id = p_startup_semester_id;
  if v_semester_id is null then
    raise exception 'Startup semester not found' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not public.can_manage_semester(v_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  update public.startup_organizations
  set name = p_name, slug = p_slug, industry = p_industry,
      description = p_description, updated_at = now()
  where id = v_organization_id;
  update public.startup_semesters
  set stage = p_stage,
      preferred_expertise_tags = coalesce(p_preferred_expertise_tags, '{}'),
      mentorship_needs = coalesce(p_mentorship_needs, '{}'),
      updated_at = now()
  where id = p_startup_semester_id;
  return p_startup_semester_id;
end;
$$;

create or replace function public.authorize_semester_member_identity_update(
  p_profile_id uuid,
  p_semester_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership_id uuid;
begin
  if auth.uid() is null or not public.can_manage_semester(p_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  select id into v_membership_id
  from public.semester_memberships
  where semester_id = p_semester_id and profile_id = p_profile_id;
  if v_membership_id is null then
    raise exception 'Semester member not found' using errcode = 'P0002';
  end if;
  if public.is_super_admin(p_profile_id) and not public.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required for this identity' using errcode = '42501';
  end if;
  return v_membership_id;
end;
$$;

create or replace function public.create_mentor_records(
  p_actor_profile_id uuid,
  p_profile_id uuid,
  p_semester_id uuid,
  p_email text,
  p_biography text,
  p_company text,
  p_expertise_tags text[],
  p_is_active boolean,
  p_linkedin_url text,
  p_title text,
  p_general_availability text,
  p_opening_talk text,
  p_preferred_format text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_email text;
  v_existing_role public.user_role;
  v_existing_status text;
  v_membership_id uuid;
  v_mentor_semester_id uuid;
begin
  if p_actor_profile_id is null or not public.can_manage_semester(p_semester_id, p_actor_profile_id) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  if public.is_super_admin(p_profile_id) and not public.is_super_admin(p_actor_profile_id) then
    raise exception 'Platform super-administrator access required for this identity' using errcode = '42501';
  end if;

  select membership.id, membership.role
  into v_membership_id, v_existing_role
  from public.semester_memberships membership
  where membership.semester_id = p_semester_id
    and membership.profile_id = p_profile_id;

  select profile.email, profile.status
  into v_existing_email, v_existing_status
  from public.profiles profile
  where profile.id = p_profile_id;

  if v_existing_email is null then
    raise exception 'Pending Auth-triggered profile is required' using errcode = 'P0002';
  end if;
  if v_membership_id is null and v_existing_status is distinct from 'pending' then
    raise exception 'Pending Auth-triggered profile is required' using errcode = '23514';
  end if;
  if v_membership_id is null and (
    nullif(trim(p_email), '') is null
    or lower(v_existing_email) is distinct from lower(trim(p_email))
  ) then
    raise exception 'Profile email does not match the Auth-triggered identity' using errcode = '23514';
  end if;
  if v_existing_role is not null and v_existing_role <> 'mentor' then
    raise exception 'Existing semester membership has an incompatible role' using errcode = '23514';
  end if;

  update public.profiles
  set status = 'approved',
      is_active = true,
      updated_at = now()
  where id = p_profile_id;

  insert into public.semester_memberships (semester_id, profile_id, role, status, activated_at)
  values (p_semester_id, p_profile_id, 'mentor', case when p_is_active then 'active' else 'onboarding' end,
          case when p_is_active then now() else null end)
  on conflict (semester_id, profile_id) do update
  set status = excluded.status,
      activated_at = excluded.activated_at,
      updated_at = now()
  returning id into v_membership_id;

  insert into public.mentor_profiles (profile_id, biography, company, expertise_tags, linkedin_url, title)
  values (p_profile_id, p_biography, p_company, coalesce(p_expertise_tags, '{}'), p_linkedin_url, p_title)
  on conflict (profile_id) do update
  set biography = excluded.biography,
      company = excluded.company,
      expertise_tags = excluded.expertise_tags,
      linkedin_url = excluded.linkedin_url,
      title = excluded.title,
      updated_at = now();

  insert into public.mentor_semesters (
    semester_id, semester_membership_id, general_availability, opening_talk,
    preferred_format, readiness_status
  ) values (
    p_semester_id, v_membership_id, p_general_availability, p_opening_talk,
    p_preferred_format, case when p_is_active then 'ready' else 'not_started' end
  )
  on conflict (semester_id, semester_membership_id) do update
  set general_availability = excluded.general_availability,
      opening_talk = excluded.opening_talk,
      preferred_format = excluded.preferred_format,
      readiness_status = excluded.readiness_status,
      updated_at = now()
  returning id into v_mentor_semester_id;
  return v_mentor_semester_id;
end;
$$;

create or replace function public.update_mentor_records(
  p_actor_profile_id uuid,
  p_mentor_semester_id uuid,
  p_patch jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership_id uuid;
  v_profile_id uuid;
  v_semester_id uuid;
begin
  select term.semester_id, term.semester_membership_id, membership.profile_id
  into v_semester_id, v_membership_id, v_profile_id
  from public.mentor_semesters term
  join public.semester_memberships membership on membership.id = term.semester_membership_id
  where term.id = p_mentor_semester_id and membership.role = 'mentor';
  if v_profile_id is null then
    raise exception 'Mentor semester not found' using errcode = 'P0002';
  end if;
  if p_actor_profile_id is null or not public.can_manage_semester(v_semester_id, p_actor_profile_id) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  if public.is_super_admin(v_profile_id) and not public.is_super_admin(p_actor_profile_id) then
    raise exception 'Platform super-administrator access required for this identity' using errcode = '42501';
  end if;

  update public.profiles
  set email = case when p_patch ? 'email' then nullif(trim(p_patch ->> 'email'), '') else email end,
      full_name = case when p_patch ? 'full_name' then nullif(trim(p_patch ->> 'full_name'), '') else full_name end,
      updated_at = now()
  where id = v_profile_id;

  update public.mentor_profiles
  set biography = case when p_patch ? 'biography' then p_patch ->> 'biography' else biography end,
      company = case when p_patch ? 'company' then p_patch ->> 'company' else company end,
      expertise_tags = case when p_patch ? 'expertise_tags' then coalesce(array(select jsonb_array_elements_text(p_patch -> 'expertise_tags')), '{}') else expertise_tags end,
      linkedin_url = case when p_patch ? 'linkedin_url' then p_patch ->> 'linkedin_url' else linkedin_url end,
      title = case when p_patch ? 'title' then p_patch ->> 'title' else title end,
      updated_at = now()
  where profile_id = v_profile_id;

  update public.mentor_semesters
  set general_availability = case when p_patch ? 'general_availability' then p_patch ->> 'general_availability' else general_availability end,
      opening_talk = case when p_patch ? 'opening_talk' then p_patch ->> 'opening_talk' else opening_talk end,
      preferred_format = case when p_patch ? 'preferred_format' then p_patch ->> 'preferred_format' else preferred_format end,
      updated_at = now()
  where id = p_mentor_semester_id;

  if p_patch ? 'is_active' then
    update public.semester_memberships
    set status = case when (p_patch ->> 'is_active')::boolean then 'active' else 'suspended' end,
        activated_at = case when (p_patch ->> 'is_active')::boolean then coalesce(activated_at, now()) else activated_at end,
        updated_at = now()
    where id = v_membership_id;
  end if;
  return p_mentor_semester_id;
end;
$$;

create or replace function public.set_semester_member_access(
  p_actor_profile_id uuid,
  p_profile_id uuid,
  p_semester_id uuid,
  p_role public.user_role,
  p_approve boolean,
  p_full_name text,
  p_email text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_email text;
  v_existing_role public.user_role;
  v_existing_status text;
  v_membership_id uuid;
begin
  if p_actor_profile_id is null or not public.can_manage_semester(p_semester_id, p_actor_profile_id) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;

  select membership.id, membership.role
  into v_membership_id, v_existing_role
  from public.semester_memberships membership
  where membership.semester_id = p_semester_id
    and membership.profile_id = p_profile_id;

  select profile.email, profile.status
  into v_existing_email, v_existing_status
  from public.profiles profile
  where profile.id = p_profile_id;

  if v_existing_email is null then
    raise exception 'Pending Auth-triggered profile is required' using errcode = 'P0002';
  end if;
  if not p_approve and v_membership_id is null then
    raise exception 'Semester member not found' using errcode = 'P0002';
  end if;
  if v_membership_id is null and v_existing_status is distinct from 'pending' then
    raise exception 'Pending Auth-triggered profile is required' using errcode = '23514';
  end if;
  if v_membership_id is null and (
    nullif(trim(p_email), '') is null
    or lower(v_existing_email) is distinct from lower(trim(p_email))
  ) then
    raise exception 'Profile email does not match the Auth-triggered identity' using errcode = '23514';
  end if;

  if public.is_super_admin(p_profile_id) and not public.is_super_admin(p_actor_profile_id) then
    raise exception 'Platform super-administrator access required for this identity' using errcode = '42501';
  end if;

  if v_membership_id is not null
     and v_existing_role is distinct from p_role
     and (
       exists (
         select 1 from public.mentor_semesters
         where semester_membership_id = v_membership_id
       )
       or exists (
         select 1 from public.startup_team_memberships
         where semester_membership_id = v_membership_id
       )
     ) then
    raise exception 'Role transition requires explicit data migration' using errcode = '23514';
  end if;

  if p_approve then
    update public.profiles
    set status = 'approved',
        is_active = true,
        updated_at = now()
    where id = p_profile_id;
  else
    update public.profiles
    set email = coalesce(nullif(trim(p_email), ''), email),
        full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
        updated_at = now()
    where id = p_profile_id;
  end if;

  insert into public.semester_memberships (
    semester_id, profile_id, role, status, activated_at
  ) values (
    p_semester_id, p_profile_id, p_role::text, 'active', now()
  )
  on conflict (semester_id, profile_id) do update
  set role = excluded.role,
      status = 'active',
      activated_at = coalesce(public.semester_memberships.activated_at, now()),
      updated_at = now()
  returning id into v_membership_id;

  if p_role = 'mentor' then
    insert into public.mentor_profiles (profile_id)
    values (p_profile_id)
    on conflict (profile_id) do nothing;

    insert into public.mentor_semesters (
      semester_id, semester_membership_id, readiness_status
    ) values (
      p_semester_id, v_membership_id, 'not_started'
    )
    on conflict (semester_id, semester_membership_id) do nothing;
  end if;

  return v_membership_id;
end;
$$;

create or replace function public.set_platform_super_admin(
  p_profile_id uuid,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required' using errcode = '42501';
  end if;
  if p_enabled then
    insert into public.platform_roles (profile_id, role, granted_by)
    values (p_profile_id, 'super_admin', auth.uid())
    on conflict (profile_id, role) do update
    set granted_by = auth.uid(), granted_at = now();
  else
    delete from public.platform_roles
    where profile_id = p_profile_id and role = 'super_admin';
  end if;
end;
$$;

revoke execute on function public.commit_mentor_assignment(uuid,uuid,smallint,uuid,uuid,text,text,text,text[],text,jsonb) from public,anon;
grant execute on function public.commit_mentor_assignment(uuid,uuid,smallint,uuid,uuid,text,text,text,text[],text,jsonb) to authenticated;
revoke execute on function public.create_semester_draft(uuid,text,date,date,jsonb) from public,anon;
grant execute on function public.create_semester_draft(uuid,text,date,date,jsonb) to authenticated;
revoke execute on function public.replace_draft_meetings(uuid,jsonb) from public,anon;
grant execute on function public.replace_draft_meetings(uuid,jsonb) to authenticated;
revoke execute on function public.import_prior_semester_memberships(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.import_prior_semester_memberships(uuid,uuid,uuid[]) to authenticated;
revoke execute on function public.activate_semester_transition(uuid,uuid) from public,anon;
grant execute on function public.activate_semester_transition(uuid,uuid) to authenticated;
