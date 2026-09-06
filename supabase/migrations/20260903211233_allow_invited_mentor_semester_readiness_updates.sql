drop policy "mentors update their own semester profile" on "public"."mentor_semesters";

create policy "mentors update their own semester profile" on "public"."mentor_semesters"
  for update
  to "authenticated"
  using ((exists ( select 1
   from public.semester_memberships mentor_membership
  where
    ((mentor_membership.id = mentor_semesters.semester_membership_id) AND (mentor_membership.semester_id = mentor_semesters.semester_id) AND (mentor_membership.profile_id =
    private.current_profile_id(auth.uid())) AND
    (mentor_membership.status = ANY (ARRAY['invited'::public.membership_lifecycle_status, 'onboarding'::public.membership_lifecycle_status,
    'active'::public.membership_lifecycle_status]))))))
  with check ((EXISTS ( SELECT 1
   FROM public.semester_memberships mentor_membership
  WHERE
    ((mentor_membership.id = mentor_semesters.semester_membership_id) AND (mentor_membership.semester_id = mentor_semesters.semester_id) AND (mentor_membership.profile_id =
    private.current_profile_id(auth.uid())) AND
    (mentor_membership.status = ANY (ARRAY['invited'::public.membership_lifecycle_status, 'onboarding'::public.membership_lifecycle_status,
    'active'::public.membership_lifecycle_status]))))));
