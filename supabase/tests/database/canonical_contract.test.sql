begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

select has_table('public', table_name, table_name || ' is part of the canonical 20-table schema')
from unnest(array[
  'profiles', 'platform_roles', 'semesters', 'semester_memberships', 'invitations',
  'mentor_profiles', 'mentor_semesters', 'startup_organizations', 'startup_semesters',
  'startup_team_memberships', 'meetings', 'meeting_availability', 'sessions',
  'program_audit_events', 'outreach_contacts', 'outreach_companies',
  'outreach_contact_companies', 'outreach_opportunities', 'outreach_activities',
  'outreach_imports'
]) as expected(table_name);

select hasnt_view('public', view_name, view_name || ' compatibility view is retired')
from unnest(array['mentors', 'startups', 'session_dates', 'availability']) as retired(view_name);

select is(
  (select count(*) from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'),
  20::bigint,
  'public contains exactly the canonical 20 base tables'
);

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint,
  'every public base table has RLS enabled'
);

select hasnt_column('public', 'profiles', 'role', 'roles live in memberships and platform_roles');
select hasnt_column('public', 'profiles', 'semester_id', 'profiles are global identities');
select hasnt_column('public', 'profiles', 'auth_user_id', 'profile id directly references auth.users');
select hasnt_column('public', 'sessions', 'mentor_id', 'sessions use mentor_semester_id');
select hasnt_column('public', 'sessions', 'startup_id', 'sessions use startup_semester_id');
select hasnt_column('public', 'sessions', 'session_date_id', 'sessions use meeting_id');
select hasnt_column('public', 'sessions', 'session_date', 'meeting_date lives on meetings');
select hasnt_column('public', 'sessions', 'time_slot', 'sessions use numeric slot 1 or 2');
select hasnt_column('public', 'sessions', 'is_confirmed', 'session state lives in status and confirmed_at');

select ok(
  to_regprocedure('public.commit_mentor_assignment(uuid,uuid,smallint,uuid,uuid,text,text,text,text[],text,jsonb)') is not null,
  'mentor assignment uses meeting and semester entity identifiers'
);
select ok(
  to_regprocedure('public.replace_draft_meetings(uuid,jsonb)') is not null,
  'semester setup manages Friday meetings'
);
select ok(
  to_regprocedure('public.commit_legacy_outreach_migration(uuid,text)') is null,
  'legacy outreach migration RPC is retired'
);
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('public', p.oid, 'execute'))),
  0::bigint,
  'security-definer functions are not executable by anonymous or PUBLIC roles'
);

select * from finish();
rollback;
