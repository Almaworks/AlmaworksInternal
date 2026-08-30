ALTER TABLE public.visa_application_orders
  ADD COLUMN IF NOT EXISTS processing_tier TEXT;

-- Also add grants that may be missing
GRANT ALL ON public.agents TO postgres, service_role;
GRANT SELECT ON public.agents TO authenticated;
GRANT ALL ON public.visa_application_orders TO postgres, service_role;
GRANT SELECT, UPDATE ON public.visa_application_orders TO authenticated;
GRANT ALL ON public.visa_application_drafts TO postgres, service_role;
GRANT ALL ON public.visa_application_passenger_payloads TO postgres, service_role;
GRANT SELECT ON public.visa_application_passenger_payloads TO authenticated;
GRANT ALL ON public.visa_application_data_keys TO postgres, service_role;
GRANT SELECT ON public.visa_application_data_keys TO authenticated;;
