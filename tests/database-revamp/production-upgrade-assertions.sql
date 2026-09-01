do $$
declare
  table_count integer;
  view_count integer;
  rls_count integer;
  legacy_count integer;
  anon_execute_count integer;
begin
  select count(*) into table_count from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE';
  if table_count <> 20 then raise exception 'expected 20 public tables, got %', table_count; end if;

  select count(*) into view_count from information_schema.views where table_schema = 'public';
  if view_count <> 0 then raise exception 'expected no public views, got %', view_count; end if;

  select count(*) into rls_count from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity;
  if rls_count <> 20 then raise exception 'expected RLS on 20 tables, got %', rls_count; end if;

  select count(*) into legacy_count from public.profiles
  where email like 'legacy-%' and status = 'approved' and role = 'mentor'
    and semester_id = '10000000-0000-0000-0000-000000000001';
  if legacy_count <> 7 then raise exception 'expected seven preserved legacy profiles, got %', legacy_count; end if;

  if exists (select 1 from pg_constraint where conname = 'profiles_id_fkey') then
    raise exception 'profiles.id must not reference auth.users';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_auth_user_id_fkey') then
    raise exception 'profiles.auth_user_id auth FK missing';
  end if;
  if not private.actor_can_manage_semester(
    '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'
  ) then raise exception 'service actor capability rejected a canonical admin profile'; end if;
  if private.can_manage_semester(
    '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'
  ) then raise exception 'auth-bound helper allowed a direct service bypass'; end if;

  select count(*) into anon_execute_count
  from information_schema.routine_privileges
  where specific_schema in ('public', 'private') and grantee = 'anon' and privilege_type = 'EXECUTE';
  if anon_execute_count <> 0 then raise exception 'anon retains execute on % routines', anon_execute_count; end if;
end $$;
