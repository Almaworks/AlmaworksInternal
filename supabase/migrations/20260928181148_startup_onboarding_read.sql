create policy "assigned onboarding startups read own organizations" on "public"."startup_organizations"
  for select
  to "authenticated"
  using ((exists ( select 1
   from (((public.startup_semesters startup_term
     JOIN public.startup_team_memberships team on (((team.startup_semester_id = startup_term.id) AND (team.semester_id = startup_term.semester_id))))
     JOIN public.semester_memberships membership on (((membership.id = team.semester_membership_id) AND (membership.semester_id = team.semester_id))))
     JOIN public.profiles profile on (((profile.id = membership.profile_id) AND (profile.auth_user_id = ( select auth.uid() as uid)))))
  where
    ((startup_term.startup_organization_id = startup_organizations.id) AND (membership.role = 'startup'::public.user_role) AND (membership.status = ANY
    (ARRAY['invited'::public.membership_lifecycle_status, 'onboarding'::public.membership_lifecycle_status])) AND (profile.status = 'approved'::text) AND profile.is_active))));

create policy "assigned onboarding startups read own startup semesters" on "public"."startup_semesters"
  for select
  to "authenticated"
  using ((exists ( select 1
   from ((public.startup_team_memberships team
     JOIN public.semester_memberships membership on (((membership.id = team.semester_membership_id) AND (membership.semester_id = team.semester_id))))
     JOIN public.profiles profile on (((profile.id = membership.profile_id) AND (profile.auth_user_id = ( select auth.uid() as uid)))))
  where
    ((team.startup_semester_id = startup_semesters.id) AND (team.semester_id = startup_semesters.semester_id) AND (membership.role = 'startup'::public.user_role) AND
    (membership.status = ANY (ARRAY['invited'::public.membership_lifecycle_status, 'onboarding'::public.membership_lifecycle_status])) AND (profile.status = 'approved'::text) AND
    profile.is_active))));
