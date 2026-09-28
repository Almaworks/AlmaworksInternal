set local check_function_bodies = off;

create or replace function public.discard_replacement_auth_placeholder (
  p_profile_id   uuid,
  p_auth_user_id uuid
)
  returns table (
    profile_id            uuid,
    auth_user_id          uuid,
    placeholder_discarded boolean
  )
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  v_actor_profile_id uuid := private.current_profile_id();
  v_retained_auth_user_id uuid;
  v_retained_email text;
  v_retained_is_active boolean;
  v_auth_email text;
  v_placeholder_profile_id uuid;
  v_placeholder_auth_user_id uuid;
  v_placeholder_email text;
  v_placeholder_role public.user_role;
  v_placeholder_status text;
  v_placeholder_is_active boolean;
  v_placeholder_semester_id uuid;
  v_placeholder_created_at timestamptz;
  v_placeholder_updated_at timestamptz;
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
    raise exception 'You cannot discard a replacement placeholder for your own login identity' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.platform_roles platform_role
    where platform_role.profile_id = p_profile_id
  ) then
    raise exception 'Platform role holders cannot have replacement placeholders discarded' using errcode = '42501';
  end if;
  if v_retained_auth_user_id is not null or v_retained_is_active then
    raise exception 'Retained profile must be unlinked and disabled' using errcode = '55000';
  end if;

  perform membership.id
  from public.semester_memberships membership
  where membership.profile_id = p_profile_id
  order by membership.id
  for update;

  if not found then
    raise exception 'Retained profile must have at least one semester membership' using errcode = '55000';
  end if;

  select auth_user.email
  into v_auth_email
  from auth.users auth_user
  where auth_user.id = p_auth_user_id
  for update;

  if not found then
    raise exception 'Replacement Auth user not found' using errcode = 'P0002';
  end if;
  if lower(btrim(v_retained_email)) is distinct from lower(btrim(v_auth_email)) then
    raise exception 'Replacement email does not match the retained profile' using errcode = '22023';
  end if;

  select
    profile.id,
    profile.auth_user_id,
    profile.email,
    profile.role,
    profile.status,
    profile.is_active,
    profile.semester_id,
    profile.created_at,
    profile.updated_at
  into
    v_placeholder_profile_id,
    v_placeholder_auth_user_id,
    v_placeholder_email,
    v_placeholder_role,
    v_placeholder_status,
    v_placeholder_is_active,
    v_placeholder_semester_id,
    v_placeholder_created_at,
    v_placeholder_updated_at
  from public.profiles profile
  where profile.id = p_auth_user_id
  for update;

  if not found then
    if exists (
      select 1
      from public.profiles profile
      where profile.auth_user_id = p_auth_user_id
    ) then
      raise exception 'Replacement Auth identity is linked to a non-placeholder profile' using errcode = '55000';
    end if;

    return query
    select p_profile_id, p_auth_user_id, false;
    return;
  end if;

  if v_placeholder_auth_user_id is distinct from p_auth_user_id
    or v_placeholder_role is distinct from 'startup'::public.user_role
    or v_placeholder_status is distinct from 'pending'
    or v_placeholder_is_active is distinct from true
    or v_placeholder_semester_id is not null
    or v_placeholder_created_at is distinct from v_placeholder_updated_at
  then
    raise exception 'Replacement profile is not an untouched Auth-trigger placeholder' using errcode = '55000';
  end if;
  if lower(btrim(v_placeholder_email)) is distinct from lower(btrim(v_auth_email)) then
    raise exception 'Replacement profile email does not match its Auth identity' using errcode = '22023';
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
  where profile.id = v_placeholder_profile_id
    and profile.auth_user_id = p_auth_user_id;

  if not found then
    raise exception 'Replacement placeholder changed during discard' using errcode = 'PT409';
  end if;

  return query
  select p_profile_id, p_auth_user_id, true;
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
    raise exception 'Outreach opportunity is stale' using errcode = 'PT409';
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
    raise exception 'Outreach opportunity is stale' using errcode = 'PT409';
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
    raise exception 'Outreach opportunity is stale' using errcode = 'PT409';
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
    raise exception 'Semester membership is stale' using errcode = 'PT409';
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
    raise exception 'Semester membership is stale' using errcode = 'PT409';
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
    raise exception 'Outreach opportunity is stale' using errcode = 'PT409';
  end if;

  if not public.can_manage_semester(v_opportunity.semester_id, v_actor_id) then
    raise exception 'Not authorized to manage this semester' using errcode = '42501';
  end if;

  if p_expected_updated_at is not null and v_opportunity.updated_at <> p_expected_updated_at then
    raise exception 'Outreach opportunity is stale' using errcode = 'PT409';
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

revoke all on schema "private" from "calendar_sql_internal";

grant usage on schema "private" to "calendar_sql_internal";

revoke all on schema "public" from "calendar_sql_internal";

grant usage on schema "public" to "calendar_sql_internal";
