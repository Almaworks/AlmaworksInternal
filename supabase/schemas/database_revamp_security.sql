revoke all privileges on table
  public.semesters, public.profiles, public.platform_roles, public.semester_memberships,
  public.invitations, public.mentor_profiles, public.mentor_semesters,
  public.startup_organizations, public.startup_semesters, public.startup_team_memberships,
  public.meetings, public.meeting_availability, public.sessions, public.program_audit_events,
  public.outreach_contacts, public.outreach_companies, public.outreach_contact_companies,
  public.outreach_opportunities, public.outreach_activities, public.outreach_imports,
  public.mentors, public.startups, public.session_dates, public.availability
from public, anon;

grant select, insert, update, delete on table
  public.semesters, public.profiles, public.platform_roles, public.semester_memberships,
  public.invitations, public.mentor_profiles, public.mentor_semesters,
  public.startup_organizations, public.startup_semesters, public.startup_team_memberships,
  public.meetings, public.meeting_availability, public.sessions, public.program_audit_events,
  public.outreach_contacts, public.outreach_companies, public.outreach_contact_companies,
  public.outreach_opportunities, public.outreach_activities, public.outreach_imports,
  public.mentors, public.startups, public.session_dates, public.availability
to authenticated;

alter function public.update_updated_at() set search_path = '';
alter function public.set_updated_at() set search_path = '';

revoke execute on function public.activate_semester_transition(uuid,uuid) from public,anon;
revoke execute on function public.authorize_semester_member_identity_update(uuid,uuid) from public,anon;
revoke execute on function public.bulk_set_membership_activity(uuid,uuid[],boolean) from public,anon;
revoke execute on function public.can_manage_any_outreach(uuid) from public,anon;
revoke execute on function public.can_manage_semester(uuid,uuid) from public,anon;
revoke execute on function public.can_read_outreach_relationship_labels(uuid) from public,anon;
revoke execute on function public.carry_forward_outreach_contacts(uuid,uuid,uuid[]) from public,anon;
revoke execute on function public.commit_mentor_assignment(uuid,uuid,text,uuid,uuid,text,text,text,text[],text,jsonb) from public,anon;
revoke execute on function public.create_mentor_records(uuid,uuid,uuid,text,text,text,text[],boolean,text,text,text,text,text) from public,anon,authenticated;
revoke execute on function public.create_semester_draft(uuid,text,date,date,jsonb) from public,anon;
revoke execute on function public.get_my_role() from public,anon;
revoke execute on function public.handle_new_user() from public,anon;
revoke execute on function public.has_outreach_company_access(uuid,uuid) from public,anon;
revoke execute on function public.has_outreach_contact_access(uuid,uuid) from public,anon;
revoke execute on function public.has_semester_role(uuid,public.user_role[],uuid) from public,anon;
revoke execute on function public.import_prior_semester_memberships(uuid,uuid,uuid[]) from public,anon;
revoke execute on function public.is_super_admin(uuid) from public,anon;
revoke execute on function public.log_outreach_activity(uuid,public.outreach_activity_kind,timestamptz,public.outreach_channel,text,jsonb,timestamptz,public.outreach_stage,timestamptz) from public,anon;
revoke execute on function public.move_startup_team_membership(uuid,uuid,uuid) from public,anon;
revoke execute on function public.mentors_view_write() from public,anon;
revoke execute on function public.release_inactive_owner_work(uuid) from public,anon;
revoke execute on function public.replace_draft_session_dates(uuid,jsonb) from public,anon;
revoke execute on function public.reset_outreach_opportunities(uuid,uuid[]) from public,anon;
revoke execute on function public.set_outreach_silence(uuid,boolean,text,timestamptz,timestamptz) from public,anon;
revoke execute on function public.set_outreach_snooze(uuid,timestamptz,text,timestamptz) from public,anon;
revoke execute on function public.set_platform_super_admin(uuid,boolean) from public,anon;
revoke execute on function public.set_semester_member_access(uuid,uuid,uuid,public.user_role,boolean,text,text) from public,anon,authenticated;
revoke execute on function public.startups_view_write() from public,anon;
revoke execute on function public.suspend_outreach_membership(uuid,uuid,text,timestamptz) from public,anon;
revoke execute on function public.transfer_outreach_owner(uuid,uuid,text,timestamptz) from public,anon;
revoke execute on function public.update_startup_records(uuid,text,text,text,text,text,text[],text[]) from public,anon;
revoke execute on function public.update_mentor_records(uuid,uuid,jsonb) from public,anon,authenticated;
revoke execute on function public.validate_outreach_owner_membership() from public,anon;

grant execute on function public.activate_semester_transition(uuid,uuid), public.bulk_set_membership_activity(uuid,uuid[],boolean),
  public.can_manage_any_outreach(uuid), public.can_manage_semester(uuid,uuid), public.carry_forward_outreach_contacts(uuid,uuid,uuid[]),
  public.commit_mentor_assignment(uuid,uuid,text,uuid,uuid,text,text,text,text[],text,jsonb), public.create_semester_draft(uuid,text,date,date,jsonb),
  public.get_my_role(), public.has_outreach_company_access(uuid,uuid), public.has_outreach_contact_access(uuid,uuid),
  public.has_semester_role(uuid,public.user_role[],uuid), public.import_prior_semester_memberships(uuid,uuid,uuid[]), public.is_super_admin(uuid),
  public.log_outreach_activity(uuid,public.outreach_activity_kind,timestamptz,public.outreach_channel,text,jsonb,timestamptz,public.outreach_stage,timestamptz),
  public.release_inactive_owner_work(uuid), public.replace_draft_session_dates(uuid,jsonb), public.reset_outreach_opportunities(uuid,uuid[]),
  public.set_outreach_silence(uuid,boolean,text,timestamptz,timestamptz), public.set_outreach_snooze(uuid,timestamptz,text,timestamptz),
  public.suspend_outreach_membership(uuid,uuid,text,timestamptz), public.transfer_outreach_owner(uuid,uuid,text,timestamptz)
to authenticated;

grant execute on function public.move_startup_team_membership(uuid,uuid,uuid),
  public.authorize_semester_member_identity_update(uuid,uuid),
  public.set_platform_super_admin(uuid,boolean),
  public.update_startup_records(uuid,text,text,text,text,text,text[],text[])
to authenticated;

grant execute on function
  public.create_mentor_records(uuid,uuid,uuid,text,text,text,text[],boolean,text,text,text,text,text),
  public.set_semester_member_access(uuid,uuid,uuid,public.user_role,boolean,text,text),
  public.update_mentor_records(uuid,uuid,jsonb)
to service_role;
