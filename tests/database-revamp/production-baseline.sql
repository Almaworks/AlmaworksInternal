


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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."access_request_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'withdrawn'
);


ALTER TYPE "public"."access_request_status" OWNER TO "postgres";


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


CREATE TYPE "public"."outreach_import_match_decision" AS ENUM (
    'create_new',
    'exact_email',
    'exact_linkedin',
    'review_required',
    'merge',
    'exclude'
);


ALTER TYPE "public"."outreach_import_match_decision" OWNER TO "postgres";


CREATE TYPE "public"."outreach_import_status" AS ENUM (
    'preview',
    'reviewing',
    'ready',
    'committing',
    'committed',
    'failed',
    'rolled_back'
);


ALTER TYPE "public"."outreach_import_status" OWNER TO "postgres";


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


CREATE TYPE "public"."outreach_status" AS ENUM (
    'prospect',
    'contacted',
    'responded',
    'onboarded'
);


ALTER TYPE "public"."outreach_status" OWNER TO "postgres";


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


CREATE TYPE "public"."session_status" AS ENUM (
    'pending',
    'confirmed',
    'declined',
    'requested',
    'cancelled'
);


ALTER TYPE "public"."session_status" OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."activate_semester_transition"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid") RETURNS TABLE("closed_semester_id" "uuid", "active_semester_id" "uuid", "alumni_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."activate_semester_transition"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_set_membership_activity"("p_semester_id" "uuid", "p_membership_ids" "uuid"[], "p_is_active" boolean) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."bulk_set_membership_activity"("p_semester_id" "uuid", "p_membership_ids" "uuid"[], "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_any_outreach"("candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.semesters
    where public.can_manage_semester(public.semesters.id, candidate_id)
  );
$$;


ALTER FUNCTION "public"."can_manage_any_outreach"("candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_semester"("target_semester_id" "uuid", "candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."can_manage_semester"("target_semester_id" "uuid", "candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_outreach_relationship_labels"("candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_super_admin(candidate_id)
    or exists (
      select 1
      from public.semester_memberships
      where public.semester_memberships.profile_id = candidate_id
        and public.semester_memberships.role = 'admin'
        and public.semester_memberships.status = 'active'
    );
$$;


ALTER FUNCTION "public"."can_read_outreach_relationship_labels"("candidate_id" "uuid") OWNER TO "postgres";


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
    auth.uid()
  from public.outreach_opportunities source
  where source.semester_id = p_source_semester_id and source.contact_id = any(p_contact_ids)
  on conflict (semester_id, contact_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;


ALTER FUNCTION "public"."carry_forward_outreach_contacts"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_contact_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."commit_legacy_outreach_migration"("p_semester_id" "uuid", "p_idempotency_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."commit_legacy_outreach_migration"("p_semester_id" "uuid", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."commit_mentor_assignment"("p_semester_id" "uuid", "p_session_date_id" "uuid", "p_time_slot" "text", "p_startup_semester_id" "uuid", "p_mentor_profile_id" "uuid", "p_idempotency_key" "text", "p_format" "text" DEFAULT 'online'::"text", "p_topic" "text" DEFAULT NULL::"text", "p_override_types" "text"[] DEFAULT '{}'::"text"[], "p_override_reason" "text" DEFAULT NULL::"text", "p_ranking_context" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."commit_mentor_assignment"("p_semester_id" "uuid", "p_session_date_id" "uuid", "p_time_slot" "text", "p_startup_semester_id" "uuid", "p_mentor_profile_id" "uuid", "p_idempotency_key" "text", "p_format" "text", "p_topic" "text", "p_override_types" "text"[], "p_override_reason" "text", "p_ranking_context" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_semester_draft"("p_source_semester_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date", "p_configuration" "jsonb") RETURNS TABLE("semester_id" "uuid", "semester_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."create_semester_draft"("p_source_semester_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date", "p_configuration" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_outreach_company_access"("target_company_id" "uuid", "candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.outreach_contact_companies
    join public.outreach_opportunities
      on public.outreach_opportunities.contact_id = public.outreach_contact_companies.contact_id
    where public.outreach_contact_companies.company_id = target_company_id
      and public.can_manage_semester(public.outreach_opportunities.semester_id, candidate_id)
  );
$$;


ALTER FUNCTION "public"."has_outreach_company_access"("target_company_id" "uuid", "candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_outreach_contact_access"("target_contact_id" "uuid", "candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.outreach_opportunities
    where public.outreach_opportunities.contact_id = target_contact_id
      and public.can_manage_semester(public.outreach_opportunities.semester_id, candidate_id)
  );
$$;


ALTER FUNCTION "public"."has_outreach_contact_access"("target_contact_id" "uuid", "candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_semester_role"("target_semester_id" "uuid", "allowed_roles" "public"."user_role"[], "candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.semester_memberships
    where semester_id = target_semester_id
      and profile_id = candidate_id
      and role = any(allowed_roles)
      and status in ('onboarding', 'active', 'alumni')
  );
$$;


ALTER FUNCTION "public"."has_semester_role"("target_semester_id" "uuid", "allowed_roles" "public"."user_role"[], "candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_prior_semester_memberships"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_membership_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS TABLE("source_count" integer, "imported_count" integer, "skipped_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."import_prior_semester_memberships"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_membership_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"("candidate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.platform_roles
    where profile_id = candidate_id and role = 'super_admin'
  );
$$;


ALTER FUNCTION "public"."is_super_admin"("candidate_id" "uuid") OWNER TO "postgres";

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


ALTER FUNCTION "public"."log_outreach_activity"("p_opportunity_id" "uuid", "p_activity_kind" "public"."outreach_activity_kind", "p_occurred_at" timestamp with time zone, "p_channel" "public"."outreach_channel", "p_summary" "text", "p_details" "jsonb", "p_next_follow_up_at" timestamp with time zone, "p_stage" "public"."outreach_stage", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "semester_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "full_name" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "auth_user_id" "uuid",
    CONSTRAINT "profiles_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


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


CREATE OR REPLACE VIEW "public"."mentors" WITH ("security_invoker"='true') AS
 SELECT "mentor_term"."id",
    "membership"."profile_id" AS "user_id",
    "mentor_term"."semester_id",
    COALESCE("profile"."full_name", "profile"."email") AS "full_name",
    "mentor"."company",
    "mentor"."title" AS "role_title",
    "mentor"."biography" AS "bio",
    "mentor"."linkedin_url",
    "mentor"."website_url",
    "mentor"."photo_url",
    "mentor"."expertise_tags",
    "mentor_term"."mentorship_goals",
    ("membership"."status" = 'active'::"public"."membership_lifecycle_status") AS "is_active",
    "mentor_term"."created_at",
    "mentor_term"."updated_at",
    (("lower"("regexp_replace"(COALESCE("profile"."full_name", "profile"."email"), '[^a-zA-Z0-9]+'::"text", '-'::"text", 'g'::"text")) || '-'::"text") || "left"(("mentor_term"."id")::"text", 8)) AS "slug",
    "profile"."email",
    "mentor_term"."general_availability",
    "mentor_term"."preferred_format",
    "mentor_term"."per_week_availability",
    "mentor_term"."opening_talk"
   FROM ((("public"."mentor_semesters" "mentor_term"
     JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "mentor_term"."semester_membership_id")))
     JOIN "public"."profiles" "profile" ON (("profile"."id" = "membership"."profile_id")))
     JOIN "public"."mentor_profiles" "mentor" ON (("mentor"."profile_id" = "membership"."profile_id")));


ALTER VIEW "public"."mentors" OWNER TO "postgres";


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
    "mentor_id" "uuid",
    "startup_id" "uuid",
    "session_date_id" "uuid",
    "session_date" "date",
    "time_slot" "text",
    "is_confirmed" boolean,
    CONSTRAINT "sessions_slot_check" CHECK (("slot" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "sessions_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'confirmed'::"text", 'declined'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mentors"("public"."sessions") RETURNS SETOF "public"."mentors"
    LANGUAGE "sql" STABLE ROWS 1
    SET "search_path" TO ''
    AS $_$ select * from public.mentors where id = $1.mentor_semester_id $_$;


ALTER FUNCTION "public"."mentors"("public"."sessions") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mentors_view_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."mentors_view_write"() OWNER TO "postgres";


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


ALTER FUNCTION "public"."release_inactive_owner_work"("p_owner_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_draft_session_dates"("p_semester_id" "uuid", "p_dates" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."replace_draft_session_dates"("p_semester_id" "uuid", "p_dates" "jsonb") OWNER TO "postgres";


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
    select p_semester_id, id, auth.uid(), 'stage_change', 'Outreach status reset',
      jsonb_build_object('stage', 'not_contacted', 'reason', 'new_semester_review')
    from reset_rows returning id
  )
  select count(*) into reset_count from logged;
  return reset_count;
end;
$$;


ALTER FUNCTION "public"."reset_outreach_opportunities"("p_semester_id" "uuid", "p_opportunity_ids" "uuid"[]) OWNER TO "postgres";


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
    "lifecycle_status" "public"."semester_lifecycle_status" DEFAULT 'draft'::"public"."semester_lifecycle_status" NOT NULL,
    CONSTRAINT "semesters_active_lifecycle_status_check" CHECK (((NOT "is_active") OR ("lifecycle_status" = 'active'::"public"."semester_lifecycle_status")))
);


ALTER TABLE "public"."semesters" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."semesters"("public"."mentors") RETURNS SETOF "public"."semesters"
    LANGUAGE "sql" STABLE ROWS 1
    SET "search_path" TO ''
    AS $_$ select * from public.semesters where id=$1.semester_id $_$;


ALTER FUNCTION "public"."semesters"("public"."mentors") OWNER TO "postgres";


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


CREATE OR REPLACE VIEW "public"."session_dates" WITH ("security_invoker"='true') AS
 SELECT "id",
    "semester_id",
    "meeting_date" AS "date",
    "label",
    "created_at"
   FROM "public"."meetings";


ALTER VIEW "public"."session_dates" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."semesters"("public"."session_dates") RETURNS SETOF "public"."semesters"
    LANGUAGE "sql" STABLE ROWS 1
    SET "search_path" TO ''
    AS $_$ select * from public.semesters where id=$1.semester_id $_$;


ALTER FUNCTION "public"."semesters"("public"."session_dates") OWNER TO "postgres";


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


CREATE OR REPLACE VIEW "public"."startups" WITH ("security_invoker"='true') AS
 SELECT "startup_term"."id",
    "primary_member"."profile_id" AS "user_id",
    "startup_term"."semester_id",
    "organization"."name",
    "organization"."description",
    "organization"."industry",
    "startup_term"."stage",
    "organization"."logo_url",
    "organization"."website_url" AS "website",
    ("organization"."durable_contact_data" ->> 'founder_name'::"text") AS "founder_name",
    NULL::"text" AS "mentor_preferences",
    "startup_term"."preferred_expertise_tags" AS "preferred_tags",
    "startup_term"."goals" AS "semester_goals",
    ("startup_term"."readiness_status" = 'ready'::"text") AS "is_active",
    "startup_term"."created_at",
    "startup_term"."updated_at",
    "organization"."slug",
    COALESCE(("organization"."durable_contact_data" -> 'founders'::"text"), '[]'::"jsonb") AS "founders",
    "startup_term"."mentorship_needs"
   FROM (("public"."startup_semesters" "startup_term"
     JOIN "public"."startup_organizations" "organization" ON (("organization"."id" = "startup_term"."startup_organization_id")))
     LEFT JOIN LATERAL ( SELECT "membership"."profile_id"
           FROM ("public"."startup_team_memberships" "team"
             JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "team"."semester_membership_id")))
          WHERE ("team"."startup_semester_id" = "startup_term"."id")
          ORDER BY "team"."is_primary_contact" DESC, "team"."created_at"
         LIMIT 1) "primary_member" ON (true));


ALTER VIEW "public"."startups" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."semesters"("public"."startups") RETURNS SETOF "public"."semesters"
    LANGUAGE "sql" STABLE ROWS 1
    SET "search_path" TO ''
    AS $_$ select * from public.semesters where id=$1.semester_id $_$;


ALTER FUNCTION "public"."semesters"("public"."startups") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."session_dates"("public"."sessions") RETURNS SETOF "public"."session_dates"
    LANGUAGE "sql" STABLE ROWS 1
    SET "search_path" TO ''
    AS $_$ select * from public.session_dates where id = $1.meeting_id $_$;


ALTER FUNCTION "public"."session_dates"("public"."sessions") OWNER TO "postgres";


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


ALTER FUNCTION "public"."set_outreach_silence"("p_opportunity_id" "uuid", "p_is_silenced" boolean, "p_reason" "text", "p_next_follow_up_at" timestamp with time zone, "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_outreach_snooze"("p_opportunity_id" "uuid", "p_snoozed_until" timestamp with time zone, "p_reason" "text" DEFAULT NULL::"text", "p_expected_updated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "public"."outreach_opportunities"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."set_outreach_snooze"("p_opportunity_id" "uuid", "p_snoozed_until" timestamp with time zone, "p_reason" "text", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."startups"("public"."sessions") RETURNS SETOF "public"."startups"
    LANGUAGE "sql" STABLE ROWS 1
    SET "search_path" TO ''
    AS $_$ select * from public.startups where id = $1.startup_semester_id $_$;


ALTER FUNCTION "public"."startups"("public"."sessions") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."startups_view_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."startups_view_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."suspend_outreach_membership"("p_semester_id" "uuid", "p_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) RETURNS TABLE("membership_id" "uuid", "membership_status" "public"."membership_lifecycle_status", "membership_updated_at" timestamp with time zone, "released_opportunity_ids" "uuid"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."suspend_outreach_membership"("p_semester_id" "uuid", "p_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_session_compatibility_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."sync_session_compatibility_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_outreach_owner"("p_opportunity_id" "uuid", "p_new_owner_profile_id" "uuid", "p_reason" "text" DEFAULT NULL::"text", "p_expected_updated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "public"."outreach_opportunities"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."transfer_outreach_owner"("p_opportunity_id" "uuid", "p_new_owner_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin new.updated_at = now(); return new; end;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


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


CREATE OR REPLACE VIEW "public"."availability" WITH ("security_invoker"='true') AS
 SELECT "availability"."id",
    "membership"."profile_id" AS "user_id",
    "availability"."meeting_id" AS "session_date_id",
    "availability"."is_available",
    "availability"."created_at"
   FROM ("public"."meeting_availability" "availability"
     JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "availability"."semester_membership_id")));


ALTER VIEW "public"."availability" OWNER TO "postgres";


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



ALTER TABLE ONLY "public"."program_audit_events"
    ADD CONSTRAINT "program_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."semester_memberships"
    ADD CONSTRAINT "semester_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."semester_memberships"
    ADD CONSTRAINT "semester_memberships_semester_id_id_key" UNIQUE ("semester_id", "id");



ALTER TABLE ONLY "public"."semester_memberships"
    ADD CONSTRAINT "semester_memberships_semester_profile_key" UNIQUE ("semester_id", "profile_id");



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



CREATE UNIQUE INDEX "invitations_open_identity_idx" ON "public"."invitations" USING "btree" ("semester_id", "email", "role") WHERE ("status" = ANY (ARRAY['draft'::"public"."invitation_lifecycle_status", 'queued'::"public"."invitation_lifecycle_status", 'sent'::"public"."invitation_lifecycle_status"]));



CREATE INDEX "invitations_operations_idx" ON "public"."invitations" USING "btree" ("semester_id", "status", "created_at" DESC);



CREATE UNIQUE INDEX "one_active_semester" ON "public"."semesters" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "outreach_activities_actor_idx" ON "public"."outreach_activities" USING "btree" ("actor_profile_id") WHERE ("actor_profile_id" IS NOT NULL);



CREATE INDEX "outreach_activities_new_owner_idx" ON "public"."outreach_activities" USING "btree" ("new_owner_profile_id") WHERE ("new_owner_profile_id" IS NOT NULL);



CREATE INDEX "outreach_activities_previous_owner_idx" ON "public"."outreach_activities" USING "btree" ("previous_owner_profile_id") WHERE ("previous_owner_profile_id" IS NOT NULL);



CREATE INDEX "outreach_activities_supersedes_idx" ON "public"."outreach_activities" USING "btree" ("semester_id", "opportunity_id", "supersedes_activity_id") WHERE ("supersedes_activity_id" IS NOT NULL);



CREATE INDEX "outreach_activities_timeline_idx" ON "public"."outreach_activities" USING "btree" ("semester_id", "opportunity_id", "occurred_at" DESC, "id" DESC);



CREATE INDEX "outreach_companies_created_by_idx" ON "public"."outreach_companies" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE UNIQUE INDEX "outreach_companies_domain_key" ON "public"."outreach_companies" USING "btree" ("domain") WHERE ("domain" IS NOT NULL);



CREATE INDEX "outreach_companies_normalized_name_idx" ON "public"."outreach_companies" USING "btree" ("normalized_name");



CREATE INDEX "outreach_contact_companies_company_idx" ON "public"."outreach_contact_companies" USING "btree" ("company_id", "contact_id");



CREATE UNIQUE INDEX "outreach_contact_companies_identity_key" ON "public"."outreach_contact_companies" USING "btree" ("contact_id", "company_id", COALESCE("started_on", '-infinity'::"date"));



CREATE UNIQUE INDEX "outreach_contact_companies_primary_key" ON "public"."outreach_contact_companies" USING "btree" ("contact_id") WHERE ("is_primary" AND ("ended_on" IS NULL));



CREATE INDEX "outreach_contacts_created_by_idx" ON "public"."outreach_contacts" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE UNIQUE INDEX "outreach_contacts_email_key" ON "public"."outreach_contacts" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE UNIQUE INDEX "outreach_contacts_linkedin_key" ON "public"."outreach_contacts" USING "btree" ("canonical_linkedin_url") WHERE ("canonical_linkedin_url" IS NOT NULL);



CREATE INDEX "outreach_opportunities_contact_idx" ON "public"."outreach_opportunities" USING "btree" ("contact_id", "semester_id");



CREATE INDEX "outreach_opportunities_created_by_idx" ON "public"."outreach_opportunities" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "outreach_opportunities_owner_idx" ON "public"."outreach_opportunities" USING "btree" ("owner_profile_id", "semester_id") WHERE ("owner_profile_id" IS NOT NULL);



CREATE UNIQUE INDEX "outreach_opportunities_semester_contact_key" ON "public"."outreach_opportunities" USING "btree" ("semester_id", "contact_id");



CREATE INDEX "outreach_opportunities_silenced_by_idx" ON "public"."outreach_opportunities" USING "btree" ("silenced_by") WHERE ("silenced_by" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_auth_user_id_key" ON "public"."profiles" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE INDEX "semester_memberships_operations_idx" ON "public"."semester_memberships" USING "btree" ("semester_id", "status", "role");



CREATE INDEX "semester_memberships_profile_idx" ON "public"."semester_memberships" USING "btree" ("profile_id", "semester_id");



CREATE UNIQUE INDEX "sessions_active_mentor_slot_key" ON "public"."sessions" USING "btree" ("meeting_id", "slot", "mentor_semester_id") WHERE ("status" <> 'cancelled'::"text");



CREATE UNIQUE INDEX "sessions_active_startup_slot_key" ON "public"."sessions" USING "btree" ("meeting_id", "slot", "startup_semester_id") WHERE ("status" <> 'cancelled'::"text");



CREATE UNIQUE INDEX "sessions_semester_idempotency_key" ON "public"."sessions" USING "btree" ("semester_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "sessions_semester_idx" ON "public"."sessions" USING "btree" ("semester_id");



CREATE INDEX "startup_team_memberships_profile_idx" ON "public"."startup_team_memberships" USING "btree" ("semester_membership_id");



CREATE OR REPLACE TRIGGER "mentors_view_write" INSTEAD OF INSERT OR DELETE OR UPDATE ON "public"."mentors" FOR EACH ROW EXECUTE FUNCTION "public"."mentors_view_write"();



CREATE OR REPLACE TRIGGER "prevent_outreach_activity_mutation" BEFORE DELETE OR UPDATE ON "public"."outreach_activities" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_outreach_activity_mutation"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "sessions_updated_at" BEFORE UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "startups_view_write" INSTEAD OF INSERT OR DELETE OR UPDATE ON "public"."startups" FOR EACH ROW EXECUTE FUNCTION "public"."startups_view_write"();



CREATE OR REPLACE TRIGGER "sync_session_compatibility_columns" BEFORE INSERT OR UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_session_compatibility_columns"();



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
    ADD CONSTRAINT "profiles_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id");



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



CREATE POLICY "admins can delete sessions" ON "public"."sessions" FOR DELETE USING (("public"."get_my_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "admins can insert profiles" ON "public"."profiles" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "admins can insert sessions" ON "public"."sessions" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "admins can update all profiles" ON "public"."profiles" FOR UPDATE USING (("public"."get_my_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "admins can update sessions" ON "public"."sessions" FOR UPDATE USING (("public"."get_my_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "admins can view all profiles" ON "public"."profiles" FOR SELECT USING (("public"."get_my_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "admins can view all sessions" ON "public"."sessions" FOR SELECT USING (("public"."get_my_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "admins manage meetings" ON "public"."meetings" TO "authenticated" USING ("public"."can_manage_semester"("semester_id", "auth"."uid"())) WITH CHECK ("public"."can_manage_semester"("semester_id", "auth"."uid"()));



CREATE POLICY "admins manage outreach imports" ON "public"."outreach_imports" TO "authenticated" USING ("public"."can_manage_semester"("semester_id", "auth"."uid"())) WITH CHECK ("public"."can_manage_semester"("semester_id", "auth"."uid"()));



CREATE POLICY "admins manage sessions" ON "public"."sessions" TO "authenticated" USING ("public"."can_manage_semester"("semester_id", "auth"."uid"())) WITH CHECK ("public"."can_manage_semester"("semester_id", "auth"."uid"()));



CREATE POLICY "admins view program audit" ON "public"."program_audit_events" FOR SELECT TO "authenticated" USING ("public"."can_manage_semester"("semester_id", "auth"."uid"()));



CREATE POLICY "authenticated members read mentor profiles" ON "public"."mentor_profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "sm"
  WHERE (("sm"."profile_id" = "mentor_profiles"."profile_id") AND "public"."has_semester_role"("sm"."semester_id", ARRAY['mentor'::"public"."user_role", 'startup'::"public"."user_role", 'admin'::"public"."user_role"])))));



CREATE POLICY "authenticated users read semesters" ON "public"."semesters" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "cohort reads startup semesters" ON "public"."startup_semesters" FOR SELECT TO "authenticated" USING ("public"."has_semester_role"("semester_id", ARRAY['mentor'::"public"."user_role", 'startup'::"public"."user_role", 'admin'::"public"."user_role"]));



ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_availability" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meetings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meetings visible to semester members" ON "public"."meetings" FOR SELECT TO "authenticated" USING ("public"."has_semester_role"("semester_id", ARRAY['admin'::"public"."user_role", 'mentor'::"public"."user_role", 'startup'::"public"."user_role"], "auth"."uid"()));



CREATE POLICY "members manage own meeting availability" ON "public"."meeting_availability" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "membership"
  WHERE (("membership"."id" = "meeting_availability"."semester_membership_id") AND ("membership"."profile_id" = "auth"."uid"())))) OR "public"."can_manage_semester"("semester_id", "auth"."uid"()))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "membership"
  WHERE (("membership"."id" = "meeting_availability"."semester_membership_id") AND ("membership"."profile_id" = "auth"."uid"())))) OR "public"."can_manage_semester"("semester_id", "auth"."uid"())));



CREATE POLICY "members read own semester memberships" ON "public"."semester_memberships" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."can_manage_semester"("semester_id")));



CREATE POLICY "members read startup organizations" ON "public"."startup_organizations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."startup_semesters" "ss"
  WHERE (("ss"."startup_organization_id" = "startup_organizations"."id") AND "public"."has_semester_role"("ss"."semester_id", ARRAY['mentor'::"public"."user_role", 'startup'::"public"."user_role", 'admin'::"public"."user_role"])))));



ALTER TABLE "public"."mentor_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mentor_semesters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mentors read own semester profile" ON "public"."mentor_semesters" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "sm"
  WHERE (("sm"."id" = "mentor_semesters"."semester_membership_id") AND (("sm"."profile_id" = "auth"."uid"()) OR "public"."can_manage_semester"("mentor_semesters"."semester_id"))))));



CREATE POLICY "mentors respond to own sessions" ON "public"."sessions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."mentor_semesters" "mentor_term"
     JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "mentor_term"."semester_membership_id")))
  WHERE (("mentor_term"."id" = "sessions"."mentor_semester_id") AND ("membership"."profile_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."mentor_semesters" "mentor_term"
     JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "mentor_term"."semester_membership_id")))
  WHERE (("mentor_term"."id" = "sessions"."mentor_semester_id") AND ("membership"."profile_id" = "auth"."uid"())))));



CREATE POLICY "mentors update own mentor profile" ON "public"."mentor_profiles" FOR UPDATE TO "authenticated" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "mentors update own semester profile" ON "public"."mentor_semesters" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "sm"
  WHERE (("sm"."id" = "mentor_semesters"."semester_membership_id") AND ("sm"."profile_id" = "auth"."uid"()) AND ("sm"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"]))))));



ALTER TABLE "public"."outreach_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outreach_companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outreach_contact_companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outreach_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outreach_imports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outreach_opportunities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform roles visible to owner" ON "public"."platform_roles" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_super_admin"()));



ALTER TABLE "public"."platform_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_audit_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "semester admins manage invitations" ON "public"."invitations" TO "authenticated" USING ("public"."can_manage_semester"("semester_id")) WITH CHECK ("public"."can_manage_semester"("semester_id"));



CREATE POLICY "semester admins manage semester memberships" ON "public"."semester_memberships" TO "authenticated" USING ("public"."can_manage_semester"("semester_id")) WITH CHECK ("public"."can_manage_semester"("semester_id"));



CREATE POLICY "semester admins manage startup organizations" ON "public"."startup_organizations" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."startup_semesters" "ss"
  WHERE (("ss"."startup_organization_id" = "startup_organizations"."id") AND "public"."can_manage_semester"("ss"."semester_id")))));



CREATE POLICY "semester admins manage startup team memberships" ON "public"."startup_team_memberships" TO "authenticated" USING ("public"."can_manage_semester"("semester_id")) WITH CHECK ("public"."can_manage_semester"("semester_id"));



CREATE POLICY "semester managers create outreach companies" ON "public"."outreach_companies" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_any_outreach"());



CREATE POLICY "semester managers create outreach contact companies" ON "public"."outreach_contact_companies" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_outreach_contact_access"("contact_id") AND ("public"."has_outreach_company_access"("company_id") OR "public"."can_manage_any_outreach"())));



CREATE POLICY "semester managers create outreach contacts" ON "public"."outreach_contacts" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_any_outreach"());



CREATE POLICY "semester managers create outreach opportunities" ON "public"."outreach_opportunities" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_semester"("semester_id"));



CREATE POLICY "semester managers delete outreach companies" ON "public"."outreach_companies" FOR DELETE TO "authenticated" USING ("public"."has_outreach_company_access"("id"));



CREATE POLICY "semester managers delete outreach contact companies" ON "public"."outreach_contact_companies" FOR DELETE TO "authenticated" USING (("public"."has_outreach_contact_access"("contact_id") AND "public"."has_outreach_company_access"("company_id")));



CREATE POLICY "semester managers delete outreach contacts" ON "public"."outreach_contacts" FOR DELETE TO "authenticated" USING ("public"."has_outreach_contact_access"("id"));



CREATE POLICY "semester managers read outreach activities" ON "public"."outreach_activities" FOR SELECT TO "authenticated" USING ("public"."can_manage_semester"("semester_id"));



CREATE POLICY "semester managers read outreach companies" ON "public"."outreach_companies" FOR SELECT TO "authenticated" USING ("public"."has_outreach_company_access"("id"));



CREATE POLICY "semester managers read outreach contact companies" ON "public"."outreach_contact_companies" FOR SELECT TO "authenticated" USING (("public"."has_outreach_contact_access"("contact_id") AND "public"."has_outreach_company_access"("company_id")));



CREATE POLICY "semester managers read outreach contacts" ON "public"."outreach_contacts" FOR SELECT TO "authenticated" USING ("public"."has_outreach_contact_access"("id"));



CREATE POLICY "semester managers read outreach opportunities" ON "public"."outreach_opportunities" FOR SELECT TO "authenticated" USING ("public"."can_manage_semester"("semester_id"));



CREATE POLICY "semester managers update outreach companies" ON "public"."outreach_companies" FOR UPDATE TO "authenticated" USING ("public"."has_outreach_company_access"("id")) WITH CHECK ("public"."has_outreach_company_access"("id"));



CREATE POLICY "semester managers update outreach contact companies" ON "public"."outreach_contact_companies" FOR UPDATE TO "authenticated" USING (("public"."has_outreach_contact_access"("contact_id") AND "public"."has_outreach_company_access"("company_id"))) WITH CHECK (("public"."has_outreach_contact_access"("contact_id") AND "public"."has_outreach_company_access"("company_id")));



CREATE POLICY "semester managers update outreach contacts" ON "public"."outreach_contacts" FOR UPDATE TO "authenticated" USING ("public"."has_outreach_contact_access"("id")) WITH CHECK ("public"."has_outreach_contact_access"("id"));



ALTER TABLE "public"."semester_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."semesters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sessions visible to semester participants" ON "public"."sessions" FOR SELECT TO "authenticated" USING (("public"."can_manage_semester"("semester_id", "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."mentor_semesters" "mentor_term"
     JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "mentor_term"."semester_membership_id")))
  WHERE (("mentor_term"."id" = "sessions"."mentor_semester_id") AND ("membership"."profile_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."startup_team_memberships" "team"
     JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "team"."semester_membership_id")))
  WHERE (("team"."startup_semester_id" = "sessions"."startup_semester_id") AND ("membership"."profile_id" = "auth"."uid"()))))));



CREATE POLICY "startup teams read their memberships" ON "public"."startup_team_memberships" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."semester_memberships" "sm"
  WHERE (("sm"."id" = "startup_team_memberships"."semester_membership_id") AND (("sm"."profile_id" = "auth"."uid"()) OR "public"."can_manage_semester"("startup_team_memberships"."semester_id"))))));



CREATE POLICY "startup teams update startup semester" ON "public"."startup_semesters" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."startup_team_memberships" "stm"
     JOIN "public"."semester_memberships" "sm" ON (("sm"."id" = "stm"."semester_membership_id")))
  WHERE (("stm"."startup_semester_id" = "startup_semesters"."id") AND ("sm"."profile_id" = "auth"."uid"()) AND ("sm"."status" = ANY (ARRAY['onboarding'::"public"."membership_lifecycle_status", 'active'::"public"."membership_lifecycle_status"])))))) WITH CHECK (("semester_id" = "semester_id"));



ALTER TABLE "public"."startup_organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."startup_semesters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."startup_team_memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "startups request sessions" ON "public"."sessions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."startup_team_memberships" "team"
     JOIN "public"."semester_memberships" "membership" ON (("membership"."id" = "team"."semester_membership_id")))
  WHERE (("team"."startup_semester_id" = "sessions"."startup_semester_id") AND ("membership"."profile_id" = "auth"."uid"())))));



CREATE POLICY "super admins manage platform roles" ON "public"."platform_roles" TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "users update own safe profile fields" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."activate_semester_transition"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_semester_transition"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."activate_semester_transition"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_semester_transition"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bulk_set_membership_activity"("p_semester_id" "uuid", "p_membership_ids" "uuid"[], "p_is_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bulk_set_membership_activity"("p_semester_id" "uuid", "p_membership_ids" "uuid"[], "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_set_membership_activity"("p_semester_id" "uuid", "p_membership_ids" "uuid"[], "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_set_membership_activity"("p_semester_id" "uuid", "p_membership_ids" "uuid"[], "p_is_active" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_any_outreach"("candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_any_outreach"("candidate_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_any_outreach"("candidate_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_any_outreach"("candidate_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_semester"("target_semester_id" "uuid", "candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_semester"("target_semester_id" "uuid", "candidate_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_semester"("target_semester_id" "uuid", "candidate_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_semester"("target_semester_id" "uuid", "candidate_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_read_outreach_relationship_labels"("candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_read_outreach_relationship_labels"("candidate_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_outreach_relationship_labels"("candidate_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_outreach_relationship_labels"("candidate_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."carry_forward_outreach_contacts"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_contact_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."carry_forward_outreach_contacts"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_contact_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."carry_forward_outreach_contacts"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_contact_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."carry_forward_outreach_contacts"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_contact_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."commit_legacy_outreach_migration"("p_semester_id" "uuid", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."commit_legacy_outreach_migration"("p_semester_id" "uuid", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."commit_legacy_outreach_migration"("p_semester_id" "uuid", "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."commit_mentor_assignment"("p_semester_id" "uuid", "p_session_date_id" "uuid", "p_time_slot" "text", "p_startup_semester_id" "uuid", "p_mentor_profile_id" "uuid", "p_idempotency_key" "text", "p_format" "text", "p_topic" "text", "p_override_types" "text"[], "p_override_reason" "text", "p_ranking_context" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."commit_mentor_assignment"("p_semester_id" "uuid", "p_session_date_id" "uuid", "p_time_slot" "text", "p_startup_semester_id" "uuid", "p_mentor_profile_id" "uuid", "p_idempotency_key" "text", "p_format" "text", "p_topic" "text", "p_override_types" "text"[], "p_override_reason" "text", "p_ranking_context" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."commit_mentor_assignment"("p_semester_id" "uuid", "p_session_date_id" "uuid", "p_time_slot" "text", "p_startup_semester_id" "uuid", "p_mentor_profile_id" "uuid", "p_idempotency_key" "text", "p_format" "text", "p_topic" "text", "p_override_types" "text"[], "p_override_reason" "text", "p_ranking_context" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."commit_mentor_assignment"("p_semester_id" "uuid", "p_session_date_id" "uuid", "p_time_slot" "text", "p_startup_semester_id" "uuid", "p_mentor_profile_id" "uuid", "p_idempotency_key" "text", "p_format" "text", "p_topic" "text", "p_override_types" "text"[], "p_override_reason" "text", "p_ranking_context" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_semester_draft"("p_source_semester_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date", "p_configuration" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_semester_draft"("p_source_semester_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date", "p_configuration" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_semester_draft"("p_source_semester_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date", "p_configuration" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_semester_draft"("p_source_semester_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date", "p_configuration" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_outreach_company_access"("target_company_id" "uuid", "candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_outreach_company_access"("target_company_id" "uuid", "candidate_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_outreach_company_access"("target_company_id" "uuid", "candidate_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_outreach_company_access"("target_company_id" "uuid", "candidate_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_outreach_contact_access"("target_contact_id" "uuid", "candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_outreach_contact_access"("target_contact_id" "uuid", "candidate_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_outreach_contact_access"("target_contact_id" "uuid", "candidate_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_outreach_contact_access"("target_contact_id" "uuid", "candidate_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_semester_role"("target_semester_id" "uuid", "allowed_roles" "public"."user_role"[], "candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_semester_role"("target_semester_id" "uuid", "allowed_roles" "public"."user_role"[], "candidate_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_semester_role"("target_semester_id" "uuid", "allowed_roles" "public"."user_role"[], "candidate_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_semester_role"("target_semester_id" "uuid", "allowed_roles" "public"."user_role"[], "candidate_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_prior_semester_memberships"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_membership_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_prior_semester_memberships"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_membership_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."import_prior_semester_memberships"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_membership_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_prior_semester_memberships"("p_source_semester_id" "uuid", "p_target_semester_id" "uuid", "p_membership_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_super_admin"("candidate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_super_admin"("candidate_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"("candidate_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"("candidate_id" "uuid") TO "service_role";



GRANT SELECT,INSERT ON TABLE "public"."outreach_activities" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."outreach_activities" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."log_outreach_activity"("p_opportunity_id" "uuid", "p_activity_kind" "public"."outreach_activity_kind", "p_occurred_at" timestamp with time zone, "p_channel" "public"."outreach_channel", "p_summary" "text", "p_details" "jsonb", "p_next_follow_up_at" timestamp with time zone, "p_stage" "public"."outreach_stage", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_outreach_activity"("p_opportunity_id" "uuid", "p_activity_kind" "public"."outreach_activity_kind", "p_occurred_at" timestamp with time zone, "p_channel" "public"."outreach_channel", "p_summary" "text", "p_details" "jsonb", "p_next_follow_up_at" timestamp with time zone, "p_stage" "public"."outreach_stage", "p_expected_updated_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."log_outreach_activity"("p_opportunity_id" "uuid", "p_activity_kind" "public"."outreach_activity_kind", "p_occurred_at" timestamp with time zone, "p_channel" "public"."outreach_channel", "p_summary" "text", "p_details" "jsonb", "p_next_follow_up_at" timestamp with time zone, "p_stage" "public"."outreach_stage", "p_expected_updated_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_outreach_activity"("p_opportunity_id" "uuid", "p_activity_kind" "public"."outreach_activity_kind", "p_occurred_at" timestamp with time zone, "p_channel" "public"."outreach_channel", "p_summary" "text", "p_details" "jsonb", "p_next_follow_up_at" timestamp with time zone, "p_stage" "public"."outreach_stage", "p_expected_updated_at" timestamp with time zone) TO "service_role";



GRANT ALL ON TABLE "public"."mentor_profiles" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."mentor_profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."mentor_semesters" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."mentor_semesters" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."semester_memberships" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."semester_memberships" TO "authenticated";



GRANT ALL ON TABLE "public"."mentors" TO "service_role";
GRANT ALL ON TABLE "public"."mentors" TO "authenticated";



GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT ALL ON FUNCTION "public"."mentors"("public"."sessions") TO "anon";
GRANT ALL ON FUNCTION "public"."mentors"("public"."sessions") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mentors"("public"."sessions") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mentors_view_write"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mentors_view_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."mentors_view_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mentors_view_write"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_outreach_activity_mutation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_outreach_activity_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_outreach_activity_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_outreach_activity_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_inactive_owner_work"("p_owner_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_inactive_owner_work"("p_owner_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."release_inactive_owner_work"("p_owner_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_inactive_owner_work"("p_owner_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."replace_draft_session_dates"("p_semester_id" "uuid", "p_dates" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."replace_draft_session_dates"("p_semester_id" "uuid", "p_dates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_draft_session_dates"("p_semester_id" "uuid", "p_dates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_draft_session_dates"("p_semester_id" "uuid", "p_dates" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_outreach_opportunities"("p_semester_id" "uuid", "p_opportunity_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_outreach_opportunities"("p_semester_id" "uuid", "p_opportunity_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."reset_outreach_opportunities"("p_semester_id" "uuid", "p_opportunity_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_outreach_opportunities"("p_semester_id" "uuid", "p_opportunity_ids" "uuid"[]) TO "service_role";



GRANT ALL ON TABLE "public"."semesters" TO "authenticated";
GRANT ALL ON TABLE "public"."semesters" TO "service_role";



GRANT ALL ON FUNCTION "public"."semesters"("public"."mentors") TO "anon";
GRANT ALL ON FUNCTION "public"."semesters"("public"."mentors") TO "authenticated";
GRANT ALL ON FUNCTION "public"."semesters"("public"."mentors") TO "service_role";



GRANT ALL ON TABLE "public"."meetings" TO "service_role";
GRANT ALL ON TABLE "public"."meetings" TO "authenticated";



GRANT ALL ON TABLE "public"."session_dates" TO "service_role";
GRANT ALL ON TABLE "public"."session_dates" TO "authenticated";



GRANT ALL ON FUNCTION "public"."semesters"("public"."session_dates") TO "anon";
GRANT ALL ON FUNCTION "public"."semesters"("public"."session_dates") TO "authenticated";
GRANT ALL ON FUNCTION "public"."semesters"("public"."session_dates") TO "service_role";



GRANT ALL ON TABLE "public"."startup_organizations" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."startup_organizations" TO "authenticated";



GRANT ALL ON TABLE "public"."startup_semesters" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."startup_semesters" TO "authenticated";



GRANT ALL ON TABLE "public"."startup_team_memberships" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."startup_team_memberships" TO "authenticated";



GRANT ALL ON TABLE "public"."startups" TO "service_role";
GRANT ALL ON TABLE "public"."startups" TO "authenticated";



GRANT ALL ON FUNCTION "public"."semesters"("public"."startups") TO "anon";
GRANT ALL ON FUNCTION "public"."semesters"("public"."startups") TO "authenticated";
GRANT ALL ON FUNCTION "public"."semesters"("public"."startups") TO "service_role";



GRANT ALL ON FUNCTION "public"."session_dates"("public"."sessions") TO "anon";
GRANT ALL ON FUNCTION "public"."session_dates"("public"."sessions") TO "authenticated";
GRANT ALL ON FUNCTION "public"."session_dates"("public"."sessions") TO "service_role";



GRANT ALL ON TABLE "public"."outreach_opportunities" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."outreach_opportunities" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_outreach_silence"("p_opportunity_id" "uuid", "p_is_silenced" boolean, "p_reason" "text", "p_next_follow_up_at" timestamp with time zone, "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_outreach_silence"("p_opportunity_id" "uuid", "p_is_silenced" boolean, "p_reason" "text", "p_next_follow_up_at" timestamp with time zone, "p_expected_updated_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."set_outreach_silence"("p_opportunity_id" "uuid", "p_is_silenced" boolean, "p_reason" "text", "p_next_follow_up_at" timestamp with time zone, "p_expected_updated_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_outreach_silence"("p_opportunity_id" "uuid", "p_is_silenced" boolean, "p_reason" "text", "p_next_follow_up_at" timestamp with time zone, "p_expected_updated_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_outreach_snooze"("p_opportunity_id" "uuid", "p_snoozed_until" timestamp with time zone, "p_reason" "text", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_outreach_snooze"("p_opportunity_id" "uuid", "p_snoozed_until" timestamp with time zone, "p_reason" "text", "p_expected_updated_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."set_outreach_snooze"("p_opportunity_id" "uuid", "p_snoozed_until" timestamp with time zone, "p_reason" "text", "p_expected_updated_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_outreach_snooze"("p_opportunity_id" "uuid", "p_snoozed_until" timestamp with time zone, "p_reason" "text", "p_expected_updated_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."startups"("public"."sessions") TO "anon";
GRANT ALL ON FUNCTION "public"."startups"("public"."sessions") TO "authenticated";
GRANT ALL ON FUNCTION "public"."startups"("public"."sessions") TO "service_role";



REVOKE ALL ON FUNCTION "public"."startups_view_write"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."startups_view_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."startups_view_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."startups_view_write"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."suspend_outreach_membership"("p_semester_id" "uuid", "p_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."suspend_outreach_membership"("p_semester_id" "uuid", "p_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."suspend_outreach_membership"("p_semester_id" "uuid", "p_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."suspend_outreach_membership"("p_semester_id" "uuid", "p_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_session_compatibility_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_session_compatibility_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_session_compatibility_columns"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."transfer_outreach_owner"("p_opportunity_id" "uuid", "p_new_owner_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_outreach_owner"("p_opportunity_id" "uuid", "p_new_owner_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_outreach_owner"("p_opportunity_id" "uuid", "p_new_owner_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_outreach_owner"("p_opportunity_id" "uuid", "p_new_owner_profile_id" "uuid", "p_reason" "text", "p_expected_updated_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_outreach_owner_membership"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_outreach_owner_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_outreach_owner_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_outreach_owner_membership"() TO "service_role";



GRANT ALL ON TABLE "public"."meeting_availability" TO "service_role";
GRANT ALL ON TABLE "public"."meeting_availability" TO "authenticated";



GRANT ALL ON TABLE "public"."availability" TO "service_role";
GRANT ALL ON TABLE "public"."availability" TO "authenticated";



GRANT ALL ON TABLE "public"."invitations" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."invitations" TO "authenticated";



GRANT ALL ON TABLE "public"."outreach_companies" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."outreach_companies" TO "authenticated";



GRANT ALL ON TABLE "public"."outreach_contact_companies" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."outreach_contact_companies" TO "authenticated";



GRANT ALL ON TABLE "public"."outreach_contacts" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."outreach_contacts" TO "authenticated";



GRANT ALL ON TABLE "public"."outreach_imports" TO "service_role";
GRANT ALL ON TABLE "public"."outreach_imports" TO "authenticated";



GRANT ALL ON TABLE "public"."platform_roles" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."platform_roles" TO "authenticated";



GRANT ALL ON TABLE "public"."program_audit_events" TO "service_role";
GRANT ALL ON TABLE "public"."program_audit_events" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







