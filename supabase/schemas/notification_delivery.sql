-- Semester-scoped, recipient-specific delivery ledger for contextual mail.
-- Browser clients cannot write it. The authenticated semester administrator
-- who saves a Friday speaker may queue and record that event through the app.
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  event_kind text not null check (event_kind in (
    'friday_speaker_confirmed', 'friday_speaker_updated',
    'booking_requested', 'booking_confirmed', 'booking_declined', 'booking_canceled', 'booking_reminder',
    'friday_group_assigned', 'friday_group_updated', 'friday_reminder', 'outreach_digest'
  )),
  source_id uuid not null,
  source_version text not null check (length(source_version) between 1 and 128),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null check (recipient_email = lower(btrim(recipient_email)) and length(recipient_email) between 3 and 254),
  status text not null default 'queued' check (status in ('queued', 'submitting', 'accepted', 'rejected', 'unknown', 'suppressed')),
  due_at timestamptz not null default now(),
  provider_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, event_kind, source_id, source_version, recipient_profile_id)
);

create index if not exists notification_deliveries_status_idx
  on public.notification_deliveries (status, due_at, id);

alter table public.notification_deliveries enable row level security;

create policy "semester admins read notification deliveries"
  on public.notification_deliveries for select to authenticated
  using (private.can_manage_semester(semester_id, auth.uid()));

create policy "semester admins queue notification deliveries"
  on public.notification_deliveries for insert to authenticated
  with check (
    private.can_manage_semester(semester_id, auth.uid())
    and exists (
      select 1 from public.profiles profile
      where profile.id = notification_deliveries.recipient_profile_id
        and lower(btrim(profile.email)) = notification_deliveries.recipient_email
        and profile.status = 'approved' and profile.is_active
    )
    and (
      (event_kind in ('friday_speaker_confirmed', 'friday_speaker_updated')
        and exists (select 1 from public.friday_speakers speaker where speaker.semester_id = notification_deliveries.semester_id and speaker.meeting_id = notification_deliveries.source_id)
        and exists (select 1 from public.semester_memberships membership where membership.semester_id = notification_deliveries.semester_id and membership.profile_id = notification_deliveries.recipient_profile_id and membership.role = 'startup' and membership.status = 'active'))
      or (event_kind in ('booking_requested', 'booking_confirmed', 'booking_declined', 'booking_canceled', 'booking_reminder')
        and exists (select 1 from public.mentor_booking_requests booking where booking.semester_id = notification_deliveries.semester_id and booking.id = notification_deliveries.source_id))
      or (event_kind in ('friday_group_assigned', 'friday_group_updated', 'friday_reminder')
        and exists (select 1 from public.friday_programs program where program.semester_id = notification_deliveries.semester_id and program.meeting_id = notification_deliveries.source_id))
      or (event_kind = 'outreach_digest' and source_id = semester_id)
    )
  );

create policy "semester admins record notification deliveries"
  on public.notification_deliveries for update to authenticated
  using (private.can_manage_semester(semester_id, auth.uid()))
  with check (private.can_manage_semester(semester_id, auth.uid()));

create or replace function private.protect_notification_delivery_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
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
$$;

create trigger protect_notification_delivery_identity
  before update on public.notification_deliveries
  for each row execute function private.protect_notification_delivery_identity();

revoke all privileges on table public.notification_deliveries from public, anon, authenticated, service_role;
grant select, insert, update on table public.notification_deliveries to authenticated;
