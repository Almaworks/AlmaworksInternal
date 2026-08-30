set local check_function_bodies = off;

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

revoke all on function "public"."commit_legacy_outreach_migration"(uuid, text) from public;

grant execute on function "public"."commit_legacy_outreach_migration"(uuid, text) to "authenticated", "postgres";
