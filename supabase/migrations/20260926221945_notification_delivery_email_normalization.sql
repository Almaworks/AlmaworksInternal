drop policy "semester admins queue notification deliveries" on "public"."notification_deliveries";

create policy "semester admins queue notification deliveries" on "public"."notification_deliveries"
  for insert
  to "authenticated"
  with check ((private.can_manage_semester(semester_id, auth.uid()) AND (EXISTS ( SELECT 1
   FROM (public.semester_memberships membership
     JOIN public.profiles profile ON ((profile.id = membership.profile_id)))
  WHERE
    ((membership.semester_id = notification_deliveries.semester_id) AND (membership.profile_id = notification_deliveries.recipient_profile_id) AND (membership.role =
    'startup'::public.user_role) AND (membership.status = 'active'::public.membership_lifecycle_status) AND (lower(btrim(profile.email)) = notification_deliveries.recipient_email)
    AND (profile.status = 'approved'::text) AND profile.is_active))) AND (EXISTS ( SELECT 1
   FROM public.friday_speakers speaker
  WHERE ((speaker.semester_id = notification_deliveries.semester_id) AND (speaker.meeting_id = notification_deliveries.source_id))))));
