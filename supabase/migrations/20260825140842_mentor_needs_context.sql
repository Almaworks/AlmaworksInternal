alter table "public"."startup_semesters"
  add column "mentor_need_context" text;

alter table "public"."startup_semesters"
  add column "mentor_need_no_preference" boolean not null default false;
