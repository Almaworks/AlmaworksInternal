create policy "semester admins delete Friday assignments" on "public"."friday_program_assignments"
  for delete
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)));

create policy "semester admins update Friday programs" on "public"."friday_programs"
  for update
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)))
  with
    check
    ((private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)) AND (generated_by_profile_id = ( SELECT private.current_profile_id(( SELECT auth.uid() AS uid)) AS
    current_profile_id))));

revoke all on table "public"."friday_program_assignments" from "authenticated";

grant delete, insert, select on table "public"."friday_program_assignments" to "authenticated";

revoke all on table "public"."friday_programs" from "authenticated";

grant insert, select, update on table "public"."friday_programs" to "authenticated";
