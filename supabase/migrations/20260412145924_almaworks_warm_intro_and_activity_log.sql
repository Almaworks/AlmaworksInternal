ALTER TABLE public.outreach
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS referred_by text;

CREATE INDEX IF NOT EXISTS outreach_source_channel_idx ON public.outreach (source_channel);

CREATE TABLE IF NOT EXISTS public.outreach_activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_id uuid NOT NULL REFERENCES public.outreach(id) ON DELETE CASCADE,
  semester_id uuid NOT NULL REFERENCES public.semesters(id),
  admin_id    uuid NOT NULL REFERENCES public.profiles(id),
  action_type text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outreach_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can manage outreach activity"
  ON public.outreach_activity_log AS PERMISSIVE FOR ALL TO public
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::public.user_role);

CREATE INDEX IF NOT EXISTS outreach_activity_log_outreach_idx ON public.outreach_activity_log (outreach_id);
CREATE INDEX IF NOT EXISTS outreach_activity_log_created_idx ON public.outreach_activity_log (created_at DESC);;
