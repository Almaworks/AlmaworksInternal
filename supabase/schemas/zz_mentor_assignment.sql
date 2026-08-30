-- Authorized, atomic mentor assignment transaction for the weekly schedule.

create table public.mentor_assignment_requests (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id),
  session_date_id uuid not null references public.session_dates(id),
  time_slot text not null check (time_slot in ('3:30-4:15', '4:15-5:00')),
  startup_semester_id uuid not null references public.startup_semesters(id),
  mentor_profile_id uuid not null references public.mentor_profiles(profile_id),
  idempotency_key text not null check (pg_catalog.length(pg_catalog.btrim(idempotency_key)) > 0),
  request_fingerprint text not null,
  request_payload jsonb not null check (pg_catalog.jsonb_typeof(request_payload) = 'object'),
  session_id uuid references public.sessions(id),
  created_at timestamptz not null default pg_catalog.now(),
  unique (semester_id, idempotency_key)
);

create table public.mentor_assignment_audit (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  request_id uuid not null unique references public.mentor_assignment_requests(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id),
  session_date_id uuid not null references public.session_dates(id),
  time_slot text not null check (time_slot in ('3:30-4:15', '4:15-5:00')),
  startup_semester_id uuid not null references public.startup_semesters(id),
  mentor_profile_id uuid not null references public.mentor_profiles(profile_id),
  action text not null default 'assignment.committed' check (action = 'assignment.committed'),
  override_types text[] not null default '{}'::text[],
  override_reason text,
  ranking_context jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(ranking_context) = 'object'),
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  check (
    (pg_catalog.cardinality(override_types) = 0 and override_reason is null)
    or (pg_catalog.cardinality(override_types) > 0 and pg_catalog.length(pg_catalog.btrim(override_reason)) > 0)
  ),
  unique (semester_id, idempotency_key)
);

create index mentor_assignment_requests_slot_idx
  on public.mentor_assignment_requests (semester_id, session_date_id, time_slot);
create index mentor_assignment_audit_startup_idx
  on public.mentor_assignment_audit (semester_id, startup_semester_id, created_at desc);
create index mentor_assignment_audit_mentor_idx
  on public.mentor_assignment_audit (semester_id, mentor_profile_id, created_at desc);

alter table public.mentor_assignment_requests enable row level security;
alter table public.mentor_assignment_audit enable row level security;

create policy "semester admins can read assignment requests"
  on public.mentor_assignment_requests
  for select
  to authenticated
  using (public.can_manage_semester(semester_id, (select auth.uid())));

create policy "semester admins can read assignment audit"
  on public.mentor_assignment_audit
  for select
  to authenticated
  using (public.can_manage_semester(semester_id, (select auth.uid())));

grant select on table public.mentor_assignment_requests to authenticated;
grant select on table public.mentor_assignment_audit to authenticated;

create or replace function public.commit_mentor_assignment(
  p_semester_id uuid,
  p_session_date_id uuid,
  p_time_slot text,
  p_startup_semester_id uuid,
  p_mentor_profile_id uuid,
  p_idempotency_key text,
  p_format text default 'online',
  p_topic text default null,
  p_override_types text[] default '{}'::text[],
  p_override_reason text default null,
  p_ranking_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_key text := nullif(pg_catalog.btrim(p_idempotency_key), '');
  v_format text := nullif(pg_catalog.btrim(p_format), '');
  v_override_reason text := nullif(pg_catalog.btrim(p_override_reason), '');
  v_override_types text[];
  v_payload jsonb;
  v_fingerprint text;
  v_existing_request public.mentor_assignment_requests%rowtype;
  v_existing_audit_id uuid;
  v_request_id uuid;
  v_session_id uuid;
  v_audit_id uuid;
  v_mentor_id uuid;
  v_startup_id uuid;
  v_mentor_membership_id uuid;
  v_capacity integer;
  v_assignment_count integer;
  v_has_expertise_match boolean;
begin
  if v_actor_id is null or not (
    public.is_super_admin(v_actor_id)
    or exists (
      select 1
      from public.semester_memberships as membership
      where membership.semester_id = p_semester_id
        and membership.profile_id = v_actor_id
        and membership.role = 'admin'
        and membership.status = 'active'
    )
  ) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;

  if v_key is null then
    raise exception 'Idempotency key is required' using errcode = '22023';
  end if;
  if p_time_slot not in ('3:30-4:15', '4:15-5:00') then
    raise exception 'Unsupported assignment time slot' using errcode = '22023';
  end if;
  if v_format is null then
    raise exception 'Assignment format is required' using errcode = '22023';
  end if;
  if p_ranking_context is null or pg_catalog.jsonb_typeof(p_ranking_context) <> 'object' then
    raise exception 'Ranking context must be a JSON object' using errcode = '22023';
  end if;

  select coalesce(pg_catalog.array_agg(distinct override_type order by override_type), '{}'::text[])
  into v_override_types
  from pg_catalog.unnest(coalesce(p_override_types, '{}'::text[])) as override_type;

  if v_override_types && array['availability', 'capacity', 'expertise', 'second_slot']::text[] is false
     and pg_catalog.cardinality(v_override_types) > 0 then
    raise exception 'Unsupported assignment override type' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(v_override_types) as override_type
    where override_type <> all(array['availability', 'capacity', 'expertise', 'second_slot']::text[])
  ) then
    raise exception 'Unsupported assignment override type' using errcode = '22023';
  end if;
  if pg_catalog.cardinality(v_override_types) > 0 and v_override_reason is null then
    raise exception 'Override reason is required when overrides are used' using errcode = '22023';
  end if;
  if pg_catalog.cardinality(v_override_types) = 0 then
    v_override_reason := null;
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'semesterId', p_semester_id,
    'sessionDateId', p_session_date_id,
    'timeSlot', p_time_slot,
    'startupSemesterId', p_startup_semester_id,
    'mentorProfileId', p_mentor_profile_id,
    'format', v_format,
    'topic', nullif(pg_catalog.btrim(p_topic), ''),
    'overrideTypes', pg_catalog.to_jsonb(v_override_types),
    'overrideReason', v_override_reason,
    'rankingContext', p_ranking_context
  );
  v_fingerprint := pg_catalog.md5(v_payload::text);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_semester_id::text || ':assignment-key:' || v_key, 0)
  );

  select request.*
  into v_existing_request
  from public.mentor_assignment_requests as request
  where request.semester_id = p_semester_id
    and request.idempotency_key = v_key;

  if found then
    if v_existing_request.request_fingerprint <> v_fingerprint then
      raise exception 'Idempotency key is already bound to a different assignment' using errcode = '23505';
    end if;
    if v_existing_request.session_id is null then
      raise exception 'Assignment request is incomplete' using errcode = '40001';
    end if;
    select audit.id
    into v_existing_audit_id
    from public.mentor_assignment_audit as audit
    where audit.request_id = v_existing_request.id;
    return pg_catalog.jsonb_build_object(
      'sessionId', v_existing_request.session_id,
      'requestId', v_existing_request.id,
      'auditId', v_existing_audit_id,
      'replayed', true
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_semester_id::text || ':assignment-slot:' || p_session_date_id::text || ':' || p_time_slot,
      0
    )
  );

  if not exists (
    select 1 from public.session_dates as session_date
    where session_date.id = p_session_date_id
      and session_date.semester_id = p_semester_id
  ) then
    raise exception 'Session date must belong to the target semester' using errcode = '22023';
  end if;

  select membership.id, mentor_semester.capacity
  into v_mentor_membership_id, v_capacity
  from public.semester_memberships as membership
  join public.mentor_semesters as mentor_semester
    on mentor_semester.semester_membership_id = membership.id
   and mentor_semester.semester_id = membership.semester_id
  join public.mentor_profiles as mentor_profile
    on mentor_profile.profile_id = membership.profile_id
  where membership.semester_id = p_semester_id
    and membership.profile_id = p_mentor_profile_id
    and membership.role = 'mentor'
    and membership.status = 'active';

  if v_mentor_membership_id is null then
    raise exception 'Mentor must have an active membership in the target semester' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.startup_semesters as startup_semester
    join public.startup_team_memberships as team
      on team.startup_semester_id = startup_semester.id
     and team.semester_id = startup_semester.semester_id
    join public.semester_memberships as membership
      on membership.id = team.semester_membership_id
     and membership.semester_id = team.semester_id
    where startup_semester.id = p_startup_semester_id
      and startup_semester.semester_id = p_semester_id
      and membership.role = 'startup'
      and membership.status = 'active'
  ) then
    raise exception 'Startup must have an active membership in the target semester' using errcode = '22023';
  end if;

  select mentor.id
  into v_mentor_id
  from public.mentors as mentor
  where mentor.semester_id = p_semester_id
    and mentor.user_id = p_mentor_profile_id
    and mentor.is_active
  order by mentor.id
  limit 1;
  if v_mentor_id is null then
    raise exception 'No active schedule mentor exists for this semester membership' using errcode = '22023';
  end if;

  select startup.id
  into v_startup_id
  from public.startup_team_memberships as team
  join public.semester_memberships as membership
    on membership.id = team.semester_membership_id
   and membership.semester_id = team.semester_id
  join public.startups as startup
    on startup.user_id = membership.profile_id
   and startup.semester_id = membership.semester_id
  where team.startup_semester_id = p_startup_semester_id
    and team.semester_id = p_semester_id
    and membership.status = 'active'
    and startup.is_active
  order by team.is_primary_contact desc, startup.id
  limit 1;
  if v_startup_id is null then
    raise exception 'No active schedule startup exists for this semester membership' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.sessions as session
    where session.semester_id = p_semester_id
      and session.session_date_id = p_session_date_id
      and session.time_slot = p_time_slot
      and session.mentor_id = v_mentor_id
      and session.status <> 'declined'
  ) then
    raise exception 'Mentor is already assigned in this slot' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.sessions as session
    where session.semester_id = p_semester_id
      and session.session_date_id = p_session_date_id
      and session.time_slot = p_time_slot
      and session.startup_id = v_startup_id
      and session.status <> 'declined'
  ) then
    raise exception 'Startup already has an assignment in this slot' using errcode = '23505';
  end if;
  if not ('second_slot' = any(v_override_types)) and exists (
    select 1 from public.sessions as session
    where session.semester_id = p_semester_id
      and session.session_date_id = p_session_date_id
      and session.time_slot <> p_time_slot
      and session.startup_id = v_startup_id
      and session.mentor_id = v_mentor_id
      and session.status <> 'declined'
  ) then
    raise exception 'Second slot must use a different mentor unless overridden' using errcode = '23505';
  end if;

  if not ('availability' = any(v_override_types)) and exists (
    select 1 from public.availability as availability
    where availability.user_id = p_mentor_profile_id
      and availability.session_date_id = p_session_date_id
      and not availability.is_available
  ) then
    raise exception 'Mentor is unavailable for this date; availability override required' using errcode = '23514';
  end if;

  select pg_catalog.count(*)::integer
  into v_assignment_count
  from public.sessions as session
  join public.mentors as mentor on mentor.id = session.mentor_id
  where session.semester_id = p_semester_id
    and mentor.user_id = p_mentor_profile_id
    and session.status <> 'declined';
  if v_assignment_count >= v_capacity and not ('capacity' = any(v_override_types)) then
    raise exception 'Mentor capacity has been reached; capacity override required' using errcode = '23514';
  end if;

  select
    pg_catalog.cardinality(startup_semester.mentorship_needs || startup_semester.preferred_expertise_tags) = 0
    or mentor_profile.expertise_tags && (startup_semester.mentorship_needs || startup_semester.preferred_expertise_tags)
  into v_has_expertise_match
  from public.mentor_profiles as mentor_profile
  cross join public.startup_semesters as startup_semester
  where mentor_profile.profile_id = p_mentor_profile_id
    and startup_semester.id = p_startup_semester_id;
  if not coalesce(v_has_expertise_match, false) and not ('expertise' = any(v_override_types)) then
    raise exception 'Mentor expertise does not match startup needs; expertise override required' using errcode = '23514';
  end if;

  insert into public.mentor_assignment_requests (
    semester_id, actor_profile_id, session_date_id, time_slot,
    startup_semester_id, mentor_profile_id, idempotency_key,
    request_fingerprint, request_payload
  ) values (
    p_semester_id, v_actor_id, p_session_date_id, p_time_slot,
    p_startup_semester_id, p_mentor_profile_id, v_key,
    v_fingerprint, v_payload
  ) returning id into v_request_id;

  insert into public.sessions (
    startup_id, mentor_id, session_date_id, semester_id, topic,
    status, time_slot, format, startup_absent, is_confirmed, confirmed_at
  ) values (
    v_startup_id, v_mentor_id, p_session_date_id, p_semester_id,
    nullif(pg_catalog.btrim(p_topic), ''),
    'confirmed', p_time_slot, v_format, false, true, pg_catalog.now()
  ) returning id into v_session_id;

  insert into public.mentor_assignment_audit (
    semester_id, request_id, session_id, actor_profile_id, session_date_id,
    time_slot, startup_semester_id, mentor_profile_id, override_types,
    override_reason, ranking_context, idempotency_key
  ) values (
    p_semester_id, v_request_id, v_session_id, v_actor_id, p_session_date_id,
    p_time_slot, p_startup_semester_id, p_mentor_profile_id, v_override_types,
    v_override_reason, p_ranking_context, v_key
  ) returning id into v_audit_id;

  update public.mentor_assignment_requests
  set session_id = v_session_id
  where id = v_request_id;

  return pg_catalog.jsonb_build_object(
    'sessionId', v_session_id,
    'requestId', v_request_id,
    'auditId', v_audit_id,
    'replayed', false
  );
end;
$$;

revoke execute on function public.commit_mentor_assignment(
  uuid, uuid, text, uuid, uuid, text, text, text, text[], text, jsonb
) from public, anon;
grant execute on function public.commit_mentor_assignment(
  uuid, uuid, text, uuid, uuid, text, text, text, text[], text, jsonb
) to authenticated;
