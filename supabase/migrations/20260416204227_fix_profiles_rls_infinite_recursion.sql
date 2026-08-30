
-- Fix Postgres error 42P17: infinite recursion in profiles RLS policies.
-- The three "admins can ..." policies all used a subquery on `profiles`
-- from within a policy on `profiles`, causing infinite recursion.
-- We replace them with a SECURITY DEFINER function that bypasses RLS
-- when reading the caller's own role, breaking the cycle.

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

DROP POLICY IF EXISTS "admins can view all profiles" ON public.profiles;
CREATE POLICY "admins can view all profiles" ON public.profiles
  FOR SELECT
  USING (public.get_my_role() = 'admin'::public.user_role);

DROP POLICY IF EXISTS "admins can update all profiles" ON public.profiles;
CREATE POLICY "admins can update all profiles" ON public.profiles
  FOR UPDATE
  USING (public.get_my_role() = 'admin'::public.user_role);

DROP POLICY IF EXISTS "admins can insert profiles" ON public.profiles;
CREATE POLICY "admins can insert profiles" ON public.profiles
  FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin'::public.user_role);
;
