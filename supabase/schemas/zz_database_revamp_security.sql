-- This file is deliberately last in declarative-schema order. Earlier domain files
-- define policies and functions; this layer closes every implicit Data API grant,
-- then exposes only the operations used by the application.

create schema if not exists private;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

revoke all privileges on all tables in schema public from public, anon, authenticated, service_role;
revoke all privileges on all sequences in schema public from public, anon, authenticated, service_role;
revoke execute on all functions in schema public from public, anon, authenticated, service_role;

revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;

-- Authenticated Data API reads. program_audit_events is intentionally RPC-only.
grant select on table
  public.semesters,
  public.profiles,
  public.platform_roles,
  public.semester_memberships,
  public.invitations,
  public.mentor_profiles,
  public.mentor_semesters,
  public.startup_organizations,
  public.startup_semesters,
  public.startup_team_memberships,
  public.meetings,
  public.meeting_availability,
  public.sessions,
  public.outreach_contacts,
  public.outreach_companies,
  public.outreach_contact_companies,
  public.outreach_opportunities,
  public.outreach_activities,
  public.outreach_imports
to authenticated;

grant insert on table
  public.meetings,
  public.meeting_availability,
  public.sessions,
  public.outreach_contacts,
  public.outreach_companies,
  public.outreach_contact_companies,
  public.outreach_opportunities,
  public.outreach_imports
to authenticated;

grant update on table
  public.profiles,
  public.semester_memberships,
  public.startup_semesters,
  public.meetings,
  public.meeting_availability,
  public.sessions,
  public.outreach_contacts,
  public.outreach_opportunities,
  public.outreach_imports
to authenticated;

grant delete on table public.meeting_availability to authenticated;

-- The service key is used only in server routes that provision identities and
-- perform administrator-owned startup/session writes.
grant select on table
  public.profiles,
  public.semester_memberships,
  public.startup_organizations,
  public.startup_semesters,
  public.startup_team_memberships,
  public.sessions
to service_role;

grant insert on table
  public.semester_memberships,
  public.startup_organizations,
  public.startup_semesters,
  public.startup_team_memberships,
  public.sessions
to service_role;

grant update on table
  public.semester_memberships,
  public.startup_team_memberships,
  public.sessions
to service_role;

grant delete on table
  public.startup_team_memberships,
  public.sessions
to service_role;

-- Policy helpers are callable by policies but are outside the exposed schema.
grant execute on function private.is_super_admin(uuid) to authenticated;
grant execute on function private.has_semester_role(uuid,public.user_role[],uuid) to authenticated;
grant execute on function private.can_manage_semester(uuid,uuid) to authenticated;
grant execute on function private.can_read_outreach_relationship_labels(uuid) to authenticated;
grant execute on function private.has_outreach_contact_access(uuid,uuid) to authenticated;
grant execute on function private.has_outreach_company_access(uuid,uuid) to authenticated;

-- Authenticated commands. Every function performs its own actor/semester check.
grant execute on function public.activate_semester_transition(uuid,uuid) to authenticated;
grant execute on function public.authorize_semester_member_identity_update(uuid,uuid) to authenticated;
grant execute on function public.bulk_set_membership_activity(uuid,uuid[],boolean) to authenticated;
grant execute on function public.can_manage_any_outreach(uuid) to authenticated;
grant execute on function public.can_manage_semester(uuid,uuid) to authenticated;
grant execute on function public.carry_forward_outreach_contacts(uuid,uuid,uuid[]) to authenticated;
grant execute on function public.commit_mentor_assignment(uuid,uuid,smallint,uuid,uuid,text,text,text,text[],text,jsonb) to authenticated;
grant execute on function public.create_semester_draft(uuid,text,date,date,jsonb) to authenticated;
grant execute on function public.import_prior_semester_memberships(uuid,uuid,uuid[]) to authenticated;
grant execute on function public.log_outreach_activity(uuid,public.outreach_activity_kind,timestamptz,public.outreach_channel,text,jsonb,timestamptz,public.outreach_stage,timestamptz) to authenticated;
grant execute on function public.move_startup_team_membership(uuid,uuid,uuid) to authenticated;
grant execute on function public.release_inactive_owner_work(uuid) to authenticated;
grant execute on function public.replace_draft_meetings(uuid,jsonb) to authenticated;
grant execute on function public.reset_outreach_opportunities(uuid,uuid[]) to authenticated;
grant execute on function public.set_outreach_silence(uuid,boolean,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.set_outreach_snooze(uuid,timestamptz,text,timestamptz) to authenticated;
grant execute on function public.suspend_outreach_membership(uuid,uuid,text,timestamptz) to authenticated;
grant execute on function public.transfer_outreach_owner(uuid,uuid,text,timestamptz) to authenticated;
grant execute on function public.update_startup_records(uuid,text,text,text,text,text,text[],text[]) to authenticated;

-- Identity-bearing mutations are only called from authenticated server routes
-- after the application has established the actor identity.
grant execute on function public.create_mentor_records(uuid,uuid,uuid,text,text,text,text[],boolean,text,text,text,text,text) to service_role;
grant execute on function public.set_semester_member_access(uuid,uuid,uuid,public.user_role,boolean,text,text) to service_role;
grant execute on function public.update_mentor_records(uuid,uuid,jsonb) to service_role;
