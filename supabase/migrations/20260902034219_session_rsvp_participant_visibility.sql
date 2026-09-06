set local check_function_bodies = off;

drop policy "program members read profiles" on "public"."profiles";

drop policy "members read authorized semester memberships" on "public"."semester_memberships";

drop policy "owners or admins read startup team memberships" on "public"."startup_team_memberships";

create or replace function private.can_read_session_participant (
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
    and (
      private.can_manage_semester(target_semester_id, candidate_id)
      or exists (
        select 1
        from public.semester_memberships own_membership
        where own_membership.id = target_membership_id
          and own_membership.semester_id = target_semester_id
          and own_membership.profile_id = private.current_profile_id(candidate_id)
      )
      or exists (
        select 1
        from public.sessions session
        join public.semester_memberships target_membership
          on target_membership.id = target_membership_id
         and target_membership.semester_id = session.semester_id
         and target_membership.status in ('onboarding', 'active')
        where session.semester_id = target_semester_id
          and (
            exists (
              select 1 from public.mentor_semesters target_mentor
              where target_mentor.id = session.mentor_semester_id
                and target_mentor.semester_membership_id = target_membership.id
            )
            or exists (
              select 1 from public.startup_team_memberships target_team
              where target_team.startup_semester_id = session.startup_semester_id
                and target_team.semester_membership_id = target_membership.id
            )
          )
          and (
            exists (
              select 1
              from public.mentor_semesters viewer_mentor
              join public.semester_memberships viewer_membership
                on viewer_membership.id = viewer_mentor.semester_membership_id
               and viewer_membership.semester_id = viewer_mentor.semester_id
              where viewer_mentor.id = session.mentor_semester_id
                and viewer_membership.profile_id = private.current_profile_id(candidate_id)
                and viewer_membership.status in ('onboarding', 'active')
            )
            or exists (
              select 1
              from public.startup_team_memberships viewer_team
              join public.semester_memberships viewer_membership
                on viewer_membership.id = viewer_team.semester_membership_id
               and viewer_membership.semester_id = viewer_team.semester_id
              where viewer_team.startup_semester_id = session.startup_semester_id
                and viewer_membership.profile_id = private.current_profile_id(candidate_id)
                and viewer_membership.status in ('onboarding', 'active')
            )
          )
      )
    )
$function$;

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
   from public.semester_memberships session_participant
  where
    ((session_participant.profile_id = profiles.id) AND private.can_read_session_participant(session_participant.id, session_participant.semester_id, ( select auth.uid() as
    uid)))))));

create policy "members read authorized semester memberships" on "public"."semester_memberships"
  for select
  to "authenticated"
  using
    (((profile_id = ( select private.current_profile_id(( select auth.uid() as uid)) as current_profile_id)) or private.can_manage_semester(semester_id, ( select auth.uid() as
    uid)) or
    ((role = 'mentor'::public.user_role) AND (status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status,
    'alumni'::public.membership_lifecycle_status])) AND (exists ( select 1
   from public.semesters viewer_semester
  where private.has_semester_role(viewer_semester.id, ARRAY['admin'::public.user_role, 'mentor'::public.user_role, 'startup'::public.user_role], ( select auth.uid() as uid))))) or
    private.can_read_session_participant(id, semester_id, ( select auth.uid() as uid))));

create policy "owners or admins read startup team memberships" on "public"."startup_team_memberships"
  for select
  to "authenticated"
  using ((private.can_manage_semester(semester_id, ( select auth.uid() as uid)) or (exists ( select 1
   from public.semester_memberships membership
  where
    ((membership.id = startup_team_memberships.semester_membership_id) AND (membership.semester_id = startup_team_memberships.semester_id) AND (membership.profile_id = ( select
    private.current_profile_id(( select auth.uid() as uid)) as current_profile_id))))) or
    private.can_read_session_participant(semester_membership_id, semester_id, ( select auth.uid() as uid))));

revoke all on function "private"."can_read_session_participant"(uuid, uuid, uuid) from public;

grant execute on function "private"."can_read_session_participant"(uuid, uuid, uuid) to "authenticated", "postgres";
