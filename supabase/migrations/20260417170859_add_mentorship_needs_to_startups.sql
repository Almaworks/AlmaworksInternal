ALTER TABLE public.startups ADD COLUMN IF NOT EXISTS mentorship_needs text[] NOT NULL DEFAULT '{}';;
