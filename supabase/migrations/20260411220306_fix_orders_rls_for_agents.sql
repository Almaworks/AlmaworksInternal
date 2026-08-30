DROP POLICY IF EXISTS "orders_select_for_agent" ON public.visa_application_orders;

CREATE POLICY "orders_select_for_agent"
  ON public.visa_application_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.agents a WHERE a.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "orders_update_for_agent" ON public.visa_application_orders;

CREATE POLICY "orders_update_for_agent"
  ON public.visa_application_orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.agents a WHERE a.user_id = auth.uid())
  )
  WITH CHECK (
    status IN ('paid', 'processing', 'completed')
    AND EXISTS (SELECT 1 FROM public.agents a WHERE a.user_id = auth.uid())
  );;
