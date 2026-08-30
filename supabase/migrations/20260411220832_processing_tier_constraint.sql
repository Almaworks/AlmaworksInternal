ALTER TABLE public.visa_application_orders
  DROP CONSTRAINT IF EXISTS visa_application_orders_processing_tier_check;

ALTER TABLE public.visa_application_orders
  ADD CONSTRAINT visa_application_orders_processing_tier_check
  CHECK (processing_tier IS NULL OR processing_tier IN ('standard', 'express', 'ultra_express'));;
