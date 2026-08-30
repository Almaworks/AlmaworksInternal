drop extension if exists "pg_net";
create type "public"."outreach_status" as enum ('prospect', 'contacted', 'responded', 'onboarded');
create type "public"."session_status" as enum ('pending', 'confirmed', 'declined');
create type "public"."startup_stage" as enum ('idea', 'mvp', 'growth');
create type "public"."user_role" as enum ('mentor', 'startup', 'admin');
create table "public"."availability" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "session_date_id" uuid not null,
    "is_available" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."availability" enable row level security;
create table "public"."mentors" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "semester_id" uuid not null,
    "full_name" text not null,
    "company" text,
    "role_title" text,
    "bio" text,
    "linkedin_url" text,
    "website_url" text,
    "photo_url" text,
    "expertise_tags" text[] not null default '{}'::text[],
    "mentorship_goals" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."mentors" enable row level security;
create table "public"."outreach" (
    "id" uuid not null default gen_random_uuid(),
    "admin_id" uuid not null,
    "semester_id" uuid not null,
    "prospect_name" text not null,
    "prospect_email" text,
    "linkedin_url" text,
    "company" text,
    "expertise_tags" text[] not null default '{}'::text[],
    "status" public.outreach_status not null default 'prospect'::public.outreach_status,
    "notes" text,
    "last_contacted_at" timestamp with time zone,
    "converted_mentor_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."outreach" enable row level security;
create table "public"."profiles" (
    "id" uuid not null,
    "email" text not null,
    "role" public.user_role not null,
    "semester_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."profiles" enable row level security;
create table "public"."semesters" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "start_date" date not null,
    "end_date" date not null,
    "is_active" boolean not null default false,
    "created_at" timestamp with time zone not null default now()
      );
create table "public"."session_dates" (
    "id" uuid not null default gen_random_uuid(),
    "semester_id" uuid not null,
    "date" date not null,
    "label" text,
    "created_at" timestamp with time zone not null default now()
      );
alter table "public"."session_dates" enable row level security;
create table "public"."sessions" (
    "id" uuid not null default gen_random_uuid(),
    "startup_id" uuid not null,
    "mentor_id" uuid not null,
    "session_date_id" uuid not null,
    "semester_id" uuid not null,
    "topic" text,
    "status" public.session_status not null default 'pending'::public.session_status,
    "notes" text,
    "requested_at" timestamp with time zone not null default now(),
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."sessions" enable row level security;
create table "public"."startups" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "semester_id" uuid not null,
    "name" text not null,
    "description" text,
    "industry" text,
    "stage" public.startup_stage,
    "logo_url" text,
    "website" text,
    "founder_name" text,
    "mentor_preferences" text,
    "preferred_tags" text[] not null default '{}'::text[],
    "semester_goals" text[] not null default '{}'::text[],
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );
alter table "public"."startups" enable row level security;
CREATE INDEX availability_date_idx ON public.availability USING btree (session_date_id);
CREATE UNIQUE INDEX availability_pkey ON public.availability USING btree (id);
CREATE UNIQUE INDEX availability_user_id_session_date_id_key ON public.availability USING btree (user_id, session_date_id);
CREATE INDEX availability_user_idx ON public.availability USING btree (user_id);
CREATE UNIQUE INDEX mentors_pkey ON public.mentors USING btree (id);
CREATE INDEX mentors_semester_idx ON public.mentors USING btree (semester_id);
CREATE INDEX mentors_tags_idx ON public.mentors USING gin (expertise_tags);
CREATE UNIQUE INDEX mentors_user_id_semester_id_key ON public.mentors USING btree (user_id, semester_id);
CREATE UNIQUE INDEX one_active_semester ON public.semesters USING btree (is_active) WHERE (is_active = true);
CREATE UNIQUE INDEX outreach_pkey ON public.outreach USING btree (id);
CREATE INDEX outreach_semester_idx ON public.outreach USING btree (semester_id);
CREATE INDEX outreach_status_idx ON public.outreach USING btree (status);
CREATE INDEX outreach_tags_idx ON public.outreach USING gin (expertise_tags);
CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);
CREATE UNIQUE INDEX semesters_pkey ON public.semesters USING btree (id);
CREATE UNIQUE INDEX session_dates_pkey ON public.session_dates USING btree (id);
CREATE UNIQUE INDEX session_dates_semester_id_date_key ON public.session_dates USING btree (semester_id, date);
CREATE INDEX session_dates_semester_idx ON public.session_dates USING btree (semester_id);
CREATE INDEX sessions_mentor_idx ON public.sessions USING btree (mentor_id);
CREATE UNIQUE INDEX sessions_pkey ON public.sessions USING btree (id);
CREATE INDEX sessions_semester_idx ON public.sessions USING btree (semester_id);
CREATE INDEX sessions_startup_idx ON public.sessions USING btree (startup_id);
CREATE INDEX sessions_status_idx ON public.sessions USING btree (status);
CREATE UNIQUE INDEX startups_pkey ON public.startups USING btree (id);
CREATE INDEX startups_semester_idx ON public.startups USING btree (semester_id);
CREATE INDEX startups_tags_idx ON public.startups USING gin (preferred_tags);
CREATE UNIQUE INDEX startups_user_id_semester_id_key ON public.startups USING btree (user_id, semester_id);
alter table "public"."availability" add constraint "availability_pkey" PRIMARY KEY using index "availability_pkey";
alter table "public"."mentors" add constraint "mentors_pkey" PRIMARY KEY using index "mentors_pkey";
alter table "public"."outreach" add constraint "outreach_pkey" PRIMARY KEY using index "outreach_pkey";
alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";
alter table "public"."semesters" add constraint "semesters_pkey" PRIMARY KEY using index "semesters_pkey";
alter table "public"."session_dates" add constraint "session_dates_pkey" PRIMARY KEY using index "session_dates_pkey";
alter table "public"."sessions" add constraint "sessions_pkey" PRIMARY KEY using index "sessions_pkey";
alter table "public"."startups" add constraint "startups_pkey" PRIMARY KEY using index "startups_pkey";
alter table "public"."availability" add constraint "availability_session_date_id_fkey" FOREIGN KEY (session_date_id) REFERENCES public.session_dates(id) ON DELETE CASCADE not valid;
alter table "public"."availability" validate constraint "availability_session_date_id_fkey";
alter table "public"."availability" add constraint "availability_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;
alter table "public"."availability" validate constraint "availability_user_id_fkey";
alter table "public"."availability" add constraint "availability_user_id_session_date_id_key" UNIQUE using index "availability_user_id_session_date_id_key";
alter table "public"."mentors" add constraint "mentors_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) not valid;
alter table "public"."mentors" validate constraint "mentors_semester_id_fkey";
alter table "public"."mentors" add constraint "mentors_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;
alter table "public"."mentors" validate constraint "mentors_user_id_fkey";
alter table "public"."mentors" add constraint "mentors_user_id_semester_id_key" UNIQUE using index "mentors_user_id_semester_id_key";
alter table "public"."outreach" add constraint "outreach_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES public.profiles(id) not valid;
alter table "public"."outreach" validate constraint "outreach_admin_id_fkey";
alter table "public"."outreach" add constraint "outreach_converted_mentor_id_fkey" FOREIGN KEY (converted_mentor_id) REFERENCES public.mentors(id) not valid;
alter table "public"."outreach" validate constraint "outreach_converted_mentor_id_fkey";
alter table "public"."outreach" add constraint "outreach_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) not valid;
alter table "public"."outreach" validate constraint "outreach_semester_id_fkey";
alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;
alter table "public"."profiles" validate constraint "profiles_id_fkey";
alter table "public"."profiles" add constraint "profiles_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) not valid;
alter table "public"."profiles" validate constraint "profiles_semester_id_fkey";
alter table "public"."session_dates" add constraint "session_dates_semester_id_date_key" UNIQUE using index "session_dates_semester_id_date_key";
alter table "public"."session_dates" add constraint "session_dates_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) not valid;
alter table "public"."session_dates" validate constraint "session_dates_semester_id_fkey";
alter table "public"."sessions" add constraint "sessions_mentor_id_fkey" FOREIGN KEY (mentor_id) REFERENCES public.mentors(id) ON DELETE CASCADE not valid;
alter table "public"."sessions" validate constraint "sessions_mentor_id_fkey";
alter table "public"."sessions" add constraint "sessions_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) not valid;
alter table "public"."sessions" validate constraint "sessions_semester_id_fkey";
alter table "public"."sessions" add constraint "sessions_session_date_id_fkey" FOREIGN KEY (session_date_id) REFERENCES public.session_dates(id) not valid;
alter table "public"."sessions" validate constraint "sessions_session_date_id_fkey";
alter table "public"."sessions" add constraint "sessions_startup_id_fkey" FOREIGN KEY (startup_id) REFERENCES public.startups(id) ON DELETE CASCADE not valid;
alter table "public"."sessions" validate constraint "sessions_startup_id_fkey";
alter table "public"."startups" add constraint "startups_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id) not valid;
alter table "public"."startups" validate constraint "startups_semester_id_fkey";
alter table "public"."startups" add constraint "startups_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;
alter table "public"."startups" validate constraint "startups_user_id_fkey";
alter table "public"."startups" add constraint "startups_user_id_semester_id_key" UNIQUE using index "startups_user_id_semester_id_key";
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into profiles (id, email, role)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'startup')
  );
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
grant delete on table "public"."availability" to "anon";
grant insert on table "public"."availability" to "anon";
grant references on table "public"."availability" to "anon";
grant select on table "public"."availability" to "anon";
grant trigger on table "public"."availability" to "anon";
grant truncate on table "public"."availability" to "anon";
grant update on table "public"."availability" to "anon";
grant delete on table "public"."availability" to "authenticated";
grant insert on table "public"."availability" to "authenticated";
grant references on table "public"."availability" to "authenticated";
grant select on table "public"."availability" to "authenticated";
grant trigger on table "public"."availability" to "authenticated";
grant truncate on table "public"."availability" to "authenticated";
grant update on table "public"."availability" to "authenticated";
grant delete on table "public"."availability" to "service_role";
grant insert on table "public"."availability" to "service_role";
grant references on table "public"."availability" to "service_role";
grant select on table "public"."availability" to "service_role";
grant trigger on table "public"."availability" to "service_role";
grant truncate on table "public"."availability" to "service_role";
grant update on table "public"."availability" to "service_role";
grant delete on table "public"."mentors" to "anon";
grant insert on table "public"."mentors" to "anon";
grant references on table "public"."mentors" to "anon";
grant select on table "public"."mentors" to "anon";
grant trigger on table "public"."mentors" to "anon";
grant truncate on table "public"."mentors" to "anon";
grant update on table "public"."mentors" to "anon";
grant delete on table "public"."mentors" to "authenticated";
grant insert on table "public"."mentors" to "authenticated";
grant references on table "public"."mentors" to "authenticated";
grant select on table "public"."mentors" to "authenticated";
grant trigger on table "public"."mentors" to "authenticated";
grant truncate on table "public"."mentors" to "authenticated";
grant update on table "public"."mentors" to "authenticated";
grant delete on table "public"."mentors" to "service_role";
grant insert on table "public"."mentors" to "service_role";
grant references on table "public"."mentors" to "service_role";
grant select on table "public"."mentors" to "service_role";
grant trigger on table "public"."mentors" to "service_role";
grant truncate on table "public"."mentors" to "service_role";
grant update on table "public"."mentors" to "service_role";
grant delete on table "public"."outreach" to "anon";
grant insert on table "public"."outreach" to "anon";
grant references on table "public"."outreach" to "anon";
grant select on table "public"."outreach" to "anon";
grant trigger on table "public"."outreach" to "anon";
grant truncate on table "public"."outreach" to "anon";
grant update on table "public"."outreach" to "anon";
grant delete on table "public"."outreach" to "authenticated";
grant insert on table "public"."outreach" to "authenticated";
grant references on table "public"."outreach" to "authenticated";
grant select on table "public"."outreach" to "authenticated";
grant trigger on table "public"."outreach" to "authenticated";
grant truncate on table "public"."outreach" to "authenticated";
grant update on table "public"."outreach" to "authenticated";
grant delete on table "public"."outreach" to "service_role";
grant insert on table "public"."outreach" to "service_role";
grant references on table "public"."outreach" to "service_role";
grant select on table "public"."outreach" to "service_role";
grant trigger on table "public"."outreach" to "service_role";
grant truncate on table "public"."outreach" to "service_role";
grant update on table "public"."outreach" to "service_role";
grant delete on table "public"."profiles" to "anon";
grant insert on table "public"."profiles" to "anon";
grant references on table "public"."profiles" to "anon";
grant select on table "public"."profiles" to "anon";
grant trigger on table "public"."profiles" to "anon";
grant truncate on table "public"."profiles" to "anon";
grant update on table "public"."profiles" to "anon";
grant delete on table "public"."profiles" to "authenticated";
grant insert on table "public"."profiles" to "authenticated";
grant references on table "public"."profiles" to "authenticated";
grant select on table "public"."profiles" to "authenticated";
grant trigger on table "public"."profiles" to "authenticated";
grant truncate on table "public"."profiles" to "authenticated";
grant update on table "public"."profiles" to "authenticated";
grant delete on table "public"."profiles" to "service_role";
grant insert on table "public"."profiles" to "service_role";
grant references on table "public"."profiles" to "service_role";
grant select on table "public"."profiles" to "service_role";
grant trigger on table "public"."profiles" to "service_role";
grant truncate on table "public"."profiles" to "service_role";
grant update on table "public"."profiles" to "service_role";
grant delete on table "public"."semesters" to "anon";
grant insert on table "public"."semesters" to "anon";
grant references on table "public"."semesters" to "anon";
grant select on table "public"."semesters" to "anon";
grant trigger on table "public"."semesters" to "anon";
grant truncate on table "public"."semesters" to "anon";
grant update on table "public"."semesters" to "anon";
grant delete on table "public"."semesters" to "authenticated";
grant insert on table "public"."semesters" to "authenticated";
grant references on table "public"."semesters" to "authenticated";
grant select on table "public"."semesters" to "authenticated";
grant trigger on table "public"."semesters" to "authenticated";
grant truncate on table "public"."semesters" to "authenticated";
grant update on table "public"."semesters" to "authenticated";
grant delete on table "public"."semesters" to "service_role";
grant insert on table "public"."semesters" to "service_role";
grant references on table "public"."semesters" to "service_role";
grant select on table "public"."semesters" to "service_role";
grant trigger on table "public"."semesters" to "service_role";
grant truncate on table "public"."semesters" to "service_role";
grant update on table "public"."semesters" to "service_role";
grant delete on table "public"."session_dates" to "anon";
grant insert on table "public"."session_dates" to "anon";
grant references on table "public"."session_dates" to "anon";
grant select on table "public"."session_dates" to "anon";
grant trigger on table "public"."session_dates" to "anon";
grant truncate on table "public"."session_dates" to "anon";
grant update on table "public"."session_dates" to "anon";
grant delete on table "public"."session_dates" to "authenticated";
grant insert on table "public"."session_dates" to "authenticated";
grant references on table "public"."session_dates" to "authenticated";
grant select on table "public"."session_dates" to "authenticated";
grant trigger on table "public"."session_dates" to "authenticated";
grant truncate on table "public"."session_dates" to "authenticated";
grant update on table "public"."session_dates" to "authenticated";
grant delete on table "public"."session_dates" to "service_role";
grant insert on table "public"."session_dates" to "service_role";
grant references on table "public"."session_dates" to "service_role";
grant select on table "public"."session_dates" to "service_role";
grant trigger on table "public"."session_dates" to "service_role";
grant truncate on table "public"."session_dates" to "service_role";
grant update on table "public"."session_dates" to "service_role";
grant delete on table "public"."sessions" to "anon";
grant insert on table "public"."sessions" to "anon";
grant references on table "public"."sessions" to "anon";
grant select on table "public"."sessions" to "anon";
grant trigger on table "public"."sessions" to "anon";
grant truncate on table "public"."sessions" to "anon";
grant update on table "public"."sessions" to "anon";
grant delete on table "public"."sessions" to "authenticated";
grant insert on table "public"."sessions" to "authenticated";
grant references on table "public"."sessions" to "authenticated";
grant select on table "public"."sessions" to "authenticated";
grant trigger on table "public"."sessions" to "authenticated";
grant truncate on table "public"."sessions" to "authenticated";
grant update on table "public"."sessions" to "authenticated";
grant delete on table "public"."sessions" to "service_role";
grant insert on table "public"."sessions" to "service_role";
grant references on table "public"."sessions" to "service_role";
grant select on table "public"."sessions" to "service_role";
grant trigger on table "public"."sessions" to "service_role";
grant truncate on table "public"."sessions" to "service_role";
grant update on table "public"."sessions" to "service_role";
grant delete on table "public"."startups" to "anon";
grant insert on table "public"."startups" to "anon";
grant references on table "public"."startups" to "anon";
grant select on table "public"."startups" to "anon";
grant trigger on table "public"."startups" to "anon";
grant truncate on table "public"."startups" to "anon";
grant update on table "public"."startups" to "anon";
grant delete on table "public"."startups" to "authenticated";
grant insert on table "public"."startups" to "authenticated";
grant references on table "public"."startups" to "authenticated";
grant select on table "public"."startups" to "authenticated";
grant trigger on table "public"."startups" to "authenticated";
grant truncate on table "public"."startups" to "authenticated";
grant update on table "public"."startups" to "authenticated";
grant delete on table "public"."startups" to "service_role";
grant insert on table "public"."startups" to "service_role";
grant references on table "public"."startups" to "service_role";
grant select on table "public"."startups" to "service_role";
grant trigger on table "public"."startups" to "service_role";
grant truncate on table "public"."startups" to "service_role";
grant update on table "public"."startups" to "service_role";
create policy "admins can view all availability"
  on "public"."availability"
  as permissive
  for select
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "users can insert own availability"
  on "public"."availability"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));
create policy "users can update own availability"
  on "public"."availability"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));
create policy "users can view own availability"
  on "public"."availability"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));
create policy "admins can delete mentor profiles"
  on "public"."mentors"
  as permissive
  for delete
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can insert mentor profiles"
  on "public"."mentors"
  as permissive
  for insert
  to public
with check ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "mentors can update own profile"
  on "public"."mentors"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));
create policy "mentors can view all mentor profiles"
  on "public"."mentors"
  as permissive
  for select
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['mentor'::public.user_role, 'startup'::public.user_role, 'admin'::public.user_role])));
create policy "admins can manage all outreach"
  on "public"."outreach"
  as permissive
  for all
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can insert profiles"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((( SELECT profiles_1.role
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can update all profiles"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((( SELECT profiles_1.role
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can view all profiles"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((( SELECT profiles_1.role
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = auth.uid())) = 'admin'::public.user_role));
create policy "users can update own profile"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((auth.uid() = id));
create policy "users can view own profile"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((auth.uid() = id));
create policy "admins can manage session dates"
  on "public"."session_dates"
  as permissive
  for all
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "all authenticated users can view session dates"
  on "public"."session_dates"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));
create policy "admins can delete sessions"
  on "public"."sessions"
  as permissive
  for delete
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can insert sessions"
  on "public"."sessions"
  as permissive
  for insert
  to public
with check ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can update sessions"
  on "public"."sessions"
  as permissive
  for update
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can view all sessions"
  on "public"."sessions"
  as permissive
  for select
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "mentors can view own sessions"
  on "public"."sessions"
  as permissive
  for select
  to public
using ((mentor_id IN ( SELECT mentors.id
   FROM public.mentors
  WHERE (mentors.user_id = auth.uid()))));
create policy "startups can insert session requests"
  on "public"."sessions"
  as permissive
  for insert
  to public
with check ((startup_id IN ( SELECT startups.id
   FROM public.startups
  WHERE (startups.user_id = auth.uid()))));
create policy "startups can view own sessions"
  on "public"."sessions"
  as permissive
  for select
  to public
using ((startup_id IN ( SELECT startups.id
   FROM public.startups
  WHERE (startups.user_id = auth.uid()))));
create policy "admins can delete startup profiles"
  on "public"."startups"
  as permissive
  for delete
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can insert startup profiles"
  on "public"."startups"
  as permissive
  for insert
  to public
with check ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "mentors and admins can view all startups"
  on "public"."startups"
  as permissive
  for select
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['mentor'::public.user_role, 'admin'::public.user_role])));
create policy "startups can update own profile"
  on "public"."startups"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));
create policy "startups can view own profile"
  on "public"."startups"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));
CREATE TRIGGER mentors_updated_at BEFORE UPDATE ON public.mentors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER outreach_updated_at BEFORE UPDATE ON public.outreach FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER sessions_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER startups_updated_at BEFORE UPDATE ON public.startups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
create policy "anyone can view mentor photos"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'mentor-photos'::text));
create policy "anyone can view startup logos"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'startup-logos'::text));
create policy "authenticated users can upload mentor photos"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'mentor-photos'::text) AND (auth.uid() IS NOT NULL)));
create policy "authenticated users can upload startup logos"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'startup-logos'::text) AND (auth.uid() IS NOT NULL)));
create policy "users can update own mentor photo"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'mentor-photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
