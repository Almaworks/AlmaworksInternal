create policy "startup participants update own organization profile" on "public"."startup_organizations"
  for update
  to "authenticated"
  using ((exists ( select 1
   from ((public.startup_semesters startup_term
     JOIN public.startup_team_memberships team on (((team.startup_semester_id = startup_term.id) AND (team.semester_id = startup_term.semester_id))))
     JOIN public.semester_memberships membership on (((membership.id = team.semester_membership_id) AND (membership.semester_id = team.semester_id))))
  where
    ((startup_term.startup_organization_id = startup_organizations.id) AND (membership.profile_id = ( select private.current_profile_id(( select auth.uid() as uid)) as
    current_profile_id)) AND (membership.role = 'startup'::public.user_role) AND
    (membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status]))))))
  with check ((EXISTS ( SELECT 1
   FROM ((public.startup_semesters startup_term
     JOIN public.startup_team_memberships team ON (((team.startup_semester_id = startup_term.id) AND (team.semester_id = startup_term.semester_id))))
     JOIN public.semester_memberships membership ON (((membership.id = team.semester_membership_id) AND (membership.semester_id = team.semester_id))))
  WHERE
    ((startup_term.startup_organization_id = startup_organizations.id) AND (membership.profile_id = ( SELECT private.current_profile_id(( SELECT auth.uid() AS uid)) AS
    current_profile_id)) AND (membership.role = 'startup'::public.user_role) AND
    (membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status]))))));

revoke all ("description") on table "public"."startup_organizations" from "authenticated";

grant update ("description") on table "public"."startup_organizations" to "authenticated";

revoke all ("industry") on table "public"."startup_organizations" from "authenticated";

grant update ("industry") on table "public"."startup_organizations" to "authenticated";

revoke all ("name") on table "public"."startup_organizations" from "authenticated";

grant update ("name") on table "public"."startup_organizations" to "authenticated";

revoke all ("website_url") on table "public"."startup_organizations" from "authenticated";

grant update ("website_url") on table "public"."startup_organizations" to "authenticated";

revoke all ("stage") on table "public"."startup_semesters" from "authenticated";

grant update ("stage") on table "public"."startup_semesters" to "authenticated";
