ALTER TABLE public.startups ADD COLUMN IF NOT EXISTS founders JSONB NOT NULL DEFAULT '[]'::jsonb;;
