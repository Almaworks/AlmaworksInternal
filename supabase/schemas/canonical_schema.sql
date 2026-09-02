


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."invitation_lifecycle_status" AS ENUM (
    'draft',
    'queued',
    'sent',
    'failed',
    'accepted',
    'expired',
    'revoked'
);


ALTER TYPE "public"."invitation_lifecycle_status" OWNER TO "postgres";


CREATE TYPE "public"."membership_lifecycle_status" AS ENUM (
    'invited',
    'onboarding',
    'active',
    'alumni',
    'suspended'
);


ALTER TYPE "public"."membership_lifecycle_status" OWNER TO "postgres";


CREATE TYPE "public"."outreach_activity_kind" AS ENUM (
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


ALTER TYPE "public"."outreach_activity_kind" OWNER TO "postgres";


CREATE TYPE "public"."outreach_channel" AS ENUM (
    'email',
    'linkedin',
    'warm_intro',
    'referral',
    'event',
    'other'
);


ALTER TYPE "public"."outreach_channel" OWNER TO "postgres";


CREATE TYPE "public"."outreach_stage" AS ENUM (
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


ALTER TYPE "public"."outreach_stage" OWNER TO "postgres";


CREATE TYPE "public"."platform_role" AS ENUM (
    'super_admin'
);


ALTER TYPE "public"."platform_role" OWNER TO "postgres";


CREATE TYPE "public"."semester_lifecycle_status" AS ENUM (
    'draft',
    'active',
    'closed',
    'archived'
);


ALTER TYPE "public"."semester_lifecycle_status" OWNER TO "postgres";


CREATE TYPE "public"."startup_stage" AS ENUM (
    'idea',
    'mvp',
    'growth'
);


ALTER TYPE "public"."startup_stage" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'mentor',
    'startup',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."current_profile_id"("candidate_auth_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select id from public.profiles where auth_user_id = candidate_auth_user_id $$;


ALTER FUNCTION "private"."current_profile_id"("candidate_auth_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."actor_is_super_admin"("actor_profile_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select actor_profile_id is not null and exists (select 1 from public.platform_roles where profile_id=actor_profile_id and role='super_admin') $$;


ALTER FUNCTION "private"."actor_is_super_admin"("actor_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."actor_has_semester_role"("target_semester_id" "uuid", "allowed_roles" "public"."user_role"[], "actor_profile_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select actor_profile_id is not null and exists (select 1 from public.semester_memberships where semester_id=target_semester_id and profile_id=actor_profile_id and role=any(allowed_roles) and status='active') $$;


ALTER FUNCTION "private"."actor_has_semester_role"("target_semester_id" "uuid", "allowed_roles" "public"."user_role"[], "actor_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."actor_can_manage_semester"("target_semester_id" "uuid", "actor_profile_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select private.actor_is_super_admin(actor_profile_id) or private.actor_has_semester_role(target_semester_id,array['admin']::public.user_role[],actor_profile_id) $$;


ALTER FUNCTION "private"."actor_can_manage_semester"("target_semester_id" "uuid", "actor_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_manage_semester"("target_semester_id" "uuid", "candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select candidate_id is not null and candidate_id is not distinct from auth.uid() and private.actor_can_manage_semester(target_semester_id, private.current_profile_id(candidate_id)) $$;


ALTER FUNCTION "private"."can_manage_semester"("target_semester_id" "uuid", "candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_read_mentor_profile"("target_profile_id" "uuid", "candidate_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select candidate_id is not null
    and candidate_id is not distinct from auth.uid()
    and exists (
      select 1
      from public.semester_memberships candidate_membership
        where candidate_membership.profile_id = private.current_profile_id(candidate_id)
        and candidate_membership.status in ('onboarding', 'active')
    )
    and exists (
      select 1
      from public.semester_memberships mentor_membership
      where mentor_membership.profile_id = target_profile_id
        and mentor_membership.role = 'mentor'
        and mentor_membership.status in ('onboarding', 'active', 'alumni')
    );
$$;


ALTER FUNCTION "private"."can_read_mentor_profile"("target_profile_id" "uuid", "candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_read_outreach_relationship_labels"("candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select private.is_super_admin(candidate_id) or (candidate_id is not null and candidate_id is not distinct from auth.uid() and exists(select 1 from public.semester_memberships where profile_id=private.current_profile_id(candidate_id) and role='admin' and status='active')) $$;


ALTER FUNCTION "private"."can_read_outreach_relationship_labels"("candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."has_outreach_company_access"("target_company_id" "uuid", "candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select exists(select 1 from public.outreach_contact_companies cc join public.outreach_opportunities o on o.contact_id=cc.contact_id where cc.company_id=target_company_id and private.can_manage_semester(o.semester_id,candidate_id)) $$;


ALTER FUNCTION "private"."has_outreach_company_access"("target_company_id" "uuid", "candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."has_outreach_contact_access"("target_contact_id" "uuid", "candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select exists(select 1 from public.outreach_opportunities o where o.contact_id=target_contact_id and private.can_manage_semester(o.semester_id,candidate_id)) $$;


ALTER FUNCTION "private"."has_outreach_contact_access"("target_contact_id" "uuid", "candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."has_semester_role"("target_semester_id" "uuid", "allowed_roles" "public"."user_role"[], "candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select candidate_id is not null and candidate_id is not distinct from auth.uid() and private.actor_has_semester_role(target_semester_id, allowed_roles, private.current_profile_id(candidate_id)) $$;


ALTER FUNCTION "private"."has_semester_role"("target_semester_id" "uuid", "allowed_roles" "public"."user_role"[], "candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_super_admin"("candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select candidate_id is not null and candidate_id is not distinct from auth.uid() and private.actor_is_super_admin(private.current_profile_id(candidate_id)) $$;


ALTER FUNCTION "private"."is_super_admin"("candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_semester_transition"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid") RETURNS TABLE("closed_semester_id" "uuid", "active_semester_id" "uuid", "alumni_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    (p_source_semester_id,private.current_profile_id(),'semester.closed','semester',p_source_semester_id,jsonb_build_object('next_semester_id',p_target_semester_id,'alumni_count',v_alumni_count)),
    (p_target_semester_id,private.current_profile_id(),'semester.activated','semester',p_target_semester_id,jsonb_build_object('previous_semester_id',p_source_semester_id));
  return query select p_source_semester_id,p_target_semester_id,v_alumni_count;
end;
$$;


ALTER FUNCTION "public"."activate_semester_transition"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."authorize_semester_member_identity_update"("p_profile_id" "uuid", "p_semester_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  if private.actor_is_super_admin(p_profile_id) and not private.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required for this identity' using errcode = '42501';
  end if;
  return v_membership_id;
end;
$$;


ALTER FUNCTION "public"."authorize_semester_member_identity_update"("p_profile_id" "uuid", "p_semester_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_set_membership_activity"("p_semester_id" "uuid", "p_membership_ids" "uuid"[], "p_is_active" boolean) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
 select p_semester_id,private.current_profile_id(),case when p_is_active then 'membership.activated' else 'membership.suspended' end,'semester_membership',membership_id,jsonb_build_object('bulk',true,'status',v_status) from unnest(p_membership_ids) membership_id;
 return v_updated_count;
end; $$;


ALTER FUNCTION "public"."bulk_set_membership_activity"("p_semester_id" "uuid", "p_membership_ids" "uuid"[], "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_any_outreach"("candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select candidate_id is not null and candidate_id is not distinct from auth.uid() and exists(select 1 from public.semesters s where private.can_manage_semester(s.id,candidate_id)) $$;


ALTER FUNCTION "public"."can_manage_any_outreach"("candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_semester"("target_semester_id" "uuid", "candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select candidate_id is not null and candidate_id is not distinct from auth.uid() and private.can_manage_semester(target_semester_id,candidate_id) $$;


ALTER FUNCTION "public"."can_manage_semester"("target_semester_id" "uuid", "candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."carry_forward_outreach_contacts"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_contact_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    private.current_profile_id()
  from public.outreach_opportunities source
  where source.semester_id = p_source_semester_id and source.contact_id = any(p_contact_ids)
  on conflict (semester_id, contact_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;


ALTER FUNCTION "public"."carry_forward_outreach_contacts"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_contact_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."commit_mentor_assignment"("p_semester_id" "uuid", "p_meeting_id" "uuid", "p_slot" smallint, "p_startup_semester_id" "uuid", "p_mentor_semester_id" "uuid", "p_idempotency_key" "text", "p_format" "text" DEFAULT 'online'::"text", "p_topic" "text" DEFAULT NULL::"text", "p_override_types" "text"[] DEFAULT '{}'::"text"[], "p_override_reason" "text" DEFAULT NULL::"text", "p_ranking_context" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  values(p_semester_id, private.current_profile_id(), 'session.assigned', 'session', v_session_id, jsonb_build_object('override_types', p_override_types, 'ranking_context', p_ranking_context));
  return jsonb_build_object('sessionId', v_session_id, 'replayed', false);
end;
$$;


ALTER FUNCTION "public"."commit_mentor_assignment"("p_semester_id" "uuid", "p_meeting_id" "uuid", "p_slot" smallint, "p_startup_semester_id" "uuid", "p_mentor_semester_id" "uuid", "p_idempotency_key" "text", "p_format" "text", "p_topic" "text", "p_override_types" "text"[], "p_override_reason" "text", "p_ranking_context" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_mentor_records"("p_actor_profile_id" "uuid", "p_profile_id" "uuid", "p_semester_id" "uuid", "p_email" "text", "p_biography" "text", "p_company" "text", "p_expertise_tags" "text"[], "p_is_active" boolean, "p_linkedin_url" "text", "p_title" "text", "p_general_availability" "text", "p_opening_talk" "text", "p_preferred_format" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_existing_email text;
  v_existing_role public.user_role;
  v_existing_status text;
  v_membership_id uuid;
  v_mentor_semester_id uuid;
begin
  if p_actor_profile_id is null or not private.actor_can_manage_semester(p_semester_id, p_actor_profile_id) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  if private.actor_is_super_admin(p_profile_id) and not private.actor_is_super_admin(p_actor_profile_id) then
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
$$;


ALTER FUNCTION "public"."create_mentor_records"("p_actor_profile_id" "uuid", "p_profile_id" "uuid", "p_semester_id" "uuid", "p_email" "text", "p_biography" "text", "p_company" "text", "p_expertise_tags" "text"[], "p_is_active" boolean, "p_linkedin_url" "text", "p_title" "text", "p_general_availability" "text", "p_opening_talk" "text", "p_preferred_format" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_semester_draft"("p_source_semester_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date", "p_configuration" "jsonb") RETURNS TABLE("semester_id" "uuid", "semester_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_semester_id uuid;
begin
  if auth.uid() is null or not private.can_manage_semester(p_source_semester_id, auth.uid()) then raise exception 'Semester administrator access required' using errcode = '42501'; end if;
  if nullif(trim(p_name), '') is null or p_end_date <= p_start_date then raise exception 'Valid semester name and date range are required' using errcode = '22023'; end if;
  insert into public.semesters(name,start_date,end_date,is_active,lifecycle_status,configuration) values(trim(p_name),p_start_date,p_end_date,false,'draft',coalesce(p_configuration,'{}')) returning id into v_semester_id;
  insert into public.semester_memberships(semester_id,profile_id,role,status,activated_at) values(v_semester_id,private.current_profile_id(),'admin','active',now());
  insert into public.program_audit_events(semester_id,actor_profile_id,action,subject_type,subject_id,details) values(v_semester_id,private.current_profile_id(),'semester.draft_created','semester',v_semester_id,jsonb_build_object('source_semester_id',p_source_semester_id));
  return query select v_semester_id, trim(p_name);
end;
$$;


ALTER FUNCTION "public"."create_semester_draft"("p_source_semester_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date", "p_configuration" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ begin insert into public.profiles(id,auth_user_id,email,role,status,full_name) values(new.id,new.id,lower(new.email),'startup'::public.user_role,'pending',coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name')) on conflict(id) do update set auth_user_id=excluded.auth_user_id,email=excluded.email,full_name=coalesce(public.profiles.full_name,excluded.full_name),updated_at=now(); return new; end; $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_prior_semester_memberships"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_membership_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS TABLE("source_count" integer, "imported_count" integer, "skipped_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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

  insert into public.program_audit_events(semester_id,actor_profile_id,action,subject_type,details) values(p_target_semester_id,private.current_profile_id(),'membership.imported','semester_membership',jsonb_build_object('source_semester_id',p_source_semester_id,'imported_count',v_after-v_before));
  return query select v_source_count,v_after-v_before,v_source_count-(v_after-v_before);
end;
$$;


ALTER FUNCTION "public"."import_prior_semester_memberships"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_membership_ids" "uuid"[]) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."outreach_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester_id" "uuid" NOT NULL,
    "opportunity_id" "uuid" NOT NULL,
    "actor_profile_id" "uuid",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "summary" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "previous_owner_profile_id" "uuid",
    "new_owner_profile_id" "uuid",
    "supersedes_activity_id" "uuid",
    "external_message_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activity_kind" "public"."outreach_activity_kind" NOT NULL,
    "channel" "public"."outreach_channel",
    CONSTRAINT "outreach_activities_check" CHECK ((("activity_kind" <> ALL (ARRAY['email'::"public"."outreach_activity_kind", 'call'::"public"."outreach_activity_kind", 'linkedin'::"public"."outreach_activity_kind"])) OR ("channel" IS NOT NULL))),
    CONSTRAINT "outreach_activities_external_message_id_check" CHECK ((("external_message_id" IS NULL) OR ("length"("btrim"("external_message_id")) > 0)))
);


ALTER TABLE "public"."outreach_activities" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_outreach_activity"("p_opportunity_id" "uuid", "p_activity_kind" "public"."outreach_activity_kind", "p_occurred_at" timestamp with time zone DEFAULT "now"(), "p_channel" "public"."outreach_channel" DEFAULT NULL::"public"."outreach_channel", "p_summary" "text" DEFAULT NULL::"text", "p_details" "jsonb" DEFAULT '{}'::"jsonb", "p_next_follow_up_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_stage" "public"."outreach_stage" DEFAULT NULL::"public"."outreach_stage", "p_expected_updated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "public"."outreach_activities"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := private.current_profile_id();
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
$$;


ALTER FUNCTION "public"."log_outreach_activity"("p_opportunity_id" "uuid", "p_activity_kind" "public"."outreach_activity_kind", "p_occurred_at" timestamp with time zone, "p_channel" "public"."outreach_channel", "p_summary" "text", "p_details" "jsonb", "p_next_follow_up_at" timestamp with time zone, "p_stage" "public"."outreach_stage", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_startup_team_membership"("p_from_startup_semester_id" "uuid", "p_profile_id" "uuid", "p_to_startup_semester_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."move_startup_team_membership"("p_from_startup_semester_id" "uuid", "p_profile_id" "uuid", "p_to_startup_semester_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_outreach_activity_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  raise exception 'Outreach activities are append-only' using errcode = '55000';
end;
$$;


ALTER FUNCTION "public"."prevent_outreach_activity_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_inactive_owner_work"("p_owner_profile_id" "uuid") RETURNS TABLE("opportunity_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := private.current_profile_id();
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


ALTER FUNCTION "public"."release_inactive_owner_work"("p_owner_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_draft_meetings"("p_semester_id" "uuid", "p_meetings" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."replace_draft_meetings"("p_semester_id" "uuid", "p_meetings" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_outreach_opportunities"("p_semester_id" "uuid", "p_opportunity_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    select p_semester_id, id, private.current_profile_id(), 'stage_change', 'Outreach status reset',
      jsonb_build_object('stage', 'not_contacted', 'reason', 'new_semester_review')
    from reset_rows returning id
  )
  select count(*) into reset_count from logged;
  return reset_count;
end;
$$;


ALTER FUNCTION "public"."reset_outreach_opportunities"("p_semester_id" "uuid", "p_opportunity_ids" "uuid"[]) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."outreach_opportunities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "owner_profile_id" "uuid",
    "cadence_days" smallint DEFAULT 7 NOT NULL,
    "next_follow_up_at" timestamp with time zone,
    "snoozed_until" timestamp with time zone,
    "is_silenced" boolean DEFAULT false NOT NULL,
    "silenced_at" timestamp with time zone,
    "silenced_by" "uuid",
    "silence_reason" "text",
    "latest_inbound_activity_at" timestamp with time zone,
    "latest_outbound_activity_at" timestamp with time zone,
    "referred_by" "text",
    "priority" smallint DEFAULT 50 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_channel" "public"."outreach_channel",
    "stage" "text" DEFAULT 'not_contacted'::"text" NOT NULL,
    "relationship_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "semester_notes" "text",
    "source_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "outreach_opportunities_cadence_days_check" CHECK ((("cadence_days" >= 1) AND ("cadence_days" <= 365))),
    CONSTRAINT "outreach_opportunities_check" CHECK ((("is_silenced" AND ("silenced_at" IS NOT NULL) AND ("silenced_by" IS NOT NULL) AND ("silence_reason" IS NOT NULL) AND ("length"("btrim"("silence_reason")) > 0)) OR ((NOT "is_silenced") AND ("silenced_at" IS NULL) AND ("silenced_by" IS NULL) AND ("silence_reason" IS NULL)))),
    CONSTRAINT "outreach_opportunities_priority_check" CHECK ((("priority" >= 0) AND ("priority" <= 100))),
    CONSTRAINT "outreach_opportunities_relationship_types_check" CHECK (("cardinality"("relationship_types") > 0)),
    CONSTRAINT "outreach_opportunities_stage_check" CHECK (("stage" = ANY (ARRAY['not_contacted'::"text", 'researching'::"text", 'contacted'::"text", 'replied'::"text", 'conversation_scheduled'::"text", 'ready'::"text", 'declined'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."outreach_opportunities" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_outreach_silence"("p_opportunity_id" "uuid", "p_is_silenced" boolean, "p_reason" "text" DEFAULT NULL::"text", "p_next_follow_up_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_expected_updated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "public"."outreach_opportunities"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := private.current_profile_id();
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


ALTER FUNCTION "public"."set_outreach_silence"("p_opportunity_id" "uuid", "p_is_silenced" boolean, "p_reason" "text", "p_next_follow_up_at" timestamp with time zone, "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_outreach_snooze"("p_opportunity_id" "uuid", "p_snoozed_until" timestamp with time zone, "p_reason" "text" DEFAULT NULL::"text", "p_expected_updated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "public"."outreach_opportunities"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := private.current_profile_id();
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


ALTER FUNCTION "public"."set_outreach_snooze"("p_opportunity_id" "uuid", "p_snoozed_until" timestamp with time zone, "p_reason" "text", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_platform_super_admin"("p_profile_id" "uuid", "p_enabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required' using errcode = '42501';
  end if;
  if p_enabled then
    insert into public.platform_roles (profile_id, role, granted_by)
    values (p_profile_id, 'super_admin', private.current_profile_id())
    on conflict (profile_id, role) do update
    set granted_by = private.current_profile_id(), granted_at = now();
  else
    delete from public.platform_roles
    where profile_id = p_profile_id and role = 'super_admin';
  end if;
end;
$$;


ALTER FUNCTION "public"."set_platform_super_admin"("p_profile_id" "uuid", "p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_semester_member_access"("p_actor_profile_id" "uuid", "p_profile_id" "uuid", "p_semester_id" "uuid", "p_role" "public"."user_role", "p_approve" boolean, "p_full_name" "text", "p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_existing_email text;
  v_existing_role public.user_role;
  v_existing_status text;
  v_membership_id uuid;
begin
  if p_actor_profile_id is null or not private.actor_can_manage_semester(p_semester_id, p_actor_profile_id) then
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

  if private.actor_is_super_admin(p_profile_id) and not private.actor_is_super_admin(p_actor_profile_id) then
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
$$;


ALTER FUNCTION "public"."set_semester_member_access"("p_actor_profile_id" "uuid", "p_profile_id" "uuid", "p_semester_id" "uuid", "p_role" "public"."user_role", "p_approve" boolean, "p_full_name" "text", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."suspend_outreach_membership"("p_semester_id" "uuid", "p_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) RETURNS TABLE("membership_id" "uuid", "membership_status" "public"."membership_lifecycle_status", "membership_updated_at" timestamp with time zone, "released_opportunity_ids" "uuid"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := private.current_profile_id();
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


ALTER FUNCTION "public"."suspend_outreach_membership"("p_semester_id" "uuid", "p_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_outreach_owner"("p_opportunity_id" "uuid", "p_new_owner_profile_id" "uuid", "p_reason" "text" DEFAULT NULL::"text", "p_expected_updated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "public"."outreach_opportunities"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := private.current_profile_id();
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


ALTER FUNCTION "public"."transfer_outreach_owner"("p_opportunity_id" "uuid", "p_new_owner_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_mentor_records"("p_actor_profile_id" "uuid", "p_mentor_semester_id" "uuid", "p_patch" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  if p_actor_profile_id is null or not private.actor_can_manage_semester(v_semester_id, p_actor_profile_id) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  if private.actor_is_super_admin(v_profile_id) and not private.actor_is_super_admin(p_actor_profile_id) then
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
$$;


ALTER FUNCTION "public"."update_mentor_records"("p_actor_profile_id" "uuid", "p_mentor_semester_id" "uuid", "p_patch" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."semester_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "invited_at" timestamp with time zone,
    "activated_at" timestamp with time zone,
    "alumni_at" timestamp with time zone,
    "suspended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "public"."membership_lifecycle_status" DEFAULT 'invited'::"public"."membership_lifecycle_status" NOT NULL,
    "onboarding_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "onboarding_started_at" timestamp with time zone,
    "onboarding_completed_at" timestamp with time zone
);


ALTER TABLE "public"."semester_memberships" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_own_onboarding_progress"("p_membership_id" "uuid", "p_semester_id" "uuid", "p_onboarding_data" "jsonb", "p_finalize" boolean) RETURNS "public"."semester_memberships"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  actor_id uuid := private.current_profile_id();
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
$$;


ALTER FUNCTION "public"."update_own_onboarding_progress"("p_membership_id" "uuid", "p_semester_id" "uuid", "p_onboarding_data" "jsonb", "p_finalize" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_startup_records"("p_startup_semester_id" "uuid", "p_name" "text", "p_slug" "text", "p_industry" "text", "p_description" "text", "p_stage" "text", "p_preferred_expertise_tags" "text"[], "p_mentorship_needs" "text"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."update_startup_records"("p_startup_semester_id" "uuid", "p_name" "text", "p_slug" "text", "p_industry" "text", "p_description" "text", "p_stage" "text", "p_preferred_expertise_tags" "text"[], "p_mentorship_needs" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin new.updated_at = now(); return new; end;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_outreach_contact_bundle"("p_semester_id" "uuid", "p_contact_id" "uuid" DEFAULT NULL::"uuid", "p_full_name" "text" DEFAULT NULL::"text", "p_email" "text" DEFAULT NULL::"text", "p_linkedin_url" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_biography" "text" DEFAULT NULL::"text", "p_company_id" "uuid" DEFAULT NULL::"uuid", "p_company_name" "text" DEFAULT NULL::"text", "p_company_normalized_name" "text" DEFAULT NULL::"text", "p_company_domain" "text" DEFAULT NULL::"text", "p_company_title" "text" DEFAULT NULL::"text", "p_owner_profile_id" "uuid" DEFAULT NULL::"uuid", "p_stage" "text" DEFAULT 'not_contacted'::"text", "p_relationship_types" "text"[] DEFAULT ARRAY['mentor'::"text"], "p_source_context" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("contact_id" "uuid", "company_id" "uuid", "opportunity_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
#variable_conflict use_column
declare
  actor_id uuid := private.current_profile_id();
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
$$;


ALTER FUNCTION "public"."upsert_outreach_contact_bundle"("p_semester_id" "uuid", "p_contact_id" "uuid", "p_full_name" "text", "p_email" "text", "p_linkedin_url" "text", "p_phone" "text", "p_biography" "text", "p_company_id" "uuid", "p_company_name" "text", "p_company_normalized_name" "text", "p_company_domain" "text", "p_company_title" "text", "p_owner_profile_id" "uuid", "p_stage" "text", "p_relationship_types" "text"[], "p_source_context" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_outreach_owner_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."validate_outreach_owner_membership"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "startup_semester_id" "uuid",
    "matched_profile_id" "uuid",
    "invited_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "sent_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "last_error_code" "text",
    "last_error_message" "text",
    "send_attempts" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "public"."invitation_lifecycle_status" DEFAULT 'draft'::"public"."invitation_lifecycle_status" NOT NULL,
    CONSTRAINT "invitations_check" CHECK (((("role" = 'startup'::"public"."user_role") AND ("startup_semester_id" IS NOT NULL)) OR (("role" <> 'startup'::"public"."user_role") AND ("startup_semester_id" IS NULL)))),
    CONSTRAINT "invitations_email_check" CHECK (("email" = "lower"(TRIM(BOTH FROM "email")))),
    CONSTRAINT "invitations_send_attempts_check" CHECK (("send_attempts" >= 0))
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meeting_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester_id" "uuid" NOT NULL,
    "meeting_id" "uuid" NOT NULL,
    "semester_membership_id" "uuid" NOT NULL,
    "slot" smallint NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "source" "text" DEFAULT 'user'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meeting_availability_slot_check" CHECK (("slot" = ANY (ARRAY[1, 2])))
);


ALTER TABLE "public"."meeting_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester_id" "uuid" NOT NULL,
    "meeting_date" "date" NOT NULL,
    "label" "text",
    "slot_1_starts_at" time without time zone DEFAULT '15:30:00'::time without time zone NOT NULL,
    "slot_1_ends_at" time without time zone DEFAULT '16:15:00'::time without time zone NOT NULL,
    "slot_2_starts_at" time without time zone DEFAULT '16:15:00'::time without time zone NOT NULL,
    "slot_2_ends_at" time without time zone DEFAULT '17:00:00'::time without time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meetings_check" CHECK ((("slot_1_starts_at" < "slot_1_ends_at") AND ("slot_1_ends_at" <= "slot_2_starts_at") AND ("slot_2_starts_at" < "slot_2_ends_at"))),
    CONSTRAINT "meetings_meeting_date_check" CHECK ((EXTRACT(isodow FROM "meeting_date") = (5)::numeric))
);


ALTER TABLE "public"."meetings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mentor_profiles" (
    "profile_id" "uuid" NOT NULL,
    "biography" "text",
    "company" "text",
    "title" "text",
    "linkedin_url" "text",
    "website_url" "text",
    "photo_url" "text",
    "expertise_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mentor_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mentor_semesters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester_id" "uuid" NOT NULL,
    "semester_membership_id" "uuid" NOT NULL,
    "mentorship_goals" "text",
    "preferred_format" "text",
    "capacity" integer DEFAULT 4 NOT NULL,
    "readiness_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "general_availability" "text",
    "per_week_availability" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "opening_talk" "text",
    CONSTRAINT "mentor_semesters_capacity_check" CHECK ((("capacity" >= 0) AND ("capacity" <= 50))),
    CONSTRAINT "mentor_semesters_readiness_status_check" CHECK (("readiness_status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'ready'::"text"])))
);


ALTER TABLE "public"."mentor_semesters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."outreach_companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "normalized_name" "text" NOT NULL,
    "domain" "text",
    "website_url" "text",
    "description" "text",
    "sector" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "outreach_companies_domain_check" CHECK ((("domain" IS NULL) OR ("domain" = "lower"("btrim"("domain"))))),
    CONSTRAINT "outreach_companies_name_check" CHECK (("length"("btrim"("name")) > 0)),
    CONSTRAINT "outreach_companies_normalized_name_check" CHECK (("normalized_name" = "lower"("btrim"("normalized_name"))))
);


ALTER TABLE "public"."outreach_companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."outreach_contact_companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "title" "text",
    "started_on" "date",
    "ended_on" "date",
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "outreach_contact_companies_check" CHECK ((("ended_on" IS NULL) OR ("started_on" IS NULL) OR ("ended_on" >= "started_on")))
);


ALTER TABLE "public"."outreach_contact_companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."outreach_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text",
    "linkedin_url" "text",
    "canonical_linkedin_url" "text",
    "phone" "text",
    "biography" "text",
    "expertise_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "relationship_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "background_notes" "text",
    CONSTRAINT "outreach_contacts_canonical_linkedin_url_check" CHECK ((("canonical_linkedin_url" IS NULL) OR ("length"("btrim"("canonical_linkedin_url")) > 0))),
    CONSTRAINT "outreach_contacts_email_check" CHECK ((("email" IS NULL) OR ("email" = "lower"("btrim"("email"))))),
    CONSTRAINT "outreach_contacts_full_name_check" CHECK (("length"("btrim"("full_name")) > 0))
);


ALTER TABLE "public"."outreach_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."outreach_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "source_name" "text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "status" "text" DEFAULT 'preview'::"text" NOT NULL,
    "rows" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "result" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "committed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "outreach_imports_rows_check" CHECK (("jsonb_typeof"("rows") = 'array'::"text")),
    CONSTRAINT "outreach_imports_status_check" CHECK (("status" = ANY (ARRAY['preview'::"text", 'committing'::"text", 'committed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."outreach_imports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_roles" (
    "profile_id" "uuid" NOT NULL,
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "public"."platform_role" NOT NULL
);


ALTER TABLE "public"."platform_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "auth_user_id" "uuid",
    "email" "text" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "semester_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "full_name" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "profiles_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester_id" "uuid" NOT NULL,
    "actor_profile_id" "uuid",
    "action" "text" NOT NULL,
    "subject_type" "text" NOT NULL,
    "subject_id" "uuid",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."program_audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."semesters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "configuration" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "configuration_template_version" integer,
    "closed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lifecycle_status" "public"."semester_lifecycle_status" DEFAULT 'draft'::"public"."semester_lifecycle_status" NOT NULL
);


ALTER TABLE "public"."semesters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester_id" "uuid" NOT NULL,
    "topic" "text",
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "notes" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "format" "text",
    "startup_absent" boolean DEFAULT false NOT NULL,
    "substitute_name" "text",
    "meeting_id" "uuid" NOT NULL,
    "mentor_semester_id" "uuid" NOT NULL,
    "startup_semester_id" "uuid" NOT NULL,
    "slot" smallint NOT NULL,
    "idempotency_key" "text",
    CONSTRAINT "sessions_slot_check" CHECK (("slot" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "sessions_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'confirmed'::"text", 'declined'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."startup_organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "industry" "text",
    "website_url" "text",
    "logo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "durable_contact_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."startup_organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."startup_semesters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester_id" "uuid" NOT NULL,
    "startup_organization_id" "uuid" NOT NULL,
    "company_snapshot" "text",
    "stage" "public"."startup_stage",
    "goals" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "mentorship_needs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "preferred_expertise_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "readiness_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mentor_need_context" "text",
    "mentor_need_no_preference" boolean DEFAULT false NOT NULL,
    CONSTRAINT "startup_semesters_readiness_status_check" CHECK (("readiness_status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'ready'::"text"])))
);


ALTER TABLE "public"."startup_semesters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."startup_team_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester_id" "uuid" NOT NULL,
    "startup_semester_id" "uuid" NOT NULL,
    "semester_membership_id" "uuid" NOT NULL,
    "is_primary_contact" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."startup_team_memberships" OWNER TO "postgres";


ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_availability"
    ADD CONSTRAINT "meeting_availability_meeting_id_semester_membership_id_slot_key" UNIQUE ("meeting_id", "semester_membership_id", "slot");



ALTER TABLE ONLY "public"."meeting_availability"
    ADD CONSTRAINT "meeting_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_semester_id_id_key" UNIQUE ("semester_id", "id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_semester_id_meeting_date_key" UNIQUE ("semester_id", "meeting_date");



ALTER TABLE ONLY "public"."mentor_profiles"
    ADD CONSTRAINT "mentor_profiles_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."mentor_semesters"
    ADD CONSTRAINT "mentor_semesters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mentor_semesters"
    ADD CONSTRAINT "mentor_semesters_semester_id_id_key" UNIQUE ("semester_id", "id");



ALTER TABLE ONLY "public"."mentor_semesters"
    ADD CONSTRAINT "mentor_semesters_semester_id_semester_membership_id_key" UNIQUE ("semester_id", "semester_membership_id");



ALTER TABLE ONLY "public"."outreach_activities"
    ADD CONSTRAINT "outreach_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outreach_activities"
    ADD CONSTRAINT "outreach_activities_semester_id_opportunity_id_id_key" UNIQUE ("semester_id", "opportunity_id", "id");



ALTER TABLE ONLY "public"."outreach_companies"
    ADD CONSTRAINT "outreach_companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outreach_contact_companies"
    ADD CONSTRAINT "outreach_contact_companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outreach_contacts"
    ADD CONSTRAINT "outreach_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outreach_imports"
    ADD CONSTRAINT "outreach_imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outreach_imports"
    ADD CONSTRAINT "outreach_imports_semester_id_idempotency_key_key" UNIQUE ("semester_id", "idempotency_key");



ALTER TABLE ONLY "public"."outreach_opportunities"
    ADD CONSTRAINT "outreach_opportunities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outreach_opportunities"
    ADD CONSTRAINT "outreach_opportunities_semester_id_id_key" UNIQUE ("semester_id", "id");



ALTER TABLE ONLY "public"."platform_roles"
    ADD CONSTRAINT "platform_roles_pkey" PRIMARY KEY ("profile_id", "role");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."program_audit_events"
    ADD CONSTRAINT "program_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."semester_memberships"
    ADD CONSTRAINT "semester_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."semester_memberships"
    ADD CONSTRAINT "semester_memberships_semester_id_id_key" UNIQUE ("semester_id", "id");



ALTER TABLE ONLY "public"."semester_memberships"
    ADD CONSTRAINT "semester_memberships_semester_profile_key" UNIQUE ("semester_id", "profile_id");



ALTER TABLE "public"."semesters"
    ADD CONSTRAINT "semesters_active_lifecycle_status_check" CHECK (((NOT "is_active") OR ("lifecycle_status" = 'active'::"public"."semester_lifecycle_status"))) NOT VALID;



ALTER TABLE ONLY "public"."semesters"
    ADD CONSTRAINT "semesters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."startup_organizations"
    ADD CONSTRAINT "startup_organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."startup_organizations"
    ADD CONSTRAINT "startup_organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."startup_semesters"
    ADD CONSTRAINT "startup_semesters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."startup_semesters"
    ADD CONSTRAINT "startup_semesters_semester_id_id_key" UNIQUE ("semester_id", "id");



ALTER TABLE ONLY "public"."startup_semesters"
    ADD CONSTRAINT "startup_semesters_semester_id_startup_organization_id_key" UNIQUE ("semester_id", "startup_organization_id");



ALTER TABLE ONLY "public"."startup_team_memberships"
    ADD CONSTRAINT "startup_team_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."startup_team_memberships"
    ADD CONSTRAINT "startup_team_memberships_startup_semester_id_semester_membe_key" UNIQUE ("startup_semester_id", "semester_membership_id");



CREATE INDEX "invitations_invited_by_idx" ON "public"."invitations" USING "btree" ("invited_by");



CREATE INDEX "invitations_matched_profile_idx" ON "public"."invitations" USING "btree" ("matched_profile_id") WHERE ("matched_profile_id" IS NOT NULL);



CREATE UNIQUE INDEX "invitations_open_identity_idx" ON "public"."invitations" USING "btree" ("semester_id", "email", "role") WHERE ("status" = ANY (ARRAY['draft'::"public"."invitation_lifecycle_status", 'queued'::"public"."invitation_lifecycle_status", 'sent'::"public"."invitation_lifecycle_status"]));



CREATE INDEX "invitations_operations_idx" ON "public"."invitations" USING "btree" ("semester_id", "status", "created_at" DESC);



CREATE INDEX "invitations_startup_semester_idx" ON "public"."invitations" USING "btree" ("startup_semester_id") WHERE ("startup_semester_id" IS NOT NULL);



CREATE INDEX "meeting_availability_member_idx" ON "public"."meeting_availability" USING "btree" ("semester_membership_id", "meeting_id");



CREATE INDEX "meeting_availability_semester_idx" ON "public"."meeting_availability" USING "btree" ("semester_id");



CREATE INDEX "mentor_semesters_membership_idx" ON "public"."mentor_semesters" USING "btree" ("semester_membership_id");



CREATE UNIQUE INDEX "one_active_semester" ON "public"."semesters" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "outreach_activities_actor_idx" ON "public"."outreach_activities" USING "btree" ("actor_profile_id") WHERE ("actor_profile_id" IS NOT NULL);



CREATE INDEX "outreach_activities_new_owner_idx" ON "public"."outreach_activities" USING "btree" ("new_owner_profile_id") WHERE ("new_owner_profile_id" IS NOT NULL);



CREATE INDEX "outreach_activities_previous_owner_idx" ON "public"."outreach_activities" USING "btree" ("previous_owner_profile_id") WHERE ("previous_owner_profile_id" IS NOT NULL);



CREATE INDEX "outreach_activities_supersedes_idx" ON "public"."outreach_activities" USING "btree" ("semester_id", "opportunity_id", "supersedes_activity_id") WHERE ("supersedes_activity_id" IS NOT NULL);



CREATE INDEX "outreach_activities_timeline_idx" ON "public"."outreach_activities" USING "btree" ("semester_id", "opportunity_id", "occurred_at" DESC, "id" DESC);



CREATE INDEX "outreach_companies_created_by_idx" ON "public"."outreach_companies" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE UNIQUE INDEX "outreach_companies_domain_key" ON "public"."outreach_companies" USING "btree" ("domain") WHERE ("domain" IS NOT NULL);



CREATE UNIQUE INDEX "outreach_companies_normalized_name_key" ON "public"."outreach_companies" USING "btree" ("normalized_name");



CREATE INDEX "outreach_contact_companies_company_idx" ON "public"."outreach_contact_companies" USING "btree" ("company_id", "contact_id");



CREATE UNIQUE INDEX "outreach_contact_companies_identity_key" ON "public"."outreach_contact_companies" USING "btree" ("contact_id", "company_id", COALESCE("started_on", '-infinity'::"date"));



CREATE UNIQUE INDEX "outreach_contact_companies_primary_key" ON "public"."outreach_contact_companies" USING "btree" ("contact_id") WHERE ("is_primary" AND ("ended_on" IS NULL));



CREATE INDEX "outreach_contacts_created_by_idx" ON "public"."outreach_contacts" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE UNIQUE INDEX "outreach_contacts_email_key" ON "public"."outreach_contacts" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE UNIQUE INDEX "outreach_contacts_linkedin_key" ON "public"."outreach_contacts" USING "btree" ("canonical_linkedin_url") WHERE ("canonical_linkedin_url" IS NOT NULL);



CREATE INDEX "outreach_imports_created_by_idx" ON "public"."outreach_imports" USING "btree" ("created_by");



CREATE INDEX "outreach_opportunities_contact_idx" ON "public"."outreach_opportunities" USING "btree" ("contact_id", "semester_id");



CREATE INDEX "outreach_opportunities_created_by_idx" ON "public"."outreach_opportunities" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "outreach_opportunities_owner_idx" ON "public"."outreach_opportunities" USING "btree" ("owner_profile_id", "semester_id") WHERE ("owner_profile_id" IS NOT NULL);



CREATE INDEX "outreach_opportunities_queue_cursor_idx" ON "public"."outreach_opportunities" USING "btree" ("semester_id", "next_follow_up_at", "id");



CREATE UNIQUE INDEX "outreach_opportunities_semester_contact_key" ON "public"."outreach_opportunities" USING "btree" ("semester_id", "contact_id");



CREATE INDEX "outreach_opportunities_silenced_by_idx" ON "public"."outreach_opportunities" USING "btree" ("silenced_by") WHERE ("silenced_by" IS NOT NULL);



CREATE INDEX "platform_roles_granted_by_idx" ON "public"."platform_roles" USING "btree" ("granted_by") WHERE ("granted_by" IS NOT NULL);



CREATE INDEX "program_audit_events_actor_idx" ON "public"."program_audit_events" USING "btree" ("actor_profile_id") WHERE ("actor_profile_id" IS NOT NULL);



CREATE INDEX "program_audit_events_semester_timeline_idx" ON "public"."program_audit_events" USING "btree" ("semester_id", "created_at" DESC);



CREATE INDEX "semester_memberships_operations_idx" ON "public"."semester_memberships" USING "btree" ("semester_id", "status", "role");



CREATE INDEX "semester_memberships_profile_idx" ON "public"."semester_memberships" USING "btree" ("profile_id", "semester_id");



CREATE UNIQUE INDEX "semesters_one_active_idx" ON "public"."semesters" USING "btree" ("is_active") WHERE "is_active";



CREATE UNIQUE INDEX "sessions_active_mentor_slot_key" ON "public"."sessions" USING "btree" ("meeting_id", "slot", "mentor_semester_id") WHERE ("status" <> 'cancelled'::"text");



CREATE UNIQUE INDEX "sessions_active_startup_slot_key" ON "public"."sessions" USING "btree" ("meeting_id", "slot", "startup_semester_id") WHERE ("status" <> 'cancelled'::"text");



CREATE INDEX "sessions_mentor_idx" ON "public"."sessions" USING "btree" ("mentor_semester_id", "meeting_id");



CREATE UNIQUE INDEX "sessions_semester_idempotency_key" ON "public"."sessions" USING "btree" ("semester_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "sessions_semester_idx" ON "public"."sessions" USING "btree" ("semester_id");



CREATE INDEX "sessions_semester_meeting_idx" ON "public"."sessions" USING "btree" ("semester_id", "meeting_id");



CREATE INDEX "sessions_startup_idx" ON "public"."sessions" USING "btree" ("startup_semester_id", "meeting_id");



CREATE INDEX "startup_semesters_organization_idx" ON "public"."startup_semesters" USING "btree" ("startup_organization_id");



CREATE INDEX "startup_team_memberships_profile_idx" ON "public"."startup_team_memberships" USING "btree" ("semester_membership_id");



CREATE INDEX "startup_team_memberships_semester_idx" ON "public"."startup_team_memberships" USING "btree" ("semester_id");



CREATE OR REPLACE TRIGGER "prevent_outreach_activity_mutation" BEFORE DELETE OR UPDATE ON "public"."outreach_activities" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_outreach_activity_mutation"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "sessions_updated_at" BEFORE UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "validate_canonical_outreach_owner_membership" BEFORE INSERT OR UPDATE OF "semester_id", "owner_profile_id", "stage" ON "public"."outreach_opportunities" FOR EACH ROW EXECUTE FUNCTION "public"."validate_outreach_owner_membership"();



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_matched_profile_id_fkey" FOREIGN KEY ("matched_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_startup_semester_id_fkey" FOREIGN KEY ("startup_semester_id") REFERENCES "public"."startup_semesters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meeting_availability"
    ADD CONSTRAINT "meeting_availability_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_availability"
    ADD CONSTRAINT "meeting_availability_semester_id_meeting_id_fkey" FOREIGN KEY ("semester_id", "meeting_id") REFERENCES "public"."meetings"("semester_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_availability"
    ADD CONSTRAINT "meeting_availability_semester_id_semester_membership_id_fkey" FOREIGN KEY ("semester_id", "semester_membership_id") REFERENCES "public"."semester_memberships"("semester_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mentor_profiles"
    ADD CONSTRAINT "mentor_profiles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mentor_semesters"
    ADD CONSTRAINT "mentor_semesters_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mentor_semesters"
    ADD CONSTRAINT "mentor_semesters_semester_membership_id_fkey" FOREIGN KEY ("semester_membership_id") REFERENCES "public"."semester_memberships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outreach_activities"
    ADD CONSTRAINT "outreach_activities_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."outreach_activities"
    ADD CONSTRAINT "outreach_activities_new_owner_profile_id_fkey" FOREIGN KEY ("new_owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."outreach_activities"
    ADD CONSTRAINT "outreach_activities_previous_owner_profile_id_fkey" FOREIGN KEY ("previous_owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."outreach_activities"
    ADD CONSTRAINT "outreach_activities_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outreach_activities"
    ADD CONSTRAINT "outreach_activities_semester_id_opportunity_id_fkey" FOREIGN KEY ("semester_id", "opportunity_id") REFERENCES "public"."outreach_opportunities"("semester_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outreach_activities"
    ADD CONSTRAINT "outreach_activities_semester_id_opportunity_id_supersedes__fkey" FOREIGN KEY ("semester_id", "opportunity_id", "supersedes_activity_id") REFERENCES "public"."outreach_activities"("semester_id", "opportunity_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."outreach_companies"
    ADD CONSTRAINT "outreach_companies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."outreach_contact_companies"
    ADD CONSTRAINT "outreach_contact_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."outreach_companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outreach_contact_companies"
    ADD CONSTRAINT "outreach_contact_companies_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."outreach_contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outreach_contacts"
    ADD CONSTRAINT "outreach_contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."outreach_imports"
    ADD CONSTRAINT "outreach_imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."outreach_imports"
    ADD CONSTRAINT "outreach_imports_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outreach_opportunities"
    ADD CONSTRAINT "outreach_opportunities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."outreach_contacts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."outreach_opportunities"
    ADD CONSTRAINT "outreach_opportunities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."outreach_opportunities"
    ADD CONSTRAINT "outreach_opportunities_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."outreach_opportunities"
    ADD CONSTRAINT "outreach_opportunities_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outreach_opportunities"
    ADD CONSTRAINT "outreach_opportunities_silenced_by_fkey" FOREIGN KEY ("silenced_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."platform_roles"
    ADD CONSTRAINT "platform_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."platform_roles"
    ADD CONSTRAINT "platform_roles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_audit_events"
    ADD CONSTRAINT "program_audit_events_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_audit_events"
    ADD CONSTRAINT "program_audit_events_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."semester_memberships"
    ADD CONSTRAINT "semester_memberships_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."semester_memberships"
    ADD CONSTRAINT "semester_memberships_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_semester_meeting_fkey" FOREIGN KEY ("semester_id", "meeting_id") REFERENCES "public"."meetings"("semester_id", "id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_semester_mentor_fkey" FOREIGN KEY ("semester_id", "mentor_semester_id") REFERENCES "public"."mentor_semesters"("semester_id", "id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_semester_startup_fkey" FOREIGN KEY ("semester_id", "startup_semester_id") REFERENCES "public"."startup_semesters"("semester_id", "id");



ALTER TABLE ONLY "public"."startup_semesters"
    ADD CONSTRAINT "startup_semesters_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."startup_semesters"
    ADD CONSTRAINT "startup_semesters_startup_organization_id_fkey" FOREIGN KEY ("startup_organization_id") REFERENCES "public"."startup_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."startup_team_memberships"
    ADD CONSTRAINT "startup_team_memberships_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."startup_team_memberships"
    ADD CONSTRAINT "startup_team_memberships_semester_membership_id_fkey" FOREIGN KEY ("semester_membership_id") REFERENCES "public"."semester_memberships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."startup_team_memberships"
    ADD CONSTRAINT "startup_team_memberships_startup_semester_id_fkey" FOREIGN KEY ("startup_semester_id") REFERENCES "public"."startup_semesters"("id") ON DELETE CASCADE;



CREATE POLICY "admins or mentors update sessions" ON "public"."sessions" FOR UPDATE TO "authenticated" USING (("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM ("public"."mentor_semesters" "mentor_term"
     JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "mentor_term"."semester_membership_id")))
  WHERE (("mentor_term"."id" = "sessions"."mentor_semester_id") AND ("mentor_term"."semester_id" = "sessions"."semester_id") AND ("membership"."semester_id" = "sessions"."semester_id") AND ("membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) AND ("membership"."role" = 'mentor'::"public"."user_role") AND ("membership"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"]))))))) WITH CHECK (("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")) OR (("status" = ANY (ARRAY['confirmed'::"text", 'declined'::"text"])) AND (EXISTS ( SELECT 1
   FROM ("public"."mentor_semesters" "mentor_term"
     JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "mentor_term"."semester_membership_id")))
  WHERE (("mentor_term"."id" = "sessions"."mentor_semester_id") AND ("mentor_term"."semester_id" = "sessions"."semester_id") AND ("membership"."semester_id" = "sessions"."semester_id") AND ("membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) AND ("membership"."role" = 'mentor'::"public"."user_role") AND ("membership"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"]))))))));



CREATE POLICY "authenticated users read semesters" ON "public"."semesters" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "cohort members read meetings" ON "public"."meetings" FOR SELECT TO "authenticated" USING ("private"."has_semester_role"("semester_id", ARRAY['admin'::"public"."user_role", 'mentor'::"public"."user_role", 'startup'::"public"."user_role"], ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "cohort members read startup organizations" ON "public"."startup_organizations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."startup_semesters" "startup_term"
  WHERE (("startup_term"."startup_organization_id" = "startup_organizations"."id") AND "private"."has_semester_role"("startup_term"."semester_id", ARRAY['admin'::"public"."user_role", 'mentor'::"public"."user_role", 'startup'::"public"."user_role"], ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "cohort members read startup semesters" ON "public"."startup_semesters" FOR SELECT TO "authenticated" USING ("private"."has_semester_role"("semester_id", ARRAY['admin'::"public"."user_role", 'mentor'::"public"."user_role", 'startup'::"public"."user_role"], ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_availability" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meetings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members delete meeting availability" ON "public"."meeting_availability" FOR DELETE TO "authenticated" USING (("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "membership"
  WHERE (("membership"."id" = "meeting_availability"."semester_membership_id") AND ("membership"."semester_id" = "meeting_availability"."semester_id") AND ("membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) AND ("membership"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"])))))));



CREATE POLICY "members insert meeting availability" ON "public"."meeting_availability" FOR INSERT TO "authenticated" WITH CHECK (("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")) OR ((EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "membership"
  WHERE (("membership"."id" = "meeting_availability"."semester_membership_id") AND ("membership"."semester_id" = "meeting_availability"."semester_id") AND ("membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) AND ("membership"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"]))))) AND (EXISTS ( SELECT 1
   FROM "public"."meetings" "meeting"
  WHERE (("meeting"."id" = "meeting_availability"."meeting_id") AND ("meeting"."semester_id" = "meeting_availability"."semester_id")))))));



CREATE POLICY "members read authorized semester memberships" ON "public"."semester_memberships" FOR SELECT TO "authenticated" USING ((("profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) OR "private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")) OR (("role" = 'mentor'::"public"."user_role") AND ("status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status", 'alumni'::"public"."membership_lifecycle_status"])) AND (EXISTS ( SELECT 1
   FROM "public"."semesters" "viewer_semester"
  WHERE "private"."has_semester_role"("viewer_semester"."id", ARRAY['admin'::"public"."user_role", 'mentor'::"public"."user_role", 'startup'::"public"."user_role"], ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "members update meeting availability" ON "public"."meeting_availability" FOR UPDATE TO "authenticated" USING (("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "membership"
  WHERE (("membership"."id" = "meeting_availability"."semester_membership_id") AND ("membership"."semester_id" = "meeting_availability"."semester_id") AND ("membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) AND ("membership"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"]))))))) WITH CHECK (("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")) OR ((EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "membership"
  WHERE (("membership"."id" = "meeting_availability"."semester_membership_id") AND ("membership"."semester_id" = "meeting_availability"."semester_id") AND ("membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) AND ("membership"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"]))))) AND (EXISTS ( SELECT 1
   FROM "public"."meetings" "meeting"
  WHERE (("meeting"."id" = "meeting_availability"."meeting_id") AND ("meeting"."semester_id" = "meeting_availability"."semester_id")))))));



ALTER TABLE "public"."mentor_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mentor_semesters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mentors update their own mentor profile" ON "public"."mentor_profiles" FOR UPDATE TO "authenticated" USING (("profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id"))) WITH CHECK (("profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")));



CREATE POLICY "mentors update their own semester profile" ON "public"."mentor_semesters" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "mentor_membership"
  WHERE (("mentor_membership"."id" = "mentor_semesters"."semester_membership_id") AND ("mentor_membership"."semester_id" = "mentor_semesters"."semester_id") AND ("mentor_membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) AND ("mentor_membership"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "mentor_membership"
  WHERE (("mentor_membership"."id" = "mentor_semesters"."semester_membership_id") AND ("mentor_membership"."semester_id" = "mentor_semesters"."semester_id") AND ("mentor_membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) AND ("mentor_membership"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"]))))));



ALTER TABLE "public"."outreach_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outreach_companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outreach_contact_companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outreach_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outreach_imports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outreach_opportunities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owners or admins read meeting availability" ON "public"."meeting_availability" FOR SELECT TO "authenticated" USING (("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "membership"
  WHERE (("membership"."id" = "meeting_availability"."semester_membership_id") AND ("membership"."semester_id" = "meeting_availability"."semester_id") AND ("membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")))))));



CREATE POLICY "owners or admins read startup team memberships" ON "public"."startup_team_memberships" FOR SELECT TO "authenticated" USING (("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "membership"
  WHERE (("membership"."id" = "startup_team_memberships"."semester_membership_id") AND ("membership"."semester_id" = "startup_team_memberships"."semester_id") AND ("membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")))))));



CREATE POLICY "owners or super admins read platform roles" ON "public"."platform_roles" FOR SELECT TO "authenticated" USING ((("profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) OR "private"."is_super_admin"(( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "participants read sessions" ON "public"."sessions" FOR SELECT TO "authenticated" USING (("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM ("public"."mentor_semesters" "mentor_term"
     JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "mentor_term"."semester_membership_id")))
  WHERE (("mentor_term"."id" = "sessions"."mentor_semester_id") AND ("mentor_term"."semester_id" = "sessions"."semester_id") AND ("membership"."semester_id" = "sessions"."semester_id") AND ("membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."startup_team_memberships" "team"
     JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "team"."semester_membership_id")))
  WHERE (("team"."startup_semester_id" = "sessions"."startup_semester_id") AND ("team"."semester_id" = "sessions"."semester_id") AND ("membership"."semester_id" = "sessions"."semester_id") AND ("membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")))))));



ALTER TABLE "public"."platform_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "program members read mentor profiles" ON "public"."mentor_profiles" FOR SELECT TO "authenticated" USING ((("profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) OR "private"."is_super_admin"(( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "viewer_membership"
  WHERE (("viewer_membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) AND ("viewer_membership"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"])))))));



CREATE POLICY "program members read mentor semesters" ON "public"."mentor_semesters" FOR SELECT TO "authenticated" USING (("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "mentor_membership"
  WHERE (("mentor_membership"."id" = "mentor_semesters"."semester_membership_id") AND ("mentor_membership"."semester_id" = "mentor_semesters"."semester_id") AND (("mentor_membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) OR (("mentor_membership"."role" = 'mentor'::"public"."user_role") AND ("mentor_membership"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status", 'alumni'::"public"."membership_lifecycle_status"])) AND (EXISTS ( SELECT 1
           FROM "public"."semester_memberships" "viewer_membership"
          WHERE (("viewer_membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) AND ("viewer_membership"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"]))))))))))));



CREATE POLICY "program members read profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) OR "private"."is_super_admin"(( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "administrator"
  WHERE (("administrator"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) AND ("administrator"."role" = 'admin'::"public"."user_role") AND ("administrator"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"]))))) OR "private"."can_read_mentor_profile"("id", ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."program_audit_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "semester admins delete sessions" ON "public"."sessions" FOR DELETE TO "authenticated" USING ("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "semester admins insert outreach imports" ON "public"."outreach_imports" FOR INSERT TO "authenticated" WITH CHECK ("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "semester admins read invitations" ON "public"."invitations" FOR SELECT TO "authenticated" USING ("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "semester admins read outreach activities" ON "public"."outreach_activities" FOR SELECT TO "authenticated" USING ("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "semester admins read outreach companies" ON "public"."outreach_companies" FOR SELECT TO "authenticated" USING ("private"."has_outreach_company_access"("id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "semester admins read outreach company links" ON "public"."outreach_contact_companies" FOR SELECT TO "authenticated" USING (("private"."has_outreach_contact_access"("contact_id", ( SELECT "auth"."uid"() AS "uid")) AND "private"."has_outreach_company_access"("company_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "semester admins read outreach contacts" ON "public"."outreach_contacts" FOR SELECT TO "authenticated" USING ("private"."has_outreach_contact_access"("id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "semester admins read outreach imports" ON "public"."outreach_imports" FOR SELECT TO "authenticated" USING ("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "semester admins read outreach opportunities" ON "public"."outreach_opportunities" FOR SELECT TO "authenticated" USING ("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "semester admins read program audit" ON "public"."program_audit_events" FOR SELECT TO "authenticated" USING ("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "semester admins update outreach company links" ON "public"."outreach_contact_companies" FOR UPDATE TO "authenticated" USING (("private"."has_outreach_contact_access"("contact_id", ( SELECT "auth"."uid"() AS "uid")) AND "private"."has_outreach_company_access"("company_id", ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (("private"."has_outreach_contact_access"("contact_id", ( SELECT "auth"."uid"() AS "uid")) AND "private"."has_outreach_company_access"("company_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "semester admins update outreach contacts" ON "public"."outreach_contacts" FOR UPDATE TO "authenticated" USING ("private"."has_outreach_contact_access"("id", ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ("private"."has_outreach_contact_access"("id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "semester admins update outreach imports" ON "public"."outreach_imports" FOR UPDATE TO "authenticated" USING ("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "semester admins update outreach opportunities" ON "public"."outreach_opportunities" FOR UPDATE TO "authenticated" USING ("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."semester_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."semesters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "startup teams update startup semesters" ON "public"."startup_semesters" FOR UPDATE TO "authenticated" USING (("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM ("public"."startup_team_memberships" "team"
     JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "team"."semester_membership_id")))
  WHERE (("team"."startup_semester_id" = "startup_semesters"."id") AND ("team"."semester_id" = "startup_semesters"."semester_id") AND ("membership"."semester_id" = "startup_semesters"."semester_id") AND ("membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) AND ("membership"."role" = 'startup'::"public"."user_role") AND ("membership"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"]))))))) WITH CHECK (("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM ("public"."startup_team_memberships" "team"
     JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "team"."semester_membership_id")))
  WHERE (("team"."startup_semester_id" = "startup_semesters"."id") AND ("team"."semester_id" = "startup_semesters"."semester_id") AND ("membership"."semester_id" = "startup_semesters"."semester_id") AND ("membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) AND ("membership"."role" = 'startup'::"public"."user_role") AND ("membership"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"])))))));



ALTER TABLE "public"."startup_organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."startup_semesters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."startup_team_memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "startups request sessions" ON "public"."sessions" FOR INSERT TO "authenticated" WITH CHECK (("private"."can_manage_semester"("semester_id", ( SELECT "auth"."uid"() AS "uid")) OR (("status" = 'requested'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."startup_team_memberships" "team"
     JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "team"."semester_membership_id")))
  WHERE (("team"."startup_semester_id" = "sessions"."startup_semester_id") AND ("team"."semester_id" = "sessions"."semester_id") AND ("membership"."semester_id" = "sessions"."semester_id") AND ("membership"."profile_id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")) AND ("membership"."role" = 'startup'::"public"."user_role") AND ("membership"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"]))))))));



CREATE POLICY "users update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id"))) WITH CHECK (("id" = ( SELECT "private"."current_profile_id"(( SELECT "auth"."uid"() AS "uid")) AS "current_profile_id")));



GRANT USAGE ON SCHEMA "private" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."can_manage_semester"("target_semester_id" "uuid", "candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_manage_semester"("target_semester_id" "uuid", "candidate_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_read_mentor_profile"("target_profile_id" "uuid", "candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_read_mentor_profile"("target_profile_id" "uuid", "candidate_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_read_outreach_relationship_labels"("candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_read_outreach_relationship_labels"("candidate_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."has_outreach_company_access"("target_company_id" "uuid", "candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."has_outreach_company_access"("target_company_id" "uuid", "candidate_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."has_outreach_contact_access"("target_contact_id" "uuid", "candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."has_outreach_contact_access"("target_contact_id" "uuid", "candidate_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."has_semester_role"("target_semester_id" "uuid", "allowed_roles" "public"."user_role"[], "candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."has_semester_role"("target_semester_id" "uuid", "allowed_roles" "public"."user_role"[], "candidate_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_super_admin"("candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_super_admin"("candidate_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."activate_semester_transition"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_semester_transition"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."authorize_semester_member_identity_update"("p_profile_id" "uuid", "p_semester_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."authorize_semester_member_identity_update"("p_profile_id" "uuid", "p_semester_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."bulk_set_membership_activity"("p_semester_id" "uuid", "p_membership_ids" "uuid"[], "p_is_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bulk_set_membership_activity"("p_semester_id" "uuid", "p_membership_ids" "uuid"[], "p_is_active" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."can_manage_any_outreach"("candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_any_outreach"("candidate_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."can_manage_semester"("target_semester_id" "uuid", "candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_semester"("target_semester_id" "uuid", "candidate_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."carry_forward_outreach_contacts"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_contact_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."carry_forward_outreach_contacts"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_contact_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."commit_mentor_assignment"("p_semester_id" "uuid", "p_meeting_id" "uuid", "p_slot" smallint, "p_startup_semester_id" "uuid", "p_mentor_semester_id" "uuid", "p_idempotency_key" "text", "p_format" "text", "p_topic" "text", "p_override_types" "text"[], "p_override_reason" "text", "p_ranking_context" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."commit_mentor_assignment"("p_semester_id" "uuid", "p_meeting_id" "uuid", "p_slot" smallint, "p_startup_semester_id" "uuid", "p_mentor_semester_id" "uuid", "p_idempotency_key" "text", "p_format" "text", "p_topic" "text", "p_override_types" "text"[], "p_override_reason" "text", "p_ranking_context" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_mentor_records"("p_actor_profile_id" "uuid", "p_profile_id" "uuid", "p_semester_id" "uuid", "p_email" "text", "p_biography" "text", "p_company" "text", "p_expertise_tags" "text"[], "p_is_active" boolean, "p_linkedin_url" "text", "p_title" "text", "p_general_availability" "text", "p_opening_talk" "text", "p_preferred_format" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_mentor_records"("p_actor_profile_id" "uuid", "p_profile_id" "uuid", "p_semester_id" "uuid", "p_email" "text", "p_biography" "text", "p_company" "text", "p_expertise_tags" "text"[], "p_is_active" boolean, "p_linkedin_url" "text", "p_title" "text", "p_general_availability" "text", "p_opening_talk" "text", "p_preferred_format" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_semester_draft"("p_source_semester_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date", "p_configuration" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_semester_draft"("p_source_semester_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date", "p_configuration" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."import_prior_semester_memberships"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_membership_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_prior_semester_memberships"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_membership_ids" "uuid"[]) TO "authenticated";



GRANT SELECT ON TABLE "public"."outreach_activities" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."log_outreach_activity"("p_opportunity_id" "uuid", "p_activity_kind" "public"."outreach_activity_kind", "p_occurred_at" timestamp with time zone, "p_channel" "public"."outreach_channel", "p_summary" "text", "p_details" "jsonb", "p_next_follow_up_at" timestamp with time zone, "p_stage" "public"."outreach_stage", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_outreach_activity"("p_opportunity_id" "uuid", "p_activity_kind" "public"."outreach_activity_kind", "p_occurred_at" timestamp with time zone, "p_channel" "public"."outreach_channel", "p_summary" "text", "p_details" "jsonb", "p_next_follow_up_at" timestamp with time zone, "p_stage" "public"."outreach_stage", "p_expected_updated_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."move_startup_team_membership"("p_from_startup_semester_id" "uuid", "p_profile_id" "uuid", "p_to_startup_semester_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_startup_team_membership"("p_from_startup_semester_id" "uuid", "p_profile_id" "uuid", "p_to_startup_semester_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."prevent_outreach_activity_mutation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."release_inactive_owner_work"("p_owner_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_inactive_owner_work"("p_owner_profile_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."replace_draft_meetings"("p_semester_id" "uuid", "p_meetings" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."replace_draft_meetings"("p_semester_id" "uuid", "p_meetings" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."reset_outreach_opportunities"("p_semester_id" "uuid", "p_opportunity_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_outreach_opportunities"("p_semester_id" "uuid", "p_opportunity_ids" "uuid"[]) TO "authenticated";



GRANT SELECT ON TABLE "public"."outreach_opportunities" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_outreach_silence"("p_opportunity_id" "uuid", "p_is_silenced" boolean, "p_reason" "text", "p_next_follow_up_at" timestamp with time zone, "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_outreach_silence"("p_opportunity_id" "uuid", "p_is_silenced" boolean, "p_reason" "text", "p_next_follow_up_at" timestamp with time zone, "p_expected_updated_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_outreach_snooze"("p_opportunity_id" "uuid", "p_snoozed_until" timestamp with time zone, "p_reason" "text", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_outreach_snooze"("p_opportunity_id" "uuid", "p_snoozed_until" timestamp with time zone, "p_reason" "text", "p_expected_updated_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_platform_super_admin"("p_profile_id" "uuid", "p_enabled" boolean) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."set_semester_member_access"("p_actor_profile_id" "uuid", "p_profile_id" "uuid", "p_semester_id" "uuid", "p_role" "public"."user_role", "p_approve" boolean, "p_full_name" "text", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_semester_member_access"("p_actor_profile_id" "uuid", "p_profile_id" "uuid", "p_semester_id" "uuid", "p_role" "public"."user_role", "p_approve" boolean, "p_full_name" "text", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."suspend_outreach_membership"("p_semester_id" "uuid", "p_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."suspend_outreach_membership"("p_semester_id" "uuid", "p_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."transfer_outreach_owner"("p_opportunity_id" "uuid", "p_new_owner_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_outreach_owner"("p_opportunity_id" "uuid", "p_new_owner_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_mentor_records"("p_actor_profile_id" "uuid", "p_mentor_semester_id" "uuid", "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_mentor_records"("p_actor_profile_id" "uuid", "p_mentor_semester_id" "uuid", "p_patch" "jsonb") TO "service_role";



GRANT SELECT ON TABLE "public"."semester_memberships" TO "authenticated";
GRANT SELECT ON TABLE "public"."semester_memberships" TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_own_onboarding_progress"("p_membership_id" "uuid", "p_semester_id" "uuid", "p_onboarding_data" "jsonb", "p_finalize" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_own_onboarding_progress"("p_membership_id" "uuid", "p_semester_id" "uuid", "p_onboarding_data" "jsonb", "p_finalize" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_startup_records"("p_startup_semester_id" "uuid", "p_name" "text", "p_slug" "text", "p_industry" "text", "p_description" "text", "p_stage" "text", "p_preferred_expertise_tags" "text"[], "p_mentorship_needs" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_startup_records"("p_startup_semester_id" "uuid", "p_name" "text", "p_slug" "text", "p_industry" "text", "p_description" "text", "p_stage" "text", "p_preferred_expertise_tags" "text"[], "p_mentorship_needs" "text"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_updated_at"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."upsert_outreach_contact_bundle"("p_semester_id" "uuid", "p_contact_id" "uuid", "p_full_name" "text", "p_email" "text", "p_linkedin_url" "text", "p_phone" "text", "p_biography" "text", "p_company_id" "uuid", "p_company_name" "text", "p_company_normalized_name" "text", "p_company_domain" "text", "p_company_title" "text", "p_owner_profile_id" "uuid", "p_stage" "text", "p_relationship_types" "text"[], "p_source_context" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_outreach_contact_bundle"("p_semester_id" "uuid", "p_contact_id" "uuid", "p_full_name" "text", "p_email" "text", "p_linkedin_url" "text", "p_phone" "text", "p_biography" "text", "p_company_id" "uuid", "p_company_name" "text", "p_company_normalized_name" "text", "p_company_domain" "text", "p_company_title" "text", "p_owner_profile_id" "uuid", "p_stage" "text", "p_relationship_types" "text"[], "p_source_context" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."validate_outreach_owner_membership"() FROM PUBLIC;



GRANT SELECT ON TABLE "public"."invitations" TO "authenticated";



GRANT SELECT,DELETE ON TABLE "public"."meeting_availability" TO "authenticated";



GRANT SELECT ON TABLE "public"."meetings" TO "authenticated";
GRANT SELECT ON TABLE "public"."meetings" TO "service_role";



GRANT SELECT ON TABLE "public"."mentor_profiles" TO "authenticated";



GRANT SELECT ON TABLE "public"."mentor_semesters" TO "authenticated";



GRANT SELECT ON TABLE "public"."outreach_companies" TO "authenticated";



GRANT SELECT ON TABLE "public"."outreach_contact_companies" TO "authenticated";



GRANT SELECT ON TABLE "public"."outreach_contacts" TO "authenticated";



GRANT SELECT ON TABLE "public"."outreach_imports" TO "authenticated";



GRANT SELECT ON TABLE "public"."platform_roles" TO "authenticated";



GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT ON TABLE "public"."semesters" TO "authenticated";



GRANT SELECT ON TABLE "public"."sessions" TO "authenticated";
GRANT SELECT,DELETE ON TABLE "public"."sessions" TO "service_role";



GRANT SELECT ON TABLE "public"."startup_organizations" TO "authenticated";
GRANT SELECT ON TABLE "public"."startup_organizations" TO "service_role";



GRANT SELECT ON TABLE "public"."startup_semesters" TO "authenticated";
GRANT SELECT ON TABLE "public"."startup_semesters" TO "service_role";



GRANT SELECT ON TABLE "public"."startup_team_memberships" TO "authenticated";
GRANT SELECT,DELETE ON TABLE "public"."startup_team_memberships" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";


CREATE OR REPLACE FUNCTION public.preview_member_login_removal(p_profile_id uuid)
RETURNS TABLE(
  profile_id uuid,
  auth_user_id uuid,
  full_name text,
  email text,
  profile_is_active boolean,
  semester_count bigint,
  session_count bigint,
  suspend_membership_ids uuid[],
  already_prepared boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
declare
  v_latest_account_action text;
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required' using errcode = '42501';
  end if;

  if p_profile_id = private.current_profile_id() then
    raise exception 'You cannot remove your own login account' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.platform_roles platform_role
    where platform_role.profile_id = p_profile_id
  ) then
    raise exception 'Platform role holders cannot have their login account removed' using errcode = '42501';
  end if;

  select audit_event.action
  into v_latest_account_action
  from public.program_audit_events audit_event
  where audit_event.subject_type = 'profile'
    and audit_event.subject_id = p_profile_id
    and audit_event.action in ('member.login_removal_prepared', 'member.login_restored')
  order by audit_event.created_at desc, audit_event.action desc
  limit 1;

  return query
  select
    profile.id,
    profile.auth_user_id,
    profile.full_name,
    profile.email,
    profile.is_active,
    (
      select count(distinct membership.semester_id)
      from public.semester_memberships membership
      where membership.profile_id = profile.id
    ),
    (
      select count(*)
      from (
        select session.id
        from public.sessions session
        join public.mentor_semesters mentor_term
          on mentor_term.id = session.mentor_semester_id
         and mentor_term.semester_id = session.semester_id
        join public.semester_memberships mentor_membership
          on mentor_membership.id = mentor_term.semester_membership_id
         and mentor_membership.semester_id = mentor_term.semester_id
        where mentor_membership.profile_id = profile.id
        union
        select session.id
        from public.sessions session
        join public.startup_team_memberships startup_team
          on startup_team.startup_semester_id = session.startup_semester_id
         and startup_team.semester_id = session.semester_id
        join public.semester_memberships startup_membership
          on startup_membership.id = startup_team.semester_membership_id
         and startup_membership.semester_id = startup_team.semester_id
        where startup_membership.profile_id = profile.id
      ) retained_session
    ),
    (
      select coalesce(array_agg(membership.id order by membership.id), '{}'::uuid[])
      from public.semester_memberships membership
      where membership.profile_id = profile.id
        and membership.status in ('invited', 'onboarding', 'active')
    ),
    coalesce(v_latest_account_action = 'member.login_removal_prepared', false)
  from public.profiles profile
  where profile.id = p_profile_id;

  if not found then
    raise exception 'Member profile not found' using errcode = 'P0002';
  end if;
end;
$$;


CREATE OR REPLACE FUNCTION public.prepare_member_login_removal(p_profile_id uuid, p_reason text)
RETURNS TABLE(
  profile_id uuid,
  auth_user_id uuid,
  profile_is_active boolean,
  suspended_membership_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
declare
  v_actor_profile_id uuid := private.current_profile_id();
  v_auth_user_id uuid;
  v_is_active boolean;
  v_latest_account_action text;
  v_prior_statuses jsonb;
  v_suspended_membership_ids uuid[] := '{}'::uuid[];
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Removal reason is required' using errcode = '22023';
  end if;

  select profile.auth_user_id, profile.is_active
  into v_auth_user_id, v_is_active
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if not found then
    raise exception 'Member profile not found' using errcode = 'P0002';
  end if;
  if p_profile_id = v_actor_profile_id then
    raise exception 'You cannot remove your own login account' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.platform_roles platform_role
    where platform_role.profile_id = p_profile_id
  ) then
    raise exception 'Platform role holders cannot have their login account removed' using errcode = '42501';
  end if;

  select audit_event.action
  into v_latest_account_action
  from public.program_audit_events audit_event
  where audit_event.subject_type = 'profile'
    and audit_event.subject_id = p_profile_id
    and audit_event.action in ('member.login_removal_prepared', 'member.login_restored')
  order by audit_event.created_at desc, audit_event.action desc
  limit 1;

  select coalesce(
    jsonb_object_agg(membership.id::text, membership.status::text),
    '{}'::jsonb
  )
  into v_prior_statuses
  from public.semester_memberships membership
  where membership.profile_id = p_profile_id;

  if v_is_active then
    update public.profiles profile
    set is_active = false,
        updated_at = now()
    where profile.id = p_profile_id
      and profile.is_active;
  end if;

  with suspended as (
    update public.semester_memberships membership
    set status = 'suspended',
        suspended_at = now(),
        updated_at = now()
    where membership.profile_id = p_profile_id
      and membership.status in ('invited', 'onboarding', 'active')
    returning membership.id
  )
  select coalesce(array_agg(suspended.id order by suspended.id), '{}'::uuid[])
  into v_suspended_membership_ids
  from suspended;

  if v_latest_account_action is distinct from 'member.login_removal_prepared' then
    insert into public.program_audit_events (
      semester_id,
      actor_profile_id,
      action,
      subject_type,
      subject_id,
      details
    )
    select
      membership.semester_id,
      v_actor_profile_id,
      'member.login_removal_prepared',
      'profile',
      p_profile_id,
      jsonb_build_object(
        'reason', btrim(p_reason),
        'target_profile_id', p_profile_id,
        'prior_statuses', jsonb_build_array(
          jsonb_build_object(
            'membership_id', membership.id,
            'status', v_prior_statuses ->> membership.id::text
          )
        ),
        'affected_membership_ids', case
          when membership.id = any(v_suspended_membership_ids) then jsonb_build_array(membership.id)
          else '[]'::jsonb
        end
      )
    from public.semester_memberships membership
    where membership.profile_id = p_profile_id
    order by membership.semester_id;
  end if;

  return query
  select p_profile_id, v_auth_user_id, false, v_suspended_membership_ids;
end;
$$;


CREATE OR REPLACE FUNCTION public.attach_replacement_auth_identity(p_profile_id uuid, p_auth_user_id uuid)
RETURNS TABLE(
  profile_id uuid,
  auth_user_id uuid,
  profile_is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
declare
  v_actor_profile_id uuid := private.current_profile_id();
  v_retained_auth_user_id uuid;
  v_retained_email text;
  v_retained_is_active boolean;
  v_placeholder_profile_id uuid;
  v_placeholder_email text;
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required' using errcode = '42501';
  end if;

  select profile.auth_user_id, profile.email, profile.is_active
  into v_retained_auth_user_id, v_retained_email, v_retained_is_active
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if not found then
    raise exception 'Member profile not found' using errcode = 'P0002';
  end if;
  if p_profile_id = v_actor_profile_id then
    raise exception 'You cannot replace your own login identity' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.platform_roles platform_role
    where platform_role.profile_id = p_profile_id
  ) then
    raise exception 'Platform role holders cannot have their login identity replaced' using errcode = '42501';
  end if;
  if v_retained_auth_user_id is not null or v_retained_is_active then
    raise exception 'Retained profile must be unlinked and disabled' using errcode = '55000';
  end if;

  select profile.id, profile.email
  into v_placeholder_profile_id, v_placeholder_email
  from public.profiles profile
  where profile.auth_user_id = p_auth_user_id
  for update;

  if not found or v_placeholder_profile_id = p_profile_id then
    raise exception 'Replacement placeholder profile not found' using errcode = 'P0002';
  end if;
  if lower(btrim(v_retained_email)) is distinct from lower(btrim(v_placeholder_email)) then
    raise exception 'Replacement email does not match the retained profile' using errcode = '22023';
  end if;

  if exists (select 1 from public.semester_memberships membership where membership.profile_id = v_placeholder_profile_id)
    or exists (select 1 from public.platform_roles platform_role where platform_role.profile_id = v_placeholder_profile_id or platform_role.granted_by = v_placeholder_profile_id)
    or exists (select 1 from public.mentor_profiles mentor_profile where mentor_profile.profile_id = v_placeholder_profile_id)
    or exists (select 1 from public.invitations invitation where invitation.invited_by = v_placeholder_profile_id or invitation.matched_profile_id = v_placeholder_profile_id)
    or exists (select 1 from public.program_audit_events audit_event where audit_event.actor_profile_id = v_placeholder_profile_id)
    or exists (select 1 from public.outreach_contacts contact where contact.created_by = v_placeholder_profile_id or contact.archived_by = v_placeholder_profile_id)
    or exists (select 1 from public.outreach_companies company where company.created_by = v_placeholder_profile_id)
    or exists (
      select 1
      from public.outreach_opportunities opportunity
      where opportunity.owner_profile_id = v_placeholder_profile_id
        or opportunity.silenced_by = v_placeholder_profile_id
        or opportunity.created_by = v_placeholder_profile_id
        or opportunity.archived_by = v_placeholder_profile_id
    )
    or exists (
      select 1
      from public.outreach_activities activity
      where activity.actor_profile_id = v_placeholder_profile_id
        or activity.previous_owner_profile_id = v_placeholder_profile_id
        or activity.new_owner_profile_id = v_placeholder_profile_id
    )
    or exists (select 1 from public.outreach_imports outreach_import where outreach_import.created_by = v_placeholder_profile_id)
  then
    raise exception 'Replacement profile contains durable references' using errcode = '55000';
  end if;

  delete from public.profiles profile
  where profile.id = v_placeholder_profile_id;

  update public.profiles profile
  set auth_user_id = p_auth_user_id,
      is_active = true,
      updated_at = now()
  where profile.id = p_profile_id;

  insert into public.program_audit_events (
    semester_id,
    actor_profile_id,
    action,
    subject_type,
    subject_id,
    details
  )
  select
    membership.semester_id,
    v_actor_profile_id,
    'member.login_restored',
    'profile',
    p_profile_id,
    jsonb_build_object(
      'target_profile_id', p_profile_id,
      'replacement_auth_user_id', p_auth_user_id,
      'membership_status', membership.status
    )
  from public.semester_memberships membership
  where membership.profile_id = p_profile_id
  order by membership.semester_id;

  return query
  select p_profile_id, p_auth_user_id, true;
end;
$$;


revoke all on function public.preview_member_login_removal(uuid) from public, anon;
revoke all on function public.prepare_member_login_removal(uuid, text) from public, anon;
revoke all on function public.attach_replacement_auth_identity(uuid, uuid) from public, anon;
grant execute on function public.preview_member_login_removal(uuid) to authenticated, postgres;
grant execute on function public.prepare_member_login_removal(uuid, text) to authenticated, postgres;
grant execute on function public.attach_replacement_auth_identity(uuid, uuid) to authenticated, postgres;
