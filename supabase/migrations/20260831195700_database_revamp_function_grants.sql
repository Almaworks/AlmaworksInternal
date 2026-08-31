set local check_function_bodies = off;

revoke all on function "public"."get_my_role"() from public;

revoke all on function "public"."get_my_role"() from "authenticated";

grant execute on function "public"."get_my_role"() to "authenticated";

revoke all on function "public"."handle_new_user"() from public;

revoke all on function "public"."mentors_view_write"() from public;

revoke all on function "public"."startups_view_write"() from public;
