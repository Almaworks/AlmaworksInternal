alter table public.mentor_booking_windows enable row level security;
alter table public.mentor_booking_requests enable row level security;

create policy "active participants and admins read booking windows" on public.mentor_booking_windows
for select to authenticated using (
  private.can_manage_semester(semester_id,auth.uid())
  or (exists(select 1 from public.semesters semester where semester.id=semester_id and semester.is_active)
      and exists(select 1 from public.semester_memberships membership where membership.semester_id=mentor_booking_windows.semester_id
        and membership.profile_id=private.current_profile_id() and membership.role in ('mentor','startup') and membership.status='active'))
);
create policy "owning mentors publish booking windows" on public.mentor_booking_windows
for insert to authenticated with check (
  mentor_profile_id=private.current_profile_id()
  and exists(select 1 from public.semester_memberships membership where membership.semester_id=mentor_booking_windows.semester_id
    and membership.profile_id=private.current_profile_id() and membership.role='mentor' and membership.status='active')
  and exists(select 1 from public.semesters semester where semester.id=semester_id and semester.is_active)
);
create policy "owning mentors withdraw booking windows" on public.mentor_booking_windows
for update to authenticated using (
  mentor_profile_id=private.current_profile_id()
  and exists(select 1 from public.semester_memberships membership where membership.semester_id=mentor_booking_windows.semester_id
    and membership.profile_id=private.current_profile_id() and membership.role='mentor' and membership.status='active')
) with check (mentor_profile_id=private.current_profile_id());

create policy "booking parties and admins read private requests" on public.mentor_booking_requests
for select to authenticated using (
  private.can_manage_semester(semester_id,auth.uid())
  or (mentor_profile_id=private.current_profile_id()
      and exists(select 1 from public.semester_memberships membership where membership.semester_id=mentor_booking_requests.semester_id
        and membership.profile_id=private.current_profile_id() and membership.role='mentor' and membership.status='active'))
  or exists(
    select 1 from public.startup_team_memberships team
    join public.semester_memberships membership on membership.id=team.semester_membership_id and membership.semester_id=team.semester_id
    where team.semester_id=mentor_booking_requests.semester_id and team.startup_semester_id=mentor_booking_requests.startup_semester_id
      and membership.profile_id=private.current_profile_id() and membership.role='startup' and membership.status='active'
  )
);
create policy "active startups request booking windows" on public.mentor_booking_requests
for insert to authenticated with check (
  requested_by_profile_id=private.current_profile_id()
  and exists(
    select 1 from public.startup_team_memberships team
    join public.semester_memberships membership on membership.id=team.semester_membership_id and membership.semester_id=team.semester_id
    join public.semesters semester on semester.id=team.semester_id and semester.is_active
    where team.semester_id=mentor_booking_requests.semester_id and team.startup_semester_id=mentor_booking_requests.startup_semester_id
      and membership.profile_id=private.current_profile_id() and membership.role='startup' and membership.status='active'
  )
);
create policy "booking parties transition own requests" on public.mentor_booking_requests
for update to authenticated using (
  mentor_profile_id=private.current_profile_id()
  or exists(
    select 1 from public.startup_team_memberships team
    join public.semester_memberships membership on membership.id=team.semester_membership_id and membership.semester_id=team.semester_id
    where team.semester_id=mentor_booking_requests.semester_id and team.startup_semester_id=mentor_booking_requests.startup_semester_id
      and membership.profile_id=private.current_profile_id() and membership.role='startup' and membership.status='active'
  )
) with check (true);

revoke all on table public.mentor_booking_windows from anon,authenticated;
revoke all on table public.mentor_booking_requests from anon,authenticated;
grant select on table public.mentor_booking_windows,public.mentor_booking_requests to authenticated;
grant insert (semester_id,mentor_semester_id,mentor_profile_id,mentor_name,starts_at,ends_at) on public.mentor_booking_windows to authenticated;
grant update (withdrawn_at,updated_at) on public.mentor_booking_windows to authenticated;
grant insert (semester_id,window_id,mentor_semester_id,mentor_profile_id,mentor_name,startup_semester_id,startup_organization_id,startup_name,requested_by_profile_id,topic,status,starts_at,ends_at) on public.mentor_booking_requests to authenticated;
grant update (status,responded_at,cancelled_at,updated_at) on public.mentor_booking_requests to authenticated;

revoke all on function public.publish_mentor_booking_window(uuid,timestamptz,timestamptz) from public,anon;
revoke all on function public.withdraw_mentor_booking_window(uuid,uuid) from public,anon;
revoke all on function public.request_mentor_booking_window(uuid,uuid,text) from public,anon;
revoke all on function public.respond_to_mentor_booking_request(uuid,uuid,text) from public,anon;
revoke all on function public.cancel_mentor_booking_request(uuid,uuid) from public,anon;
grant execute on function public.publish_mentor_booking_window(uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.withdraw_mentor_booking_window(uuid,uuid) to authenticated;
grant execute on function public.request_mentor_booking_window(uuid,uuid,text) to authenticated;
grant execute on function public.respond_to_mentor_booking_request(uuid,uuid,text) to authenticated;
grant execute on function public.cancel_mentor_booking_request(uuid,uuid) to authenticated;
