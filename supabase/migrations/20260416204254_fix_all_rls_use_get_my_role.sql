
-- Replace every policy that does an inline subquery on profiles with the
-- get_my_role() security-definer function.  This avoids nested RLS
-- evaluation and keeps the pattern consistent across all tables.

-- availability
DROP POLICY IF EXISTS "admins can view all availability" ON public.availability;
CREATE POLICY "admins can view all availability" ON public.availability
  FOR SELECT USING (public.get_my_role() = 'admin'::public.user_role);

-- mentors
DROP POLICY IF EXISTS "admins can delete mentor profiles" ON public.mentors;
CREATE POLICY "admins can delete mentor profiles" ON public.mentors
  FOR DELETE USING (public.get_my_role() = 'admin'::public.user_role);

DROP POLICY IF EXISTS "admins can insert mentor profiles" ON public.mentors;
CREATE POLICY "admins can insert mentor profiles" ON public.mentors
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin'::public.user_role);

DROP POLICY IF EXISTS "mentors can view all mentor profiles" ON public.mentors;
CREATE POLICY "mentors can view all mentor profiles" ON public.mentors
  FOR SELECT USING (
    public.get_my_role() = ANY (ARRAY['mentor'::public.user_role, 'startup'::public.user_role, 'admin'::public.user_role])
  );

-- outreach
DROP POLICY IF EXISTS "admins can manage all outreach" ON public.outreach;
CREATE POLICY "admins can manage all outreach" ON public.outreach
  FOR ALL USING (public.get_my_role() = 'admin'::public.user_role);

-- outreach_activity_log
DROP POLICY IF EXISTS "admins can manage outreach activity" ON public.outreach_activity_log;
CREATE POLICY "admins can manage outreach activity" ON public.outreach_activity_log
  FOR ALL USING (public.get_my_role() = 'admin'::public.user_role);

-- session_dates
DROP POLICY IF EXISTS "admins can manage session dates" ON public.session_dates;
CREATE POLICY "admins can manage session dates" ON public.session_dates
  FOR ALL USING (public.get_my_role() = 'admin'::public.user_role);

-- sessions
DROP POLICY IF EXISTS "admins can delete sessions" ON public.sessions;
CREATE POLICY "admins can delete sessions" ON public.sessions
  FOR DELETE USING (public.get_my_role() = 'admin'::public.user_role);

DROP POLICY IF EXISTS "admins can insert sessions" ON public.sessions;
CREATE POLICY "admins can insert sessions" ON public.sessions
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin'::public.user_role);

DROP POLICY IF EXISTS "admins can update sessions" ON public.sessions;
CREATE POLICY "admins can update sessions" ON public.sessions
  FOR UPDATE USING (public.get_my_role() = 'admin'::public.user_role);

DROP POLICY IF EXISTS "admins can view all sessions" ON public.sessions;
CREATE POLICY "admins can view all sessions" ON public.sessions
  FOR SELECT USING (public.get_my_role() = 'admin'::public.user_role);

-- startups
DROP POLICY IF EXISTS "admins can delete startup profiles" ON public.startups;
CREATE POLICY "admins can delete startup profiles" ON public.startups
  FOR DELETE USING (public.get_my_role() = 'admin'::public.user_role);

DROP POLICY IF EXISTS "admins can insert startup profiles" ON public.startups;
CREATE POLICY "admins can insert startup profiles" ON public.startups
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin'::public.user_role);

DROP POLICY IF EXISTS "mentors and admins can view all startups" ON public.startups;
CREATE POLICY "mentors and admins can view all startups" ON public.startups
  FOR SELECT USING (
    public.get_my_role() = ANY (ARRAY['mentor'::public.user_role, 'admin'::public.user_role])
  );
;
