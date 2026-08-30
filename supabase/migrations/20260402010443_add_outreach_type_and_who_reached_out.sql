
-- Add outreach_type tags (e.g. Sponsorship, Partnership, Mentor, Investor)
ALTER TABLE public.outreach
  ADD COLUMN IF NOT EXISTS outreach_type text[] NOT NULL DEFAULT '{}';

-- Add who_reached_out field (name of admin/person who last contacted)
ALTER TABLE public.outreach
  ADD COLUMN IF NOT EXISTS who_reached_out text;
;
