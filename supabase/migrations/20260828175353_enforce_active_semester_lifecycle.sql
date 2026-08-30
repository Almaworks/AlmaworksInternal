alter table "public"."semesters"
  add constraint "semesters_active_lifecycle_status_check" check (((NOT is_active) OR (lifecycle_status = 'active'::public.semester_lifecycle_status))) not valid;
