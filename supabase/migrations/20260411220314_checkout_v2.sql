ALTER TABLE public.visa_application_orders
  ADD COLUMN IF NOT EXISTS consular_fee_cents    INTEGER,
  ADD COLUMN IF NOT EXISTS service_fee_cents     INTEGER,
  ADD COLUMN IF NOT EXISTS shipping_tier         TEXT,
  ADD COLUMN IF NOT EXISTS shipping_fee_cents    INTEGER,
  ADD COLUMN IF NOT EXISTS insurance_fee_cents   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contact_email         TEXT,
  ADD COLUMN IF NOT EXISTS shipping_address      JSONB,
  ADD COLUMN IF NOT EXISTS terms_version         TEXT,
  ADD COLUMN IF NOT EXISTS terms_agreed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_agreed_ip       TEXT,
  ADD COLUMN IF NOT EXISTS terms_user_agent      TEXT;;
