CREATE POLICY "assigned startup members delete managed logos" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'startup-profile-logos'::text) AND (EXISTS ( SELECT 1
   FROM public.startup_organizations organization
  WHERE (((organization.id)::text = (storage.foldername(objects.name))[1]) AND private.can_manage_startup_logo(organization.id))))));

CREATE POLICY "assigned startup members insert managed logos" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH
    CHECK
    (((bucket_id = 'startup-profile-logos'::text) AND (name ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'::text) AND (EXISTS ( SELECT 1
   FROM public.startup_organizations organization
  WHERE (((organization.id)::text = (storage.foldername(objects.name))[1]) AND private.can_manage_startup_logo(organization.id))))));

CREATE POLICY "cohort viewers read managed startup logos" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'startup-profile-logos'::text) AND (EXISTS ( SELECT 1
   FROM public.startup_organizations organization
  WHERE ((organization.id)::text = (storage.foldername(objects.name))[1])))));
