set local check_function_bodies = off;

revoke all on table "public"."invitations" from "anon";

revoke all on table "public"."meeting_availability" from "anon";

revoke all on table "public"."meetings" from "anon";

revoke all on table "public"."mentor_profiles" from "anon";

revoke all on table "public"."mentor_semesters" from "anon";

revoke all on table "public"."outreach_activities" from "anon";

revoke all on table "public"."outreach_companies" from "anon";

revoke all on table "public"."outreach_contact_companies" from "anon";

revoke all on table "public"."outreach_contacts" from "anon";

revoke all on table "public"."outreach_imports" from "anon";

revoke all on table "public"."outreach_opportunities" from "anon";

revoke all on table "public"."platform_roles" from "anon";

revoke all on table "public"."program_audit_events" from "anon";

revoke all on table "public"."semester_memberships" from "anon";

revoke all on table "public"."semesters" from "anon";

revoke all on table "public"."sessions" from "anon";

revoke all on table "public"."startup_organizations" from "anon";

revoke all on table "public"."startup_semesters" from "anon";

revoke all on table "public"."startup_team_memberships" from "anon";

revoke all on table "public"."availability" from "anon";

revoke all on table "public"."mentors" from "anon";

revoke all on table "public"."session_dates" from "anon";

revoke all on table "public"."startups" from "anon";

create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.update_updated_at()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin new.updated_at = now(); return new; end;
$function$;
