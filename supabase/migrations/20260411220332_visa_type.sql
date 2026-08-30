ALTER TABLE public.visa_application_drafts
  ADD COLUMN IF NOT EXISTS visa_type TEXT
  CHECK (visa_type IN ('L', 'Q1', 'Q2', 'M', 'S1', 'S2', 'X', 'Z'));

ALTER TABLE public.visa_application_orders
  ADD COLUMN IF NOT EXISTS visa_type TEXT
  CHECK (visa_type IN ('L', 'Q1', 'Q2', 'M', 'S1', 'S2', 'X', 'Z'));;
