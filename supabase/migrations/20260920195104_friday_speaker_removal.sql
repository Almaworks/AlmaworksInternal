create policy "semester admins delete Friday speakers" on "public"."friday_speakers"
  for delete
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)));

revoke all on table "public"."friday_speakers" from "authenticated";

grant delete, insert, select, update on table "public"."friday_speakers" to "authenticated";
