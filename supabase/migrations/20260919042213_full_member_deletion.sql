set local check_function_bodies = off;

create table "public"."member_deletion_operations" (
  "id"               uuid                     not null default gen_random_uuid(),
  "profile_id"       uuid                     not null,
  "auth_user_id"     uuid,
  "source_email"     text,
  "source_name"      text,
  "version"          text                     not null,
  "status"           text                     not null,
  "counts"           jsonb                    not null default '{}'::jsonb,
  "impact"           jsonb                    not null default '{}'::jsonb,
  "actor_profile_id" uuid                     not null,
  "prepared_at"      timestamp with time zone not null default now(),
  "completed_at"     timestamp with time zone,
  constraint "member_deletion_operation_completed_scrub"
    check (((status <> 'completed'::text) OR ((auth_user_id IS NULL) AND (source_email IS NULL) AND (source_name IS NULL) AND (completed_at IS NOT NULL)))),
  constraint "member_deletion_operations_pkey" primary key (id),
  constraint "member_deletion_operations_profile_id_key" unique (profile_id),
  constraint "member_deletion_operations_status_check" check ((status = ANY (ARRAY['in_progress'::text, 'completed'::text])))
);

alter table "public"."member_deletion_operations"
  enable row level security;

create or replace function private.can_delete_prepared_profile_photo (
  object_name text
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$
  select private.is_super_admin(auth.uid()) and exists (
    select 1 from public.member_deletion_operations operation
    where operation.status='in_progress' and object_name like operation.profile_id::text || '/%'
  )
$function$;

create or replace function private.current_profile_id (
  candidate_auth_user_id uuid default auth.uid()
)
  returns uuid
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$
  select profile.id from public.profiles profile
  where profile.auth_user_id = candidate_auth_user_id
    and not exists (select 1 from public.member_deletion_operations operation where operation.profile_id=profile.id)
$function$;

create or replace function private.guard_mentor_booking_request()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
declare
  actor_profile uuid := private.current_profile_id();
  canonical_mentor record;
  canonical_startup record;
  local_start timestamp;
  local_end timestamp;
  deletion_target uuid;
  deletion_mentor_name text;
  deletion_status text;
begin
  if tg_op='INSERT' then
    select term.id as mentor_semester_id, membership.profile_id, profile.full_name,
      semester.start_date, semester.end_date, coalesce(nullif(btrim(semester.configuration->>'timezone'),''),'America/New_York') as timezone
    into canonical_mentor
    from public.mentor_semesters term
    join public.semester_memberships membership on membership.id=term.semester_membership_id and membership.semester_id=term.semester_id
    join public.profiles profile on profile.id=membership.profile_id
    join public.semesters semester on semester.id=term.semester_id
    where term.id=new.mentor_semester_id and term.semester_id=new.semester_id and membership.role='mentor' and membership.status='active' and semester.is_active;
    if canonical_mentor.mentor_semester_id is null then raise exception 'Selected mentor is not available in this semester' using errcode='P0002'; end if;
    if new.ends_at-new.starts_at <> interval '15 minutes' or new.starts_at<=now() then raise exception 'Booking requests must be a future 15-minute appointment' using errcode='22023'; end if;
    local_start := new.starts_at at time zone canonical_mentor.timezone;
    local_end := new.ends_at at time zone canonical_mentor.timezone;
    if local_start::date <> local_end::date or local_start::date < canonical_mentor.start_date or local_start::date > canonical_mentor.end_date then raise exception 'Booking must occur during one semester day' using errcode='22023'; end if;
    if extract(minute from local_start)::integer % 15 <> 0 or extract(second from local_start)::integer <> 0 then raise exception 'Booking start must align to 15 minutes' using errcode='22023'; end if;
    if extract(dow from local_start)=5 and local_start::time < time '17:00' and local_end::time > time '15:00' then raise exception 'Independent mentor bookings cannot overlap the Friday Program from 3:00 PM to 5:00 PM' using errcode='22023'; end if;
    if not exists(select 1 from public.mentor_weekly_availability availability where availability.semester_id=new.semester_id and availability.mentor_semester_id=canonical_mentor.mentor_semester_id and availability.weekday=extract(dow from local_start)::smallint and availability.starts_at<=local_start::time and availability.ends_at>=local_end::time) then raise exception 'Selected time is outside this mentor''s weekly availability' using errcode='22023'; end if;
    select startup.id as startup_semester_id, startup.startup_organization_id, organization.name into canonical_startup
    from public.startup_team_memberships team
    join public.semester_memberships membership on membership.id=team.semester_membership_id and membership.semester_id=team.semester_id
    join public.startup_semesters startup on startup.id=team.startup_semester_id and startup.semester_id=team.semester_id
    join public.startup_organizations organization on organization.id=startup.startup_organization_id
    where team.semester_id=new.semester_id and membership.profile_id=actor_profile and membership.role='startup' and membership.status='active';
    if canonical_startup.startup_semester_id is null then raise exception 'Active startup membership required' using errcode='42501'; end if;
    new.window_id:=null; new.mentor_semester_id:=canonical_mentor.mentor_semester_id; new.mentor_profile_id:=canonical_mentor.profile_id; new.mentor_name:=coalesce(nullif(btrim(canonical_mentor.full_name),''),'Mentor');
    new.startup_semester_id:=canonical_startup.startup_semester_id; new.startup_organization_id:=canonical_startup.startup_organization_id; new.startup_name:=canonical_startup.name; new.requested_by_profile_id:=actor_profile; new.topic:=btrim(new.topic); new.status:='pending'; new.requested_at:=now(); new.responded_at:=null; new.cancelled_at:=null; new.updated_at:=now(); return new;
  end if;
  if tg_op='UPDATE' then
    deletion_target := nullif(pg_catalog.current_setting('member_deletion.finalizing_profile_id',true),'')::uuid;
    if current_user='postgres' and deletion_target is not null and private.is_finalizing_member_deletion(deletion_target)
      and (old.mentor_profile_id=deletion_target or old.requested_by_profile_id=deletion_target) then
      deletion_mentor_name := case when old.mentor_profile_id=deletion_target then 'Deleted member' else old.mentor_name end;
      deletion_status := case when old.mentor_profile_id=deletion_target and old.starts_at>now()
        and old.status in ('pending','accepted') then 'cancelled' else old.status end;
      if row(old.id,old.semester_id,old.window_id,old.mentor_semester_id,old.mentor_profile_id,old.startup_semester_id,old.startup_organization_id,old.startup_name,old.requested_by_profile_id,old.starts_at,old.ends_at,old.requested_at)
         is distinct from row(new.id,new.semester_id,new.window_id,new.mentor_semester_id,new.mentor_profile_id,new.startup_semester_id,new.startup_organization_id,new.startup_name,new.requested_by_profile_id,new.starts_at,new.ends_at,new.requested_at)
        or new.topic<>'Private request removed'
        or new.mentor_name is distinct from deletion_mentor_name
        or new.status is distinct from deletion_status
      then raise exception 'Invalid personal deletion booking update' using errcode='42501'; end if;
      return new;
    end if;
    if row(old.id,old.semester_id,old.window_id,old.mentor_semester_id,old.mentor_profile_id,old.mentor_name,old.startup_semester_id,old.startup_organization_id,old.startup_name,old.requested_by_profile_id,old.topic,old.starts_at,old.ends_at,old.requested_at) is distinct from row(new.id,new.semester_id,new.window_id,new.mentor_semester_id,new.mentor_profile_id,new.mentor_name,new.startup_semester_id,new.startup_organization_id,new.startup_name,new.requested_by_profile_id,new.topic,new.starts_at,new.ends_at,new.requested_at) then raise exception 'Booking identity, topic, and interval are immutable' using errcode='42501'; end if;
    if new.status=old.status then if row(new.responded_at,new.cancelled_at) is distinct from row(old.responded_at,old.cancelled_at) then raise exception 'Booking timestamps are protected' using errcode='42501'; end if; return old; end if;
    if old.status='pending' and new.status in ('accepted','declined') then if actor_profile is distinct from old.mentor_profile_id then raise exception 'Only the owning mentor can respond' using errcode='42501'; end if; new.responded_at:=now(); new.cancelled_at:=null;
    elsif old.status in ('pending','accepted') and new.status='cancelled' then if actor_profile is distinct from old.mentor_profile_id and not exists(select 1 from public.startup_team_memberships team join public.semester_memberships membership on membership.id=team.semester_membership_id where team.semester_id=old.semester_id and team.startup_semester_id=old.startup_semester_id and membership.profile_id=actor_profile and membership.status='active' and membership.role='startup') then raise exception 'Only either booking party can cancel' using errcode='42501'; end if; new.cancelled_at:=now(); new.responded_at:=old.responded_at;
    else raise exception 'Invalid booking status transition' using errcode='55000'; end if;
    new.updated_at:=now(); return new;
  end if;
  -- Only the existing owner-executed, super-admin deletion RPC may remove
  -- booking history. Participant table access remains governed by RLS.
  if tg_op='DELETE' and current_user='postgres' and private.is_super_admin(auth.uid()) then
    return old;
  end if;
  raise exception 'Booking history cannot be deleted' using errcode='42501';
end;
$function$;

create or replace function private.guard_mentor_booking_window()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
declare
  actor_profile uuid := private.current_profile_id();
  canonical_mentor record;
begin
  if tg_op='INSERT' then
    select term.id as mentor_semester_id,membership.profile_id,profile.full_name,
      coalesce(nullif(btrim(semester.configuration->>'timezone'),''),'America/New_York') as timezone
      into canonical_mentor
    from public.mentor_semesters term
    join public.semester_memberships membership on membership.id=term.semester_membership_id and membership.semester_id=term.semester_id
    join public.profiles profile on profile.id=membership.profile_id
    join public.semesters semester on semester.id=term.semester_id
    where term.semester_id=new.semester_id and membership.profile_id=actor_profile
      and membership.role='mentor' and membership.status='active' and semester.is_active;
    if canonical_mentor.mentor_semester_id is null then raise exception 'Active owning mentor required' using errcode='42501'; end if;
    if new.starts_at<=now() or new.ends_at<=new.starts_at then raise exception 'Availability must be a future positive interval' using errcode='22023'; end if;
    new.mentor_semester_id:=canonical_mentor.mentor_semester_id;
    new.mentor_profile_id:=canonical_mentor.profile_id;
    new.mentor_name:=coalesce(nullif(btrim(canonical_mentor.full_name),''),'Mentor');
    new.withdrawn_at:=null; new.created_at:=now(); new.updated_at:=now();
    return new;
  end if;
  if tg_op='UPDATE' then
    if current_user='postgres' and private.is_finalizing_member_deletion(old.mentor_profile_id) then
      if row(old.id,old.semester_id,old.mentor_semester_id,old.mentor_profile_id,old.starts_at,old.ends_at,old.created_at)
         is distinct from row(new.id,new.semester_id,new.mentor_semester_id,new.mentor_profile_id,new.starts_at,new.ends_at,new.created_at)
        or new.mentor_name<>'Deleted member' or new.withdrawn_at is null
      then raise exception 'Invalid personal deletion availability update' using errcode='42501'; end if;
      return new;
    end if;
    if row(old.id,old.semester_id,old.mentor_semester_id,old.mentor_profile_id,old.mentor_name,old.starts_at,old.ends_at,old.created_at)
       is distinct from row(new.id,new.semester_id,new.mentor_semester_id,new.mentor_profile_id,new.mentor_name,new.starts_at,new.ends_at,new.created_at)
    then raise exception 'Published availability fields are immutable' using errcode='42501'; end if;
    if old.withdrawn_at is not null then
      if new.withdrawn_at is distinct from old.withdrawn_at then raise exception 'Withdrawn availability is immutable' using errcode='55000'; end if;
      return old;
    end if;
    if actor_profile is distinct from old.mentor_profile_id then raise exception 'Only the owning mentor can withdraw availability' using errcode='42501'; end if;
    if old.starts_at<=now() then raise exception 'Only future availability can be withdrawn' using errcode='55000'; end if;
    if new.withdrawn_at is null then raise exception 'Availability update must withdraw the window' using errcode='42501'; end if;
    if exists(select 1 from public.mentor_booking_window_claims claim where claim.window_id=old.id) then
      raise exception 'Availability with a live request cannot be withdrawn' using errcode='55000';
    end if;
    new.withdrawn_at:=now(); new.updated_at:=now(); return new;
  end if;
  if tg_op='DELETE' and current_user='postgres' and private.is_finalizing_member_deletion(old.mentor_profile_id) then
    return old;
  end if;
  raise exception 'Availability records cannot be deleted' using errcode='42501';
end;
$function$;

create or replace function private.guard_personal_deletion_anchor()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
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
$function$;

create or replace function private.guard_personal_deletion_membership()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
begin
  if exists(select 1 from public.member_deletion_operations operation where operation.profile_id=new.profile_id)
    and (new.status in ('invited','onboarding','active')
      or (tg_op='UPDATE' and new.onboarding_data is distinct from old.onboarding_data
        and not (current_user='postgres' and private.is_finalizing_member_deletion(new.profile_id)))) then
    raise exception 'Deleted member cannot regain program access' using errcode='55000';
  end if;
  return new;
end;
$function$;

create or replace function private.guard_personal_deletion_mentor_details()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
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
$function$;

create or replace function private.is_finalizing_member_deletion (
  p_profile_id uuid
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$
  select private.is_super_admin(auth.uid())
    and coalesce(pg_catalog.current_setting('member_deletion.finalizing_profile_id',true)=p_profile_id::text,false)
    and exists(select 1 from public.member_deletion_operations operation
      where operation.profile_id=p_profile_id and operation.status='in_progress')
$function$;

create or replace function private.member_deletion_impact (
  p_profile_id uuid
)
  returns table (
    counts   jsonb,
    blockers text[],
    version  text,
    impact   jsonb
  )
  language plpgsql
  stable
  security definer
  set search_path to ''
  AS $function$
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
        'platform_roles','program_audit_events','semester_memberships','member_deletion_operations'
      ])
  ) then
    v_blockers := array_append(v_blockers,'A new profile dependency needs a deletion policy.');
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
      where object.bucket_id='profile-photos' and object.name like p_profile_id::text || '/%')
  )) into v_revision;
  return query select v_counts,v_blockers,v_revision,v_impact;
end;
$function$;

create or replace function public.finalize_member_deletion (
  p_profile_id   uuid,
  p_operation_id uuid
)
  returns table (
    profile_id uuid,
    status     text
  )
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
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
$function$;

create or replace function public.prepare_member_deletion (
  p_profile_id         uuid,
  p_confirmation_email text,
  p_reason             text,
  p_version            text
)
  returns table (
    profile_id   uuid,
    status       text,
    auth_user_id uuid,
    operation_id uuid
  )
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
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
      raise exception 'Deletion preview changed; review the impact again' using errcode='40001';
    end if;
    return query select p_profile_id,v_operation.status,v_operation.auth_user_id,v_operation.id;
    return;
  end if;
  if lower(btrim(p_confirmation_email)) is distinct from lower(v_profile.email) then raise exception 'Confirmation email does not match the target' using errcode='22023'; end if;
  perform membership.id from public.semester_memberships membership where membership.profile_id=p_profile_id order by membership.id for update;
  select * into v_impact from private.member_deletion_impact(p_profile_id);
  if v_impact.version is distinct from p_version then raise exception 'Deletion preview changed; review the impact again' using errcode='40001'; end if;
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
$function$;

create or replace function public.preview_member_deletion (
  p_profile_id uuid
)
  returns table (
    profile_id uuid,
    full_name  text,
    email      text,
    version    text,
    status     text,
    counts     jsonb,
    blockers   text[],
    impact     jsonb
  )
  language plpgsql
  stable
  security definer
  set search_path to ''
  AS $function$
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
$function$;

alter table "public"."member_deletion_operations"
  add constraint "member_deletion_operations_actor_profile_id_fkey" foreign key (actor_profile_id) references public.profiles(id) on delete restrict;

alter table "public"."member_deletion_operations"
  add constraint "member_deletion_operations_profile_id_fkey" foreign key (profile_id) references public.profiles(id) on delete restrict;

create trigger guard_personal_deletion_mentor_profile
  before insert or update on public.mentor_profiles
  for each row
  execute function private.guard_personal_deletion_mentor_details();

create trigger guard_personal_deletion_mentor_semester
  before insert or update on public.mentor_semesters
  for each row
  execute function private.guard_personal_deletion_mentor_details();

create trigger guard_personal_deletion_anchor
  before update on public.profiles
  for each row
  execute function private.guard_personal_deletion_anchor();

create trigger guard_personal_deletion_membership
  before insert or update on public.semester_memberships
  for each row
  execute function private.guard_personal_deletion_membership();

revoke all on function "private"."can_delete_prepared_profile_photo"(text) from public;

grant execute on function "private"."can_delete_prepared_profile_photo"(text) to "authenticated", "postgres";

revoke all on function "private"."guard_personal_deletion_anchor"() from public;

grant execute on function "private"."guard_personal_deletion_anchor"() to "postgres";

revoke all on function "private"."guard_personal_deletion_membership"() from public;

grant execute on function "private"."guard_personal_deletion_membership"() to "postgres";

revoke all on function "private"."guard_personal_deletion_mentor_details"() from public;

grant execute on function "private"."guard_personal_deletion_mentor_details"() to "postgres";

revoke all on function "private"."is_finalizing_member_deletion"(uuid) from public;

grant execute on function "private"."is_finalizing_member_deletion"(uuid) to "authenticated", "postgres";

revoke all on function "private"."member_deletion_impact"(uuid) from public;

grant execute on function "private"."member_deletion_impact"(uuid) to "postgres";

revoke all on function "public"."finalize_member_deletion"(uuid, uuid) from public;

grant execute on function "public"."finalize_member_deletion"(uuid, uuid) to "authenticated", "postgres";

revoke all on function "public"."prepare_member_deletion"(uuid, text, text, text) from public;

grant execute on function "public"."prepare_member_deletion"(uuid, text, text, text) to "authenticated", "postgres";

revoke all on function "public"."preview_member_deletion"(uuid) from public;

grant execute on function "public"."preview_member_deletion"(uuid) to "authenticated", "postgres";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."member_deletion_operations" to "postgres";
