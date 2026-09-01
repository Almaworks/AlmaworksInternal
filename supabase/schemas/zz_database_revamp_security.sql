-- This file is deliberately last in declarative-schema order. Earlier domain files
-- define policies and functions; this layer closes every implicit Data API grant,
-- then exposes only the operations used by the application.

create schema if not exists private;

-- Function EXECUTE is granted to PUBLIC by PostgreSQL's global built-in
-- defaults. Schema-local defaults cannot subtract that global grant, so close
-- it globally for each role that owns application functions.
alter default privileges for role postgres
  revoke all on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private
  revoke all on functions from public, anon, authenticated, service_role;

alter default privileges for role supabase_admin
  revoke all on functions from public, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public
  revoke all on functions from public, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema private
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema private
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema private
  revoke all on functions from public, anon, authenticated, service_role;

revoke all privileges on all tables in schema public from public, anon, authenticated, service_role;
revoke all privileges on all sequences in schema public from public, anon, authenticated, service_role;
revoke all privileges on all functions in schema public from public, anon, authenticated, service_role;

revoke all privileges on all tables in schema private from public, anon, authenticated, service_role;
revoke all privileges on all sequences in schema private from public, anon, authenticated, service_role;
revoke all privileges on all functions in schema private from public, anon, authenticated, service_role;

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

grant insert (semester_id, meeting_id, semester_membership_id, slot, is_available, source) on table public.meeting_availability to authenticated;
grant insert (semester_id, meeting_id, mentor_semester_id, startup_semester_id, slot, status, topic, format) on table public.sessions to authenticated;
grant insert (full_name, email, linkedin_url, canonical_linkedin_url, phone, biography, created_by) on table public.outreach_contacts to authenticated;
grant insert (name, normalized_name, domain, created_by) on table public.outreach_companies to authenticated;
grant insert (contact_id, company_id, title, is_primary) on table public.outreach_contact_companies to authenticated;
grant insert (semester_id, contact_id, owner_profile_id, stage, relationship_types, source_context, created_by) on table public.outreach_opportunities to authenticated;
grant insert (semester_id, source_name, status, idempotency_key, rows, result, created_by) on table public.outreach_imports to authenticated;

grant update (full_name) on table public.profiles to authenticated;
grant update (onboarding_data, onboarding_started_at, onboarding_completed_at, activated_at, status) on table public.semester_memberships to authenticated;
grant update (goals, mentorship_needs, mentor_need_context, mentor_need_no_preference, preferred_expertise_tags) on table public.startup_semesters to authenticated;
grant update (semester_id, meeting_id, semester_membership_id, slot, is_available, source) on table public.meeting_availability to authenticated;
grant update (status) on table public.sessions to authenticated;
grant update (full_name, email, linkedin_url, phone, biography, expertise_tags, notes) on table public.outreach_contacts to authenticated;
grant update (contact_id, company_id, is_primary) on table public.outreach_contact_companies to authenticated;
grant update (semester_id, contact_id, owner_profile_id, stage, relationship_types, source_context, created_by) on table public.outreach_opportunities to authenticated;
grant update (status, idempotency_key, committed_at, result, updated_at) on table public.outreach_imports to authenticated;

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

grant insert (semester_id, profile_id, role, status) on table public.semester_memberships to service_role;
grant insert (name, slug, description, industry) on table public.startup_organizations to service_role;
grant insert (semester_id, startup_organization_id, stage, preferred_expertise_tags, readiness_status) on table public.startup_semesters to service_role;
grant insert (semester_id, startup_semester_id, semester_membership_id) on table public.startup_team_memberships to service_role;
grant insert (semester_id, meeting_id, mentor_semester_id, startup_semester_id, slot, status, topic, format, startup_absent, substitute_name) on table public.sessions to service_role;

grant update (status) on table public.semester_memberships to service_role;
grant update (mentor_semester_id, startup_semester_id, slot, status, topic, format, startup_absent, substitute_name) on table public.sessions to service_role;

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
