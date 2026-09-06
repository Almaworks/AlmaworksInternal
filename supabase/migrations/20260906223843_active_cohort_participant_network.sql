set local check_function_bodies = off;

drop policy "program members read mentor profiles" on "public"."mentor_profiles";

drop policy "program members read profiles" on "public"."profiles";

drop policy "members read authorized semester memberships" on "public"."semester_memberships";

drop policy "owners or admins read startup team memberships" on "public"."startup_team_memberships";

drop function "private"."can_read_mentor_profile"(uuid, uuid);

create or replace function private.can_read_active_cohort_participant (
  target_membership_id uuid,
  target_semester_id   uuid,
  candidate_id         uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$
  select candidate_id is not null
    and candidate_id is not distinct from auth.uid()
    and exists (
      select 1
      from public.semesters target_semester
      where target_semester.id = target_semester_id
        and target_semester.is_active
    )
    and exists (
      select 1
      from public.semester_memberships target_membership
      where target_membership.id = target_membership_id
        and target_membership.semester_id = target_semester_id
        and target_membership.role in ('mentor', 'startup')
        and target_membership.status = 'active'
    )
    and exists (
      select 1
      from public.semester_memberships viewer_membership
      where viewer_membership.semester_id = target_semester_id
        and viewer_membership.profile_id = private.current_profile_id(candidate_id)
        and viewer_membership.role in ('mentor', 'startup')
        and viewer_membership.status = 'active'
    );
$function$;

create or replace function private.can_read_mentor_profile (
  target_profile_id uuid,
  candidate_id      uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  AS $function$
  select candidate_id is not null
    and candidate_id is not distinct from auth.uid()
    and exists (
      select 1
      from public.semester_memberships target_membership
      where target_membership.profile_id = target_profile_id
        and target_membership.role = 'mentor'
        and (
          private.can_manage_semester(target_membership.semester_id, candidate_id)
          or private.can_read_active_cohort_participant(
            target_membership.id,
            target_membership.semester_id,
            candidate_id
          )
          or private.can_read_session_participant(
            target_membership.id,
            target_membership.semester_id,
            candidate_id
          )
        )
    );
$function$;

create policy "program members read mentor profiles" on "public"."mentor_profiles"
  for select
  to "authenticated"
  using
    (((profile_id = ( select private.current_profile_id(( select auth.uid() as uid)) as current_profile_id)) or private.is_super_admin(( select auth.uid() as uid)) or (exists (
    select 1
   from public.semester_memberships administrator
  where
    ((administrator.profile_id = ( select private.current_profile_id(( select auth.uid() as uid)) as current_profile_id)) AND (administrator.role = 'admin'::public.user_role) AND
    (administrator.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status]))))) or
    private.can_read_mentor_profile(profile_id, ( select auth.uid() as uid))));

create policy "program members read profiles" on "public"."profiles"
  for select
  to "authenticated"
  using
    (((id = ( select private.current_profile_id(( select auth.uid() as uid)) as current_profile_id)) or private.is_super_admin(( select auth.uid() as uid)) or (exists ( select 1
   from public.semester_memberships administrator
  where
    ((administrator.profile_id = ( select private.current_profile_id(( select auth.uid() as uid)) as current_profile_id)) AND (administrator.role = 'admin'::public.user_role) AND
    (administrator.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status]))))) or
    private.can_read_mentor_profile(id, ( select auth.uid() as uid)) or (exists ( select 1
   from public.semester_memberships cohort_participant
  where
    ((cohort_participant.profile_id = profiles.id) AND private.can_read_active_cohort_participant(cohort_participant.id, cohort_participant.semester_id, ( select auth.uid() as
    uid))))) or (exists ( select 1
   from public.semester_memberships session_participant
  where
    ((session_participant.profile_id = profiles.id) AND private.can_read_session_participant(session_participant.id, session_participant.semester_id, ( select auth.uid() as
    uid)))))));

create policy "members read authorized semester memberships" on "public"."semester_memberships"
  for select
  to "authenticated"
  using
    (((profile_id = ( select private.current_profile_id(( select auth.uid() as uid)) as current_profile_id)) or private.can_manage_semester(semester_id, ( select auth.uid() as
    uid)) or private.can_read_active_cohort_participant(id, semester_id, ( select auth.uid() as uid)) or
    private.can_read_session_participant(id, semester_id, ( select auth.uid() as uid))));

create policy "owners or admins read startup team memberships" on "public"."startup_team_memberships"
  for select
  to "authenticated"
  using ((private.can_manage_semester(semester_id, ( select auth.uid() as uid)) or (exists ( select 1
   from public.semester_memberships membership
  where
    ((membership.id = startup_team_memberships.semester_membership_id) AND (membership.semester_id = startup_team_memberships.semester_id) AND (membership.profile_id = ( select
    private.current_profile_id(( select auth.uid() as uid)) as current_profile_id))))) or
    private.can_read_active_cohort_participant(semester_membership_id, semester_id, ( select auth.uid() as uid)) or
    private.can_read_session_participant(semester_membership_id, semester_id, ( select auth.uid() as uid))));

revoke all on function "private"."can_read_active_cohort_participant"(uuid, uuid, uuid) from public;

grant execute on function "private"."can_read_active_cohort_participant"(uuid, uuid, uuid) to "authenticated", "postgres";

revoke all on function "private"."can_read_mentor_profile"(uuid, uuid) from public;

grant execute on function "private"."can_read_mentor_profile"(uuid, uuid) to "authenticated", "postgres";
