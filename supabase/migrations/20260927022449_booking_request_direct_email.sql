create policy "booking requester queues mentor request delivery" on "public"."notification_deliveries"
  for insert
  to "authenticated"
  with check (((event_kind = 'booking_requested'::text) AND (status = 'queued'::text) AND (EXISTS ( SELECT 1
   FROM public.mentor_booking_requests booking
  WHERE
    ((booking.id = notification_deliveries.source_id) AND (booking.semester_id = notification_deliveries.semester_id) AND (booking.requested_by_profile_id =
    private.current_profile_id()) AND (booking.status = 'pending'::text) AND (booking.mentor_profile_id = notification_deliveries.recipient_profile_id) AND
    (booking.requested_at = (notification_deliveries.source_version)::timestamp with time zone)))) AND (EXISTS ( SELECT 1
   FROM public.semester_memberships membership
  WHERE
    ((membership.semester_id = notification_deliveries.semester_id) AND (membership.profile_id = notification_deliveries.recipient_profile_id) AND (membership.role =
    'mentor'::public.user_role) AND (membership.status = 'active'::public.membership_lifecycle_status)))) AND (EXISTS ( SELECT 1
   FROM public.profiles profile
  WHERE
    ((profile.id = notification_deliveries.recipient_profile_id) AND (lower(btrim(profile.email)) = notification_deliveries.recipient_email) AND (profile.status = 'approved'::text)
    AND profile.is_active)))));

create policy "booking requester reads mentor request delivery" on "public"."notification_deliveries"
  for select
  to "authenticated"
  using (((event_kind = 'booking_requested'::text) AND (exists ( select 1
   from public.mentor_booking_requests booking
  where
    ((booking.id = notification_deliveries.source_id) AND (booking.semester_id = notification_deliveries.semester_id) AND (booking.requested_by_profile_id =
    private.current_profile_id()) AND (booking.mentor_profile_id = notification_deliveries.recipient_profile_id) AND
    (booking.requested_at = (notification_deliveries.source_version)::timestamp with time zone))))));

create policy "booking requester records mentor request delivery" on "public"."notification_deliveries"
  for update
  to "authenticated"
  using (((event_kind = 'booking_requested'::text) AND (exists ( select 1
   from public.mentor_booking_requests booking
  where
    ((booking.id = notification_deliveries.source_id) AND (booking.semester_id = notification_deliveries.semester_id) AND (booking.requested_by_profile_id =
    private.current_profile_id()) AND (booking.mentor_profile_id = notification_deliveries.recipient_profile_id) AND
    (booking.requested_at = (notification_deliveries.source_version)::timestamp with time zone))))))
  with check (((event_kind = 'booking_requested'::text) AND (EXISTS ( SELECT 1
   FROM public.mentor_booking_requests booking
  WHERE
    ((booking.id = notification_deliveries.source_id) AND (booking.semester_id = notification_deliveries.semester_id) AND (booking.requested_by_profile_id =
    private.current_profile_id()) AND (booking.mentor_profile_id = notification_deliveries.recipient_profile_id) AND
    (booking.requested_at = (notification_deliveries.source_version)::timestamp with time zone))))));
