-- Admin FK cannot be restored without original auth users present.
-- Make admin_id nullable so imported rows can be linked manually after re-login.
ALTER TABLE public.outreach DROP CONSTRAINT IF EXISTS outreach_admin_id_fkey;
ALTER TABLE public.outreach ALTER COLUMN admin_id DROP NOT NULL;;
