ALTER TABLE public.outreach
  ADD COLUMN IF NOT EXISTS outreach_type text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.outreach
  ADD COLUMN IF NOT EXISTS who_reached_out text;;
