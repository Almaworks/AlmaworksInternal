-- Contract phase. Apply only after run_database_revamp_backfill() reconciles production.

do $$
begin
  if exists (
    select 1 from public.sessions
    where meeting_id is null
       or mentor_semester_id is null
       or startup_semester_id is null
       or slot not in (1, 2)
       or canonical_status not in ('requested', 'confirmed', 'declined', 'cancelled')
  ) then
    raise exception 'Canonical session reconciliation is incomplete';
  end if;
  if exists (select 1 from public.outreach_opportunities where canonical_stage is null or cardinality(relationship_types) = 0) then
    raise exception 'Canonical outreach reconciliation is incomplete';
  end if;
end;
$$;

drop policy if exists "sessions are viewable by participants" on public.sessions;
drop policy if exists "startups can view own sessions" on public.sessions;
drop policy if exists "mentors can view own sessions" on public.sessions;
drop policy if exists "startups can insert session requests" on public.sessions;
drop policy if exists "mentors can update session status" on public.sessions;
drop policy if exists "admins can manage all sessions" on public.sessions;

alter table public.sessions drop constraint if exists sessions_mentor_id_fkey;
alter table public.sessions drop constraint if exists sessions_startup_id_fkey;
alter table public.sessions drop constraint if exists sessions_session_date_id_fkey;
alter table public.sessions drop column if exists mentor_id;
alter table public.sessions drop column if exists startup_id;
alter table public.sessions drop column if exists session_date_id;
alter table public.sessions drop column if exists session_date;
alter table public.sessions drop column if exists time_slot;
alter table public.sessions drop column if exists is_confirmed;
alter table public.sessions rename column status to legacy_status;
alter table public.sessions rename column canonical_status to status;
alter table public.sessions drop column legacy_status;
alter table public.sessions alter column meeting_id set not null;
alter table public.sessions alter column mentor_semester_id set not null;
alter table public.sessions alter column startup_semester_id set not null;
alter table public.sessions alter column slot set not null;
alter table public.sessions alter column status set not null;
alter table public.sessions alter column status set default 'requested';
alter table public.sessions add constraint sessions_slot_check check (slot in (1, 2));
alter table public.sessions add constraint sessions_status_check check (status in ('requested', 'confirmed', 'declined', 'cancelled'));
alter table public.sessions add constraint sessions_semester_meeting_fkey foreign key (semester_id, meeting_id) references public.meetings(semester_id, id);
alter table public.sessions add constraint sessions_semester_mentor_fkey foreign key (semester_id, mentor_semester_id) references public.mentor_semesters(semester_id, id);
alter table public.sessions add constraint sessions_semester_startup_fkey foreign key (semester_id, startup_semester_id) references public.startup_semesters(semester_id, id);
create unique index sessions_active_mentor_slot_key on public.sessions(meeting_id, slot, mentor_semester_id) where status <> 'cancelled';
create unique index sessions_active_startup_slot_key on public.sessions(meeting_id, slot, startup_semester_id) where status <> 'cancelled';

alter table public.outreach_opportunities drop constraint if exists outreach_opportunities_converted_mentor_profile_id_fkey;
alter table public.outreach_opportunities drop constraint if exists outreach_opportunities_converted_startup_semester_id_fkey;
alter table public.outreach_opportunities drop constraint if exists outreach_opportunities_semester_id_source_import_job_id_fkey;
alter table public.outreach_opportunities drop column if exists converted_mentor_profile_id;
alter table public.outreach_opportunities drop column if exists converted_startup_semester_id;
alter table public.outreach_opportunities drop column if exists conversion_details;
alter table public.outreach_opportunities drop column if exists source_import_job_id;
alter table public.outreach_opportunities drop column if exists notes;
drop trigger if exists validate_outreach_owner_membership on public.outreach_opportunities;
alter table public.outreach_opportunities rename column stage to legacy_stage;
alter table public.outreach_opportunities rename column canonical_stage to stage;
alter table public.outreach_opportunities drop column legacy_stage;
alter table public.outreach_opportunities alter column stage set not null;
alter table public.outreach_opportunities alter column stage set default 'not_contacted';
alter table public.outreach_opportunities add constraint outreach_opportunities_stage_check check (stage in ('not_contacted', 'researching', 'contacted', 'replied', 'conversation_scheduled', 'ready', 'declined', 'closed'));
alter table public.outreach_opportunities add constraint outreach_opportunities_relationship_types_check check (cardinality(relationship_types) > 0);
create unique index if not exists outreach_opportunities_semester_contact_key on public.outreach_opportunities(semester_id, contact_id);
create trigger validate_canonical_outreach_owner_membership
before insert or update of semester_id, owner_profile_id, stage on public.outreach_opportunities
for each row execute function private.validate_outreach_owner_membership();

alter table public.outreach_activities drop constraint if exists outreach_activities_semester_id_import_job_id_fkey;
alter table public.outreach_activities drop column if exists import_job_id;

drop table public.access_requests cascade;
drop table public.availability cascade;
drop table public.availability_windows cascade;
drop table public.invitation_delivery_attempts cascade;
drop table public.lifecycle_audit_events cascade;
drop table public.lifecycle_configuration_templates cascade;
drop table public.mentor_assignment_audit cascade;
drop table public.mentor_assignment_requests cascade;
drop table public.mentors cascade;
drop table public.onboarding_progress cascade;
drop table public.outreach cascade;
drop table public.outreach_activity_log cascade;
drop table public.outreach_import_rows cascade;
drop table public.outreach_import_jobs cascade;
drop table public.outreach_opportunity_labels cascade;
drop table public.outreach_relationship_labels cascade;
drop table public.session_dates cascade;
drop table public.startups cascade;

alter table public.semester_memberships drop constraint if exists semester_memberships_semester_id_profile_id_role_key;
alter table public.semester_memberships add constraint semester_memberships_semester_profile_key unique (semester_id, profile_id);

create policy "sessions visible to semester participants" on public.sessions
for select to authenticated
using (
  private.can_manage_semester(semester_id, auth.uid())
  or exists (
    select 1 from public.mentor_semesters mentor_term
    join public.semester_memberships membership on membership.id = mentor_term.semester_membership_id
    where mentor_term.id = sessions.mentor_semester_id and membership.profile_id = auth.uid()
  )
  or exists (
    select 1 from public.startup_team_memberships team
    join public.semester_memberships membership on membership.id = team.semester_membership_id
    where team.startup_semester_id = sessions.startup_semester_id and membership.profile_id = auth.uid()
  )
);

create policy "admins manage sessions" on public.sessions
for all to authenticated
using (private.can_manage_semester(semester_id, auth.uid()))
with check (private.can_manage_semester(semester_id, auth.uid()));

create policy "mentors respond to own sessions" on public.sessions
for update to authenticated
using (
  exists (
    select 1 from public.mentor_semesters mentor_term
    join public.semester_memberships membership on membership.id = mentor_term.semester_membership_id
    where mentor_term.id = sessions.mentor_semester_id and membership.profile_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.mentor_semesters mentor_term
    join public.semester_memberships membership on membership.id = mentor_term.semester_membership_id
    where mentor_term.id = sessions.mentor_semester_id and membership.profile_id = auth.uid()
  )
);

create policy "startups request sessions" on public.sessions
for insert to authenticated
with check (
  exists (
    select 1 from public.startup_team_memberships team
    join public.semester_memberships membership on membership.id = team.semester_membership_id
    where team.startup_semester_id = sessions.startup_semester_id and membership.profile_id = auth.uid()
  )
);

create or replace function public.carry_forward_outreach_contacts(
  p_source_semester_id uuid,
  p_target_semester_id uuid,
  p_contact_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare inserted_count integer;
begin
  if auth.uid() is null
    or not private.can_manage_semester(p_source_semester_id, auth.uid())
    or not private.can_manage_semester(p_target_semester_id, auth.uid()) then
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

create or replace function public.reset_outreach_opportunities(
  p_semester_id uuid,
  p_opportunity_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare reset_count integer;
begin
  if auth.uid() is null or not private.can_manage_semester(p_semester_id, auth.uid()) then
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

revoke execute on function public.carry_forward_outreach_contacts(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.carry_forward_outreach_contacts(uuid, uuid, uuid[]) to authenticated;
revoke execute on function public.reset_outreach_opportunities(uuid, uuid[]) from public, anon;
grant execute on function public.reset_outreach_opportunities(uuid, uuid[]) to authenticated;

drop function public.run_database_revamp_backfill();
