CREATE TABLE IF NOT EXISTS public.visa_business_key (
  id          BOOLEAN     PRIMARY KEY DEFAULT TRUE,
  public_key_jwk JSONB    NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID        REFERENCES public.agents(id),
  CONSTRAINT single_row CHECK (id = TRUE)
);

ALTER TABLE public.visa_business_key ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.visa_business_key TO postgres, service_role;;
