-- A personal deletion operation is a global system-delivery record. It stores temporary
-- cleanup identifiers only until finalization; no direct Data API access is granted.
create table if not exists public.member_deletion_operations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  auth_user_id uuid,
  source_email text,
  source_name text,
  version text not null,
  status text not null check (status in ('in_progress', 'completed')),
  counts jsonb not null default '{}'::jsonb,
  impact jsonb not null default '{}'::jsonb,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  prepared_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint member_deletion_operation_completed_scrub check (
    status <> 'completed' or
    (auth_user_id is null and source_email is null and source_name is null and completed_at is not null)
  )
);
alter table public.member_deletion_operations add column if not exists impact jsonb not null default '{}'::jsonb;
alter table public.member_deletion_operations enable row level security;
revoke all on public.member_deletion_operations from public, anon, authenticated, service_role;

create or replace function private.is_finalizing_member_deletion(p_profile_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select private.is_super_admin(auth.uid())
    and coalesce(pg_catalog.current_setting('member_deletion.finalizing_profile_id',true)=p_profile_id::text,false)
    and exists(select 1 from public.member_deletion_operations operation
      where operation.profile_id=p_profile_id and operation.status='in_progress')
$$;
revoke all on function private.is_finalizing_member_deletion(uuid) from public, anon, authenticated, service_role;
grant execute on function private.is_finalizing_member_deletion(uuid) to authenticated, postgres;

-- An old JWT cannot resolve an application identity as soon as preparation commits.
create or replace function private.current_profile_id(candidate_auth_user_id uuid default auth.uid())
returns uuid language sql stable security definer set search_path=''
as $$
  select profile.id from public.profiles profile
  where profile.auth_user_id = candidate_auth_user_id
    and not exists (select 1 from public.member_deletion_operations operation where operation.profile_id=profile.id)
$$;
revoke all on function private.current_profile_id(uuid) from public, anon;
grant execute on function private.current_profile_id(uuid) to authenticated, postgres;

-- Reusable impact inventory. Ambiguous shared content requires a manual transfer/review.
create or replace function private.member_deletion_impact(p_profile_id uuid)
returns table(counts jsonb, blockers text[], version text, impact jsonb)
language plpgsql stable security definer set search_path=''
as $$
declare
  v_profile public.profiles%rowtype;
  v_counts jsonb;
  v_blockers text[] := '{}'::text[];
  v_revision text;
  v_impact jsonb;
begin
  select * into v_profile from public.profiles where id=p_profile_id;
  if not found then raise exception 'Member profile not found' using errcode='P0002'; end if;
  select jsonb_build_object(
    'semesters', (select count(distinct semester_id) from public.semester_memberships where profile_id=p_profile_id),
    'memberships', (select count(*) from public.semester_memberships where profile_id=p_profile_id),
    'startupTeams', (select count(*) from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id where membership.profile_id=p_profile_id),
    'mentorMeetings', (select count(*) from public.sessions session join public.mentor_semesters term on term.id=session.mentor_semester_id join public.semester_memberships membership on membership.id=term.semester_membership_id where membership.profile_id=p_profile_id),
    'upcomingMentorMeetings', (
      (select count(*) from public.mentor_booking_requests request where request.mentor_profile_id=p_profile_id and request.starts_at>now() and request.status in ('pending','accepted'))
      + (select count(*) from public.sessions session join public.mentor_semesters term on term.id=session.mentor_semester_id
        join public.semester_memberships membership on membership.id=term.semester_membership_id
        join public.meetings meeting on meeting.id=session.meeting_id
        join public.semesters semester on semester.id=session.semester_id
        where membership.profile_id=p_profile_id
          and ((meeting.meeting_date + case session.slot when 2 then meeting.slot_2_starts_at else meeting.slot_1_starts_at end)
            at time zone coalesce(nullif(semester.configuration->>'timezone',''),'America/New_York'))>now()
          and session.status in ('requested','confirmed'))
    ),
    'startupBookings', (select count(*) from public.mentor_booking_requests request where request.requested_by_profile_id=p_profile_id),
    'profileFiles', (select count(*) from storage.objects object where object.bucket_id='profile-photos' and object.name like p_profile_id::text || '/%'),
    'historicalSessions', (select count(distinct session.id) from public.sessions session left join public.mentor_semesters term on term.id=session.mentor_semester_id left join public.semester_memberships mentor on mentor.id=term.semester_membership_id left join public.startup_team_memberships team on team.startup_semester_id=session.startup_semester_id left join public.semester_memberships startup on startup.id=team.semester_membership_id where mentor.profile_id=p_profile_id or startup.profile_id=p_profile_id)
  ) into v_counts;
  select jsonb_build_object(
    'semesters',coalesce((select jsonb_agg(semester.name order by semester.start_date,semester.id)
      from public.semesters semester where semester.id in (select membership.semester_id from public.semester_memberships membership where membership.profile_id=p_profile_id)),'[]'::jsonb),
    'sharedStartups',coalesce((select jsonb_agg(distinct organization.name)
      from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id
      join public.startup_semesters startup on startup.id=team.startup_semester_id
      join public.startup_organizations organization on organization.id=startup.startup_organization_id
      where membership.profile_id=p_profile_id),'[]'::jsonb),
    'upcomingMentorMeetings',coalesce((select jsonb_agg(impact_item.label order by impact_item.starts_at,impact_item.label)
      from (
        select request.starts_at, to_char(request.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') || ' — Independent booking' as label
        from public.mentor_booking_requests request
        where request.mentor_profile_id=p_profile_id and request.starts_at>now() and request.status in ('pending','accepted')
        union all
        select ((meeting.meeting_date + case session.slot when 2 then meeting.slot_2_starts_at else meeting.slot_1_starts_at end)
          at time zone coalesce(nullif(semester.configuration->>'timezone',''),'America/New_York')) as starts_at,
          to_char((meeting.meeting_date + case session.slot when 2 then meeting.slot_2_starts_at else meeting.slot_1_starts_at end)
            at time zone coalesce(nullif(semester.configuration->>'timezone',''),'America/New_York') at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS"Z"') || ' — Friday Program' as label
        from public.sessions session join public.mentor_semesters term on term.id=session.mentor_semester_id
        join public.semester_memberships membership on membership.id=term.semester_membership_id
        join public.meetings meeting on meeting.id=session.meeting_id
        join public.semesters semester on semester.id=session.semester_id
        where membership.profile_id=p_profile_id
          and ((meeting.meeting_date + case session.slot when 2 then meeting.slot_2_starts_at else meeting.slot_1_starts_at end)
            at time zone coalesce(nullif(semester.configuration->>'timezone',''),'America/New_York'))>now()
          and session.status in ('requested','confirmed')
      ) impact_item),'[]'::jsonb)
  ) into v_impact;

  if exists (select 1 from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id where membership.profile_id=p_profile_id and team.is_primary_contact
    and exists(select 1 from public.startup_team_memberships teammate where teammate.startup_semester_id=team.startup_semester_id and teammate.semester_membership_id<>team.semester_membership_id)) then
    v_blockers := array_append(v_blockers,'Transfer primary startup contact ownership before deletion.');
  end if;
  if (v_counts->>'memberships')::int=0 then
    v_blockers := array_append(v_blockers,'Only semester members can use this deletion workflow.');
  end if;
  if exists (select 1 from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id join public.startup_semesters startup on startup.id=team.startup_semester_id join public.startup_organizations organization on organization.id=startup.startup_organization_id where membership.profile_id=p_profile_id and (organization.durable_contact_data<>'{}'::jsonb or startup.goals<>'{}'::text[] or startup.mentorship_needs<>'{}'::text[] or nullif(btrim(startup.mentor_need_context),'') is not null)) then
    v_blockers := array_append(v_blockers,'Shared startup free text or contact data requires a privacy review.');
  end if;
  if exists (select 1 from public.sessions session join public.startup_team_memberships team on team.startup_semester_id=session.startup_semester_id join public.semester_memberships membership on membership.id=team.semester_membership_id where membership.profile_id=p_profile_id and (session.topic is not null or session.notes is not null or session.substitute_name is not null)) then
    v_blockers := array_append(v_blockers,'Shared startup session free text requires a privacy review.');
  end if;
  if exists (select 1 from public.outreach_contacts where email=lower(v_profile.email)) then
    v_blockers := array_append(v_blockers,'A matching outreach contact must be reviewed separately.');
  end if;
  if exists (select 1 from public.outreach_email_messages message where message.recipient_email=lower(v_profile.email)) then
    v_blockers := array_append(v_blockers,'An outreach email snapshot addressed to this member requires a privacy review.');
  end if;
  if exists (select 1 from public.outreach_opportunities opportunity
      where (opportunity.owner_profile_id=p_profile_id or opportunity.created_by=p_profile_id
        or opportunity.silenced_by=p_profile_id or opportunity.archived_by=p_profile_id)
        and (nullif(btrim(opportunity.semester_notes),'') is not null
          or nullif(btrim(opportunity.referred_by),'') is not null
          or nullif(btrim(opportunity.silence_reason),'') is not null
          or opportunity.source_context<>'{}'::jsonb))
    or exists (select 1 from public.outreach_companies company
      where company.created_by=p_profile_id and nullif(btrim(company.description),'') is not null)
    or exists (select 1 from public.outreach_contacts contact
      where contact.created_by=p_profile_id and (contact.notes is not null or contact.background_notes is not null or contact.biography is not null)) then
    v_blockers := array_append(v_blockers,'Target-linked outreach free text requires a privacy review.');
  end if;
  if exists (select 1 from public.outreach_imports where created_by=p_profile_id)
    or exists (select 1 from public.outreach_email_templates where created_by=p_profile_id)
    or exists (select 1 from public.outreach_email_messages where created_by=p_profile_id) then
    v_blockers := array_append(v_blockers,'Authored outreach payloads require a separate ownership and privacy review.');
  end if;
  if exists (select 1 from public.outreach_gmail_messages message
      where message.profile_id=p_profile_id or lower(message.recipient)=lower(v_profile.email)
        or lower(message.sender)=lower(v_profile.email)) then
    v_blockers := array_append(v_blockers,'Personal Gmail message snapshots require a separate ownership and privacy review.');
  end if;
  if exists (select 1 from public.notification_deliveries delivery
      where delivery.recipient_profile_id=p_profile_id and delivery.status in ('submitting','unknown')) then
    v_blockers := array_append(v_blockers,'Resolve in-flight or uncertain notification delivery before deleting this member.');
  end if;
  if exists (select 1 from public.notification_deliveries delivery
      where delivery.recipient_profile_id<>p_profile_id and delivery.recipient_email=lower(v_profile.email)) then
    v_blockers := array_append(v_blockers,'A notification delivery snapshot addressed to this member requires a privacy review.');
  end if;
  if exists (select 1 from public.mentor_booking_decision_notes note
      join public.mentor_booking_requests request on request.id=note.request_id
      where note.author_profile_id=p_profile_id or request.mentor_profile_id=p_profile_id
        or request.requested_by_profile_id=p_profile_id
        or exists(select 1 from public.startup_team_memberships team
          join public.semester_memberships membership on membership.id=team.semester_membership_id
          where team.startup_semester_id=request.startup_semester_id and membership.profile_id=p_profile_id))
    or exists (select 1 from public.mentor_booking_meeting_details detail
      join public.mentor_booking_requests request on request.id=detail.request_id
      where (detail.location is not null or detail.video_url is not null)
        and (detail.updated_by_profile_id=p_profile_id or request.mentor_profile_id=p_profile_id
          or request.requested_by_profile_id=p_profile_id
          or exists(select 1 from public.startup_team_memberships team
            join public.semester_memberships membership on membership.id=team.semester_membership_id
            where team.startup_semester_id=request.startup_semester_id and membership.profile_id=p_profile_id)))
    or exists (select 1 from public.mentor_booking_outcomes outcome
      join public.mentor_booking_requests request on request.id=outcome.request_id
      where outcome.feedback is not null
        and (outcome.reporter_profile_id=p_profile_id or request.mentor_profile_id=p_profile_id
          or request.requested_by_profile_id=p_profile_id
          or exists(select 1 from public.startup_team_memberships team
            join public.semester_memberships membership on membership.id=team.semester_membership_id
            where team.startup_semester_id=request.startup_semester_id and membership.profile_id=p_profile_id))) then
    v_blockers := array_append(v_blockers,'Shared booking notes, logistics, or feedback require a privacy review.');
  end if;
  if exists (select 1 from public.mentor_profiles where profile_id=p_profile_id and photo_url is not null) then
    v_blockers := array_append(v_blockers,'Legacy personal photo URL requires manual external cleanup.');
  end if;
  if exists (select 1 from storage.objects object where object.owner_id=v_profile.auth_user_id::text
    and (object.bucket_id<>'profile-photos' or object.name not like p_profile_id::text || '/%')) then
    v_blockers := array_append(v_blockers,'Other personally owned Storage objects require a separate cleanup policy.');
  end if;
  if exists (select 1 from public.invitations where email=lower(v_profile.email) and matched_profile_id is distinct from p_profile_id) then
    v_blockers := array_append(v_blockers,'An unlinked invitation with this email needs identity review.');
  end if;
  -- New direct profile references in later schemas are not silently ignored.
  if exists (
    select 1 from pg_catalog.pg_constraint foreign_key
    join pg_catalog.pg_class relation on relation.oid=foreign_key.conrelid
    where foreign_key.contype='f' and foreign_key.confrelid='public.profiles'::regclass
      and relation.relnamespace='public'::regnamespace
      and relation.relname <> all(array[
        'expertise_tags','friday_programs','invitations','mentor_booking_requests','mentor_booking_windows',
        'mentor_profiles','outreach_activities','outreach_companies','outreach_contacts','outreach_email_messages',
        'outreach_email_templates','outreach_imports','outreach_opportunities','participant_notification_reads',
        'platform_roles','program_audit_events','semester_memberships','member_deletion_operations',
        'google_calendar_connections','meetings','mentor_booking_decision_notes',
        'mentor_booking_meeting_details','mentor_booking_outcomes','notification_deliveries',
        'outreach_gmail_accounts','outreach_gmail_messages','outreach_gmail_oauth'
      ])
  ) then
    v_blockers := array_append(v_blockers,'A new profile dependency needs a deletion policy.');
  end if;
  -- Calendar is optional during rollout. Its anonymization trigger removes local
  -- records, but provider holds must finish disconnect cleanup before credentials
  -- are forgotten. Do not block unrelated members merely because the table exists.
  if to_regclass('public.google_calendar_connections') is not null then
    if exists(select 1 from public.google_calendar_connections connection
      where connection.profile_id=p_profile_id and connection.status<>'disconnected') then
      v_blockers := array_append(v_blockers,'Disconnect Google Calendar and wait for hold cleanup before deleting this member.');
    end if;
    if exists(select 1 from private.google_calendar_oauth_transactions oauth_attempt
      where oauth_attempt.profile_id=p_profile_id and oauth_attempt.consumed_at is not null
        and oauth_attempt.completed_at is null and oauth_attempt.expires_at>now()) then
      v_blockers := array_append(v_blockers,'Wait for the Google Calendar connection attempt to finish before deleting this member.');
    end if;
  end if;
  select md5(concat_ws('|',to_jsonb(v_profile)::text,v_counts::text,v_impact::text,
    (select jsonb_agg(to_jsonb(membership) order by membership.id)::text
      from public.semester_memberships membership where membership.profile_id=p_profile_id),
    (select jsonb_agg(to_jsonb(request) order by request.id)::text
      from public.mentor_booking_requests request where request.mentor_profile_id=p_profile_id or request.requested_by_profile_id=p_profile_id),
    (select jsonb_agg(to_jsonb(booking_window) order by booking_window.id)::text
      from public.mentor_booking_windows booking_window where booking_window.mentor_profile_id=p_profile_id),
    (select jsonb_agg(to_jsonb(session) order by session.id)::text
      from public.sessions session join public.mentor_semesters term on term.id=session.mentor_semester_id
      join public.semester_memberships membership on membership.id=term.semester_membership_id where membership.profile_id=p_profile_id),
    (select jsonb_agg(to_jsonb(team) order by team.id)::text from public.startup_team_memberships team
      join public.semester_memberships membership on membership.id=team.semester_membership_id where membership.profile_id=p_profile_id),
    (select jsonb_agg(to_jsonb(invitation) order by invitation.id)::text from public.invitations invitation
      where invitation.matched_profile_id=p_profile_id or invitation.email=lower(v_profile.email)),
    (select jsonb_agg(to_jsonb(object) order by object.id)::text from storage.objects object
      where object.bucket_id='profile-photos' and object.name like p_profile_id::text || '/%'),
    (select jsonb_agg(to_jsonb(meeting) order by meeting.id)::text from public.meetings meeting
      where meeting.friday_canceled_by_profile_id=p_profile_id),
    (select jsonb_agg(to_jsonb(detail) order by detail.id)::text from public.mentor_booking_meeting_details detail
      join public.mentor_booking_requests request on request.id=detail.request_id
      where detail.updated_by_profile_id=p_profile_id or request.mentor_profile_id=p_profile_id or request.requested_by_profile_id=p_profile_id
        or exists(select 1 from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id
          where team.startup_semester_id=request.startup_semester_id and membership.profile_id=p_profile_id)),
    (select jsonb_agg(to_jsonb(note) order by note.id)::text from public.mentor_booking_decision_notes note
      join public.mentor_booking_requests request on request.id=note.request_id
      where note.author_profile_id=p_profile_id or request.mentor_profile_id=p_profile_id or request.requested_by_profile_id=p_profile_id
        or exists(select 1 from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id
          where team.startup_semester_id=request.startup_semester_id and membership.profile_id=p_profile_id)),
    (select jsonb_agg(to_jsonb(outcome) order by outcome.id)::text from public.mentor_booking_outcomes outcome
      join public.mentor_booking_requests request on request.id=outcome.request_id
      where outcome.reporter_profile_id=p_profile_id or request.mentor_profile_id=p_profile_id or request.requested_by_profile_id=p_profile_id
        or exists(select 1 from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id
          where team.startup_semester_id=request.startup_semester_id and membership.profile_id=p_profile_id)),
    (select jsonb_agg(to_jsonb(delivery) order by delivery.id)::text from public.notification_deliveries delivery
      where delivery.recipient_profile_id=p_profile_id or delivery.recipient_email=lower(v_profile.email)),
    (select jsonb_agg(to_jsonb(account) order by account.profile_id)::text from public.outreach_gmail_accounts account
      where account.profile_id=p_profile_id),
    (select jsonb_agg(to_jsonb(oauth) order by oauth.state_hash)::text from public.outreach_gmail_oauth oauth
      where oauth.profile_id=p_profile_id),
    (select jsonb_agg(to_jsonb(message) order by message.id)::text from public.outreach_gmail_messages message
      where message.profile_id=p_profile_id or lower(message.recipient)=lower(v_profile.email)
        or lower(message.sender)=lower(v_profile.email))
  )) into v_revision;
  return query select v_counts,v_blockers,v_revision,v_impact;
end;
$$;
revoke all on function private.member_deletion_impact(uuid) from public, anon, authenticated, service_role;

create or replace function public.preview_member_deletion(p_profile_id uuid)
returns table(profile_id uuid, full_name text, email text, version text, status text, counts jsonb, blockers text[], impact jsonb)
language plpgsql stable security definer set search_path=''
as $$
declare v_profile public.profiles%rowtype; v_operation public.member_deletion_operations%rowtype;
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then raise exception 'Platform super-administrator access required' using errcode='42501'; end if;
  select * into v_profile from public.profiles where id=p_profile_id;
  if not found then raise exception 'Member profile not found' using errcode='P0002'; end if;
  if p_profile_id=private.current_profile_id() or exists(select 1 from public.platform_roles where platform_roles.profile_id=p_profile_id) then
    raise exception 'Protected account cannot be deleted' using errcode='42501';
  end if;
  select * into v_operation from public.member_deletion_operations operation where operation.profile_id=p_profile_id;
  if found then
    return query select p_profile_id,case when v_operation.status='completed' then 'Deleted member'::text else v_operation.source_name end,
      coalesce(v_operation.source_email,''),v_operation.version,v_operation.status,v_operation.counts,'{}'::text[],v_operation.impact;
    return;
  end if;
  return query select p_profile_id,coalesce(v_profile.full_name,''),v_profile.email,impact.version,'ready'::text,impact.counts,impact.blockers,impact.impact
    from private.member_deletion_impact(p_profile_id) impact;
end;
$$;

create or replace function public.prepare_member_deletion(p_profile_id uuid,p_confirmation_email text,p_reason text,p_version text)
returns table(profile_id uuid, status text, auth_user_id uuid, operation_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_profile public.profiles%rowtype; v_operation public.member_deletion_operations%rowtype; v_impact record;
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then raise exception 'Platform super-administrator access required' using errcode='42501'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 10 and 500 then raise exception 'A deletion reason of 10–500 characters is required' using errcode='22023'; end if;
  select * into v_profile from public.profiles where id=p_profile_id for update;
  if not found then raise exception 'Member profile not found' using errcode='P0002'; end if;
  if p_profile_id=private.current_profile_id() or exists(select 1 from public.platform_roles where platform_roles.profile_id=p_profile_id) then
    raise exception 'Protected account cannot be deleted' using errcode='42501';
  end if;
  select * into v_operation from public.member_deletion_operations operation where operation.profile_id=p_profile_id for update;
  if found then
    if v_operation.status='completed' then
      return query select p_profile_id,v_operation.status,v_operation.auth_user_id,v_operation.id;
      return;
    end if;
    if v_operation.version is distinct from p_version or (v_operation.status<>'completed' and lower(btrim(p_confirmation_email)) is distinct from v_operation.source_email) then
      raise exception 'Deletion preview changed; review the impact again' using errcode='PT409';
    end if;
    return query select p_profile_id,v_operation.status,v_operation.auth_user_id,v_operation.id;
    return;
  end if;
  if lower(btrim(p_confirmation_email)) is distinct from lower(v_profile.email) then raise exception 'Confirmation email does not match the target' using errcode='22023'; end if;
  perform membership.id from public.semester_memberships membership where membership.profile_id=p_profile_id order by membership.id for update;
  -- Serialize with delivery claims, OAuth callbacks, and new shared booking text.
  lock table public.mentor_booking_meeting_details,public.mentor_booking_decision_notes,
    public.mentor_booking_outcomes,public.notification_deliveries,
    public.outreach_gmail_accounts,public.outreach_gmail_oauth,public.outreach_gmail_messages
    in share row exclusive mode;
  select * into v_impact from private.member_deletion_impact(p_profile_id);
  if v_impact.version is distinct from p_version then raise exception 'Deletion preview changed; review the impact again' using errcode='PT409'; end if;
  if cardinality(v_impact.blockers)>0 then raise exception 'Resolve all deletion impact blockers before continuing' using errcode='55000'; end if;
  insert into public.member_deletion_operations(profile_id,auth_user_id,source_email,source_name,version,status,counts,impact,actor_profile_id)
  values(p_profile_id,v_profile.auth_user_id,lower(v_profile.email),coalesce(v_profile.full_name,''),p_version,'in_progress',v_impact.counts,v_impact.impact,private.current_profile_id())
  returning * into v_operation;
  update public.profiles set is_active=false,updated_at=now() where id=p_profile_id;
  update public.semester_memberships set status='suspended',suspended_at=now(),updated_at=now()
  where semester_memberships.profile_id=p_profile_id and semester_memberships.status in ('invited','onboarding','active');
  insert into public.program_audit_events(semester_id,actor_profile_id,action,subject_type,subject_id,details)
    select membership.semester_id,v_operation.actor_profile_id,'member.personal_deletion_prepared','profile',p_profile_id,
      jsonb_build_object('operation_id',v_operation.id)
    from public.semester_memberships membership where membership.profile_id=p_profile_id;
  -- The administrator's text is intentionally not persisted: it can contain target PII.
  return query select p_profile_id,v_operation.status,v_operation.auth_user_id,v_operation.id;
end;
$$;

create or replace function public.finalize_member_deletion(p_profile_id uuid,p_operation_id uuid)
returns table(profile_id uuid,status text)
language plpgsql security definer set search_path=''
as $$
declare v_operation public.member_deletion_operations%rowtype; v_old_email text; v_impact record;
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then raise exception 'Platform super-administrator access required' using errcode='42501'; end if;
  select * into v_operation from public.member_deletion_operations operation where operation.id=p_operation_id and operation.profile_id=p_profile_id for update;
  if not found then raise exception 'Deletion operation not found' using errcode='P0002'; end if;
  if v_operation.status='completed' then return query select p_profile_id,'completed'::text; return; end if;
  -- Concurrent shared-content writes must not cross the final privacy inventory.
  lock table public.startup_organizations,public.startup_semesters,public.startup_team_memberships,
    public.sessions,public.outreach_contacts,public.outreach_companies,public.outreach_opportunities,
    public.outreach_imports,public.outreach_email_messages,public.outreach_email_templates,
    public.invitations,public.mentor_booking_requests,public.mentor_booking_windows,
    public.mentor_booking_meeting_details,public.mentor_booking_decision_notes,
    public.mentor_booking_outcomes,public.meetings,public.notification_deliveries,
    public.outreach_gmail_accounts,public.outreach_gmail_oauth,public.outreach_gmail_messages,
    storage.objects in share row exclusive mode;
  select * into v_impact from private.member_deletion_impact(p_profile_id);
  if cardinality(v_impact.blockers)>0 then
    raise exception 'New deletion impact blockers appeared; resolve them before retrying cleanup' using errcode='55000';
  end if;
  if exists(select 1 from auth.users where id=v_operation.auth_user_id) then raise exception 'Auth identity still exists; retry external cleanup' using errcode='55000'; end if;
  if exists(select 1 from storage.objects where bucket_id='profile-photos' and name like p_profile_id::text || '/%') then
    raise exception 'Personal files remain; retry external cleanup' using errcode='55000';
  end if;
  v_old_email:=v_operation.source_email;
  perform pg_catalog.set_config('member_deletion.finalizing_profile_id',p_profile_id::text,true);
  -- Remove recipient-address snapshots and private integration credentials before
  -- anonymizing the profile. In-flight delivery and Gmail message history block above.
  delete from public.notification_deliveries delivery where delivery.recipient_profile_id=p_profile_id;
  delete from public.outreach_gmail_oauth oauth where oauth.profile_id=p_profile_id;
  delete from public.outreach_gmail_accounts account where account.profile_id=p_profile_id;
  update public.meetings meeting set friday_canceled_by_profile_id=null
    where meeting.friday_canceled_by_profile_id=p_profile_id;
  -- Future mentor bookings lose their occupancy through the existing status trigger.
  update public.mentor_booking_requests request set
    status=case when request.mentor_profile_id=p_profile_id and request.starts_at>now() and request.status in ('pending','accepted') then 'cancelled' else request.status end,
    cancelled_at=case when request.mentor_profile_id=p_profile_id and request.starts_at>now() and request.status in ('pending','accepted') then now() else request.cancelled_at end,
    responded_at=case when request.mentor_profile_id=p_profile_id and request.starts_at>now() and request.status in ('pending','accepted') then null else request.responded_at end,
    mentor_name=case when request.mentor_profile_id=p_profile_id then 'Deleted member' else request.mentor_name end,
    topic='Private request removed',updated_at=now()
    where request.mentor_profile_id=p_profile_id or request.requested_by_profile_id=p_profile_id;
  update public.mentor_booking_windows set mentor_name='Deleted member',withdrawn_at=coalesce(withdrawn_at,now()),updated_at=now()
    where mentor_profile_id=p_profile_id;
  delete from public.mentor_booking_windows booking_window
    where booking_window.mentor_profile_id=p_profile_id
      and not exists(select 1 from public.mentor_booking_requests request where request.window_id=booking_window.id);
  update public.sessions session set topic=null,notes=null,substitute_name=null,
    status=case when ((meeting.meeting_date + case session.slot when 2 then meeting.slot_2_starts_at else meeting.slot_1_starts_at end)
      at time zone coalesce(nullif(semester.configuration->>'timezone',''),'America/New_York'))>now()
      and session.status in ('requested','confirmed') then 'cancelled' else session.status end,
    updated_at=now()
    from public.mentor_semesters term join public.semester_memberships membership on membership.id=term.semester_membership_id,
      public.meetings meeting,public.semesters semester
    where session.mentor_semester_id=term.id and meeting.id=session.meeting_id
      and semester.id=session.semester_id and membership.profile_id=p_profile_id;
  delete from public.session_rsvps rsvp using public.semester_memberships membership
    where rsvp.semester_membership_id=membership.id and membership.profile_id=p_profile_id;
  delete from public.mentor_weekly_availability availability using public.mentor_semesters term join public.semester_memberships membership on membership.id=term.semester_membership_id
    where availability.mentor_semester_id=term.id and membership.profile_id=p_profile_id;
  delete from public.startup_team_memberships team using public.semester_memberships membership
    where team.semester_membership_id=membership.id and membership.profile_id=p_profile_id;
  delete from public.participant_notification_reads where participant_notification_reads.profile_id=p_profile_id;
  update public.invitations set email='deleted+'||invitations.id::text||'@invalid.example',full_name='Deleted member',
    status=case when invitations.status in ('draft','queued','sent') then 'revoked'::public.invitation_lifecycle_status else invitations.status end,
    revoked_at=case when invitations.status in ('draft','queued','sent') then now() else invitations.revoked_at end,
    last_error_message=null,updated_at=now()
    where invitations.matched_profile_id=p_profile_id or invitations.email=v_old_email;
  update public.program_audit_events set details='{}'::jsonb
    where actor_profile_id=p_profile_id or (subject_type='profile' and subject_id=p_profile_id);
  update public.outreach_activities set summary=null,details='{}'::jsonb
    where actor_profile_id=p_profile_id or previous_owner_profile_id=p_profile_id or new_owner_profile_id=p_profile_id;
  update public.semester_memberships set onboarding_data='{}'::jsonb,onboarding_started_at=null,onboarding_completed_at=null,
    status='suspended',suspended_at=coalesce(suspended_at,now()),updated_at=now()
    where semester_memberships.profile_id=p_profile_id and semester_memberships.status<>'alumni';
  update public.semester_memberships set onboarding_data='{}'::jsonb,onboarding_started_at=null,onboarding_completed_at=null,updated_at=now()
    where semester_memberships.profile_id=p_profile_id and semester_memberships.status='alumni';
  update public.mentor_semesters set mentorship_goals=null,general_availability=null,per_week_availability='{}'::jsonb,
    opening_talk=null,preferred_format=null,updated_at=now()
    where semester_membership_id in (select id from public.semester_memberships where semester_memberships.profile_id=p_profile_id);
  delete from public.mentor_expertise_tags where mentor_profile_id=p_profile_id;
  delete from public.mentor_profiles where mentor_profiles.profile_id=p_profile_id;
  update public.profiles set auth_user_id=null,email='deleted+'||p_profile_id::text||'@invalid.example',
    full_name='Deleted member',photo_path=null,is_active=false,status='rejected',updated_at=now()
    where id=p_profile_id;
  update public.member_deletion_operations set auth_user_id=null,source_email=null,source_name=null,
    version='completed',impact='{"semesters":[],"sharedStartups":[],"upcomingMentorMeetings":[]}'::jsonb,
    status='completed',completed_at=now()
    where id=p_operation_id;
  -- A minimal system audit remains; it cannot reconstruct target contact details or free text.
  insert into public.program_audit_events(semester_id,actor_profile_id,action,subject_type,subject_id,details)
    select membership.semester_id,v_operation.actor_profile_id,'member.personal_deletion_completed','profile',p_profile_id,
      jsonb_build_object('operation_id',p_operation_id,'affected_counts',v_operation.counts)
    from public.semester_memberships membership where membership.profile_id=p_profile_id;
  return query select p_profile_id,'completed'::text;
end;
$$;

revoke all on function public.preview_member_deletion(uuid) from public, anon, service_role;
revoke all on function public.prepare_member_deletion(uuid,text,text,text) from public, anon, service_role;
revoke all on function public.finalize_member_deletion(uuid,uuid) from public, anon, service_role;
grant execute on function public.preview_member_deletion(uuid) to authenticated, postgres;
grant execute on function public.prepare_member_deletion(uuid,text,text,text) to authenticated, postgres;
grant execute on function public.finalize_member_deletion(uuid,uuid) to authenticated, postgres;

-- The account may have an old JWT or an in-flight integration callback after
-- preparation. Never recreate its delivery or private integration state.
create or replace function private.guard_prepared_member_delivery()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_profile_id uuid; v_old_profile_id uuid;
begin
  if tg_table_name='notification_deliveries' then
    v_profile_id:=new.recipient_profile_id;
    if tg_op='UPDATE' then v_old_profile_id:=old.recipient_profile_id; end if;
  else
    v_profile_id:=new.profile_id;
    if tg_op='UPDATE' then v_old_profile_id:=old.profile_id; end if;
  end if;
  if exists(select 1 from public.member_deletion_operations operation
      where operation.profile_id=v_profile_id or operation.profile_id=v_old_profile_id) then
    raise exception 'Deleted member delivery state cannot be recreated or advanced' using errcode='55000';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_prepared_member_delivery() from public, anon, authenticated, service_role;
drop trigger if exists guard_prepared_member_delivery on public.notification_deliveries;
create trigger guard_prepared_member_delivery before insert or update on public.notification_deliveries
for each row execute function private.guard_prepared_member_delivery();
drop trigger if exists guard_prepared_member_gmail_account on public.outreach_gmail_accounts;
create trigger guard_prepared_member_gmail_account before insert or update on public.outreach_gmail_accounts
for each row execute function private.guard_prepared_member_delivery();
drop trigger if exists guard_prepared_member_gmail_oauth on public.outreach_gmail_oauth;
create trigger guard_prepared_member_gmail_oauth before insert or update on public.outreach_gmail_oauth
for each row execute function private.guard_prepared_member_delivery();
drop trigger if exists guard_prepared_member_gmail_message on public.outreach_gmail_messages;
create trigger guard_prepared_member_gmail_message before insert or update on public.outreach_gmail_messages
for each row execute function private.guard_prepared_member_delivery();

create or replace function private.guard_personal_deletion_anchor()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_status text;
begin
  select operation.status into v_status from public.member_deletion_operations operation where operation.profile_id=new.id;
  if v_status is null then return new; end if;
  if new.is_active or (new.auth_user_id is not null and new.auth_user_id is distinct from old.auth_user_id)
    or (v_status='completed' and new is distinct from old) then
    raise exception 'Deleted member identity cannot be restored or edited' using errcode='55000';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_personal_deletion_anchor on public.profiles;
create trigger guard_personal_deletion_anchor before update on public.profiles
for each row execute function private.guard_personal_deletion_anchor();

create or replace function private.guard_personal_deletion_membership()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if exists(select 1 from public.member_deletion_operations operation where operation.profile_id=new.profile_id)
    and (new.status in ('invited','onboarding','active')
      or (tg_op='UPDATE' and new.onboarding_data is distinct from old.onboarding_data
        and not (current_user='postgres' and private.is_finalizing_member_deletion(new.profile_id)))) then
    raise exception 'Deleted member cannot regain program access' using errcode='55000';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_personal_deletion_membership on public.semester_memberships;
create trigger guard_personal_deletion_membership before insert or update on public.semester_memberships
for each row execute function private.guard_personal_deletion_membership();

create or replace function private.guard_personal_deletion_mentor_details()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_profile_id uuid;
begin
  if tg_table_name='mentor_profiles' then
    v_profile_id:=new.profile_id;
  else
    select membership.profile_id into v_profile_id from public.semester_memberships membership
    where membership.id=new.semester_membership_id;
  end if;
  if exists(select 1 from public.member_deletion_operations operation where operation.profile_id=v_profile_id)
    and not coalesce(private.is_finalizing_member_deletion(v_profile_id),false) then
    raise exception 'Deleted member details cannot be recreated' using errcode='55000';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_personal_deletion_mentor_profile on public.mentor_profiles;
create trigger guard_personal_deletion_mentor_profile before insert or update on public.mentor_profiles
for each row execute function private.guard_personal_deletion_mentor_details();
drop trigger if exists guard_personal_deletion_mentor_semester on public.mentor_semesters;
create trigger guard_personal_deletion_mentor_semester before insert or update on public.mentor_semesters
for each row execute function private.guard_personal_deletion_mentor_details();

create or replace function private.can_delete_prepared_profile_photo(object_name text)
returns boolean language sql stable security definer set search_path=''
as $$
  select private.is_super_admin(auth.uid()) and exists (
    select 1 from public.member_deletion_operations operation
    where operation.status='in_progress' and object_name like operation.profile_id::text || '/%'
  )
$$;
revoke all on function private.can_delete_prepared_profile_photo(text) from public, anon, service_role;
grant execute on function private.can_delete_prepared_profile_photo(text) to authenticated, postgres;

drop policy if exists "super admins list prepared personal photos" on storage.objects;
create policy "super admins list prepared personal photos" on storage.objects
for select to authenticated using (
  bucket_id='profile-photos' and private.can_delete_prepared_profile_photo(name)
);
drop policy if exists "super admins delete prepared personal photos" on storage.objects;
create policy "super admins delete prepared personal photos" on storage.objects
for delete to authenticated using (
  bucket_id='profile-photos' and private.can_delete_prepared_profile_photo(name)
);

