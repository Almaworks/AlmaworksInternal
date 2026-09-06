set local check_function_bodies = off;

create or replace function public.delete_startup_permanently (
  p_startup_organization_id uuid,
  p_confirmation_name       text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare
  v_name text;
  v_deleted_sessions integer;
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) then
    raise exception 'Platform super-administrator access required' using errcode = '42501';
  end if;
  select organization.name into v_name
  from public.startup_organizations organization
  where organization.id = p_startup_organization_id;
  if v_name is null then raise exception 'Startup not found' using errcode = 'P0002'; end if;
  if btrim(p_confirmation_name) <> v_name then raise exception 'Startup name confirmation does not match' using errcode = '22023'; end if;
  delete from public.sessions session
  using public.startup_semesters term
  where session.startup_semester_id = term.id
    and term.startup_organization_id = p_startup_organization_id;
  get diagnostics v_deleted_sessions = row_count;
  delete from public.startup_organizations where id = p_startup_organization_id;
  return jsonb_build_object('startupName', v_name, 'deletedSessions', v_deleted_sessions);
end;
$function$;

revoke all on function "public"."delete_startup_permanently"(uuid, text) from public;

grant execute on function "public"."delete_startup_permanently"(uuid, text) to "authenticated", "postgres";
