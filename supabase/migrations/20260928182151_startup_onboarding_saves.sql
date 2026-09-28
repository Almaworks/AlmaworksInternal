revoke all ("company_snapshot") on table "public"."startup_semesters" from "authenticated";

grant update ("company_snapshot") on table "public"."startup_semesters" to "authenticated";

revoke all ("readiness_status") on table "public"."startup_semesters" from "authenticated";

grant update ("readiness_status") on table "public"."startup_semesters" to "authenticated";
