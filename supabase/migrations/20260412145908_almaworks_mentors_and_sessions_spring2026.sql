ALTER TABLE public.mentors ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.mentors
  ADD COLUMN IF NOT EXISTS slug              text,
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS general_availability text,
  ADD COLUMN IF NOT EXISTS preferred_format  text,
  ADD COLUMN IF NOT EXISTS per_week_availability jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS opening_talk      text;

CREATE UNIQUE INDEX IF NOT EXISTS mentors_slug_key ON public.mentors(slug);

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS time_slot        text,
  ADD COLUMN IF NOT EXISTS format           text,
  ADD COLUMN IF NOT EXISTS startup_absent   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS substitute_name  text,
  ADD COLUMN IF NOT EXISTS is_confirmed     boolean NOT NULL DEFAULT true;

ALTER TABLE public.sessions ALTER COLUMN startup_id DROP NOT NULL;;
