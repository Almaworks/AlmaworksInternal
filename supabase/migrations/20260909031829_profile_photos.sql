alter table "public"."profiles"
  add column "photo_path" text;

alter table "public"."profiles"
  add constraint "profiles_photo_path_check"
    check (((photo_path IS NULL) OR (photo_path ~ (('^'::text || (id)::text) || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'::text))));

revoke all ("photo_url") on table "public"."mentor_profiles" from "authenticated";

grant update ("photo_url") on table "public"."mentor_profiles" to "authenticated";

revoke all ("photo_path") on table "public"."profiles" from "authenticated";

grant update ("photo_path") on table "public"."profiles" to "authenticated";
