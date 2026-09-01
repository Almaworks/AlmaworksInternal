set local check_function_bodies = off;

revoke all on function "public"."create_mentor_records"(uuid, uuid, uuid, text, text, text, text[], boolean, text, text, text, text, text) from "anon";

revoke all on function "public"."create_mentor_records"(uuid, uuid, uuid, text, text, text, text[], boolean, text, text, text, text, text) from "authenticated";
