ALTER TABLE public.startups ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS startups_slug_key ON public.startups(slug);;
