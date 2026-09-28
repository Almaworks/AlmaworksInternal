drop policy "semester admins queue notification deliveries" on "public"."notification_deliveries";

drop index "public"."notification_deliveries_status_idx";

alter table "public"."notification_deliveries"
  drop constraint "notification_deliveries_event_kind_check";

alter table "public"."notification_deliveries"
  add column "due_at" timestamp with time zone not null default now();

alter table "public"."notification_deliveries"
  add constraint "notification_deliveries_event_kind_check"
    check
    ((event_kind = ANY (ARRAY['friday_speaker_confirmed'::text, 'friday_speaker_updated'::text, 'booking_requested'::text, 'booking_confirmed'::text, 'booking_declined'::text,
    'booking_canceled'::text, 'booking_reminder'::text, 'friday_group_assigned'::text, 'friday_group_updated'::text, 'friday_reminder'::text, 'outreach_digest'::text])));

create index notification_deliveries_status_idx on public.notification_deliveries using btree (status, due_at, id);

create policy "semester admins queue notification deliveries" on "public"."notification_deliveries"
  for insert
  to "authenticated"
  with check ((private.can_manage_semester(semester_id, auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles profile
  WHERE
    ((profile.id = notification_deliveries.recipient_profile_id) AND (lower(btrim(profile.email)) = notification_deliveries.recipient_email) AND (profile.status = 'approved'::text)
    AND profile.is_active))) AND (((event_kind = ANY (ARRAY['friday_speaker_confirmed'::text, 'friday_speaker_updated'::text])) AND (EXISTS ( SELECT 1
   FROM public.friday_speakers speaker
  WHERE ((speaker.semester_id = notification_deliveries.semester_id) AND (speaker.meeting_id = notification_deliveries.source_id)))) AND (EXISTS ( SELECT 1
   FROM public.semester_memberships membership
  WHERE
    ((membership.semester_id = notification_deliveries.semester_id) AND (membership.profile_id = notification_deliveries.recipient_profile_id) AND (membership.role =
    'startup'::public.user_role) AND (membership.status = 'active'::public.membership_lifecycle_status))))) OR
    ((event_kind = ANY (ARRAY['booking_requested'::text, 'booking_confirmed'::text, 'booking_declined'::text, 'booking_canceled'::text, 'booking_reminder'::text])) AND (EXISTS (
    SELECT 1
   FROM public.mentor_booking_requests booking
  WHERE ((booking.semester_id = notification_deliveries.semester_id) AND (booking.id = notification_deliveries.source_id))))) OR
    ((event_kind = ANY (ARRAY['friday_group_assigned'::text, 'friday_group_updated'::text, 'friday_reminder'::text])) AND (EXISTS ( SELECT 1
   FROM public.friday_programs program
  WHERE ((program.semester_id = notification_deliveries.semester_id) AND (program.meeting_id = notification_deliveries.source_id))))) OR
    ((event_kind = 'outreach_digest'::text) AND (source_id = semester_id)))));
