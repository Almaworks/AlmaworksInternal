revoke all on table "public"."invitations" from "authenticated";

grant delete, insert, select, update on table "public"."invitations" to "authenticated";

revoke all on table "public"."meeting_availability" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."meeting_availability" to "authenticated";

revoke all on table "public"."meetings" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."meetings" to "authenticated";

revoke all on table "public"."mentor_profiles" from "authenticated";

grant delete, insert, select, update on table "public"."mentor_profiles" to "authenticated";

revoke all on table "public"."mentor_semesters" from "authenticated";

grant delete, insert, select, update on table "public"."mentor_semesters" to "authenticated";

revoke all on table "public"."outreach_activities" from "authenticated";

grant delete, insert, select, update on table "public"."outreach_activities" to "authenticated";

revoke all on table "public"."outreach_imports" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_imports" to "authenticated";

revoke all on table "public"."outreach_opportunities" from "authenticated";

grant delete, insert, select, update on table "public"."outreach_opportunities" to "authenticated";

revoke all on table "public"."platform_roles" from "authenticated";

grant delete, insert, select, update on table "public"."platform_roles" to "authenticated";

revoke all on table "public"."profiles" from "authenticated";

grant delete, insert, select, update on table "public"."profiles" to "authenticated";

revoke all on table "public"."program_audit_events" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."program_audit_events" to "authenticated";

revoke all on table "public"."semester_memberships" from "authenticated";

grant delete, insert, select, update on table "public"."semester_memberships" to "authenticated";

revoke all on table "public"."startup_organizations" from "authenticated";

grant delete, insert, select, update on table "public"."startup_organizations" to "authenticated";

revoke all on table "public"."startup_semesters" from "authenticated";

grant delete, insert, select, update on table "public"."startup_semesters" to "authenticated";

revoke all on table "public"."startup_team_memberships" from "authenticated";

grant delete, insert, select, update on table "public"."startup_team_memberships" to "authenticated";

revoke all on table "public"."availability" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."availability" to "authenticated";

revoke all on table "public"."mentors" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."mentors" to "authenticated";

revoke all on table "public"."session_dates" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."session_dates" to "authenticated";

revoke all on table "public"."startups" from "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."startups" to "authenticated";
