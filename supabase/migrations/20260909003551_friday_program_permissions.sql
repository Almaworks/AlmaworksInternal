set local check_function_bodies = off;

revoke all on function "public"."generate_friday_program"(uuid, uuid) from public;

revoke all on function "public"."generate_friday_program"(uuid, uuid) from "authenticated";

grant execute on function "public"."generate_friday_program"(uuid, uuid) to "authenticated";

revoke all on function "public"."validate_friday_program_publication"() from public;
