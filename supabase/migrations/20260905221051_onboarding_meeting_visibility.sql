drop policy "cohort members read meetings" on "public"."meetings";

create policy "cohort members read meetings" on "public"."meetings"
  for select
  to "authenticated"
  using
    ((private.has_semester_role(semester_id, ARRAY['admin'::public.user_role, 'mentor'::public.user_role, 'startup'::public.user_role], ( select auth.uid() as uid)) or (exists (
    select 1
   from public.semester_memberships membership
  where
    ((membership.semester_id = meetings.semester_id) AND (membership.profile_id = ( select private.current_profile_id(( select auth.uid() as uid)) as current_profile_id)) AND
    (membership.role = ANY (ARRAY['mentor'::public.user_role, 'startup'::public.user_role])) AND
    (membership.status = ANY (ARRAY['invited'::public.membership_lifecycle_status, 'onboarding'::public.membership_lifecycle_status])))))));
