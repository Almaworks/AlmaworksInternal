ALTER TABLE public.visa_application_orders
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_pi_idx
  ON public.visa_application_orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;;
