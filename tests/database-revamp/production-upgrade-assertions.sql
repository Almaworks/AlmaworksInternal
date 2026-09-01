create function public.future_acl_probe() returns boolean
language sql
as $$ select true $$;

create temporary table expected_table_privileges (
  grantee text not null,
  table_name text not null,
  privilege_type text not null,
  primary key (grantee, table_name, privilege_type)
);

insert into expected_table_privileges
select 'authenticated', table_name, 'SELECT'
from unnest(array[
  'semesters', 'profiles', 'platform_roles', 'semester_memberships', 'invitations',
  'mentor_profiles', 'mentor_semesters', 'startup_organizations', 'startup_semesters',
  'startup_team_memberships', 'meetings', 'meeting_availability', 'sessions',
  'outreach_contacts', 'outreach_companies', 'outreach_contact_companies',
  'outreach_opportunities', 'outreach_activities', 'outreach_imports'
]) as granted(table_name);
insert into expected_table_privileges values
  ('authenticated', 'meeting_availability', 'DELETE');
insert into expected_table_privileges
select 'service_role', table_name, 'SELECT'
from unnest(array[
  'profiles', 'semester_memberships', 'mentor_profiles', 'mentor_semesters',
  'startup_organizations', 'startup_semesters', 'startup_team_memberships',
  'meetings', 'sessions'
]) as granted(table_name);
insert into expected_table_privileges values
  ('service_role', 'startup_team_memberships', 'DELETE'),
  ('service_role', 'sessions', 'DELETE');

create temporary table expected_column_privileges (
  grantee text not null,
  table_name text not null,
  privilege_type text not null,
  column_name text not null,
  primary key (grantee, table_name, privilege_type, column_name)
);

insert into expected_column_privileges
select grantee, table_name, privilege_type, unnest(column_names)
from (values
  ('authenticated', 'meeting_availability', 'INSERT', array['semester_id','meeting_id','semester_membership_id','slot','is_available','source']),
  ('authenticated', 'sessions', 'INSERT', array['semester_id','meeting_id','mentor_semester_id','startup_semester_id','slot','status','topic','format']),
  ('authenticated', 'outreach_imports', 'INSERT', array['semester_id','source_name','status','idempotency_key','rows','result','created_by']),
  ('authenticated', 'profiles', 'UPDATE', array['full_name']),
  ('authenticated', 'startup_semesters', 'UPDATE', array['goals','mentorship_needs','mentor_need_context','mentor_need_no_preference','preferred_expertise_tags']),
  ('authenticated', 'meeting_availability', 'UPDATE', array['semester_id','meeting_id','semester_membership_id','slot','is_available','source']),
  ('authenticated', 'sessions', 'UPDATE', array['status']),
  ('authenticated', 'outreach_contacts', 'UPDATE', array['full_name','email','linkedin_url','phone','biography','expertise_tags','notes']),
  ('authenticated', 'outreach_contact_companies', 'UPDATE', array['contact_id','company_id','is_primary']),
  ('authenticated', 'outreach_opportunities', 'UPDATE', array['semester_id','contact_id','owner_profile_id','stage','relationship_types','source_context','created_by']),
  ('authenticated', 'outreach_imports', 'UPDATE', array['status','idempotency_key','committed_at','result','updated_at']),
  ('service_role', 'semester_memberships', 'INSERT', array['semester_id','profile_id','role','status']),
  ('service_role', 'meetings', 'INSERT', array['semester_id','meeting_date','label']),
  ('service_role', 'startup_organizations', 'INSERT', array['name','slug','description','industry']),
  ('service_role', 'startup_semesters', 'INSERT', array['semester_id','startup_organization_id','stage','preferred_expertise_tags','readiness_status']),
  ('service_role', 'startup_team_memberships', 'INSERT', array['semester_id','startup_semester_id','semester_membership_id']),
  ('service_role', 'sessions', 'INSERT', array['semester_id','meeting_id','mentor_semester_id','startup_semester_id','slot','status','topic','format','startup_absent','substitute_name']),
  ('service_role', 'semester_memberships', 'UPDATE', array['status']),
  ('service_role', 'profiles', 'UPDATE', array['status']),
  ('service_role', 'sessions', 'UPDATE', array['mentor_semester_id','startup_semester_id','slot','status','topic','format','startup_absent','substitute_name'])
) as expected(grantee, table_name, privilege_type, column_names);

insert into expected_column_privileges
select expected.grantee, expected.table_name, 'SELECT', column_record.column_name
from expected_table_privileges expected
join information_schema.columns column_record
  on column_record.table_schema = 'public'
 and column_record.table_name = expected.table_name
where expected.privilege_type = 'SELECT';

create temporary table expected_function_privileges (
  grantee text not null,
  function_signature text not null,
  primary key (grantee, function_signature)
);

insert into expected_function_privileges values
  ('authenticated','private.is_super_admin(uuid)'),
  ('authenticated','private.current_profile_id(uuid)'),
  ('authenticated','private.has_semester_role(uuid,user_role[],uuid)'),
  ('authenticated','private.can_manage_semester(uuid,uuid)'),
  ('authenticated','private.can_read_outreach_relationship_labels(uuid)'),
  ('authenticated','private.has_outreach_contact_access(uuid,uuid)'),
  ('authenticated','private.has_outreach_company_access(uuid,uuid)'),
  ('authenticated','private.can_read_mentor_profile(uuid,uuid)'),
  ('authenticated','activate_semester_transition(uuid,uuid)'),
  ('authenticated','authorize_semester_member_identity_update(uuid,uuid)'),
  ('authenticated','bulk_set_membership_activity(uuid,uuid[],boolean)'),
  ('authenticated','can_manage_any_outreach(uuid)'),
  ('authenticated','can_manage_semester(uuid,uuid)'),
  ('authenticated','carry_forward_outreach_contacts(uuid,uuid,uuid[])'),
  ('authenticated','commit_mentor_assignment(uuid,uuid,smallint,uuid,uuid,text,text,text,text[],text,jsonb)'),
  ('authenticated','create_semester_draft(uuid,text,date,date,jsonb)'),
  ('authenticated','import_prior_semester_memberships(uuid,uuid,uuid[])'),
  ('authenticated','log_outreach_activity(uuid,outreach_activity_kind,timestamp with time zone,outreach_channel,text,jsonb,timestamp with time zone,outreach_stage,timestamp with time zone)'),
  ('authenticated','move_startup_team_membership(uuid,uuid,uuid)'),
  ('authenticated','release_inactive_owner_work(uuid)'),
  ('authenticated','replace_draft_meetings(uuid,jsonb)'),
  ('authenticated','reset_outreach_opportunities(uuid,uuid[])'),
  ('authenticated','set_outreach_silence(uuid,boolean,text,timestamp with time zone,timestamp with time zone)'),
  ('authenticated','set_outreach_snooze(uuid,timestamp with time zone,text,timestamp with time zone)'),
  ('authenticated','suspend_outreach_membership(uuid,uuid,text,timestamp with time zone)'),
  ('authenticated','transfer_outreach_owner(uuid,uuid,text,timestamp with time zone)'),
  ('authenticated','update_own_onboarding_progress(uuid,uuid,jsonb,boolean)'),
  ('authenticated','update_startup_records(uuid,text,text,text,text,text,text[],text[])'),
  ('authenticated','upsert_outreach_contact_bundle(uuid,uuid,text,text,text,text,text,uuid,text,text,text,text,uuid,text,text[],jsonb)'),
  ('service_role','create_mentor_records(uuid,uuid,uuid,text,text,text,text[],boolean,text,text,text,text,text)'),
  ('service_role','set_semester_member_access(uuid,uuid,uuid,user_role,boolean,text,text)'),
  ('service_role','update_mentor_records(uuid,uuid,jsonb)');

do $$
declare
  table_count integer;
  view_count integer;
  rls_count integer;
  legacy_count integer;
  anon_execute_count integer;
  mismatch_count integer;
  attached_visible_count integer;
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

  if has_function_privilege('public', 'public.future_acl_probe()', 'execute')
     or has_function_privilege('anon', 'public.future_acl_probe()', 'execute') then
    raise exception 'future functions remain executable by PUBLIC or anon';
  end if;

  select count(*) into mismatch_count from (
    (select grantee, table_name, privilege_type from expected_table_privileges
     except
     select grantee, table_name, privilege_type from information_schema.table_privileges
     where table_schema = 'public' and grantee in ('authenticated','service_role'))
    union all
    (select grantee, table_name, privilege_type from information_schema.table_privileges
     where table_schema = 'public' and grantee in ('authenticated','service_role')
     except
     select grantee, table_name, privilege_type from expected_table_privileges)
  ) mismatches;
  if mismatch_count <> 0 then raise exception 'effective table privilege mismatch count: %', mismatch_count; end if;

  select count(*) into mismatch_count from (
    (select grantee, table_name, privilege_type, column_name from expected_column_privileges
     except
     select grantee, table_name, privilege_type, column_name from information_schema.column_privileges
     where table_schema = 'public' and grantee in ('authenticated','service_role'))
    union all
    (select grantee, table_name, privilege_type, column_name from information_schema.column_privileges
     where table_schema = 'public' and grantee in ('authenticated','service_role')
     except
     select grantee, table_name, privilege_type, column_name from expected_column_privileges)
  ) mismatches;
  if mismatch_count <> 0 then raise exception 'effective column privilege mismatch count: %', mismatch_count; end if;

  select count(*) into mismatch_count from (
    (select grantee, function_signature from expected_function_privileges
     except
     select role_record.rolname, procedure_record.oid::regprocedure::text
     from pg_proc procedure_record
     cross join lateral aclexplode(coalesce(
       procedure_record.proacl,
       acldefault('f', procedure_record.proowner)
     )) privilege_record
     join pg_roles role_record on role_record.oid = privilege_record.grantee
     join pg_namespace namespace_record on namespace_record.oid = procedure_record.pronamespace
     where namespace_record.nspname in ('public','private')
       and role_record.rolname in ('authenticated','service_role')
       and privilege_record.privilege_type = 'EXECUTE')
    union all
    (select role_record.rolname, procedure_record.oid::regprocedure::text
     from pg_proc procedure_record
     cross join lateral aclexplode(coalesce(
       procedure_record.proacl,
       acldefault('f', procedure_record.proowner)
     )) privilege_record
     join pg_roles role_record on role_record.oid = privilege_record.grantee
     join pg_namespace namespace_record on namespace_record.oid = procedure_record.pronamespace
     where namespace_record.nspname in ('public','private')
       and role_record.rolname in ('authenticated','service_role')
       and privilege_record.privilege_type = 'EXECUTE'
     except
     select grantee, function_signature from expected_function_privileges)
  ) mismatches;
  if mismatch_count <> 0 then raise exception 'effective function privilege mismatch count: %', mismatch_count; end if;

  perform set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
  if private.current_profile_id() <> '20000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'attached historical login did not resolve to durable profile identity';
  end if;
  if not public.can_manage_semester(
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001'
  ) then raise exception 'attached historical admin login could not manage its semester'; end if;
  execute 'set local role authenticated';
  select count(*) into attached_visible_count from public.profiles
  where id = '20000000-0000-0000-0000-000000000001';
  execute 'reset role';
  if attached_visible_count <> 1 then raise exception 'attached historical profile is hidden by profile RLS'; end if;
end $$;
