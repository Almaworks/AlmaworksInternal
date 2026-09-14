alter table "public"."mentor_booking_requests"
  add constraint "mentor_booking_requests_semester_id_id_key" unique (semester_id, id);
