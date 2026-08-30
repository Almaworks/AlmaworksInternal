drop extension if exists "pg_net";

DO $$ BEGIN
  CREATE TYPE "public"."outreach_status" AS ENUM ('prospect', 'contacted', 'responded', 'onboarded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "public"."session_status" AS ENUM ('pending', 'confirmed', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "public"."startup_stage" AS ENUM ('idea', 'mvp', 'growth');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "public"."user_role" AS ENUM ('mentor', 'startup', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create table if not exists "public"."semesters" (
  "id" uuid not null default gen_random_uuid(),
  "name" text not null,
  "start_date" date not null,
  "end_date" date not null,
  "is_active" boolean not null default false,
  "created_at" timestamp with time zone not null default now()
);

create table if not exists "public"."profiles" (
  "id" uuid not null,
  "email" text not null,
  "role" public.user_role not null,
  "semester_id" uuid,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now()
);

create table if not exists "public"."session_dates" (
  "id" uuid not null default gen_random_uuid(),
  "semester_id" uuid not null,
  "date" date not null,
  "label" text,
  "created_at" timestamp with time zone not null default now()
);

create table if not exists "public"."mentors" (
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

create table if not exists "public"."startups" (
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

create table if not exists "public"."availability" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "session_date_id" uuid not null,
  "is_available" boolean not null default true,
  "created_at" timestamp with time zone not null default now()
);

create table if not exists "public"."sessions" (
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

create table if not exists "public"."outreach" (
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

-- Primary keys
DO $$ BEGIN alter table "public"."semesters" add constraint "semesters_pkey" PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."session_dates" add constraint "session_dates_pkey" PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."mentors" add constraint "mentors_pkey" PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."startups" add constraint "startups_pkey" PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."availability" add constraint "availability_pkey" PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."sessions" add constraint "sessions_pkey" PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."outreach" add constraint "outreach_pkey" PRIMARY KEY (id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS one_active_semester ON public.semesters (is_active) WHERE (is_active = true);
CREATE UNIQUE INDEX IF NOT EXISTS availability_user_id_session_date_id_key ON public.availability (user_id, session_date_id);
CREATE UNIQUE INDEX IF NOT EXISTS mentors_user_id_semester_id_key ON public.mentors (user_id, semester_id);
CREATE UNIQUE INDEX IF NOT EXISTS startups_user_id_semester_id_key ON public.startups (user_id, semester_id);
CREATE UNIQUE INDEX IF NOT EXISTS session_dates_semester_id_date_key ON public.session_dates (semester_id, date);

DO $$ BEGIN alter table "public"."availability" add constraint "availability_user_id_session_date_id_key" UNIQUE using index "availability_user_id_session_date_id_key"; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."mentors" add constraint "mentors_user_id_semester_id_key" UNIQUE using index "mentors_user_id_semester_id_key"; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."startups" add constraint "startups_user_id_semester_id_key" UNIQUE using index "startups_user_id_semester_id_key"; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."session_dates" add constraint "session_dates_semester_id_date_key" UNIQUE using index "session_dates_semester_id_date_key"; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS availability_date_idx ON public.availability (session_date_id);
CREATE INDEX IF NOT EXISTS availability_user_idx ON public.availability (user_id);
CREATE INDEX IF NOT EXISTS mentors_semester_idx ON public.mentors (semester_id);
CREATE INDEX IF NOT EXISTS mentors_tags_idx ON public.mentors USING gin (expertise_tags);
CREATE INDEX IF NOT EXISTS outreach_semester_idx ON public.outreach (semester_id);
CREATE INDEX IF NOT EXISTS outreach_status_idx ON public.outreach (status);
CREATE INDEX IF NOT EXISTS outreach_tags_idx ON public.outreach USING gin (expertise_tags);
CREATE INDEX IF NOT EXISTS session_dates_semester_idx ON public.session_dates (semester_id);
CREATE INDEX IF NOT EXISTS sessions_mentor_idx ON public.sessions (mentor_id);
CREATE INDEX IF NOT EXISTS sessions_semester_idx ON public.sessions (semester_id);
CREATE INDEX IF NOT EXISTS sessions_startup_idx ON public.sessions (startup_id);
CREATE INDEX IF NOT EXISTS sessions_status_idx ON public.sessions (status);
CREATE INDEX IF NOT EXISTS startups_semester_idx ON public.startups (semester_id);
CREATE INDEX IF NOT EXISTS startups_tags_idx ON public.startups USING gin (preferred_tags);

-- Foreign keys
DO $$ BEGIN alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."profiles" add constraint "profiles_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."session_dates" add constraint "session_dates_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."mentors" add constraint "mentors_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."mentors" add constraint "mentors_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."startups" add constraint "startups_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."startups" add constraint "startups_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."availability" add constraint "availability_session_date_id_fkey" FOREIGN KEY (session_date_id) REFERENCES public.session_dates(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."availability" add constraint "availability_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."sessions" add constraint "sessions_mentor_id_fkey" FOREIGN KEY (mentor_id) REFERENCES public.mentors(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."sessions" add constraint "sessions_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."sessions" add constraint "sessions_session_date_id_fkey" FOREIGN KEY (session_date_id) REFERENCES public.session_dates(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."sessions" add constraint "sessions_startup_id_fkey" FOREIGN KEY (startup_id) REFERENCES public.startups(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."outreach" add constraint "outreach_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES public.profiles(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."outreach" add constraint "outreach_converted_mentor_id_fkey" FOREIGN KEY (converted_mentor_id) REFERENCES public.mentors(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN alter table "public"."outreach" add constraint "outreach_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semesters(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Functions
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
begin
  insert into public.profiles (id, email, role, status, full_name)
  values (new.id, new.email, coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'startup'::public.user_role), 'pending', coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'));
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $function$
begin new.updated_at = now(); return new; end;
$function$;

-- Triggers
DROP TRIGGER IF EXISTS mentors_updated_at ON public.mentors;
CREATE TRIGGER mentors_updated_at BEFORE UPDATE ON public.mentors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS outreach_updated_at ON public.outreach;
CREATE TRIGGER outreach_updated_at BEFORE UPDATE ON public.outreach FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS sessions_updated_at ON public.sessions;
CREATE TRIGGER sessions_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS startups_updated_at ON public.startups;
CREATE TRIGGER startups_updated_at BEFORE UPDATE ON public.startups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS
alter table "public"."availability" enable row level security;
alter table "public"."mentors" enable row level security;
alter table "public"."outreach" enable row level security;
alter table "public"."profiles" enable row level security;
alter table "public"."session_dates" enable row level security;
alter table "public"."sessions" enable row level security;
alter table "public"."semesters" enable row level security;
alter table "public"."startups" enable row level security;

-- Grants
grant all on table "public"."availability" to "anon", "authenticated", "service_role";
grant all on table "public"."mentors" to "anon", "authenticated", "service_role";
grant all on table "public"."outreach" to "anon", "authenticated", "service_role";
grant all on table "public"."profiles" to "anon", "authenticated", "service_role";
grant all on table "public"."semesters" to "anon", "authenticated", "service_role";
grant all on table "public"."session_dates" to "anon", "authenticated", "service_role";
grant all on table "public"."sessions" to "anon", "authenticated", "service_role";
grant all on table "public"."startups" to "anon", "authenticated", "service_role";

-- RLS Policies
create policy "admins can view all availability" on "public"."availability" as permissive for select to public using ((( SELECT profiles.role FROM public.profiles WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "users can insert own availability" on "public"."availability" as permissive for insert to public with check ((user_id = auth.uid()));
create policy "users can update own availability" on "public"."availability" as permissive for update to public using ((user_id = auth.uid()));
create policy "users can view own availability" on "public"."availability" as permissive for select to public using ((user_id = auth.uid()));
create policy "admins can delete mentor profiles" on "public"."mentors" as permissive for delete to public using ((( SELECT profiles.role FROM public.profiles WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can insert mentor profiles" on "public"."mentors" as permissive for insert to public with check ((( SELECT profiles.role FROM public.profiles WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "mentors can update own profile" on "public"."mentors" as permissive for update to public using ((user_id = auth.uid()));
create policy "mentors can view all mentor profiles" on "public"."mentors" as permissive for select to public using ((( SELECT profiles.role FROM public.profiles WHERE (profiles.id = auth.uid())) = ANY (ARRAY['mentor'::public.user_role, 'startup'::public.user_role, 'admin'::public.user_role])));
create policy "admins can manage all outreach" on "public"."outreach" as permissive for all to public using ((( SELECT profiles.role FROM public.profiles WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can insert profiles" on "public"."profiles" as permissive for insert to public with check ((( SELECT profiles_1.role FROM public.profiles profiles_1 WHERE (profiles_1.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can update all profiles" on "public"."profiles" as permissive for update to public using ((( SELECT profiles_1.role FROM public.profiles profiles_1 WHERE (profiles_1.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can view all profiles" on "public"."profiles" as permissive for select to public using ((( SELECT profiles_1.role FROM public.profiles profiles_1 WHERE (profiles_1.id = auth.uid())) = 'admin'::public.user_role));
create policy "users can update own profile" on "public"."profiles" as permissive for update to public using ((auth.uid() = id));
create policy "users can view own profile" on "public"."profiles" as permissive for select to public using ((auth.uid() = id));
create policy "admins can manage session dates" on "public"."session_dates" as permissive for all to public using ((( SELECT profiles.role FROM public.profiles WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "all authenticated users can view session dates" on "public"."session_dates" as permissive for select to public using ((auth.uid() IS NOT NULL));
create policy "admins can delete sessions" on "public"."sessions" as permissive for delete to public using ((( SELECT profiles.role FROM public.profiles WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can insert sessions" on "public"."sessions" as permissive for insert to public with check ((( SELECT profiles.role FROM public.profiles WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can update sessions" on "public"."sessions" as permissive for update to public using ((( SELECT profiles.role FROM public.profiles WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can view all sessions" on "public"."sessions" as permissive for select to public using ((( SELECT profiles.role FROM public.profiles WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "mentors can view own sessions" on "public"."sessions" as permissive for select to public using ((mentor_id IN ( SELECT mentors.id FROM public.mentors WHERE (mentors.user_id = auth.uid()))));
create policy "startups can insert session requests" on "public"."sessions" as permissive for insert to public with check ((startup_id IN ( SELECT startups.id FROM public.startups WHERE (startups.user_id = auth.uid()))));
create policy "startups can view own sessions" on "public"."sessions" as permissive for select to public using ((startup_id IN ( SELECT startups.id FROM public.startups WHERE (startups.user_id = auth.uid()))));
create policy "admins can delete startup profiles" on "public"."startups" as permissive for delete to public using ((( SELECT profiles.role FROM public.profiles WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "admins can insert startup profiles" on "public"."startups" as permissive for insert to public with check ((( SELECT profiles.role FROM public.profiles WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role));
create policy "mentors and admins can view all startups" on "public"."startups" as permissive for select to public using ((( SELECT profiles.role FROM public.profiles WHERE (profiles.id = auth.uid())) = ANY (ARRAY['mentor'::public.user_role, 'admin'::public.user_role])));
create policy "startups can update own profile" on "public"."startups" as permissive for update to public using ((user_id = auth.uid()));
create policy "startups can view own profile" on "public"."startups" as permissive for select to public using ((user_id = auth.uid()));;
