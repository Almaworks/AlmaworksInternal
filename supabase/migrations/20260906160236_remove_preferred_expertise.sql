create table "public"."expertise_tag_aliases" (
  "id"               uuid                     not null default gen_random_uuid(),
  "expertise_tag_id" uuid                     not null,
  "normalized_alias" text                     not null,
  "created_at"       timestamp with time zone not null default now(),
  constraint "expertise_tag_aliases_expertise_tag_id_normalized_alias_key" unique (expertise_tag_id, normalized_alias),
  constraint "expertise_tag_aliases_normalized_alias_check" check ((length(btrim(normalized_alias)) > 0)),
  constraint "expertise_tag_aliases_normalized_alias_key" unique (normalized_alias),
  constraint "expertise_tag_aliases_pkey" primary key (id)
);

alter table "public"."expertise_tag_aliases"
  enable row level security;

create table "public"."expertise_tags" (
  "id"                    uuid                     not null default gen_random_uuid(),
  "name"                  text                     not null,
  "normalized_name"       text                     not null,
  "created_by_profile_id" uuid,
  "created_at"            timestamp with time zone not null default now(),
  "updated_at"            timestamp with time zone not null default now(),
  constraint "expertise_tags_name_check" check ((length(btrim(name)) > 0)),
  constraint "expertise_tags_normalized_name_check"
    check ((normalized_name = lower(regexp_replace(regexp_replace(btrim(name), '[-_]+'::text, ' '::text, 'g'::text), '\\s+'::text, ' '::text, 'g'::text)))),
  constraint "expertise_tags_normalized_name_key" unique (normalized_name),
  constraint "expertise_tags_pkey" primary key (id)
);

alter table "public"."expertise_tags"
  enable row level security;

create table "public"."mentor_expertise_tags" (
  "mentor_profile_id" uuid                     not null,
  "expertise_tag_id"  uuid                     not null,
  "created_at"        timestamp with time zone not null default now(),
  constraint "mentor_expertise_tags_pkey" primary key (mentor_profile_id, expertise_tag_id)
);

alter table "public"."mentor_expertise_tags"
  enable row level security;

create table "public"."startup_mentor_need_tags" (
  "startup_semester_id" uuid                     not null,
  "semester_id"         uuid                     not null,
  "expertise_tag_id"    uuid                     not null,
  "priority"            smallint                 not null,
  "created_at"          timestamp with time zone not null default now(),
  constraint "startup_mentor_need_tags_pkey" primary key (startup_semester_id, expertise_tag_id),
  constraint "startup_mentor_need_tags_priority_check" check (((priority >= 1) AND (priority <= 2))),
  constraint "startup_mentor_need_tags_startup_semester_id_priority_key" unique (startup_semester_id, priority)
);

alter table "public"."startup_mentor_need_tags"
  enable row level security;

alter table "public"."expertise_tags"
  add constraint "expertise_tags_created_by_profile_id_fkey" foreign key (created_by_profile_id) references public.profiles(id) on delete set null;

alter table "public"."expertise_tag_aliases"
  add constraint "expertise_tag_aliases_expertise_tag_id_fkey" foreign key (expertise_tag_id) references public.expertise_tags(id) on delete cascade;

alter table "public"."mentor_expertise_tags"
  add constraint "mentor_expertise_tags_expertise_tag_id_fkey" foreign key (expertise_tag_id) references public.expertise_tags(id) on delete cascade;

alter table "public"."mentor_expertise_tags"
  add constraint "mentor_expertise_tags_mentor_profile_id_fkey" foreign key (mentor_profile_id) references public.mentor_profiles(profile_id) on delete cascade;

alter table "public"."startup_mentor_need_tags"
  add constraint "startup_mentor_need_tags_expertise_tag_id_fkey" foreign key (expertise_tag_id) references public.expertise_tags(id) on delete restrict;

alter table "public"."startup_mentor_need_tags"
  add constraint "startup_mentor_need_tags_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."startup_mentor_need_tags"
  add constraint "startup_mentor_need_tags_semester_id_startup_semester_id_fkey" foreign key (semester_id, startup_semester_id) references public.startup_semesters(semester_id, id)
    on delete cascade;

create index expertise_tag_aliases_search_idx on public.expertise_tag_aliases using btree (normalized_alias);

create index mentor_expertise_tags_tag_idx on public.mentor_expertise_tags using btree (expertise_tag_id);

create index startup_mentor_need_tags_semester_tag_idx on public.startup_mentor_need_tags using btree (semester_id, expertise_tag_id);

create trigger set_expertise_tags_updated_at
  before update on public.expertise_tags
  for each row
  execute function public.set_updated_at();

create policy "authenticated members read shared expertise aliases" on "public"."expertise_tag_aliases"
  for select
  to "authenticated"
  using ((private.current_profile_id() is not null));

create policy "tag creators add aliases" on "public"."expertise_tag_aliases"
  for insert
  to "authenticated"
  with check ((EXISTS ( SELECT 1
   FROM public.expertise_tags tag
  WHERE ((tag.id = expertise_tag_aliases.expertise_tag_id) AND (tag.created_by_profile_id = private.current_profile_id())))));

create policy "authenticated members create shared expertise tags" on "public"."expertise_tags"
  for insert
  to "authenticated"
  with check (((created_by_profile_id = private.current_profile_id()) AND (EXISTS ( SELECT 1
   FROM public.semester_memberships membership
  WHERE
    ((membership.profile_id = private.current_profile_id()) AND (membership.status = ANY (ARRAY['invited'::public.membership_lifecycle_status,
    'onboarding'::public.membership_lifecycle_status, 'active'::public.membership_lifecycle_status])))))));

create policy "authenticated members read shared expertise tags" on "public"."expertise_tags"
  for select
  to "authenticated"
  using ((private.current_profile_id() is not null));

create policy "mentors manage their own expertise tags" on "public"."mentor_expertise_tags"
  for all
  to "authenticated"
  using (((mentor_profile_id = private.current_profile_id()) or private.is_super_admin()))
  with check (((mentor_profile_id = private.current_profile_id()) OR private.is_super_admin()));

create policy "participants read mentor expertise tags" on "public"."mentor_expertise_tags"
  for select
  to "authenticated"
  using (((mentor_profile_id = private.current_profile_id()) or private.is_super_admin() or (exists ( select 1
   from public.semester_memberships membership
  where
    ((membership.profile_id = private.current_profile_id()) AND (membership.status = ANY (ARRAY['onboarding'::public.membership_lifecycle_status,
    'active'::public.membership_lifecycle_status])))))));

create policy "authorized users read startup mentor needs" on "public"."startup_mentor_need_tags"
  for select
  to "authenticated"
  using ((private.can_manage_semester(semester_id) or (exists ( select 1
   from (public.startup_team_memberships team
     JOIN public.semester_memberships membership on (((membership.id = team.semester_membership_id) AND (membership.semester_id = team.semester_id))))
  where
    ((team.startup_semester_id = startup_mentor_need_tags.startup_semester_id) AND (team.semester_id = startup_mentor_need_tags.semester_id) AND (membership.profile_id =
    private.current_profile_id()) AND (membership.role = 'startup'::public.user_role) AND
    (membership.status = ANY (ARRAY['invited'::public.membership_lifecycle_status, 'onboarding'::public.membership_lifecycle_status,
    'active'::public.membership_lifecycle_status])))))));

create policy "startup teams manage their mentor needs" on "public"."startup_mentor_need_tags"
  for all
  to "authenticated"
  using ((private.can_manage_semester(semester_id) or (exists ( select 1
   from (public.startup_team_memberships team
     JOIN public.semester_memberships membership on (((membership.id = team.semester_membership_id) AND (membership.semester_id = team.semester_id))))
  where
    ((team.startup_semester_id = startup_mentor_need_tags.startup_semester_id) AND (team.semester_id = startup_mentor_need_tags.semester_id) AND (membership.profile_id =
    private.current_profile_id()) AND (membership.role = 'startup'::public.user_role) AND
    (membership.status = ANY (ARRAY['invited'::public.membership_lifecycle_status, 'onboarding'::public.membership_lifecycle_status,
    'active'::public.membership_lifecycle_status])))))))
  with check ((private.can_manage_semester(semester_id) OR (EXISTS ( SELECT 1
   FROM (public.startup_team_memberships team
     JOIN public.semester_memberships membership ON (((membership.id = team.semester_membership_id) AND (membership.semester_id = team.semester_id))))
  WHERE
    ((team.startup_semester_id = startup_mentor_need_tags.startup_semester_id) AND (team.semester_id = startup_mentor_need_tags.semester_id) AND (membership.profile_id =
    private.current_profile_id()) AND (membership.role = 'startup'::public.user_role) AND
    (membership.status = ANY (ARRAY['invited'::public.membership_lifecycle_status, 'onboarding'::public.membership_lifecycle_status,
    'active'::public.membership_lifecycle_status])))))));

grant insert, select on table "public"."expertise_tag_aliases" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."expertise_tag_aliases" to "postgres";

grant insert, select on table "public"."expertise_tags" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."expertise_tags" to "postgres";

grant delete, insert, select on table "public"."mentor_expertise_tags" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."mentor_expertise_tags" to "postgres";

grant delete, insert, select on table "public"."startup_mentor_need_tags" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."startup_mentor_need_tags" to "postgres";
