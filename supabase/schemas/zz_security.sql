-- Final-deny security boundary. This file must compose after canonical_schema.sql.
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

revoke all privileges on all tables in schema public from public, anon, authenticated, service_role;
revoke all privileges on all sequences in schema public from public, anon, authenticated, service_role;
revoke all privileges on all functions in schema public from public, anon, authenticated, service_role;
revoke all privileges on all tables in schema private from public, anon, authenticated, service_role;
revoke all privileges on all sequences in schema private from public, anon, authenticated, service_role;
revoke all privileges on all functions in schema private from public, anon, authenticated, service_role;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;

grant select on table
  public.semesters, public.profiles, public.platform_roles,
  public.semester_memberships, public.invitations, public.mentor_profiles,
  public.mentor_semesters, public.startup_organizations, public.startup_semesters,
  public.startup_team_memberships, public.meetings, public.meeting_availability, public.schedule_attention_alerts,
  public.sessions, public.session_rsvps, public.outreach_contacts, public.outreach_companies,
  public.outreach_contact_companies, public.outreach_opportunities,
  public.outreach_activities, public.outreach_imports
to authenticated;

grant insert (semester_id, meeting_id, semester_membership_id, slot, is_available, format, source) on table public.meeting_availability to authenticated;
grant insert (semester_id, meeting_id, mentor_semester_id, startup_semester_id, slot, status, topic, format) on table public.sessions to authenticated;
grant insert (semester_id, session_id, semester_membership_id, response) on table public.session_rsvps to authenticated;
grant insert (semester_id, source_name, status, idempotency_key, rows, result, created_by) on table public.outreach_imports to authenticated;
grant update (full_name) on table public.profiles to authenticated;
grant update (goals, mentorship_needs, mentor_need_context, mentor_need_no_preference, company_snapshot) on table public.startup_semesters to authenticated;
grant update (semester_id, meeting_id, semester_membership_id, slot, is_available, format, source) on table public.meeting_availability to authenticated;
grant update (status) on table public.sessions to authenticated;
grant update (response) on table public.session_rsvps to authenticated;
grant update (full_name, email, linkedin_url, phone, biography, expertise_tags, notes) on table public.outreach_contacts to authenticated;
grant update (contact_id, company_id, is_primary) on table public.outreach_contact_companies to authenticated;
grant update (semester_id, contact_id, owner_profile_id, stage, relationship_types, source_context, created_by) on table public.outreach_opportunities to authenticated;
grant update (status, idempotency_key, committed_at, result, updated_at) on table public.outreach_imports to authenticated;
grant delete on table public.meeting_availability to authenticated;

grant select on table public.profiles, public.semester_memberships,
  public.mentor_profiles, public.mentor_semesters, public.startup_organizations,
  public.startup_semesters, public.startup_team_memberships, public.meetings,
  public.sessions to service_role;
grant insert (semester_id, profile_id, role, status) on table public.semester_memberships to service_role;
grant insert (semester_id, meeting_date, label) on table public.meetings to service_role;
grant insert (name, slug, description, industry) on table public.startup_organizations to service_role;
grant insert (semester_id, startup_organization_id, stage, readiness_status) on table public.startup_semesters to service_role;
grant insert (semester_id, startup_semester_id, semester_membership_id) on table public.startup_team_memberships to service_role;
grant insert (semester_id, meeting_id, mentor_semester_id, startup_semester_id, slot, status, topic, format, startup_absent, substitute_name) on table public.sessions to service_role;
grant update (status) on table public.semester_memberships to service_role;
grant update (status) on table public.profiles to service_role;
grant update (mentor_semester_id, startup_semester_id, slot, status, topic, format, startup_absent, substitute_name) on table public.sessions to service_role;
grant delete on table public.startup_team_memberships, public.sessions to service_role;

grant execute on function private.is_super_admin(uuid) to authenticated;
grant execute on function private.current_profile_id(uuid) to authenticated;
grant execute on function private.has_semester_role(uuid,public.user_role[],uuid) to authenticated;
grant execute on function private.can_manage_semester(uuid,uuid) to authenticated;
grant execute on function public.delete_startup_permanently(uuid,text) to authenticated;
grant execute on function private.can_read_outreach_relationship_labels(uuid) to authenticated;
grant execute on function private.has_outreach_contact_access(uuid,uuid) to authenticated;
grant execute on function private.has_outreach_company_access(uuid,uuid) to authenticated;
grant execute on function private.can_read_mentor_profile(uuid,uuid) to authenticated;
grant execute on function private.can_read_session_rsvp(uuid,uuid,uuid) to authenticated;
grant execute on function private.can_read_session_participant(uuid,uuid,uuid) to authenticated;
grant execute on function private.can_write_session_rsvp(uuid,uuid,uuid,uuid) to authenticated;

grant execute on function public.activate_semester_transition(uuid,uuid) to authenticated;
grant execute on function public.authorize_semester_member_identity_update(uuid,uuid) to authenticated;
grant execute on function public.bulk_set_membership_activity(uuid,uuid[],boolean) to authenticated;
grant execute on function public.can_manage_any_outreach(uuid) to authenticated;
grant execute on function public.can_manage_semester(uuid,uuid) to authenticated;
grant execute on function public.carry_forward_outreach_contacts(uuid,uuid,uuid[]) to authenticated;
grant execute on function public.commit_mentor_assignment(uuid,uuid,smallint,uuid,uuid,text,text,text,text[],text,jsonb) to authenticated;
revoke all on function public.commit_mentor_assignment(uuid,uuid,smallint,uuid,uuid,text,text,text,text[],text,jsonb) from anon;
grant execute on function public.create_semester_draft(uuid,text,date,date,jsonb) to authenticated;
grant execute on function public.import_prior_semester_memberships(uuid,uuid,uuid[]) to authenticated;
grant execute on function public.log_outreach_activity(uuid,public.outreach_activity_kind,timestamptz,public.outreach_channel,text,jsonb,timestamptz,public.outreach_stage,timestamptz) to authenticated;
grant execute on function public.move_startup_team_membership(uuid,uuid,uuid) to authenticated;
grant execute on function public.release_inactive_owner_work(uuid) to authenticated;
grant execute on function public.replace_draft_meetings(uuid,jsonb) to authenticated;
grant execute on function public.reset_outreach_opportunities(uuid,uuid[]) to authenticated;
grant execute on function public.set_outreach_silence(uuid,boolean,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.set_outreach_snooze(uuid,timestamptz,text,timestamptz) to authenticated;
grant execute on function public.set_platform_super_admin(uuid,boolean) to authenticated;
grant execute on function public.set_mentor_account_access(uuid,boolean) to authenticated;
grant execute on function public.save_mentor_meeting_availability(uuid,jsonb) to authenticated;
grant execute on function public.suspend_outreach_membership(uuid,uuid,text,timestamptz) to authenticated;
grant execute on function public.transfer_outreach_owner(uuid,uuid,text,timestamptz) to authenticated;
grant execute on function public.update_own_onboarding_progress(uuid,uuid,jsonb,boolean) to authenticated;
grant execute on function public.update_startup_records(uuid,text,text,text,text,text,text[],text[]) to authenticated;
grant execute on function public.upsert_outreach_contact_bundle(uuid,uuid,text,text,text,text,text,uuid,text,text,text,text,uuid,text,text[],jsonb) to authenticated;

grant execute on function public.create_mentor_records(uuid,uuid,uuid,text,text,text,text[],boolean,text,text,text,text,text) to service_role;
grant execute on function public.set_semester_member_access(uuid,uuid,uuid,public.user_role,boolean,text,text) to service_role;
grant execute on function public.update_mentor_records(uuid,uuid,jsonb) to service_role;
