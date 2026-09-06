create table "public"."participant_notification_reads" (
  "profile_id"       uuid                     not null,
  "semester_id"      uuid                     not null,
  "notification_key" text                     not null,
  "read_at"          timestamp with time zone not null default now(),
  constraint "participant_notification_reads_notification_key_check" check (((length(btrim(notification_key)) >= 1) AND (length(btrim(notification_key)) <= 256))),
  constraint "participant_notification_reads_pkey" primary key (profile_id, semester_id, notification_key)
);

alter table "public"."participant_notification_reads"
  enable row level security;

alter table "public"."participant_notification_reads"
  add constraint "participant_notification_reads_profile_id_fkey" foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table "public"."participant_notification_reads"
  add constraint "participant_notification_reads_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

create index participant_notification_reads_semester_id_idx on public.participant_notification_reads using btree (semester_id);

create policy "participants insert own notification receipts" on "public"."participant_notification_reads"
  for insert
  to "authenticated"
  with check (((profile_id = ( SELECT private.current_profile_id(( SELECT auth.uid() AS uid)) AS current_profile_id)) AND (EXISTS ( SELECT 1
   FROM public.semester_memberships membership
  WHERE
    ((membership.profile_id = participant_notification_reads.profile_id) AND (membership.semester_id = participant_notification_reads.semester_id) AND (membership.role = ANY
    (ARRAY['mentor'::public.user_role, 'startup'::public.user_role])) AND
    (membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status])))))));

create policy "participants read own notification receipts" on "public"."participant_notification_reads"
  for select
  to "authenticated"
  using (((profile_id = ( select private.current_profile_id(( select auth.uid() as uid)) as current_profile_id)) AND (exists ( select 1
   from public.semester_memberships membership
  where
    ((membership.profile_id = participant_notification_reads.profile_id) AND (membership.semester_id = participant_notification_reads.semester_id) AND (membership.role = ANY
    (ARRAY['mentor'::public.user_role, 'startup'::public.user_role])) AND
    (membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status,
    'alumni'::public.membership_lifecycle_status])))))));

grant insert, select on table "public"."participant_notification_reads" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."participant_notification_reads" to "postgres";
