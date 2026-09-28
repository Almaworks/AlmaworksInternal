-- A dedicated ordinary Auth identity may deliver one designated booking request.
-- Its scope is issued in Auth app_metadata, not editable by the signed-in user.
-- This identity has no semester membership or application administrator access.
create or replace function private.is_notification_test_worker()
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null
    and (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_scope') = 'booking_test'
    and nullif((select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_semester_id'), '') is not null
    and nullif((select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_booking_id'), '') is not null
    and nullif((select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_profile_id'), '') is not null
    and nullif((select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_email'), '') is not null;
$$;
revoke all on function private.is_notification_test_worker() from public, anon, service_role;
grant execute on function private.is_notification_test_worker() to authenticated;

create policy "notification test reads its semester" on public.semesters
  for select to authenticated using (private.is_notification_test_worker()
    and id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_semester_id'));

-- Existing authenticated users may read all cohort dates. Restrict only this
-- machine identity so its other permissive SELECT policy cannot widen scope.
create policy "notification test limits semester visibility" on public.semesters
  as restrictive for select to authenticated
  using (not private.is_notification_test_worker()
    or id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_semester_id'));

create policy "notification test reads its mentor membership" on public.semester_memberships
  for select to authenticated using (private.is_notification_test_worker()
    and semester_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_semester_id')
    and profile_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_profile_id')
    and role = 'mentor' and status = 'active');

create policy "notification test reads its mentor profile" on public.profiles
  for select to authenticated using (private.is_notification_test_worker()
    and id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_profile_id')
    and lower(btrim(email)) = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_email'));

create policy "notification test reads its mentor biography" on public.mentor_profiles
  for select to authenticated using (private.is_notification_test_worker()
    and profile_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_profile_id'));

create policy "notification test reads its booking" on public.mentor_booking_requests
  for select to authenticated using (private.is_notification_test_worker()
    and semester_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_semester_id')
    and id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_booking_id')
    and mentor_profile_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_profile_id'));

create policy "notification test reads its delivery" on public.notification_deliveries
  for select to authenticated using (private.is_notification_test_worker()
    and semester_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_semester_id')
    and source_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_booking_id')
    and recipient_profile_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_profile_id')
    and recipient_email = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_email')
    and event_kind = 'booking_requested');

create policy "notification test queues its delivery" on public.notification_deliveries
  for insert to authenticated with check (private.is_notification_test_worker()
    and semester_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_semester_id')
    and source_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_booking_id')
    and recipient_profile_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_profile_id')
    and recipient_email = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_email')
    and event_kind = 'booking_requested' and status = 'queued'
    and exists (select 1 from public.mentor_booking_requests booking
      where booking.id = source_id and booking.semester_id = notification_deliveries.semester_id
        and booking.mentor_profile_id = recipient_profile_id and booking.status = 'pending'
        and booking.requested_at = source_version::timestamptz));

create policy "notification test records its delivery" on public.notification_deliveries
  for update to authenticated
  using (private.is_notification_test_worker()
    and semester_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_semester_id')
    and source_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_booking_id')
    and recipient_profile_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_profile_id')
    and recipient_email = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_email')
    and event_kind = 'booking_requested')
  with check (private.is_notification_test_worker()
    and semester_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_semester_id')
    and source_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_booking_id')
    and recipient_profile_id::text = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_profile_id')
    and recipient_email = (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_email')
    and event_kind = 'booking_requested');
