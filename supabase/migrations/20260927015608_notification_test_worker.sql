set local check_function_bodies = off;

create or replace function private.is_notification_test_worker()
  returns boolean
  language sql
  stable
  set search_path to ''
  AS $function$
  select (select auth.uid()) is not null
    and (select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_scope') = 'booking_test'
    and nullif((select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_semester_id'), '') is not null
    and nullif((select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_booking_id'), '') is not null
    and nullif((select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_profile_id'), '') is not null
    and nullif((select auth.jwt() -> 'app_metadata' ->> 'almaworks_notification_recipient_email'), '') is not null;
$function$;

create policy "notification test reads its booking" on "public"."mentor_booking_requests"
  for select
  to "authenticated"
  using
    ((private.is_notification_test_worker() AND ((semester_id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_semester_id'::text))) AND
    ((id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_booking_id'::text))) AND
    ((mentor_profile_id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_recipient_profile_id'::text)))));

create policy "notification test reads its mentor biography" on "public"."mentor_profiles"
  for select
  to "authenticated"
  using
    ((private.is_notification_test_worker() AND ((profile_id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_recipient_profile_id'::text)))));

create policy "notification test queues its delivery" on "public"."notification_deliveries"
  for insert
  to "authenticated"
  with
    check
    ((private.is_notification_test_worker() AND ((semester_id)::text = ( SELECT ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_semester_id'::text))) AND
    ((source_id)::text = ( SELECT ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_booking_id'::text))) AND
    ((recipient_profile_id)::text = ( SELECT ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_recipient_profile_id'::text))) AND
    (recipient_email = ( SELECT ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_recipient_email'::text))) AND (event_kind = 'booking_requested'::text) AND
    (status = 'queued'::text) AND (EXISTS ( SELECT 1
   FROM public.mentor_booking_requests booking
  WHERE
    ((booking.id = notification_deliveries.source_id) AND (booking.semester_id = notification_deliveries.semester_id) AND (booking.mentor_profile_id =
    notification_deliveries.recipient_profile_id) AND (booking.status = 'pending'::text) AND (booking.requested_at = (notification_deliveries.source_version)::timestamp
    with time zone))))));

create policy "notification test reads its delivery" on "public"."notification_deliveries"
  for select
  to "authenticated"
  using
    ((private.is_notification_test_worker() AND ((semester_id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_semester_id'::text))) AND
    ((source_id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_booking_id'::text))) AND
    ((recipient_profile_id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_recipient_profile_id'::text))) AND
    (recipient_email = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_recipient_email'::text))) AND (event_kind = 'booking_requested'::text)));

create policy "notification test records its delivery" on "public"."notification_deliveries"
  for update
  to "authenticated"
  using
    ((private.is_notification_test_worker() AND ((semester_id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_semester_id'::text))) AND
    ((source_id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_booking_id'::text))) AND
    ((recipient_profile_id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_recipient_profile_id'::text))) AND
    (recipient_email = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_recipient_email'::text))) AND (event_kind = 'booking_requested'::text)))
  with
    check
    ((private.is_notification_test_worker() AND ((semester_id)::text = ( SELECT ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_semester_id'::text))) AND
    ((source_id)::text = ( SELECT ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_booking_id'::text))) AND
    ((recipient_profile_id)::text = ( SELECT ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_recipient_profile_id'::text))) AND
    (recipient_email = ( SELECT ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_recipient_email'::text))) AND (event_kind = 'booking_requested'::text)));

create policy "notification test reads its mentor profile" on "public"."profiles"
  for select
  to "authenticated"
  using
    ((private.is_notification_test_worker() AND ((id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_recipient_profile_id'::text))) AND
    (lower(btrim(email)) = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_recipient_email'::text)))));

create policy "notification test reads its mentor membership" on "public"."semester_memberships"
  for select
  to "authenticated"
  using
    ((private.is_notification_test_worker() AND ((semester_id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_semester_id'::text))) AND
    ((profile_id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_recipient_profile_id'::text))) AND (role = 'mentor'::public.user_role) AND
    (status = 'active'::public.membership_lifecycle_status)));

create policy "notification test limits semester visibility" on "public"."semesters"
  as restrictive
  for select
  to "authenticated"
  using (((not private.is_notification_test_worker()) or ((id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_semester_id'::text)))));

create policy "notification test reads its semester" on "public"."semesters"
  for select
  to "authenticated"
  using ((private.is_notification_test_worker() AND ((id)::text = ( select ((auth.jwt() -> 'app_metadata'::text) ->> 'almaworks_notification_semester_id'::text)))));

revoke all on function "private"."is_notification_test_worker"() from public;

grant execute on function "private"."is_notification_test_worker"() to "authenticated", "postgres";
