-- The startup booking API may record and submit only its own mentor request email.
-- Provider credentials remain server-side; these policies do not grant admin access.
create policy "booking requester reads mentor request delivery"
  on public.notification_deliveries for select to authenticated
  using (
    event_kind = 'booking_requested'
    and exists (
      select 1 from public.mentor_booking_requests booking
      where booking.id = source_id and booking.semester_id = notification_deliveries.semester_id
        and booking.requested_by_profile_id = private.current_profile_id()
        and booking.mentor_profile_id = recipient_profile_id
        and booking.requested_at = source_version::timestamptz
    )
  );

create policy "booking requester queues mentor request delivery"
  on public.notification_deliveries for insert to authenticated
  with check (
    event_kind = 'booking_requested' and status = 'queued'
    and exists (
      select 1 from public.mentor_booking_requests booking
      where booking.id = source_id and booking.semester_id = notification_deliveries.semester_id
        and booking.requested_by_profile_id = private.current_profile_id()
        and booking.status = 'pending'
        and booking.mentor_profile_id = recipient_profile_id
        and booking.requested_at = source_version::timestamptz
    )
    and exists (
      select 1 from public.semester_memberships membership
      where membership.semester_id = notification_deliveries.semester_id
        and membership.profile_id = recipient_profile_id
        and membership.role = 'mentor' and membership.status = 'active'
    )
    and exists (
      select 1 from public.profiles profile
      where profile.id = recipient_profile_id
        and lower(btrim(profile.email)) = recipient_email
        and profile.status = 'approved' and profile.is_active
    )
  );

create policy "booking requester records mentor request delivery"
  on public.notification_deliveries for update to authenticated
  using (
    event_kind = 'booking_requested'
    and exists (
      select 1 from public.mentor_booking_requests booking
      where booking.id = source_id and booking.semester_id = notification_deliveries.semester_id
        and booking.requested_by_profile_id = private.current_profile_id()
        and booking.mentor_profile_id = recipient_profile_id
        and booking.requested_at = source_version::timestamptz
    )
  )
  with check (
    event_kind = 'booking_requested'
    and exists (
      select 1 from public.mentor_booking_requests booking
      where booking.id = source_id and booking.semester_id = notification_deliveries.semester_id
        and booking.requested_by_profile_id = private.current_profile_id()
        and booking.mentor_profile_id = recipient_profile_id
        and booking.requested_at = source_version::timestamptz
    )
  );
