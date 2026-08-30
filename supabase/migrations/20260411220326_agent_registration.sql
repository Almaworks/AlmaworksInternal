ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.agent_registration_requests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT        NOT NULL,
  full_name      TEXT        NOT NULL,
  message        TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by    UUID        REFERENCES public.agents(id),
  reviewed_at    TIMESTAMPTZ,
  temp_password       TEXT,
  requested_password  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.agent_registration_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_insert_registration_requests"
  ON public.agent_registration_requests
  FOR INSERT
  WITH CHECK (true);

GRANT ALL ON public.agent_registration_requests TO postgres, anon, authenticated, service_role;;
