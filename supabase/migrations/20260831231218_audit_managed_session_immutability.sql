set local check_function_bodies = off;

create or replace function public.prevent_audit_managed_session_mutation()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
begin
  if exists (
    select 1
    from public.mentor_assignment_audit as audit
    where audit.session_id = old.id
  ) then
    raise exception 'Audit-managed assignments cannot be updated or deleted through legacy session writes'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create trigger prevent_audit_managed_session_mutation
  before delete or update on public.sessions
  for each row
  execute function public.prevent_audit_managed_session_mutation();

revoke all on function "public"."prevent_audit_managed_session_mutation"() from public;

grant execute on function "public"."prevent_audit_managed_session_mutation"() to "postgres";
