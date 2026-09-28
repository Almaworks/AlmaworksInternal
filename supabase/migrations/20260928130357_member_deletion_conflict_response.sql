set local check_function_bodies = off;

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
$function$;

revoke all on schema "private" from "calendar_sql_internal";

grant usage on schema "private" to "calendar_sql_internal";

revoke all on schema "public" from "calendar_sql_internal";

grant usage on schema "public" to "calendar_sql_internal";
