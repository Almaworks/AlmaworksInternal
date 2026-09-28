create table "public"."notification_deliveries" (
  "id"                   uuid                     not null default gen_random_uuid(),
  "semester_id"          uuid                     not null,
  "event_kind"           text                     not null,
  "source_id"            uuid                     not null,
  "source_version"       text                     not null,
  "recipient_profile_id" uuid                     not null,
  "recipient_email"      text                     not null,
  "status"               text                     not null default 'queued'::text,
  "provider_id"          text,
  "last_error"           text,
  "created_at"           timestamp with time zone not null default now(),
  "updated_at"           timestamp with time zone not null default now(),
  constraint "notification_deliveries_event_kind_check" check ((event_kind = ANY (ARRAY['friday_speaker_confirmed'::text, 'friday_speaker_updated'::text]))),
  constraint "notification_deliveries_pkey" primary key (id),
  constraint "notification_deliveries_recipient_email_check"
    check (((recipient_email = lower(btrim(recipient_email))) AND ((length(recipient_email) >= 3) AND (length(recipient_email) <= 254)))),
  constraint "notification_deliveries_semester_id_event_kind_source_id_so_key" unique (semester_id, event_kind, source_id, source_version, recipient_profile_id),
  constraint "notification_deliveries_source_version_check" check (((length(source_version) >= 1) AND (length(source_version) <= 128))),
  constraint "notification_deliveries_status_check"
    check ((status = ANY (ARRAY['queued'::text, 'submitting'::text, 'accepted'::text, 'rejected'::text, 'unknown'::text, 'suppressed'::text])))
);

alter table "public"."notification_deliveries"
  enable row level security;

alter table "public"."notification_deliveries"
  add constraint "notification_deliveries_recipient_profile_id_fkey" foreign key (recipient_profile_id) references public.profiles(id) on delete cascade;

alter table "public"."notification_deliveries"
  add constraint "notification_deliveries_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

create index notification_deliveries_status_idx on public.notification_deliveries using btree (status, created_at, id);

create policy "semester admins queue notification deliveries" on "public"."notification_deliveries"
  for insert
  to "authenticated"
  with check (private.can_manage_semester(semester_id, auth.uid()));

create policy "semester admins read notification deliveries" on "public"."notification_deliveries"
  for select
  to "authenticated"
  using (private.can_manage_semester(semester_id, auth.uid()));

create policy "semester admins record notification deliveries" on "public"."notification_deliveries"
  for update
  to "authenticated"
  using (private.can_manage_semester(semester_id, auth.uid()))
  with check (private.can_manage_semester(semester_id, auth.uid()));

grant insert, select, update on table "public"."notification_deliveries" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."notification_deliveries" to "postgres";
