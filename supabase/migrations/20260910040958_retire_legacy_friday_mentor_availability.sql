alter table "public"."meeting_availability"
  drop constraint "meeting_availability_semester_id_fkey";

alter table "public"."meeting_availability"
  drop constraint "meeting_availability_semester_id_meeting_id_fkey";

alter table "public"."meeting_availability"
  drop constraint "meeting_availability_semester_id_semester_membership_id_fkey";

drop table "public"."meeting_availability";
