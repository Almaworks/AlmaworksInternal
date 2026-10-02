set local check_function_bodies = off;

alter table "public"."startup_organizations"
  add column "logo_path" text;

create or replace function private.can_manage_startup_logo (
  organization_id uuid
)
  returns boolean
  language sql
  stable
  set search_path to ''
  AS $function$
  select exists (
    select 1 from public.startup_semesters term
    join public.semesters semester on semester.id=term.semester_id
    join public.startup_team_memberships team on team.startup_semester_id=term.id and team.semester_id=term.semester_id
    join public.semester_memberships member on member.id=team.semester_membership_id and member.semester_id=team.semester_id
    join public.profiles profile on profile.id=member.profile_id
    where term.startup_organization_id=organization_id and semester.is_active
      and member.role='startup' and member.status in ('onboarding','active')
      and profile.auth_user_id=(select auth.uid()) and profile.is_active and profile.status='approved'
  );
$function$;

create or replace function private.guard_startup_logo_update()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin
  if (new.logo_path,new.logo_url) is distinct from (old.logo_path,old.logo_url)
     and not private.can_manage_startup_logo(old.id) then
    raise exception 'An active assigned startup membership is required to change this logo.' using errcode='42501';
  end if;
  return new;
end;
$function$;

alter table "public"."startup_organizations"
  add constraint "startup_organizations_logo_path_check"
    check (((logo_path IS NULL) OR (logo_path ~ (('^'::text || (id)::text) || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'::text))));

create trigger guard_startup_logo_update
  before update of logo_path, logo_url on public.startup_organizations
  for each row
  execute function private.guard_startup_logo_update();

revoke all on function "private"."can_manage_startup_logo"(uuid) from public;

grant execute on function "private"."can_manage_startup_logo"(uuid) to "authenticated", "postgres";

revoke all on function "private"."guard_startup_logo_update"() from public;

grant execute on function "private"."guard_startup_logo_update"() to "postgres";

revoke all ("logo_path") on table "public"."startup_organizations" from "authenticated";

grant update ("logo_path") on table "public"."startup_organizations" to "authenticated";

revoke all ("logo_url") on table "public"."startup_organizations" from "authenticated";

grant update ("logo_url") on table "public"."startup_organizations" to "authenticated";
