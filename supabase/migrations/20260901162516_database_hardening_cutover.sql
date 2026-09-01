set local check_function_bodies = off;

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "anon";

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "authenticated";

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "service_role";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "anon";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "authenticated";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "service_role";

revoke all on table "public"."invitations" from "service_role";

revoke all on table "public"."meeting_availability" from "service_role";

revoke all on table "public"."mentor_profiles" from "service_role";

revoke all on table "public"."mentor_semesters" from "service_role";

revoke all on table "public"."outreach_activities" from "service_role";

revoke all on table "public"."outreach_companies" from "service_role";

revoke all on table "public"."outreach_contact_companies" from "service_role";

revoke all on table "public"."outreach_contacts" from "service_role";

revoke all on table "public"."outreach_imports" from "service_role";

revoke all on table "public"."outreach_opportunities" from "service_role";

revoke all on table "public"."platform_roles" from "service_role";

revoke all on table "public"."program_audit_events" from "authenticated";

revoke all on table "public"."program_audit_events" from "service_role";

revoke all on table "public"."semesters" from "service_role";

drop policy "semester admins manage invitations" on "public"."invitations";

drop policy "members manage own meeting availability" on "public"."meeting_availability";

drop policy "admins manage meetings" on "public"."meetings";

drop policy "meetings visible to semester members" on "public"."meetings";

drop policy "authenticated members read mentor profiles" on "public"."mentor_profiles";

drop policy "mentors update own mentor profile" on "public"."mentor_profiles";

drop policy "mentors read own semester profile" on "public"."mentor_semesters";

drop policy "mentors update own semester profile" on "public"."mentor_semesters";

drop policy "semester managers read outreach activities" on "public"."outreach_activities";

drop policy "semester managers create outreach companies" on "public"."outreach_companies";

drop policy "semester managers delete outreach companies" on "public"."outreach_companies";

drop policy "semester managers read outreach companies" on "public"."outreach_companies";

drop policy "semester managers update outreach companies" on "public"."outreach_companies";

drop policy "semester managers create outreach contact companies" on "public"."outreach_contact_companies";

drop policy "semester managers delete outreach contact companies" on "public"."outreach_contact_companies";

drop policy "semester managers read outreach contact companies" on "public"."outreach_contact_companies";

drop policy "semester managers update outreach contact companies" on "public"."outreach_contact_companies";

drop policy "semester managers create outreach contacts" on "public"."outreach_contacts";

drop policy "semester managers delete outreach contacts" on "public"."outreach_contacts";

drop policy "semester managers read outreach contacts" on "public"."outreach_contacts";

drop policy "semester managers update outreach contacts" on "public"."outreach_contacts";

drop policy "admins manage outreach imports" on "public"."outreach_imports";

drop policy "semester managers create outreach opportunities" on "public"."outreach_opportunities";

drop policy "semester managers read outreach opportunities" on "public"."outreach_opportunities";

drop policy "platform roles visible to owner" on "public"."platform_roles";

drop policy "super admins manage platform roles" on "public"."platform_roles";

drop policy "admins can insert profiles" on "public"."profiles";

drop policy "admins can update all profiles" on "public"."profiles";

drop policy "admins can view all profiles" on "public"."profiles";

drop policy "users can view own profile" on "public"."profiles";

drop policy "users update own safe profile fields" on "public"."profiles";

drop policy "admins view program audit" on "public"."program_audit_events";

drop policy "members read own semester memberships" on "public"."semester_memberships";

drop policy "semester admins manage semester memberships" on "public"."semester_memberships";

drop policy "admins can delete sessions" on "public"."sessions";

drop policy "admins can insert sessions" on "public"."sessions";

drop policy "admins can update sessions" on "public"."sessions";

drop policy "admins can view all sessions" on "public"."sessions";

drop policy "admins manage sessions" on "public"."sessions";

drop policy "mentors respond to own sessions" on "public"."sessions";

drop policy "sessions visible to semester participants" on "public"."sessions";

drop policy "startups request sessions" on "public"."sessions";

drop policy "members read startup organizations" on "public"."startup_organizations";

drop policy "semester admins manage startup organizations" on "public"."startup_organizations";

drop policy "cohort reads startup semesters" on "public"."startup_semesters";

drop policy "startup teams update startup semester" on "public"."startup_semesters";

drop policy "semester admins manage startup team memberships" on "public"."startup_team_memberships";

drop policy "startup teams read their memberships" on "public"."startup_team_memberships";

drop policy "data_keys_select_own_agent" on "public"."visa_application_data_keys";

drop policy "orders_select_for_agent" on "public"."visa_application_orders";

drop policy "orders_update_for_agent" on "public"."visa_application_orders";

drop policy "payloads_select_for_agent" on "public"."visa_application_passenger_payloads";

drop trigger "sync_session_compatibility_columns" on "public"."sessions";

drop index "public"."outreach_companies_normalized_name_idx";

drop index "public"."profiles_auth_user_id_key";

drop view "public"."availability";

alter table "public"."agent_registration_requests"
  drop constraint "agent_registration_requests_reviewed_by_fkey";

alter table "public"."agents"
  drop constraint "agents_user_id_fkey";

alter table "public"."profiles"
  drop constraint "profiles_auth_user_id_fkey";

alter table "public"."profiles"
  drop constraint "profiles_semester_id_fkey";

alter table "public"."visa_application_data_keys"
  drop constraint "visa_application_data_keys_agent_id_fkey";

alter table "public"."visa_application_data_keys"
  drop constraint "visa_application_data_keys_order_id_fkey";

alter table "public"."visa_application_orders"
  drop constraint "visa_application_orders_draft_id_fkey";

alter table "public"."visa_application_passenger_payloads"
  drop constraint "visa_application_passenger_payloads_order_id_fkey";

alter table "public"."visa_business_key"
  drop constraint "visa_business_key_updated_by_fkey";

drop function "public"."can_read_outreach_relationship_labels"(uuid);

drop function "public"."commit_legacy_outreach_migration"(uuid, text);

drop function "public"."commit_mentor_assignment"(uuid, uuid, text, uuid, uuid, text, text, text, text[], text, jsonb);

drop function "public"."get_my_role"();

drop function "public"."has_outreach_company_access"(uuid, uuid);

drop function "public"."has_outreach_contact_access"(uuid, uuid);

drop function "public"."has_semester_role"(uuid, public.user_role[], uuid);

drop function "public"."is_super_admin"(uuid);

drop function "public"."mentors"(public.sessions);

drop function "public"."replace_draft_session_dates"(uuid, jsonb);

drop function "public"."semesters"(public.mentors);

drop view "public"."mentors";

drop function "public"."mentors_view_write"();

drop function "public"."semesters"(public.session_dates);

drop function "public"."semesters"(public.startups);

drop function "public"."session_dates"(public.sessions);

drop view "public"."session_dates";

drop function "public"."startups"(public.sessions);

drop view "public"."startups";

drop function "public"."startups_view_write"();

drop function "public"."sync_session_compatibility_columns"();

drop type "public"."access_request_status";

drop type "public"."outreach_import_match_decision";

drop type "public"."outreach_import_status";

drop type "public"."outreach_status";

drop type "public"."session_status";

alter table "public"."profiles"
  drop column "auth_user_id";

alter table "public"."profiles"
  drop column "role";

alter table "public"."profiles"
  drop column "semester_id";

alter table "public"."sessions"
  drop column "is_confirmed";

alter table "public"."sessions"
  drop column "mentor_id";

alter table "public"."sessions"
  drop column "session_date_id";

alter table "public"."sessions"
  drop column "session_date";

alter table "public"."sessions"
  drop column "startup_id";

alter table "public"."sessions"
  drop column "time_slot";

drop table "public"."agent_registration_requests";

drop table "public"."agents";

drop table "public"."visa_application_data_keys";

drop table "public"."visa_application_drafts";

drop table "public"."visa_application_orders";

drop table "public"."visa_application_passenger_payloads";

drop table "public"."visa_business_key";

create schema "private";

create or replace function private.can_manage_semester (
  target_semester_id uuid,
  candidate_id       uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$ select private.is_super_admin(candidate_id) or private.has_semester_role(target_semester_id,array['admin']::public.user_role[],candidate_id) $function$;

create or replace function private.can_read_mentor_profile (
  target_profile_id uuid,
  candidate_id      uuid
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$
  select candidate_id is not null
    and candidate_id is not distinct from auth.uid()
    and exists (
      select 1
      from public.semester_memberships candidate_membership
      where candidate_membership.profile_id = candidate_id
        and candidate_membership.status in ('onboarding', 'active')
    )
    and exists (
      select 1
      from public.semester_memberships mentor_membership
      where mentor_membership.profile_id = target_profile_id
        and mentor_membership.role = 'mentor'
        and mentor_membership.status in ('onboarding', 'active', 'alumni')
    );
$function$;

create or replace function private.can_read_outreach_relationship_labels (
  candidate_id uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$ select private.is_super_admin(candidate_id) or exists(select 1 from public.semester_memberships where profile_id=candidate_id and role='admin' and status='active') $function$;

create or replace function private.has_outreach_company_access (
  target_company_id uuid,
  candidate_id      uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$ select exists(select 1 from public.outreach_contact_companies cc join public.outreach_opportunities o on o.contact_id=cc.contact_id where cc.company_id=target_company_id and private.can_manage_semester(o.semester_id,candidate_id)) $function$;

create or replace function private.has_outreach_contact_access (
  target_contact_id uuid,
  candidate_id      uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$ select exists(select 1 from public.outreach_opportunities o where o.contact_id=target_contact_id and private.can_manage_semester(o.semester_id,candidate_id)) $function$;

create or replace function private.has_semester_role (
  target_semester_id uuid,
  allowed_roles      public.user_role[],
  candidate_id       uuid               default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$ select candidate_id is not null and candidate_id is not distinct from auth.uid() and exists (select 1 from public.semester_memberships where semester_id=target_semester_id and profile_id=candidate_id and role=any(allowed_roles) and status='active') $function$;

create or replace function private.is_super_admin (
  candidate_id uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$ select candidate_id is not null and candidate_id is not distinct from auth.uid() and exists (select 1 from public.platform_roles where profile_id=candidate_id and role='super_admin') $function$;

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
  if auth.uid() is null or not private.can_manage_semester(p_source_semester_id,auth.uid()) or not private.can_manage_semester(p_target_semester_id,auth.uid()) then raise exception 'Semester administrator access required for both semesters' using errcode='42501'; end if;
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

create or replace function public.authorize_semester_member_identity_update (
  p_profile_id  uuid,
  p_semester_id uuid
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  v_membership_id uuid;
begin
  if auth.uid() is null or not private.can_manage_semester(p_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  select id into v_membership_id
  from public.semester_memberships
  where semester_id = p_semester_id and profile_id = p_profile_id;
  if v_membership_id is null then
    raise exception 'Semester member not found' using errcode = 'P0002';
  end if;
  if private.is_super_admin(p_profile_id) and not private.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required for this identity' using errcode = '42501';
  end if;
  return v_membership_id;
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
  set search_path to ''
  AS $function$
declare v_requested_count integer; v_matching_count integer; v_updated_count integer; v_status public.membership_lifecycle_status;
begin
 if auth.uid() is null or not private.can_manage_semester(p_semester_id,auth.uid()) then raise exception 'Semester administrator access required' using errcode='42501'; end if;
 v_requested_count:=coalesce(cardinality(p_membership_ids),0); if v_requested_count<1 or v_requested_count>200 then raise exception 'Between 1 and 200 membership ids are required' using errcode='22023'; end if;
 select count(*) into v_matching_count from public.semester_memberships where semester_id=p_semester_id and id=any(p_membership_ids);
 if v_matching_count<>v_requested_count then raise exception 'Every selected membership must belong to the target semester' using errcode='22023'; end if;
 v_status:=case when p_is_active then 'active'::public.membership_lifecycle_status else 'suspended'::public.membership_lifecycle_status end;
 update public.semester_memberships set status=v_status,activated_at=case when p_is_active then coalesce(activated_at,now()) else activated_at end,suspended_at=case when p_is_active then null else now() end,updated_at=now() where semester_id=p_semester_id and id=any(p_membership_ids);
 get diagnostics v_updated_count=row_count;
 insert into public.program_audit_events(semester_id,actor_profile_id,action,subject_type,subject_id,details)
 select p_semester_id,auth.uid(),case when p_is_active then 'membership.activated' else 'membership.suspended' end,'semester_membership',membership_id,jsonb_build_object('bulk',true,'status',v_status) from unnest(p_membership_ids) membership_id;
 return v_updated_count;
end; $function$;

create or replace function public.can_manage_any_outreach (
  candidate_id uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$ select candidate_id is not null and candidate_id is not distinct from auth.uid() and exists(select 1 from public.semesters s where private.can_manage_semester(s.id,candidate_id)) $function$;

create or replace function public.can_manage_semester (
  target_semester_id uuid,
  candidate_id       uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$ select candidate_id is not null and candidate_id is not distinct from auth.uid() and private.can_manage_semester(target_semester_id,candidate_id) $function$;

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

create or replace function public.commit_mentor_assignment (
  p_semester_id         uuid,
  p_meeting_id          uuid,
  p_slot                smallint,
  p_startup_semester_id uuid,
  p_mentor_semester_id  uuid,
  p_idempotency_key     text,
  p_format              text     default 'online'::text,
  p_topic               text     default null::text,
  p_override_types      text[]   default '{}'::text[],
  p_override_reason     text     default null::text,
  p_ranking_context     jsonb    default '{}'::jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_session_id uuid;
begin
  if auth.uid() is null or not private.can_manage_semester(p_semester_id, auth.uid()) then raise exception 'Semester administrator access required' using errcode = '42501'; end if;
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
$function$;

create or replace function public.create_mentor_records (
  p_actor_profile_id     uuid,
  p_profile_id           uuid,
  p_semester_id          uuid,
  p_email                text,
  p_biography            text,
  p_company              text,
  p_expertise_tags       text[],
  p_is_active            boolean,
  p_linkedin_url         text,
  p_title                text,
  p_general_availability text,
  p_opening_talk         text,
  p_preferred_format     text
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  v_existing_email text;
  v_existing_role public.user_role;
  v_existing_status text;
  v_membership_id uuid;
  v_mentor_semester_id uuid;
begin
  if p_actor_profile_id is null or not private.can_manage_semester(p_semester_id, p_actor_profile_id) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  if private.is_super_admin(p_profile_id) and not private.is_super_admin(p_actor_profile_id) then
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
  values (p_semester_id, p_profile_id, 'mentor', case when p_is_active then 'active'::public.membership_lifecycle_status else 'onboarding'::public.membership_lifecycle_status end,
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
  if auth.uid() is null or not private.can_manage_semester(p_source_semester_id, auth.uid()) then raise exception 'Semester administrator access required' using errcode = '42501'; end if;
  if nullif(trim(p_name), '') is null or p_end_date <= p_start_date then raise exception 'Valid semester name and date range are required' using errcode = '22023'; end if;
  insert into public.semesters(name,start_date,end_date,is_active,lifecycle_status,configuration) values(trim(p_name),p_start_date,p_end_date,false,'draft',coalesce(p_configuration,'{}')) returning id into v_semester_id;
  insert into public.semester_memberships(semester_id,profile_id,role,status,activated_at) values(v_semester_id,auth.uid(),'admin','active',now());
  insert into public.program_audit_events(semester_id,actor_profile_id,action,subject_type,subject_id,details) values(v_semester_id,auth.uid(),'semester.draft_created','semester',v_semester_id,jsonb_build_object('source_semester_id',p_source_semester_id));
  return query select v_semester_id, trim(p_name);
end;
$function$;

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  AS $function$ begin insert into public.profiles(id,email,status,full_name) values(new.id,lower(new.email),'pending',coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name')) on conflict(id) do update set email=excluded.email,full_name=coalesce(public.profiles.full_name,excluded.full_name),updated_at=now(); return new; end; $function$;

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
  if auth.uid() is null or not private.can_manage_semester(p_source_semester_id,auth.uid()) or not private.can_manage_semester(p_target_semester_id,auth.uid()) then raise exception 'Semester administrator access required for both semesters' using errcode='42501'; end if;
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
        stage = coalesce(p_stage::text, stage),
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
        stage = coalesce(p_stage::text, 'replied'),
        updated_at = now()
    where public.outreach_opportunities.id = p_opportunity_id;
  else
    update public.outreach_opportunities
    set next_follow_up_at = coalesce(p_next_follow_up_at, next_follow_up_at),
        stage = coalesce(p_stage::text, stage),
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

create or replace function public.move_startup_team_membership (
  p_from_startup_semester_id uuid,
  p_profile_id               uuid,
  p_to_startup_semester_id   uuid
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
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
  if auth.uid() is null or not private.can_manage_semester(v_semester_id, auth.uid()) then
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

create or replace function public.replace_draft_meetings (
  p_semester_id uuid,
  p_meetings    jsonb
)
  returns integer
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_count integer;
begin
  if auth.uid() is null or not private.can_manage_semester(p_semester_id, auth.uid()) then raise exception 'Semester administrator access required' using errcode = '42501'; end if;
  if jsonb_typeof(p_meetings) is distinct from 'array' then raise exception 'Meetings must be a JSON array' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_to_recordset(p_meetings) proposed(date date,label text) where extract(isodow from proposed.date) <> 5) then raise exception 'Every meeting date must be a Friday' using errcode = '22023'; end if;
  delete from public.meetings where semester_id = p_semester_id;
  insert into public.meetings(semester_id,meeting_date,label) select p_semester_id,proposed.date,trim(proposed.label) from jsonb_to_recordset(p_meetings) proposed(date date,label text);
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

create or replace function public.set_platform_super_admin (
  p_profile_id uuid,
  p_enabled    boolean
)
  returns void
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then
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
$function$;

create or replace function public.set_semester_member_access (
  p_actor_profile_id uuid,
  p_profile_id       uuid,
  p_semester_id      uuid,
  p_role             public.user_role,
  p_approve          boolean,
  p_full_name        text,
  p_email            text
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  v_existing_email text;
  v_existing_role public.user_role;
  v_existing_status text;
  v_membership_id uuid;
begin
  if p_actor_profile_id is null or not private.can_manage_semester(p_semester_id, p_actor_profile_id) then
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

  if private.is_super_admin(p_profile_id) and not private.is_super_admin(p_actor_profile_id) then
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
    p_semester_id, p_profile_id, p_role, 'active'::public.membership_lifecycle_status, now()
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

create or replace function public.update_mentor_records (
  p_actor_profile_id   uuid,
  p_mentor_semester_id uuid,
  p_patch              jsonb
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
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
  if p_actor_profile_id is null or not private.can_manage_semester(v_semester_id, p_actor_profile_id) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  if private.is_super_admin(v_profile_id) and not private.is_super_admin(p_actor_profile_id) then
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
    set status = case when (p_patch ->> 'is_active')::boolean then 'active'::public.membership_lifecycle_status else 'suspended'::public.membership_lifecycle_status end,
        activated_at = case when (p_patch ->> 'is_active')::boolean then coalesce(activated_at, now()) else activated_at end,
        updated_at = now()
    where id = v_membership_id;
  end if;
  return p_mentor_semester_id;
end;
$function$;

create or replace function public.update_own_onboarding_progress (
  p_membership_id   uuid,
  p_semester_id     uuid,
  p_onboarding_data jsonb,
  p_finalize        boolean
)
  returns public.semester_memberships
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  actor_id uuid := auth.uid();
  membership_record public.semester_memberships%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into membership_record
  from public.semester_memberships
  where id = p_membership_id
    and semester_id = p_semester_id
    and profile_id = actor_id
  for update;

  if not found then
    raise exception 'Onboarding membership not found' using errcode = '42501';
  end if;

  if p_finalize and membership_record.status <> 'onboarding' then
    raise exception 'Onboarding status transition is not allowed' using errcode = '42501';
  end if;
  if not p_finalize and membership_record.status not in ('invited', 'onboarding') then
    raise exception 'Onboarding status transition is not allowed' using errcode = '42501';
  end if;

  update public.semester_memberships
  set onboarding_data = coalesce(p_onboarding_data, '[]'::jsonb),
      onboarding_started_at = coalesce(onboarding_started_at, now()),
      onboarding_completed_at = case when p_finalize then now() else onboarding_completed_at end,
      activated_at = case when p_finalize then now() else activated_at end,
      status = case when p_finalize then 'active'::public.membership_lifecycle_status else 'onboarding'::public.membership_lifecycle_status end,
      updated_at = now()
  where id = membership_record.id
  returning * into membership_record;

  return membership_record;
end;
$function$;

create or replace function public.update_startup_records (
  p_startup_semester_id      uuid,
  p_name                     text,
  p_slug                     text,
  p_industry                 text,
  p_description              text,
  p_stage                    text,
  p_preferred_expertise_tags text[],
  p_mentorship_needs         text[]
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
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
  if auth.uid() is null or not private.can_manage_semester(v_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  update public.startup_organizations
  set name = p_name, slug = p_slug, industry = p_industry,
      description = p_description, updated_at = now()
  where id = v_organization_id;
  update public.startup_semesters
  set stage = p_stage::public.startup_stage,
      preferred_expertise_tags = coalesce(p_preferred_expertise_tags, '{}'),
      mentorship_needs = coalesce(p_mentorship_needs, '{}'),
      updated_at = now()
  where id = p_startup_semester_id;
  return p_startup_semester_id;
end;
$function$;

create or replace function public.update_updated_at()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin new.updated_at = now(); return new; end;
$function$;

create or replace function public.upsert_outreach_contact_bundle (
  p_semester_id             uuid,
  p_contact_id              uuid   default null::uuid,
  p_full_name               text   default null::text,
  p_email                   text   default null::text,
  p_linkedin_url            text   default null::text,
  p_phone                   text   default null::text,
  p_biography               text   default null::text,
  p_company_id              uuid   default null::uuid,
  p_company_name            text   default null::text,
  p_company_normalized_name text   default null::text,
  p_company_domain          text   default null::text,
  p_company_title           text   default null::text,
  p_owner_profile_id        uuid   default null::uuid,
  p_stage                   text   default 'not_contacted'::text,
  p_relationship_types      text[] default ARRAY['mentor'::text],
  p_source_context          jsonb  default '{}'::jsonb
)
  returns table (
    contact_id     uuid,
    company_id     uuid,
    opportunity_id uuid
  )
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
#variable_conflict use_column
declare
  actor_id uuid := auth.uid();
  resolved_contact_id uuid := p_contact_id;
  resolved_company_id uuid := p_company_id;
  resolved_opportunity_id uuid;
  normalized_company_name text;
  normalized_company_domain text;
  company_identity_lock text;
  matched_company_id uuid;
  matched_company_name text;
  matched_company_domain text;
begin
  if actor_id is null or not private.can_manage_semester(p_semester_id, actor_id) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;

  if resolved_contact_id is null then
    if nullif(btrim(p_full_name), '') is null then
      raise exception 'Contact full name is required' using errcode = '22023';
    end if;
    insert into public.outreach_contacts (
      full_name, email, linkedin_url, canonical_linkedin_url, phone, biography, created_by
    ) values (
      btrim(p_full_name), lower(nullif(btrim(p_email), '')), nullif(btrim(p_linkedin_url), ''),
      nullif(btrim(p_linkedin_url), ''), nullif(btrim(p_phone), ''), nullif(btrim(p_biography), ''), actor_id
    )
    returning id into resolved_contact_id;
  elsif not private.has_outreach_contact_access(resolved_contact_id, actor_id) then
    raise exception 'Contact is outside the administrator outreach scope' using errcode = '42501';
  end if;

  if resolved_company_id is not null then
    if not private.has_outreach_company_access(resolved_company_id, actor_id) then
      raise exception 'Company is outside the administrator outreach scope' using errcode = '42501';
    end if;
  elsif nullif(btrim(p_company_name), '') is not null then
    normalized_company_name := lower(coalesce(
      nullif(btrim(p_company_normalized_name), ''),
      btrim(p_company_name)
    ));
    normalized_company_domain := lower(nullif(btrim(p_company_domain), ''));

    -- Lock every supplied identity key in lexical order. Calls for the same
    -- normalized name or domain serialize even before a company row exists.
    for company_identity_lock in
      select identity_key
      from (
        values
          ('company-domain:' || normalized_company_domain),
          ('company-name:' || normalized_company_name)
      ) as identity_keys(identity_key)
      where identity_key is not null
      order by identity_key
    loop
      perform pg_advisory_xact_lock(hashtextextended(company_identity_lock, 0));
    end loop;

    select company.id, company.normalized_name, company.domain
    into matched_company_id, matched_company_name, matched_company_domain
    from public.outreach_companies as company
    where company.normalized_name = normalized_company_name
      or (
        normalized_company_domain is not null
        and company.domain = normalized_company_domain
      )
    order by company.id
    limit 1;

    if matched_company_id is not null then
      if matched_company_name <> normalized_company_name
        or (
          normalized_company_domain is not null
          and matched_company_domain is distinct from normalized_company_domain
        )
        or exists (
          select 1
          from public.outreach_companies as conflicting_company
          where conflicting_company.id <> matched_company_id
            and (
              conflicting_company.normalized_name = normalized_company_name
              or (
                normalized_company_domain is not null
                and conflicting_company.domain = normalized_company_domain
              )
            )
        )
        or not private.has_outreach_company_access(matched_company_id, actor_id)
      then
        raise exception 'outreach_company_identity_conflict' using errcode = '23505';
      end if;

      resolved_company_id := matched_company_id;
    end if;

    if resolved_company_id is null then
      begin
        insert into public.outreach_companies (name, normalized_name, domain, created_by)
        values (
          btrim(p_company_name), normalized_company_name, normalized_company_domain, actor_id
        )
        returning id into resolved_company_id;
      exception when unique_violation then
        raise exception 'outreach_company_identity_conflict' using errcode = '23505';
      end;
    end if;
  end if;

  insert into public.outreach_opportunities (
    semester_id, contact_id, owner_profile_id, stage, relationship_types, source_context, created_by
  ) values (
    p_semester_id, resolved_contact_id, p_owner_profile_id,
    coalesce(nullif(btrim(p_stage), ''), 'not_contacted'),
    case when cardinality(p_relationship_types) > 0 then p_relationship_types else array['mentor']::text[] end,
    coalesce(p_source_context, '{}'::jsonb), actor_id
  )
  on conflict (semester_id, contact_id) do update
  set owner_profile_id = excluded.owner_profile_id,
      stage = excluded.stage,
      relationship_types = excluded.relationship_types,
      source_context = excluded.source_context,
      updated_at = now()
  returning id into resolved_opportunity_id;

  if resolved_company_id is not null then
    update public.outreach_contact_companies
    set is_primary = false,
        updated_at = now()
    where contact_id = resolved_contact_id
      and company_id <> resolved_company_id
      and is_primary
      and ended_on is null;

    update public.outreach_contact_companies
    set title = nullif(btrim(p_company_title), ''),
        is_primary = true,
        updated_at = now()
    where contact_id = resolved_contact_id
      and company_id = resolved_company_id
      and ended_on is null;

    if not found then
      insert into public.outreach_contact_companies (contact_id, company_id, title, is_primary)
      values (resolved_contact_id, resolved_company_id, nullif(btrim(p_company_title), ''), true);
    end if;
  end if;

  contact_id := resolved_contact_id;
  company_id := resolved_company_id;
  opportunity_id := resolved_opportunity_id;
  return next;
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

alter table "public"."profiles"
  add constraint "profiles_id_fkey" foreign key (id) references auth.users(id) on delete cascade;

create index invitations_invited_by_idx on public.invitations using btree (invited_by);

create index invitations_matched_profile_idx on public.invitations using btree (matched_profile_id)
  where (matched_profile_id is not null);

create index invitations_startup_semester_idx on public.invitations using btree (startup_semester_id)
  where (startup_semester_id is not null);

create index meeting_availability_member_idx on public.meeting_availability using btree (semester_membership_id, meeting_id);

create index meeting_availability_semester_idx on public.meeting_availability using btree (semester_id);

create index mentor_semesters_membership_idx on public.mentor_semesters using btree (semester_membership_id);

create unique index outreach_companies_normalized_name_key on public.outreach_companies using btree (normalized_name);

create index outreach_imports_created_by_idx on public.outreach_imports using btree (created_by);

create index outreach_opportunities_queue_cursor_idx on public.outreach_opportunities using btree (semester_id, next_follow_up_at, id);

create index platform_roles_granted_by_idx on public.platform_roles using btree (granted_by)
  where (granted_by is not null);

create index program_audit_events_actor_idx on public.program_audit_events using btree (actor_profile_id)
  where (actor_profile_id is not null);

create index program_audit_events_semester_timeline_idx on public.program_audit_events using btree (semester_id, created_at desc);

create unique index semesters_one_active_idx on public.semesters using btree (is_active)
  where is_active;

create index sessions_mentor_idx on public.sessions using btree (mentor_semester_id, meeting_id);

create index sessions_semester_meeting_idx on public.sessions using btree (semester_id, meeting_id);

create index sessions_startup_idx on public.sessions using btree (startup_semester_id, meeting_id);

create index startup_semesters_organization_idx on public.startup_semesters using btree (startup_organization_id);

create index startup_team_memberships_semester_idx on public.startup_team_memberships using btree (semester_id);

create policy "semester admins read invitations" on "public"."invitations"
  for select
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)));

create policy "members delete meeting availability" on "public"."meeting_availability"
  for delete
  to "authenticated"
  using ((private.can_manage_semester(semester_id, ( select auth.uid() as uid)) or (exists ( select 1
   from public.semester_memberships membership
  where
    ((membership.id = meeting_availability.semester_membership_id) AND (membership.semester_id = meeting_availability.semester_id) AND (membership.profile_id = ( select auth.uid()
    as uid)) AND (membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status])))))));

create policy "members insert meeting availability" on "public"."meeting_availability"
  for insert
  to "authenticated"
  with check ((private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)) OR ((EXISTS ( SELECT 1
   FROM public.semester_memberships membership
  WHERE
    ((membership.id = meeting_availability.semester_membership_id) AND (membership.semester_id = meeting_availability.semester_id) AND (membership.profile_id = ( SELECT auth.uid()
    AS uid)) AND (membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status]))))) AND (EXISTS ( SELECT 1
   FROM public.meetings meeting
  WHERE ((meeting.id = meeting_availability.meeting_id) AND (meeting.semester_id = meeting_availability.semester_id)))))));

create policy "members update meeting availability" on "public"."meeting_availability"
  for update
  to "authenticated"
  using ((private.can_manage_semester(semester_id, ( select auth.uid() as uid)) or (exists ( select 1
   from public.semester_memberships membership
  where
    ((membership.id = meeting_availability.semester_membership_id) AND (membership.semester_id = meeting_availability.semester_id) AND (membership.profile_id = ( select auth.uid()
    as uid)) AND (membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status])))))))
  with check ((private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)) OR ((EXISTS ( SELECT 1
   FROM public.semester_memberships membership
  WHERE
    ((membership.id = meeting_availability.semester_membership_id) AND (membership.semester_id = meeting_availability.semester_id) AND (membership.profile_id = ( SELECT auth.uid()
    AS uid)) AND (membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status]))))) AND (EXISTS ( SELECT 1
   FROM public.meetings meeting
  WHERE ((meeting.id = meeting_availability.meeting_id) AND (meeting.semester_id = meeting_availability.semester_id)))))));

create policy "owners or admins read meeting availability" on "public"."meeting_availability"
  for select
  to "authenticated"
  using ((private.can_manage_semester(semester_id, ( select auth.uid() as uid)) or (exists ( select 1
   from public.semester_memberships membership
  where
    ((membership.id = meeting_availability.semester_membership_id) AND (membership.semester_id = meeting_availability.semester_id) AND (membership.profile_id = ( select auth.uid()
    as uid)))))));

create policy "cohort members read meetings" on "public"."meetings"
  for select
  to "authenticated"
  using (private.has_semester_role(semester_id, ARRAY['admin'::public.user_role, 'mentor'::public.user_role, 'startup'::public.user_role], ( select auth.uid() as uid)));

create policy "mentors update their own mentor profile" on "public"."mentor_profiles"
  for update
  to "authenticated"
  using ((profile_id = ( select auth.uid() as uid)))
  with check ((profile_id = ( SELECT auth.uid() AS uid)));

create policy "program members read mentor profiles" on "public"."mentor_profiles"
  for select
  to "authenticated"
  using (((profile_id = ( select auth.uid() as uid)) or private.is_super_admin(( select auth.uid() as uid)) or (exists ( select 1
   from public.semester_memberships viewer_membership
  where
    ((viewer_membership.profile_id = ( select auth.uid() as uid)) AND (viewer_membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status,
    'active'::public.membership_lifecycle_status])))))));

create policy "mentors update their own semester profile" on "public"."mentor_semesters"
  for update
  to "authenticated"
  using ((exists ( select 1
   from public.semester_memberships mentor_membership
  where
    ((mentor_membership.id = mentor_semesters.semester_membership_id) AND (mentor_membership.semester_id = mentor_semesters.semester_id) AND (mentor_membership.profile_id = (
    select auth.uid() as uid)) AND (mentor_membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status]))))))
  with check ((EXISTS ( SELECT 1
   FROM public.semester_memberships mentor_membership
  WHERE
    ((mentor_membership.id = mentor_semesters.semester_membership_id) AND (mentor_membership.semester_id = mentor_semesters.semester_id) AND (mentor_membership.profile_id = (
    SELECT auth.uid() AS uid)) AND (mentor_membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status]))))));

create policy "program members read mentor semesters" on "public"."mentor_semesters"
  for select
  to "authenticated"
  using ((private.can_manage_semester(semester_id, ( select auth.uid() as uid)) or (exists ( select 1
   from public.semester_memberships mentor_membership
  where
    ((mentor_membership.id = mentor_semesters.semester_membership_id) AND (mentor_membership.semester_id = mentor_semesters.semester_id) AND ((mentor_membership.profile_id = (
    select auth.uid() as uid)) or
    ((mentor_membership.role = 'mentor'::public.user_role) AND (mentor_membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status,
    'active'::public.membership_lifecycle_status, 'alumni'::public.membership_lifecycle_status])) AND (exists ( select 1
           from public.semester_memberships viewer_membership
          where
            ((viewer_membership.profile_id = ( select auth.uid() as uid)) AND (viewer_membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status,
            'active'::public.membership_lifecycle_status]))))))))))));

create policy "semester admins read outreach activities" on "public"."outreach_activities"
  for select
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)));

create policy "semester admins read outreach companies" on "public"."outreach_companies"
  for select
  to "authenticated"
  using (private.has_outreach_company_access(id, ( select auth.uid() as uid)));

create policy "semester admins read outreach company links" on "public"."outreach_contact_companies"
  for select
  to "authenticated"
  using ((private.has_outreach_contact_access(contact_id, ( select auth.uid() as uid)) AND private.has_outreach_company_access(company_id, ( select auth.uid() as uid))));

create policy "semester admins update outreach company links" on "public"."outreach_contact_companies"
  for update
  to "authenticated"
  using ((private.has_outreach_contact_access(contact_id, ( select auth.uid() as uid)) AND private.has_outreach_company_access(company_id, ( select auth.uid() as uid))))
  with check ((private.has_outreach_contact_access(contact_id, ( SELECT auth.uid() AS uid)) AND private.has_outreach_company_access(company_id, ( SELECT auth.uid() AS uid))));

create policy "semester admins read outreach contacts" on "public"."outreach_contacts"
  for select
  to "authenticated"
  using (private.has_outreach_contact_access(id, ( select auth.uid() as uid)));

create policy "semester admins update outreach contacts" on "public"."outreach_contacts"
  for update
  to "authenticated"
  using (private.has_outreach_contact_access(id, ( select auth.uid() as uid)))
  with check (private.has_outreach_contact_access(id, ( SELECT auth.uid() AS uid)));

create policy "semester admins insert outreach imports" on "public"."outreach_imports"
  for insert
  to "authenticated"
  with check (private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)));

create policy "semester admins read outreach imports" on "public"."outreach_imports"
  for select
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)));

create policy "semester admins update outreach imports" on "public"."outreach_imports"
  for update
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)))
  with check (private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)));

create policy "semester admins read outreach opportunities" on "public"."outreach_opportunities"
  for select
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)));

create policy "semester admins update outreach opportunities" on "public"."outreach_opportunities"
  for update
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)))
  with check (private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)));

create policy "owners or super admins read platform roles" on "public"."platform_roles"
  for select
  to "authenticated"
  using (((profile_id = ( select auth.uid() as uid)) or private.is_super_admin(( select auth.uid() as uid))));

create policy "program members read profiles" on "public"."profiles"
  for select
  to "authenticated"
  using (((id = ( select auth.uid() as uid)) or private.is_super_admin(( select auth.uid() as uid)) or (exists ( select 1
   from public.semester_memberships administrator
  where
    ((administrator.profile_id = ( select auth.uid() as uid)) AND (administrator.role = 'admin'::public.user_role) AND (administrator.status = ANY
    (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status]))))) or
    private.can_read_mentor_profile(id, ( select auth.uid() as uid))));

create policy "users update their own profile" on "public"."profiles"
  for update
  to "authenticated"
  using ((id = ( select auth.uid() as uid)))
  with check ((id = ( SELECT auth.uid() AS uid)));

create policy "semester admins read program audit" on "public"."program_audit_events"
  for select
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)));

create policy "members read authorized semester memberships" on "public"."semester_memberships"
  for select
  to "authenticated"
  using
    (((profile_id = ( select auth.uid() as uid)) or private.can_manage_semester(semester_id, ( select auth.uid() as uid)) or ((role = 'mentor'::public.user_role) AND (status = ANY
    (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status, 'alumni'::public.membership_lifecycle_status])) AND (exists ( select 1
   from public.semesters viewer_semester
  where private.has_semester_role(viewer_semester.id, ARRAY['admin'::public.user_role, 'mentor'::public.user_role, 'startup'::public.user_role], ( select auth.uid() as uid)))))));

create policy "authenticated users read semesters" on "public"."semesters"
  for select
  to "authenticated"
  using ((( select auth.uid() as uid) is not null));

create policy "admins or mentors update sessions" on "public"."sessions"
  for update
  to "authenticated"
  using ((private.can_manage_semester(semester_id, ( select auth.uid() as uid)) or (exists ( select 1
   from (public.mentor_semesters mentor_term
     JOIN public.semester_memberships membership on ((membership.id = mentor_term.semester_membership_id)))
  where
    ((mentor_term.id = sessions.mentor_semester_id) AND (mentor_term.semester_id = sessions.semester_id) AND (membership.semester_id = sessions.semester_id) AND
    (membership.profile_id = ( select auth.uid() as uid)) AND (membership.role = 'mentor'::public.user_role) AND
    (membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status])))))))
  with check ((private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)) OR ((status = ANY (ARRAY['confirmed'::text, 'declined'::text])) AND (EXISTS ( SELECT 1
   FROM (public.mentor_semesters mentor_term
     JOIN public.semester_memberships membership ON ((membership.id = mentor_term.semester_membership_id)))
  WHERE
    ((mentor_term.id = sessions.mentor_semester_id) AND (mentor_term.semester_id = sessions.semester_id) AND (membership.semester_id = sessions.semester_id) AND
    (membership.profile_id = ( SELECT auth.uid() AS uid)) AND (membership.role = 'mentor'::public.user_role) AND
    (membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status]))))))));

create policy "participants read sessions" on "public"."sessions"
  for select
  to "authenticated"
  using ((private.can_manage_semester(semester_id, ( select auth.uid() as uid)) or (exists ( select 1
   from (public.mentor_semesters mentor_term
     JOIN public.semester_memberships membership on ((membership.id = mentor_term.semester_membership_id)))
  where
    ((mentor_term.id = sessions.mentor_semester_id) AND (mentor_term.semester_id = sessions.semester_id) AND (membership.semester_id = sessions.semester_id) AND
    (membership.profile_id = ( select auth.uid() as uid))))) or (exists ( select 1
   from (public.startup_team_memberships team
     JOIN public.semester_memberships membership on ((membership.id = team.semester_membership_id)))
  where
    ((team.startup_semester_id = sessions.startup_semester_id) AND (team.semester_id = sessions.semester_id) AND (membership.semester_id = sessions.semester_id) AND
    (membership.profile_id = ( select auth.uid() as uid)))))));

create policy "semester admins delete sessions" on "public"."sessions"
  for delete
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)));

create policy "startups request sessions" on "public"."sessions"
  for insert
  to "authenticated"
  with check ((private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)) OR ((status = 'requested'::text) AND (EXISTS ( SELECT 1
   FROM (public.startup_team_memberships team
     JOIN public.semester_memberships membership ON ((membership.id = team.semester_membership_id)))
  WHERE
    ((team.startup_semester_id = sessions.startup_semester_id) AND (team.semester_id = sessions.semester_id) AND (membership.semester_id = sessions.semester_id) AND
    (membership.profile_id = ( SELECT auth.uid() AS uid)) AND (membership.role = 'startup'::public.user_role) AND
    (membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status]))))))));

create policy "cohort members read startup organizations" on "public"."startup_organizations"
  for select
  to "authenticated"
  using ((exists ( select 1
   from public.startup_semesters startup_term
  where
    ((startup_term.startup_organization_id = startup_organizations.id) AND private.has_semester_role(startup_term.semester_id, ARRAY['admin'::public.user_role,
    'mentor'::public.user_role, 'startup'::public.user_role], ( select auth.uid() as uid))))));

create policy "cohort members read startup semesters" on "public"."startup_semesters"
  for select
  to "authenticated"
  using (private.has_semester_role(semester_id, ARRAY['admin'::public.user_role, 'mentor'::public.user_role, 'startup'::public.user_role], ( select auth.uid() as uid)));

create policy "startup teams update startup semesters" on "public"."startup_semesters"
  for update
  to "authenticated"
  using ((private.can_manage_semester(semester_id, ( select auth.uid() as uid)) or (exists ( select 1
   from (public.startup_team_memberships team
     JOIN public.semester_memberships membership on ((membership.id = team.semester_membership_id)))
  where
    ((team.startup_semester_id = startup_semesters.id) AND (team.semester_id = startup_semesters.semester_id) AND (membership.semester_id = startup_semesters.semester_id) AND
    (membership.profile_id = ( select auth.uid() as uid)) AND (membership.role = 'startup'::public.user_role) AND
    (membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status])))))))
  with check ((private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (public.startup_team_memberships team
     JOIN public.semester_memberships membership ON ((membership.id = team.semester_membership_id)))
  WHERE
    ((team.startup_semester_id = startup_semesters.id) AND (team.semester_id = startup_semesters.semester_id) AND (membership.semester_id = startup_semesters.semester_id) AND
    (membership.profile_id = ( SELECT auth.uid() AS uid)) AND (membership.role = 'startup'::public.user_role) AND
    (membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status])))))));

create policy "owners or admins read startup team memberships" on "public"."startup_team_memberships"
  for select
  to "authenticated"
  using ((private.can_manage_semester(semester_id, ( select auth.uid() as uid)) or (exists ( select 1
   from public.semester_memberships membership
  where
    ((membership.id = startup_team_memberships.semester_membership_id) AND (membership.semester_id = startup_team_memberships.semester_id) AND (membership.profile_id = ( select
    auth.uid() as uid)))))));

revoke all on function "private"."can_manage_semester"(uuid, uuid) from public;

grant execute on function "private"."can_manage_semester"(uuid, uuid) to "authenticated", "postgres";

revoke all on function "private"."can_read_mentor_profile"(uuid, uuid) from public;

grant execute on function "private"."can_read_mentor_profile"(uuid, uuid) to "authenticated", "postgres";

revoke all on function "private"."can_read_outreach_relationship_labels"(uuid) from public;

grant execute on function "private"."can_read_outreach_relationship_labels"(uuid) to "authenticated", "postgres";

revoke all on function "private"."has_outreach_company_access"(uuid, uuid) from public;

grant execute on function "private"."has_outreach_company_access"(uuid, uuid) to "authenticated", "postgres";

revoke all on function "private"."has_outreach_contact_access"(uuid, uuid) from public;

grant execute on function "private"."has_outreach_contact_access"(uuid, uuid) to "authenticated", "postgres";

revoke all on function "private"."has_semester_role"(uuid, public.user_role[], uuid) from public;

grant execute on function "private"."has_semester_role"(uuid, public.user_role[], uuid) to "authenticated", "postgres";

revoke all on function "private"."is_super_admin"(uuid) from public;

grant execute on function "private"."is_super_admin"(uuid) to "authenticated", "postgres";

revoke all on function "public"."authorize_semester_member_identity_update"(uuid, uuid) from public;

grant execute on function "public"."authorize_semester_member_identity_update"(uuid, uuid) to "authenticated", "postgres";

revoke all on function "public"."commit_mentor_assignment"(uuid, uuid, smallint, uuid, uuid, text, text, text, text[], text, jsonb) from public;

grant execute on function "public"."commit_mentor_assignment"(uuid, uuid, smallint, uuid, uuid, text, text, text, text[], text, jsonb) to "authenticated", "postgres";

revoke all on function "public"."create_mentor_records"(uuid, uuid, uuid, text, text, text, text[], boolean, text, text, text, text, text) from public;

grant execute on function "public"."create_mentor_records"(uuid, uuid, uuid, text, text, text, text[], boolean, text, text, text, text, text) to "postgres", "service_role";

revoke all on function "public"."move_startup_team_membership"(uuid, uuid, uuid) from public;

grant execute on function "public"."move_startup_team_membership"(uuid, uuid, uuid) to "authenticated", "postgres";

revoke all on function "public"."replace_draft_meetings"(uuid, jsonb) from public;

grant execute on function "public"."replace_draft_meetings"(uuid, jsonb) to "authenticated", "postgres";

revoke all on function "public"."set_platform_super_admin"(uuid, boolean) from public;

grant execute on function "public"."set_platform_super_admin"(uuid, boolean) to "postgres";

revoke all on function "public"."set_semester_member_access"(uuid, uuid, uuid, public.user_role, boolean, text, text) from public;

grant execute on function "public"."set_semester_member_access"(uuid, uuid, uuid, public.user_role, boolean, text, text) to "postgres", "service_role";

revoke all on function "public"."set_updated_at"() from public;

revoke all on function "public"."update_mentor_records"(uuid, uuid, jsonb) from public;

grant execute on function "public"."update_mentor_records"(uuid, uuid, jsonb) to "postgres", "service_role";

revoke all on function "public"."update_own_onboarding_progress"(uuid, uuid, jsonb, boolean) from public;

grant execute on function "public"."update_own_onboarding_progress"(uuid, uuid, jsonb, boolean) to "authenticated", "postgres";

revoke all on function "public"."update_startup_records"(uuid, text, text, text, text, text, text[], text[]) from public;

grant execute on function "public"."update_startup_records"(uuid, text, text, text, text, text, text[], text[]) to "authenticated", "postgres";

revoke all on function "public"."update_updated_at"() from public;

revoke all on function "public"."upsert_outreach_contact_bundle"(uuid, uuid, text, text, text, text, text, uuid, text, text, text, text, uuid, text, text[], jsonb) from public;

grant execute
  on function "public"."upsert_outreach_contact_bundle"(uuid, uuid, text, text, text, text, text, uuid, text, text, text, text, uuid, text, text[], jsonb)
  to "authenticated", "postgres";

grant usage on schema "private" to "authenticated";

grant create, usage on schema "private" to "postgres";

revoke all on table "public"."invitations" from "authenticated";

grant select on table "public"."invitations" to "authenticated";

revoke all on table "public"."meeting_availability" from "authenticated";

grant delete, select on table "public"."meeting_availability" to "authenticated";

revoke all on table "public"."meetings" from "authenticated";

grant select on table "public"."meetings" to "authenticated";

revoke all on table "public"."meetings" from "service_role";

grant select on table "public"."meetings" to "service_role";

revoke all on table "public"."mentor_profiles" from "authenticated";

grant select on table "public"."mentor_profiles" to "authenticated";

revoke all on table "public"."mentor_semesters" from "authenticated";

grant select on table "public"."mentor_semesters" to "authenticated";

revoke all on table "public"."outreach_activities" from "authenticated";

grant select on table "public"."outreach_activities" to "authenticated";

revoke all on table "public"."outreach_companies" from "authenticated";

grant select on table "public"."outreach_companies" to "authenticated";

revoke all on table "public"."outreach_contact_companies" from "authenticated";

grant select on table "public"."outreach_contact_companies" to "authenticated";

revoke all on table "public"."outreach_contacts" from "authenticated";

grant select on table "public"."outreach_contacts" to "authenticated";

revoke all on table "public"."outreach_imports" from "authenticated";

grant select on table "public"."outreach_imports" to "authenticated";

revoke all on table "public"."outreach_opportunities" from "authenticated";

grant select on table "public"."outreach_opportunities" to "authenticated";

revoke all on table "public"."platform_roles" from "authenticated";

grant select on table "public"."platform_roles" to "authenticated";

revoke all on table "public"."profiles" from "authenticated";

grant select on table "public"."profiles" to "authenticated";

revoke all on table "public"."profiles" from "service_role";

grant select on table "public"."profiles" to "service_role";

revoke all on table "public"."semester_memberships" from "authenticated";

grant select on table "public"."semester_memberships" to "authenticated";

revoke all on table "public"."semester_memberships" from "service_role";

grant select on table "public"."semester_memberships" to "service_role";

revoke all on table "public"."semesters" from "authenticated";

grant select on table "public"."semesters" to "authenticated";

revoke all on table "public"."sessions" from "authenticated";

grant select on table "public"."sessions" to "authenticated";

revoke all on table "public"."sessions" from "service_role";

grant delete, select on table "public"."sessions" to "service_role";

revoke all on table "public"."startup_organizations" from "authenticated";

grant select on table "public"."startup_organizations" to "authenticated";

revoke all on table "public"."startup_organizations" from "service_role";

grant select on table "public"."startup_organizations" to "service_role";

revoke all on table "public"."startup_semesters" from "authenticated";

grant select on table "public"."startup_semesters" to "authenticated";

revoke all on table "public"."startup_semesters" from "service_role";

grant select on table "public"."startup_semesters" to "service_role";

revoke all on table "public"."startup_team_memberships" from "authenticated";

grant select on table "public"."startup_team_memberships" to "authenticated";

revoke all on table "public"."startup_team_memberships" from "service_role";

grant delete, select on table "public"."startup_team_memberships" to "service_role";
