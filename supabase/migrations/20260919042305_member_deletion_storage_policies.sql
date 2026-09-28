
  create policy "super admins delete prepared personal photos"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'profile-photos'::text) AND private.can_delete_prepared_profile_photo(name)));



  create policy "super admins list prepared personal photos"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'profile-photos'::text) AND private.can_delete_prepared_profile_photo(name)));



