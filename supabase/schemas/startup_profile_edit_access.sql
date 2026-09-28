create policy "startup participants update own organization profile"
on public.startup_organizations for update to authenticated
using (
  exists (
    select 1
    from public.startup_semesters startup_term
    join public.startup_team_memberships team
      on team.startup_semester_id = startup_term.id
     and team.semester_id = startup_term.semester_id
    join public.semester_memberships membership
      on membership.id = team.semester_membership_id
     and membership.semester_id = team.semester_id
    where startup_term.startup_organization_id = startup_organizations.id
      and membership.profile_id = (select private.current_profile_id((select auth.uid())))
      and membership.role = 'startup'
      and membership.status in ('onboarding', 'active')
  )
)
with check (
  exists (
    select 1
    from public.startup_semesters startup_term
    join public.startup_team_memberships team
      on team.startup_semester_id = startup_term.id
     and team.semester_id = startup_term.semester_id
    join public.semester_memberships membership
      on membership.id = team.semester_membership_id
     and membership.semester_id = team.semester_id
    where startup_term.startup_organization_id = startup_organizations.id
      and membership.profile_id = (select private.current_profile_id((select auth.uid())))
      and membership.role = 'startup'
      and membership.status in ('onboarding', 'active')
  )
);

grant update (name, industry, description, website_url) on table public.startup_organizations to authenticated;
grant update (stage) on table public.startup_semesters to authenticated;
