-- Canonical RLS policy layer for the 20-table Almaworks schema.
-- Keep this file last: earlier domain files describe their historical policies;
-- this layer replaces them with one permissive policy per table/action.

alter table public.semesters enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_roles enable row level security;
alter table public.semester_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.mentor_profiles enable row level security;
alter table public.mentor_semesters enable row level security;
alter table public.startup_organizations enable row level security;
alter table public.startup_semesters enable row level security;
alter table public.startup_team_memberships enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_availability enable row level security;
alter table public.sessions enable row level security;
alter table public.program_audit_events enable row level security;
alter table public.outreach_contacts enable row level security;
alter table public.outreach_companies enable row level security;
alter table public.outreach_contact_companies enable row level security;
alter table public.outreach_opportunities enable row level security;
alter table public.outreach_activities enable row level security;
alter table public.outreach_imports enable row level security;

-- Remove every policy inherited from the pre-revamp schema. Restrict the
-- catalog query to the canonical manifest so unrelated schemas are untouched.
do $drop_obsolete_policies$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'semesters', 'profiles', 'platform_roles', 'semester_memberships',
        'invitations', 'mentor_profiles', 'mentor_semesters',
        'startup_organizations', 'startup_semesters',
        'startup_team_memberships', 'meetings', 'meeting_availability',
        'sessions', 'program_audit_events', 'outreach_contacts',
        'outreach_companies', 'outreach_contact_companies',
        'outreach_opportunities', 'outreach_activities', 'outreach_imports'
      ])
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$drop_obsolete_policies$;

create policy "authenticated users read semesters" on public.semesters
for select to authenticated
using ((select auth.uid()) is not null);

create policy "program members read profiles" on public.profiles
for select to authenticated
using (
  profiles.id = (select auth.uid())
  or private.is_super_admin((select auth.uid()))
  or exists (
    select 1
    from public.semester_memberships administrator
    where administrator.profile_id = (select auth.uid())
      and administrator.role = 'admin'
      and administrator.status in ('onboarding', 'active')
  )
  or exists (
    select 1
    from public.semester_memberships subject_membership
    join public.semester_memberships viewer_membership
      on viewer_membership.semester_id = subject_membership.semester_id
    where subject_membership.profile_id = profiles.id
      and subject_membership.role = 'mentor'
      and subject_membership.status in ('onboarding', 'active', 'alumni')
      and viewer_membership.profile_id = (select auth.uid())
      and viewer_membership.status in ('onboarding', 'active')
  )
);

create policy "users update their own profile" on public.profiles
for update to authenticated
using (profiles.id = (select auth.uid()))
with check (profiles.id = (select auth.uid()));

create policy "owners or super admins read platform roles" on public.platform_roles
for select to authenticated
using (
  platform_roles.profile_id = (select auth.uid())
  or private.is_super_admin((select auth.uid()))
);

create policy "members read authorized semester memberships" on public.semester_memberships
for select to authenticated
using (
  semester_memberships.profile_id = (select auth.uid())
  or private.can_manage_semester(semester_memberships.semester_id, (select auth.uid()))
  or (
    semester_memberships.role = 'mentor'
    and semester_memberships.status in ('onboarding', 'active', 'alumni')
    and exists (
      select 1
      from public.semesters viewer_semester
      where private.has_semester_role(
        viewer_semester.id,
        array['admin', 'mentor', 'startup']::public.user_role[],
        (select auth.uid())
      )
    )
  )
);

create policy "owners or admins update semester memberships" on public.semester_memberships
for update to authenticated
using (
  semester_memberships.profile_id = (select auth.uid())
  or private.can_manage_semester(semester_memberships.semester_id, (select auth.uid()))
)
with check (
  semester_memberships.profile_id = (select auth.uid())
  or private.can_manage_semester(semester_memberships.semester_id, (select auth.uid()))
);

create policy "semester admins read invitations" on public.invitations
for select to authenticated
using (private.can_manage_semester(invitations.semester_id, (select auth.uid())));

create policy "program members read mentor profiles" on public.mentor_profiles
for select to authenticated
using (
  mentor_profiles.profile_id = (select auth.uid())
  or private.is_super_admin((select auth.uid()))
  or exists (
    select 1
    from public.semester_memberships viewer_membership
    where viewer_membership.profile_id = (select auth.uid())
      and viewer_membership.status in ('onboarding', 'active')
  )
);

create policy "mentors update their own mentor profile" on public.mentor_profiles
for update to authenticated
using (mentor_profiles.profile_id = (select auth.uid()))
with check (mentor_profiles.profile_id = (select auth.uid()));

create policy "program members read mentor semesters" on public.mentor_semesters
for select to authenticated
using (
  private.can_manage_semester(mentor_semesters.semester_id, (select auth.uid()))
  or exists (
    select 1
    from public.semester_memberships mentor_membership
    where mentor_membership.id = mentor_semesters.semester_membership_id
      and mentor_membership.semester_id = mentor_semesters.semester_id
      and (
        mentor_membership.profile_id = (select auth.uid())
        or (
          mentor_membership.role = 'mentor'
          and mentor_membership.status in ('onboarding', 'active', 'alumni')
          and exists (
            select 1
            from public.semester_memberships viewer_membership
            where viewer_membership.profile_id = (select auth.uid())
              and viewer_membership.status in ('onboarding', 'active')
          )
        )
      )
  )
);

create policy "mentors update their own semester profile" on public.mentor_semesters
for update to authenticated
using (
  exists (
    select 1
    from public.semester_memberships mentor_membership
    where mentor_membership.id = mentor_semesters.semester_membership_id
      and mentor_membership.semester_id = mentor_semesters.semester_id
      and mentor_membership.profile_id = (select auth.uid())
      and mentor_membership.status in ('onboarding', 'active')
  )
)
with check (
  exists (
    select 1
    from public.semester_memberships mentor_membership
    where mentor_membership.id = mentor_semesters.semester_membership_id
      and mentor_membership.semester_id = mentor_semesters.semester_id
      and mentor_membership.profile_id = (select auth.uid())
      and mentor_membership.status in ('onboarding', 'active')
  )
);

create policy "cohort members read startup organizations" on public.startup_organizations
for select to authenticated
using (
  exists (
    select 1
    from public.startup_semesters startup_term
    where startup_term.startup_organization_id = startup_organizations.id
      and private.has_semester_role(
        startup_term.semester_id,
        array['admin', 'mentor', 'startup']::public.user_role[],
        (select auth.uid())
      )
  )
);

create policy "cohort members read startup semesters" on public.startup_semesters
for select to authenticated
using (
  private.has_semester_role(
    startup_semesters.semester_id,
    array['admin', 'mentor', 'startup']::public.user_role[],
    (select auth.uid())
  )
);

create policy "startup teams update startup semesters" on public.startup_semesters
for update to authenticated
using (
  private.can_manage_semester(startup_semesters.semester_id, (select auth.uid()))
  or exists (
    select 1
    from public.startup_team_memberships team
    join public.semester_memberships membership
      on membership.id = team.semester_membership_id
    where team.startup_semester_id = startup_semesters.id
      and team.semester_id = startup_semesters.semester_id
      and membership.semester_id = startup_semesters.semester_id
      and membership.profile_id = (select auth.uid())
      and membership.role = 'startup'
      and membership.status in ('onboarding', 'active')
  )
)
with check (
  private.can_manage_semester(startup_semesters.semester_id, (select auth.uid()))
  or exists (
    select 1
    from public.startup_team_memberships team
    join public.semester_memberships membership
      on membership.id = team.semester_membership_id
    where team.startup_semester_id = startup_semesters.id
      and team.semester_id = startup_semesters.semester_id
      and membership.semester_id = startup_semesters.semester_id
      and membership.profile_id = (select auth.uid())
      and membership.role = 'startup'
      and membership.status in ('onboarding', 'active')
  )
);

create policy "owners or admins read startup team memberships" on public.startup_team_memberships
for select to authenticated
using (
  private.can_manage_semester(startup_team_memberships.semester_id, (select auth.uid()))
  or exists (
    select 1
    from public.semester_memberships membership
    where membership.id = startup_team_memberships.semester_membership_id
      and membership.semester_id = startup_team_memberships.semester_id
      and membership.profile_id = (select auth.uid())
  )
);

create policy "cohort members read meetings" on public.meetings
for select to authenticated
using (
  private.has_semester_role(
    meetings.semester_id,
    array['admin', 'mentor', 'startup']::public.user_role[],
    (select auth.uid())
  )
);

create policy "owners or admins read meeting availability" on public.meeting_availability
for select to authenticated
using (
  private.can_manage_semester(meeting_availability.semester_id, (select auth.uid()))
  or exists (
    select 1
    from public.semester_memberships membership
    where membership.id = meeting_availability.semester_membership_id
      and membership.semester_id = meeting_availability.semester_id
      and membership.profile_id = (select auth.uid())
  )
);

create policy "members insert meeting availability" on public.meeting_availability
for insert to authenticated
with check (
  private.can_manage_semester(meeting_availability.semester_id, (select auth.uid()))
  or (
    exists (
      select 1
      from public.semester_memberships membership
      where membership.id = meeting_availability.semester_membership_id
        and membership.semester_id = meeting_availability.semester_id
        and membership.profile_id = (select auth.uid())
        and membership.status in ('onboarding', 'active')
    )
    and exists (
      select 1
      from public.meetings meeting
      where meeting.id = meeting_availability.meeting_id
        and meeting.semester_id = meeting_availability.semester_id
    )
  )
);

create policy "members update meeting availability" on public.meeting_availability
for update to authenticated
using (
  private.can_manage_semester(meeting_availability.semester_id, (select auth.uid()))
  or exists (
    select 1
    from public.semester_memberships membership
    where membership.id = meeting_availability.semester_membership_id
      and membership.semester_id = meeting_availability.semester_id
      and membership.profile_id = (select auth.uid())
      and membership.status in ('onboarding', 'active')
  )
)
with check (
  private.can_manage_semester(meeting_availability.semester_id, (select auth.uid()))
  or (
    exists (
      select 1
      from public.semester_memberships membership
      where membership.id = meeting_availability.semester_membership_id
        and membership.semester_id = meeting_availability.semester_id
        and membership.profile_id = (select auth.uid())
        and membership.status in ('onboarding', 'active')
    )
    and exists (
      select 1
      from public.meetings meeting
      where meeting.id = meeting_availability.meeting_id
        and meeting.semester_id = meeting_availability.semester_id
    )
  )
);

create policy "members delete meeting availability" on public.meeting_availability
for delete to authenticated
using (
  private.can_manage_semester(meeting_availability.semester_id, (select auth.uid()))
  or exists (
    select 1
    from public.semester_memberships membership
    where membership.id = meeting_availability.semester_membership_id
      and membership.semester_id = meeting_availability.semester_id
      and membership.profile_id = (select auth.uid())
      and membership.status in ('onboarding', 'active')
  )
);

create policy "participants read sessions" on public.sessions
for select to authenticated
using (
  private.can_manage_semester(sessions.semester_id, (select auth.uid()))
  or exists (
    select 1
    from public.mentor_semesters mentor_term
    join public.semester_memberships membership
      on membership.id = mentor_term.semester_membership_id
    where mentor_term.id = sessions.mentor_semester_id
      and mentor_term.semester_id = sessions.semester_id
      and membership.semester_id = sessions.semester_id
      and membership.profile_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.startup_team_memberships team
    join public.semester_memberships membership
      on membership.id = team.semester_membership_id
    where team.startup_semester_id = sessions.startup_semester_id
      and team.semester_id = sessions.semester_id
      and membership.semester_id = sessions.semester_id
      and membership.profile_id = (select auth.uid())
  )
);

create policy "startups request sessions" on public.sessions
for insert to authenticated
with check (
  private.can_manage_semester(sessions.semester_id, (select auth.uid()))
  or (
    sessions.status = 'requested'
    and exists (
      select 1
      from public.startup_team_memberships team
      join public.semester_memberships membership
        on membership.id = team.semester_membership_id
      where team.startup_semester_id = sessions.startup_semester_id
        and team.semester_id = sessions.semester_id
        and membership.semester_id = sessions.semester_id
        and membership.profile_id = (select auth.uid())
        and membership.role = 'startup'
        and membership.status in ('onboarding', 'active')
    )
  )
);

create policy "admins or mentors update sessions" on public.sessions
for update to authenticated
using (
  private.can_manage_semester(sessions.semester_id, (select auth.uid()))
  or exists (
    select 1
    from public.mentor_semesters mentor_term
    join public.semester_memberships membership
      on membership.id = mentor_term.semester_membership_id
    where mentor_term.id = sessions.mentor_semester_id
      and mentor_term.semester_id = sessions.semester_id
      and membership.semester_id = sessions.semester_id
      and membership.profile_id = (select auth.uid())
      and membership.role = 'mentor'
      and membership.status in ('onboarding', 'active')
  )
)
with check (
  private.can_manage_semester(sessions.semester_id, (select auth.uid()))
  or (
    sessions.status in ('confirmed', 'declined')
    and exists (
      select 1
      from public.mentor_semesters mentor_term
      join public.semester_memberships membership
        on membership.id = mentor_term.semester_membership_id
      where mentor_term.id = sessions.mentor_semester_id
        and mentor_term.semester_id = sessions.semester_id
        and membership.semester_id = sessions.semester_id
        and membership.profile_id = (select auth.uid())
        and membership.role = 'mentor'
        and membership.status in ('onboarding', 'active')
    )
  )
);

create policy "semester admins delete sessions" on public.sessions
for delete to authenticated
using (private.can_manage_semester(sessions.semester_id, (select auth.uid())));

create policy "semester admins read program audit" on public.program_audit_events
for select to authenticated
using (private.can_manage_semester(program_audit_events.semester_id, (select auth.uid())));

create policy "semester admins read outreach contacts" on public.outreach_contacts
for select to authenticated
using (private.has_outreach_contact_access(outreach_contacts.id, (select auth.uid())));

create policy "semester admins insert outreach contacts" on public.outreach_contacts
for insert to authenticated
with check (public.can_manage_any_outreach((select auth.uid())));

create policy "semester admins update outreach contacts" on public.outreach_contacts
for update to authenticated
using (private.has_outreach_contact_access(outreach_contacts.id, (select auth.uid())))
with check (private.has_outreach_contact_access(outreach_contacts.id, (select auth.uid())));

create policy "semester admins read outreach companies" on public.outreach_companies
for select to authenticated
using (private.has_outreach_company_access(outreach_companies.id, (select auth.uid())));

create policy "semester admins insert outreach companies" on public.outreach_companies
for insert to authenticated
with check (public.can_manage_any_outreach((select auth.uid())));

create policy "semester admins read outreach company links" on public.outreach_contact_companies
for select to authenticated
using (
  private.has_outreach_contact_access(outreach_contact_companies.contact_id, (select auth.uid()))
  and private.has_outreach_company_access(outreach_contact_companies.company_id, (select auth.uid()))
);

create policy "semester admins insert outreach company links" on public.outreach_contact_companies
for insert to authenticated
with check (
  private.has_outreach_contact_access(outreach_contact_companies.contact_id, (select auth.uid()))
  and private.has_outreach_company_access(outreach_contact_companies.company_id, (select auth.uid()))
);

create policy "semester admins update outreach company links" on public.outreach_contact_companies
for update to authenticated
using (
  private.has_outreach_contact_access(outreach_contact_companies.contact_id, (select auth.uid()))
  and private.has_outreach_company_access(outreach_contact_companies.company_id, (select auth.uid()))
)
with check (
  private.has_outreach_contact_access(outreach_contact_companies.contact_id, (select auth.uid()))
  and private.has_outreach_company_access(outreach_contact_companies.company_id, (select auth.uid()))
);

create policy "semester admins read outreach opportunities" on public.outreach_opportunities
for select to authenticated
using (private.can_manage_semester(outreach_opportunities.semester_id, (select auth.uid())));

create policy "semester admins insert outreach opportunities" on public.outreach_opportunities
for insert to authenticated
with check (private.can_manage_semester(outreach_opportunities.semester_id, (select auth.uid())));

create policy "semester admins update outreach opportunities" on public.outreach_opportunities
for update to authenticated
using (private.can_manage_semester(outreach_opportunities.semester_id, (select auth.uid())))
with check (private.can_manage_semester(outreach_opportunities.semester_id, (select auth.uid())));

create policy "semester admins read outreach activities" on public.outreach_activities
for select to authenticated
using (private.can_manage_semester(outreach_activities.semester_id, (select auth.uid())));

create policy "semester admins read outreach imports" on public.outreach_imports
for select to authenticated
using (private.can_manage_semester(outreach_imports.semester_id, (select auth.uid())));

create policy "semester admins insert outreach imports" on public.outreach_imports
for insert to authenticated
with check (private.can_manage_semester(outreach_imports.semester_id, (select auth.uid())));

create policy "semester admins update outreach imports" on public.outreach_imports
for update to authenticated
using (private.can_manage_semester(outreach_imports.semester_id, (select auth.uid())))
with check (private.can_manage_semester(outreach_imports.semester_id, (select auth.uid())));
