set local check_function_bodies = off;

drop policy "semester admins queue notification deliveries" on "public"."notification_deliveries";

create or replace function private.protect_notification_delivery_identity()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin
  if new.id is distinct from old.id
    or new.semester_id is distinct from old.semester_id
    or new.event_kind is distinct from old.event_kind
    or new.source_id is distinct from old.source_id
    or new.source_version is distinct from old.source_version
    or new.recipient_profile_id is distinct from old.recipient_profile_id
    or new.recipient_email is distinct from old.recipient_email
    or new.created_at is distinct from old.created_at then
    raise exception 'Notification delivery identity is immutable' using errcode = '42501';
  end if;
  return new;
end;
$function$;

create trigger protect_notification_delivery_identity
  before update on public.notification_deliveries
  for each row
  execute function private.protect_notification_delivery_identity();

create policy "semester admins queue notification deliveries" on "public"."notification_deliveries"
  for insert
  to "authenticated"
  with check ((private.can_manage_semester(semester_id, auth.uid()) AND (EXISTS ( SELECT 1
   FROM (public.semester_memberships membership
     JOIN public.profiles profile ON ((profile.id = membership.profile_id)))
  WHERE
    ((membership.semester_id = notification_deliveries.semester_id) AND (membership.profile_id = notification_deliveries.recipient_profile_id) AND (membership.role =
    'startup'::public.user_role) AND (membership.status = 'active'::public.membership_lifecycle_status) AND (profile.email = notification_deliveries.recipient_email) AND
    (profile.status = 'approved'::text) AND profile.is_active))) AND (EXISTS ( SELECT 1
   FROM public.friday_speakers speaker
  WHERE ((speaker.semester_id = notification_deliveries.semester_id) AND (speaker.meeting_id = notification_deliveries.source_id))))));

revoke all on function "private"."protect_notification_delivery_identity"() from public;

grant execute on function "private"."protect_notification_delivery_identity"() to "postgres";
