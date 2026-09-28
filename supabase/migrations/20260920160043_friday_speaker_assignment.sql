create table "public"."friday_speakers" (
  "semester_id"   uuid                     not null,
  "meeting_id"    uuid                     not null,
  "name"          text                     not null,
  "bio"           text                     not null,
  "expertise"     text                     not null,
  "topic"         text                     not null,
  "contact_email" text                     not null,
  "contact_phone" text,
  "linkedin_url"  text,
  "website_url"   text,
  "updated_at"    timestamp with time zone not null default now(),
  constraint "friday_speakers_bio_check" check (((length(btrim(bio)) >= 1) AND (length(btrim(bio)) <= 3000))),
  constraint "friday_speakers_contact_email_check" check (((length(btrim(contact_email)) >= 3) AND (length(btrim(contact_email)) <= 254))),
  constraint "friday_speakers_contact_phone_check" check (((contact_phone IS NULL) OR (length(contact_phone) <= 100))),
  constraint "friday_speakers_expertise_check" check (((length(btrim(expertise)) >= 1) AND (length(btrim(expertise)) <= 500))),
  constraint "friday_speakers_linkedin_url_check" check (((linkedin_url IS NULL) OR ((length(linkedin_url) <= 500) AND (linkedin_url ~ '^https://'::text)))),
  constraint "friday_speakers_name_check" check (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 160))),
  constraint "friday_speakers_pkey" primary key (meeting_id),
  constraint "friday_speakers_topic_check" check (((length(btrim(topic)) >= 1) AND (length(btrim(topic)) <= 300))),
  constraint "friday_speakers_website_url_check" check (((website_url IS NULL) OR ((length(website_url) <= 500) AND (website_url ~ '^https://'::text))))
);

alter table "public"."friday_speakers"
  enable row level security;

alter table "public"."friday_speakers"
  add constraint "friday_speakers_meeting_fkey" foreign key (semester_id, meeting_id) references public.meetings(semester_id, id) on delete cascade;

alter table "public"."friday_speakers"
  add constraint "friday_speakers_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

create index friday_speakers_semester_idx on public.friday_speakers using btree (semester_id);

create policy "semester admins insert Friday speakers" on "public"."friday_speakers"
  for insert
  to "authenticated"
  with check (private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)));

create policy "semester admins update Friday speakers" on "public"."friday_speakers"
  for update
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)))
  with check (private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)));

create policy "semester members read Friday speakers" on "public"."friday_speakers"
  for select
  to "authenticated"
  using ((private.can_manage_semester(semester_id, ( select auth.uid() as uid)) or (exists ( select 1
   from public.semester_memberships membership
  where
    ((membership.semester_id = friday_speakers.semester_id) AND (membership.profile_id = ( select private.current_profile_id(( select auth.uid() as uid)) as current_profile_id))
    AND (membership.role = ANY (ARRAY['mentor'::public.user_role, 'startup'::public.user_role, 'admin'::public.user_role])) AND
    (membership.status = ANY (ARRAY['active'::public.membership_lifecycle_status, 'alumni'::public.membership_lifecycle_status])))))));

grant insert, select, update on table "public"."friday_speakers" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."friday_speakers" to "postgres";

grant select on table "public"."friday_speakers" to "service_role";
