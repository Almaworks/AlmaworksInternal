begin;

select plan(145);

select has_table('public', 'outreach_contacts', 'outreach contacts table exists');
select has_table('public', 'outreach_companies', 'outreach companies table exists');
select has_table('public', 'outreach_contact_companies', 'contact-company table exists');
select has_table('public', 'outreach_relationship_labels', 'relationship labels table exists');
select has_table('public', 'outreach_opportunities', 'outreach opportunities table exists');
select has_table('public', 'outreach_opportunity_labels', 'opportunity labels table exists');
select has_table('public', 'outreach_activities', 'outreach activities table exists');
select has_table('public', 'outreach_import_jobs', 'outreach import jobs table exists');
select has_table('public', 'outreach_import_rows', 'outreach import rows table exists');

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.outreach_contacts'::regclass),
  'outreach contacts has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.outreach_companies'::regclass),
  'outreach companies has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.outreach_contact_companies'::regclass),
  'contact-company relationships have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.outreach_relationship_labels'::regclass),
  'relationship labels have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.outreach_opportunities'::regclass),
  'outreach opportunities have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.outreach_opportunity_labels'::regclass),
  'opportunity labels have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.outreach_activities'::regclass),
  'outreach activities have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.outreach_import_jobs'::regclass),
  'outreach import jobs have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.outreach_import_rows'::regclass),
  'outreach import rows have RLS enabled'
);

select has_function('public', 'log_outreach_activity', 'activity logging RPC exists');
select has_function('public', 'transfer_outreach_owner', 'owner transfer RPC exists');
select has_function('public', 'set_outreach_snooze', 'snooze RPC exists');
select has_function('public', 'set_outreach_silence', 'silence RPC exists');
select has_function('public', 'release_inactive_owner_work', 'owner release RPC exists');
select has_function('public', 'suspend_outreach_membership', 'atomic outreach suspension RPC exists');
select has_function('public', 'create_outreach_contact_opportunity', 'atomic contact creation RPC exists');
select has_function('public', 'update_outreach_contact', 'safe contact update RPC exists');
select has_trigger(
  'public',
  'outreach_opportunities',
  'validate_outreach_owner_membership',
  'owner validation trigger covers opportunity assignment paths'
);
select matches(
  lower(pg_get_functiondef('public.validate_outreach_owner_membership()'::regprocedure)),
  'for key share',
  'owner validation locks the exact membership row before checking active status'
);
select matches(
  lower(pg_get_functiondef('public.transfer_outreach_owner(uuid,uuid,text,timestamp with time zone)'::regprocedure)),
  'for key share[[:space:][:print:]]*for update',
  'owner transfer takes the membership lock before the opportunity lock'
);

select ok(
  not has_function_privilege('anon', 'public.is_super_admin(uuid)', 'EXECUTE'),
  'anonymous users cannot execute candidate super-admin checks'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.has_semester_role(uuid,public.user_role[],uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot execute candidate semester-role checks'
);
select ok(
  not has_function_privilege('anon', 'public.can_manage_semester(uuid,uuid)', 'EXECUTE'),
  'anonymous users cannot execute candidate semester-management checks'
);
select ok(
  has_function_privilege('authenticated', 'public.is_super_admin(uuid)', 'EXECUTE'),
  'authenticated policies may execute super-admin checks'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.has_semester_role(uuid,public.user_role[],uuid)',
    'EXECUTE'
  ),
  'authenticated policies may execute semester-role checks'
);
select ok(
  has_function_privilege('authenticated', 'public.can_manage_semester(uuid,uuid)', 'EXECUTE'),
  'authenticated policies may execute semester-management checks'
);

insert into public.semesters (id, name, start_date, end_date, lifecycle_status)
values
  ('10000000-0000-0000-0000-000000000001', 'CRM test semester one', '2027-01-01', '2027-06-30', 'active'),
  ('10000000-0000-0000-0000-000000000002', 'CRM test semester two', '2027-07-01', '2027-12-31', 'active');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'crm-admin-one@example.test', '{}'::jsonb, '{"full_name":"CRM Admin One"}'::jsonb),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'crm-alumni@example.test', '{}'::jsonb, '{"full_name":"CRM Alumni"}'::jsonb),
  ('20000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'crm-admin-two@example.test', '{}'::jsonb, '{"full_name":"CRM Admin Two"}'::jsonb),
  ('20000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'crm-former-owner@example.test', '{}'::jsonb, '{"full_name":"CRM Former Owner"}'::jsonb),
  ('20000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'crm-super-admin@example.test', '{}'::jsonb, '{"full_name":"CRM Super Admin"}'::jsonb),
  ('20000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'crm-cross-semester-owner@example.test', '{}'::jsonb, '{"full_name":"CRM Cross-semester Owner"}'::jsonb),
  ('20000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'crm-atomic-success@example.test', '{}'::jsonb, '{"full_name":"CRM Atomic Success"}'::jsonb),
  ('20000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'crm-atomic-unauthorized@example.test', '{}'::jsonb, '{"full_name":"CRM Atomic Unauthorized"}'::jsonb),
  ('20000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'crm-atomic-stale@example.test', '{}'::jsonb, '{"full_name":"CRM Atomic Stale"}'::jsonb),
  ('20000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'crm-atomic-rollback@example.test', '{}'::jsonb, '{"full_name":"CRM Atomic Rollback"}'::jsonb),
  ('20000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'crm-dual-role-owner@example.test', '{}'::jsonb, '{"full_name":"CRM Dual-role Owner"}'::jsonb);

update public.profiles
set role = 'admin', status = 'approved'
where id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000005',
  '20000000-0000-0000-0000-000000000006',
  '20000000-0000-0000-0000-000000000007',
  '20000000-0000-0000-0000-000000000008',
  '20000000-0000-0000-0000-000000000009',
  '20000000-0000-0000-0000-000000000010',
  '20000000-0000-0000-0000-000000000011'
);

insert into public.semester_memberships (id, semester_id, profile_id, role, status)
values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'admin', 'alumni'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'admin', 'active'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'admin', 'active'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', 'admin', 'active'),
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 'admin', 'active'),
  ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000006', 'admin', 'active'),
  ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000007', 'admin', 'active'),
  ('30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000008', 'admin', 'active'),
  ('30000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000009', 'admin', 'active'),
  ('30000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000010', 'admin', 'active'),
  ('30000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000011', 'mentor', 'active'),
  ('30000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000011', 'admin', 'active');

update public.semester_memberships
set updated_at = '2026-08-18 12:00:00+00'
where id = '30000000-0000-0000-0000-000000000012';

insert into public.platform_roles (profile_id, role, granted_by)
values (
  '20000000-0000-0000-0000-000000000005',
  'super_admin',
  '20000000-0000-0000-0000-000000000001'
);

set local role anon;
select throws_ok(
  $$select public.is_super_admin('20000000-0000-0000-0000-000000000005')$$,
  '42501',
  null,
  'anonymous callers cannot probe another candidate super-admin status'
);
select throws_ok(
  $$select public.has_semester_role(
      '10000000-0000-0000-0000-000000000001',
      array['admin']::public.user_role[],
      '20000000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  null,
  'anonymous callers cannot probe another candidate semester role'
);
select throws_ok(
  $$select public.can_manage_semester(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  null,
  'anonymous callers cannot probe another candidate semester authority'
);
reset role;

create temporary table dual_role_suspension_result (
  membership_id uuid,
  membership_status text,
  released_opportunity_ids uuid[]
) on commit drop;
grant select, insert on pg_temp.dual_role_suspension_result to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.is_super_admin('20000000-0000-0000-0000-000000000001')$$,
  'authenticated policies retain super-admin helper execution'
);
select lives_ok(
  $$select public.has_semester_role(
      '10000000-0000-0000-0000-000000000001',
      array['admin']::public.user_role[],
      '20000000-0000-0000-0000-000000000001'
    )$$,
  'authenticated policies retain semester-role helper execution'
);
select lives_ok(
  $$select public.can_manage_semester(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001'
    )$$,
  'authenticated policies retain semester-management helper execution'
);
reset role;

insert into public.outreach_contacts (id, full_name, email)
select
  ('40000000-0000-0000-0000-' || lpad(value::text, 12, '0'))::uuid,
  format('CRM Contact %s', value),
  format('crm-contact-%s@example.test', value)
from generate_series(1, 30) as value;

select lives_ok(
  $$insert into public.outreach_opportunities
      (id, semester_id, contact_id, stage, cadence_days)
    values
      ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'prospect', 7)$$,
  'the first open opportunity for a contact and semester is accepted'
);
select throws_ok(
  $$insert into public.outreach_opportunities
      (id, semester_id, contact_id, stage, cadence_days)
    values
      ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'contacted', 7)$$,
  '23505',
  null,
  'a second open opportunity for the same contact and semester is rejected'
);
select lives_ok(
  $$insert into public.outreach_opportunities
      (id, semester_id, contact_id, stage, cadence_days)
    values
      ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'closed', 7)$$,
  'a closed historical opportunity may coexist with the open opportunity'
);

select throws_ok(
  $$insert into public.outreach_opportunities
      (semester_id, contact_id, cadence_days)
    values
      ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 0)$$,
  '23514',
  null,
  'cadence below one day is rejected'
);
select throws_ok(
  $$insert into public.outreach_opportunities
      (semester_id, contact_id, cadence_days)
    values
      ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 366)$$,
  '23514',
  null,
  'cadence above 365 days is rejected'
);
select lives_ok(
  $$insert into public.outreach_opportunities
      (id, semester_id, contact_id, cadence_days)
    values
      ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 1)$$,
  'a one-day cadence is accepted'
);

select throws_ok(
  $$insert into public.outreach_opportunities
      (semester_id, contact_id, is_silenced)
    values
      ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', true)$$,
  '23514',
  null,
  'silencing without actor, timestamp, and reason is rejected'
);
select throws_ok(
  $$insert into public.outreach_opportunities
      (semester_id, contact_id, is_silenced, silenced_at, silenced_by, silence_reason)
    values
      ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000006', true, now(), '20000000-0000-0000-0000-000000000001', '   ')$$,
  '23514',
  null,
  'a blank silence reason is rejected'
);
select throws_ok(
  $$insert into public.outreach_opportunities
      (semester_id, contact_id, is_silenced, silenced_at, silenced_by, silence_reason)
    values
      ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000007', false, now(), '20000000-0000-0000-0000-000000000001', 'stale metadata')$$,
  '23514',
  null,
  'an unsilenced opportunity cannot retain silence metadata'
);
select lives_ok(
  $$insert into public.outreach_opportunities
      (id, semester_id, contact_id, is_silenced, silenced_at, silenced_by, silence_reason)
    values
      ('50000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000008', true, now(), '20000000-0000-0000-0000-000000000001', 'Do not contact')$$,
  'complete silence metadata is accepted'
);

select ok(
  not has_table_privilege('authenticated', 'public.outreach_activities', 'UPDATE'),
  'authenticated users have no update grant on outreach activities'
);
select ok(
  not has_table_privilege('authenticated', 'public.outreach_activities', 'DELETE'),
  'authenticated users have no delete grant on outreach activities'
);
select ok(
  not has_table_privilege('authenticated', 'public.outreach_opportunities', 'UPDATE'),
  'authenticated users have no direct update grant on outreach opportunities'
);
select ok(
  not has_table_privilege('authenticated', 'public.outreach_opportunities', 'DELETE'),
  'authenticated users have no direct delete grant on outreach opportunities'
);

set local role anon;
select throws_ok(
  $$insert into public.outreach_opportunities (semester_id, contact_id)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000009')$$,
  '42501',
  null,
  'anonymous users cannot mutate outreach opportunities'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$insert into public.outreach_opportunities (semester_id, contact_id)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000009')$$,
  '42501',
  null,
  'alumni administrators cannot mutate outreach opportunities'
);
reset role;

insert into public.outreach_opportunities
  (id, semester_id, contact_id, stage, owner_profile_id)
values
  ('50000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000010', 'prospect', '20000000-0000-0000-0000-000000000004'),
  ('50000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000011', 'prospect', '20000000-0000-0000-0000-000000000004'),
  ('50000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000015', 'prospect', '20000000-0000-0000-0000-000000000006'),
  ('50000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000016', 'prospect', '20000000-0000-0000-0000-000000000006'),
  ('50000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000017', 'prospect', null),
  ('50000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000018', 'prospect', null),
  ('50000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000019', 'prospect', null),
  ('50000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000022', 'prospect', '20000000-0000-0000-0000-000000000007'),
  ('50000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000023', 'prospect', '20000000-0000-0000-0000-000000000008'),
  ('50000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000024', 'prospect', '20000000-0000-0000-0000-000000000009'),
  ('50000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000025', 'prospect', '20000000-0000-0000-0000-000000000010'),
  ('50000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000026', 'prospect', '20000000-0000-0000-0000-000000000011');

insert into public.outreach_import_jobs (id, semester_id, source, created_by)
values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'csv', '20000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'csv', '20000000-0000-0000-0000-000000000003');

select lives_ok(
  $$insert into public.outreach_opportunities
      (id, semester_id, contact_id, source_import_job_id)
    values
      ('50000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000020', '60000000-0000-0000-0000-000000000001')$$,
  'an opportunity may reference an import job from the same semester'
);
select throws_ok(
  $$insert into public.outreach_opportunities
      (id, semester_id, contact_id, source_import_job_id)
    values
      ('50000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000021', '60000000-0000-0000-0000-000000000002')$$,
  '23503',
  null,
  'an opportunity cannot claim import provenance from another semester'
);

insert into public.outreach_activities
  (id, semester_id, opportunity_id, activity_kind, summary)
values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000011', 'note', 'Original activity');

select throws_ok(
  $$insert into public.outreach_activities
      (id, semester_id, opportunity_id, activity_kind, import_job_id)
    values
      ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000011', 'note', '60000000-0000-0000-0000-000000000002')$$,
  '23503',
  null,
  'an activity cannot claim import provenance from another semester'
);
select lives_ok(
  $$insert into public.outreach_activities
      (id, semester_id, opportunity_id, activity_kind, supersedes_activity_id)
    values
      ('70000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000011', 'note', '70000000-0000-0000-0000-000000000001')$$,
  'an activity may supersede earlier history on the same opportunity'
);
select throws_ok(
  $$insert into public.outreach_activities
      (id, semester_id, opportunity_id, activity_kind, supersedes_activity_id)
    values
      ('70000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000013', 'note', '70000000-0000-0000-0000-000000000001')$$,
  '23503',
  null,
  'an activity cannot supersede history from another opportunity in the same semester'
);
select throws_ok(
  $$insert into public.outreach_activities
      (id, semester_id, opportunity_id, activity_kind, supersedes_activity_id)
    values
      ('70000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000012', 'note', '70000000-0000-0000-0000-000000000001')$$,
  '23503',
  null,
  'an activity cannot supersede history from another semester'
);

insert into public.outreach_relationship_labels (id, slug, name, created_by)
values
  ('80000000-0000-0000-0000-000000000001', 'mentor', 'Mentor', '20000000-0000-0000-0000-000000000005'),
  ('80000000-0000-0000-0000-000000000002', 'investor', 'Investor', '20000000-0000-0000-0000-000000000005'),
  ('80000000-0000-0000-0000-000000000003', 'speaker', 'Speaker', '20000000-0000-0000-0000-000000000005');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  $$select id from public.outreach_opportunities
    where id in (
      '50000000-0000-0000-0000-000000000006',
      '50000000-0000-0000-0000-000000000007'
    ) order by id$$,
  $$values ('50000000-0000-0000-0000-000000000006'::uuid)$$,
  'an active administrator reads only their managed semester'
);
select lives_ok(
  $$insert into public.outreach_opportunities
      (id, semester_id, contact_id, owner_profile_id)
    values
      ('50000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000001')$$,
  'an active administrator creates an opportunity in their managed semester'
);
select throws_ok(
  $$update public.outreach_opportunities
    set notes = 'managed by semester one admin'
    where id = '50000000-0000-0000-0000-000000000008'$$,
  '42501',
  null,
  'an active administrator cannot directly update an opportunity'
);
select throws_ok(
  $$delete from public.outreach_opportunities
    where id = '50000000-0000-0000-0000-000000000013'$$,
  '42501',
  null,
  'an active administrator cannot directly delete an opportunity'
);
select throws_ok(
  $$insert into public.outreach_opportunities
      (semester_id, contact_id, owner_profile_id)
    values
      ('10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000003')$$,
  '42501',
  null,
  'an active administrator cannot create an opportunity in another semester'
);

select lives_ok(
  $$select public.log_outreach_activity(
      '50000000-0000-0000-0000-000000000008',
      'email',
      p_channel => 'email',
      p_summary => 'Email sent'
    )$$,
  'the activity RPC accepts email as a user-loggable kind'
);
select lives_ok(
  $$select public.log_outreach_activity(
      '50000000-0000-0000-0000-000000000008',
      'call',
      p_channel => 'other',
      p_summary => 'Call placed'
    )$$,
  'the activity RPC accepts call as a user-loggable kind'
);
select lives_ok(
  $$select public.log_outreach_activity(
      '50000000-0000-0000-0000-000000000008',
      'linkedin',
      p_channel => 'linkedin',
      p_summary => 'LinkedIn message sent'
    )$$,
  'the activity RPC accepts linkedin as a user-loggable kind'
);
select lives_ok(
  $$select public.log_outreach_activity(
      '50000000-0000-0000-0000-000000000008',
      'meeting',
      p_summary => 'Meeting held'
    )$$,
  'the activity RPC accepts meeting as a user-loggable kind'
);
select lives_ok(
  $$select public.log_outreach_activity(
      '50000000-0000-0000-0000-000000000008',
      'reply',
      p_summary => 'Reply received'
    )$$,
  'the activity RPC accepts reply as a user-loggable kind'
);
select lives_ok(
  $$select public.log_outreach_activity(
      '50000000-0000-0000-0000-000000000008',
      'note',
      p_summary => 'Operator note'
    )$$,
  'the activity RPC accepts note as a user-loggable kind'
);

select throws_ok(
  $$select public.log_outreach_activity(
      '50000000-0000-0000-0000-000000000008',
      'stage_change'
    )$$,
  '22023',
  null,
  'the generic activity RPC rejects forged stage-change history'
);
select throws_ok(
  $$select public.log_outreach_activity(
      '50000000-0000-0000-0000-000000000008',
      'owner_transfer'
    )$$,
  '22023',
  null,
  'the generic activity RPC rejects forged owner-transfer history'
);
select throws_ok(
  $$select public.log_outreach_activity(
      '50000000-0000-0000-0000-000000000008',
      'owner_release'
    )$$,
  '22023',
  null,
  'the generic activity RPC rejects forged owner-release history'
);
select throws_ok(
  $$select public.log_outreach_activity(
      '50000000-0000-0000-0000-000000000008',
      'snooze'
    )$$,
  '22023',
  null,
  'the generic activity RPC rejects forged snooze history'
);
select throws_ok(
  $$select public.log_outreach_activity(
      '50000000-0000-0000-0000-000000000008',
      'silence'
    )$$,
  '22023',
  null,
  'the generic activity RPC rejects forged silence history'
);
select throws_ok(
  $$select public.log_outreach_activity(
      '50000000-0000-0000-0000-000000000008',
      'unsilence'
    )$$,
  '22023',
  null,
  'the generic activity RPC rejects forged unsilence history'
);

select lives_ok(
  $$select public.transfer_outreach_owner(
      '50000000-0000-0000-0000-000000000008',
      '20000000-0000-0000-0000-000000000001',
      'Confirm current owner'
    )$$,
  'the audited owner-transfer RPC can update an opportunity'
);
select lives_ok(
  $$select public.set_outreach_snooze(
      '50000000-0000-0000-0000-000000000008',
      '2099-01-01 00:00:00+00',
      'Pause outreach'
    )$$,
  'the audited snooze RPC can update an opportunity'
);
select lives_ok(
  $$select public.set_outreach_silence(
      '50000000-0000-0000-0000-000000000008',
      true,
      'Contact requested a pause'
    )$$,
  'the audited silence RPC can update an opportunity'
);
select lives_ok(
  $$select public.set_outreach_silence(
      '50000000-0000-0000-0000-000000000008',
      false,
      null,
      '2099-02-01 00:00:00+00'
    )$$,
  'the audited unsilence RPC can restore an opportunity'
);

select results_eq(
  $$select id from public.outreach_relationship_labels
    where id = '80000000-0000-0000-0000-000000000001'$$,
  $$values ('80000000-0000-0000-0000-000000000001'::uuid)$$,
  'an active semester administrator may read the global label catalog'
);
select throws_ok(
  $$insert into public.outreach_relationship_labels (id, slug, name, created_by)
    values ('80000000-0000-0000-0000-000000000004', 'admin-forged', 'Admin Forged', '20000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'a semester administrator cannot create a global label definition'
);
select results_eq(
  $$update public.outreach_relationship_labels
    set name = 'Admin Rewritten'
    where id = '80000000-0000-0000-0000-000000000001'
    returning id$$,
  $$select null::uuid where false$$,
  'a semester administrator cannot update a global label definition'
);
select results_eq(
  $$delete from public.outreach_relationship_labels
    where id = '80000000-0000-0000-0000-000000000003'
    returning id$$,
  $$select null::uuid where false$$,
  'a semester administrator cannot delete a global label definition'
);
select lives_ok(
  $$insert into public.outreach_opportunity_labels
      (semester_id, opportunity_id, relationship_label_id, added_by)
    values
      ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000008', '80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001')$$,
  'a semester administrator may attach a global label to their opportunity'
);
select throws_ok(
  $$insert into public.outreach_opportunity_labels
      (semester_id, opportunity_id, relationship_label_id, added_by)
    values
      ('10000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000007', '80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'a semester administrator cannot attach a label in another semester'
);
select lives_ok(
  $$delete from public.outreach_opportunity_labels
    where opportunity_id = '50000000-0000-0000-0000-000000000008'
      and relationship_label_id = '80000000-0000-0000-0000-000000000001'$$,
  'a semester administrator may detach a label from their opportunity'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into public.outreach_relationship_labels (id, slug, name, created_by)
    values ('80000000-0000-0000-0000-000000000010', 'super-label', 'Super Label', '20000000-0000-0000-0000-000000000005')$$,
  'a platform super administrator may create a global label definition'
);
select results_eq(
  $$update public.outreach_relationship_labels
    set name = 'Super Label Updated'
    where id = '80000000-0000-0000-0000-000000000010'
    returning name$$,
  $$values ('Super Label Updated'::text)$$,
  'a platform super administrator may update a global label definition'
);
select results_eq(
  $$delete from public.outreach_relationship_labels
    where id = '80000000-0000-0000-0000-000000000010'
    returning id$$,
  $$values ('80000000-0000-0000-0000-000000000010'::uuid)$$,
  'a platform super administrator may delete a global label definition'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.suspend_outreach_membership(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000007',
      '   ',
      (select updated_at from public.semester_memberships
        where id = '30000000-0000-0000-0000-000000000008')
    )$$,
  '23514',
  null,
  'atomic outreach suspension requires a non-empty reason'
);
select is(
  (select status from public.semester_memberships
    where id = '30000000-0000-0000-0000-000000000008'),
  'active'::public.membership_lifecycle_status,
  'invalid suspension input leaves membership active'
);
select results_eq(
  $$select membership_id, membership_status::text, released_opportunity_ids
    from public.suspend_outreach_membership(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000007',
      'Role ended',
      (select updated_at from public.semester_memberships
        where id = '30000000-0000-0000-0000-000000000008')
    )$$,
  $$values (
      '30000000-0000-0000-0000-000000000008'::uuid,
      'suspended'::text,
      array['50000000-0000-0000-0000-000000000016'::uuid]
    )$$,
  'atomic outreach suspension returns current membership state and released IDs'
);
reset role;
select is(
  (select status from public.semester_memberships
    where id = '30000000-0000-0000-0000-000000000008'),
  'suspended'::public.membership_lifecycle_status,
  'atomic outreach suspension changes membership state'
);
select isnt(
  (select suspended_at from public.semester_memberships
    where id = '30000000-0000-0000-0000-000000000008'),
  null::timestamptz,
  'atomic outreach suspension records the suspension timestamp'
);
select is(
  (select owner_profile_id from public.outreach_opportunities
    where id = '50000000-0000-0000-0000-000000000016'),
  null,
  'atomic outreach suspension moves open work to Unassigned'
);
select is(
  (select count(*) from public.outreach_activities
    where opportunity_id = '50000000-0000-0000-0000-000000000016'
      and activity_kind = 'owner_release'),
  1::bigint,
  'atomic outreach suspension appends one release activity per released opportunity'
);
select results_eq(
  $$select actor_profile_id, summary, previous_owner_profile_id, new_owner_profile_id
    from public.outreach_activities
    where opportunity_id = '50000000-0000-0000-0000-000000000016'
      and activity_kind = 'owner_release'$$,
  $$values (
      '20000000-0000-0000-0000-000000000001'::uuid,
      'Role ended'::text,
      '20000000-0000-0000-0000-000000000007'::uuid,
      null::uuid
    )$$,
  'atomic outreach suspension records actor, reason, and previous owner'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into pg_temp.dual_role_suspension_result
      (membership_id, membership_status, released_opportunity_ids)
    select membership_id, membership_status::text, released_opportunity_ids
    from public.suspend_outreach_membership(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000011',
      'Admin role ended',
      (select updated_at from public.semester_memberships
        where id = '30000000-0000-0000-0000-000000000013')
    )$$,
  'dual-role suspension selects the active admin membership'
);
reset role;
select results_eq(
  $$select membership_id, membership_status, released_opportunity_ids
    from pg_temp.dual_role_suspension_result$$,
  $$values (
      '30000000-0000-0000-0000-000000000013'::uuid,
      'suspended'::text,
      array['50000000-0000-0000-0000-000000000020'::uuid]
  )$$,
  'dual-role suspension returns the suspended admin membership and released work'
);
select results_eq(
  $$select status::text, suspended_at, updated_at from public.semester_memberships
    where id = '30000000-0000-0000-0000-000000000012'$$,
  $$values (
      'active'::text,
      null::timestamptz,
      '2026-08-18 12:00:00+00'::timestamptz
    )$$,
  'dual-role suspension leaves the mentor membership unchanged'
);
select is(
  (select status from public.semester_memberships
    where id = '30000000-0000-0000-0000-000000000013'),
  'suspended'::public.membership_lifecycle_status,
  'dual-role suspension changes only the admin membership state'
);
select is(
  (select owner_profile_id from public.outreach_opportunities
    where id = '50000000-0000-0000-0000-000000000020'),
  null,
  'dual-role suspension releases the admin owner open opportunity'
);
select is(
  (select count(*) from public.outreach_activities
    where opportunity_id = '50000000-0000-0000-0000-000000000020'
      and activity_kind = 'owner_release'),
  1::bigint,
  'dual-role suspension audits the released opportunity exactly once'
);
select results_eq(
  $$select previous_owner_profile_id, details ->> 'membership_id'
    from public.outreach_activities
    where opportunity_id = '50000000-0000-0000-0000-000000000020'
      and activity_kind = 'owner_release'$$,
  $$values (
      '20000000-0000-0000-0000-000000000011'::uuid,
      '30000000-0000-0000-0000-000000000013'::text
    )$$,
  'dual-role suspension audit identifies the admin membership and previous owner'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.suspend_outreach_membership(
      '10000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000008',
      'Unauthorized attempt',
      (select updated_at from public.semester_memberships
        where id = '30000000-0000-0000-0000-000000000009')
    )$$,
  '42501',
  null,
  'atomic outreach suspension rejects an unauthorized caller'
);
reset role;
select is(
  (select status from public.semester_memberships
    where id = '30000000-0000-0000-0000-000000000009'),
  'active'::public.membership_lifecycle_status,
  'unauthorized suspension leaves membership active'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.suspend_outreach_membership(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000009',
      'Stale attempt',
      '2000-01-01 00:00:00+00'
    )$$,
  '40001',
  null,
  'atomic outreach suspension rejects a stale membership timestamp'
);
reset role;
select is(
  (select status from public.semester_memberships
    where id = '30000000-0000-0000-0000-000000000010'),
  'active'::public.membership_lifecycle_status,
  'stale suspension leaves membership active'
);

create function pg_temp.fail_atomic_owner_release()
returns trigger
language plpgsql
as $$
begin
  if new.opportunity_id = '50000000-0000-0000-0000-000000000019'::uuid
    and new.activity_kind = 'owner_release'
  then
    raise exception 'forced owner release activity failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger force_atomic_owner_release_failure
before insert on public.outreach_activities
for each row execute function pg_temp.fail_atomic_owner_release();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.suspend_outreach_membership(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000010',
      'Forced rollback',
      (select updated_at from public.semester_memberships
        where id = '30000000-0000-0000-0000-000000000011')
    )$$,
  'P0001',
  null,
  'owner-release activity failure aborts atomic outreach suspension'
);
reset role;
drop trigger force_atomic_owner_release_failure on public.outreach_activities;
select is(
  (select status from public.semester_memberships
    where id = '30000000-0000-0000-0000-000000000011'),
  'active'::public.membership_lifecycle_status,
  'failed owner release rolls membership suspension back'
);
select is(
  (select owner_profile_id from public.outreach_opportunities
    where id = '50000000-0000-0000-0000-000000000019'),
  '20000000-0000-0000-0000-000000000010'::uuid,
  'failed owner release rolls ownership changes back'
);
select is(
  (select count(*) from public.outreach_activities
    where opportunity_id = '50000000-0000-0000-0000-000000000019'
      and activity_kind = 'owner_release'),
  0::bigint,
  'failed owner release leaves no partial activity history'
);

update public.semester_memberships
set status = 'suspended',
    suspended_at = now(),
    updated_at = now()
where id in (
  '30000000-0000-0000-0000-000000000004',
  '30000000-0000-0000-0000-000000000006',
  '30000000-0000-0000-0000-000000000007'
);

create temporary table released_opportunity_results (opportunity_id uuid) on commit drop;
grant select, insert on pg_temp.released_opportunity_results to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into pg_temp.released_opportunity_results (opportunity_id)
    select opportunity_id from public.release_inactive_owner_work(
      '20000000-0000-0000-0000-000000000004'
    )$$,
  'owner release ignores active cross-semester ownership before authorization'
);
select results_eq(
  $$select opportunity_id from pg_temp.released_opportunity_results order by opportunity_id$$,
  $$values ('50000000-0000-0000-0000-000000000006'::uuid)$$,
  'owner release returns every affected inactive-owner opportunity ID'
);
select is(
  (select owner_profile_id from public.outreach_opportunities where id = '50000000-0000-0000-0000-000000000006'),
  null,
  'owner release moves the opportunity to Unassigned'
);
select is(
  (select count(*) from public.outreach_activities
    where opportunity_id = '50000000-0000-0000-0000-000000000006'
      and activity_kind = 'owner_release'),
  1::bigint,
  'owner release appends an activity in the same transaction'
);
reset role;
select is(
  (select owner_profile_id from public.outreach_opportunities where id = '50000000-0000-0000-0000-000000000007'),
  '20000000-0000-0000-0000-000000000004'::uuid,
  'owner release leaves work assigned where the owner still has active membership'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  $$select opportunity_id from public.release_inactive_owner_work(
      '20000000-0000-0000-0000-000000000001'
    ) order by opportunity_id$$,
  $$select null::uuid where false$$,
  'an active owner cannot be released'
);
select is(
  (select owner_profile_id from public.outreach_opportunities where id = '50000000-0000-0000-0000-000000000008'),
  '20000000-0000-0000-0000-000000000001'::uuid,
  'active-owner work remains assigned'
);
select throws_ok(
  $$select * from public.release_inactive_owner_work(
      '20000000-0000-0000-0000-000000000006'
    )$$,
  '42501',
  null,
  'release validates authorization for every inactive-owner semester before committing'
);
reset role;
select is(
  (select owner_profile_id from public.outreach_opportunities where id = '50000000-0000-0000-0000-000000000009'),
  '20000000-0000-0000-0000-000000000006'::uuid,
  'an unauthorized cross-semester release rolls back managed-semester work'
);
select is(
  (select owner_profile_id from public.outreach_opportunities where id = '50000000-0000-0000-0000-000000000010'),
  '20000000-0000-0000-0000-000000000006'::uuid,
  'an unauthorized cross-semester release leaves other-semester work assigned'
);
select cmp_ok(
  (
    select regexp_count(
      lower(pg_get_functiondef('public.release_inactive_owner_work(uuid)'::regprocedure)),
      'can_manage_semester'
    )
  ),
  '>=',
  2,
  'owner release repeats authorization in the race-safe update predicate'
);
select cmp_ok(
  (
    select regexp_count(
      lower(pg_get_functiondef('public.release_inactive_owner_work(uuid)'::regprocedure)),
      'semester_memberships'
    )
  ),
  '>=',
  2,
  'owner release repeats owner-inactivity qualification in the race-safe update predicate'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$update public.outreach_activities
    set summary = 'history rewrite'
    where opportunity_id = '50000000-0000-0000-0000-000000000006'$$,
  '42501',
  null,
  'authenticated users cannot update outreach activities'
);
select throws_ok(
  $$delete from public.outreach_activities
    where opportunity_id = '50000000-0000-0000-0000-000000000006'$$,
  '42501',
  null,
  'authenticated users cannot delete outreach activities'
);
reset role;

select ok(
  not has_function_privilege(
    'anon',
    'public.create_outreach_contact_opportunity(uuid,text,text,text,text,text,text,text[],text,text,text,text,text,text,text,text,uuid,public.outreach_stage,smallint,timestamp with time zone,public.outreach_channel,text,smallint,text,uuid[])',
    'EXECUTE'
  ),
  'anonymous users cannot execute contact creation'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_outreach_contact_opportunity(uuid,text,text,text,text,text,text,text[],text,text,text,text,text,text,text,text,uuid,public.outreach_stage,smallint,timestamp with time zone,public.outreach_channel,text,smallint,text,uuid[])',
    'EXECUTE'
  ),
  'authenticated users may execute contact creation'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
create temporary table created_contact_result on commit drop as
select * from public.create_outreach_contact_opportunity(
  p_semester_id => '10000000-0000-0000-0000-000000000001',
  p_full_name => '  Katherine Johnson  ',
  p_email => '  KATHERINE@EXAMPLE.TEST ',
  p_company_name => 'NASA',
  p_company_domain => 'NASA.GOV',
  p_title => 'Mathematician',
  p_owner_profile_id => '20000000-0000-0000-0000-000000000001',
  p_stage => 'ready',
  p_cadence_days => 14,
  p_priority => 80
);
select is((select created from created_contact_result), true, 'contact creation reports a new opportunity');
select results_eq(
  $$select full_name, email from public.outreach_contacts
    where id = (select contact_id from created_contact_result)$$,
  $$values ('Katherine Johnson'::text, 'katherine@example.test'::text)$$,
  'contact creation trims names and normalizes email'
);
select results_eq(
  $$select name, domain from public.outreach_companies
    where id = (select company_id from created_contact_result)$$,
  $$values ('NASA'::text, 'nasa.gov'::text)$$,
  'contact creation creates the company in the same transaction'
);
select is(
  (select count(*) from public.outreach_contact_companies
    where contact_id = (select contact_id from created_contact_result)
      and company_id = (select company_id from created_contact_result)
      and title = 'Mathematician'
      and is_primary),
  1::bigint,
  'contact creation links the primary company in the same transaction'
);
select results_eq(
  $$select semester_id, stage, cadence_days, priority from public.outreach_opportunities
    where id = (select opportunity_id from created_contact_result)$$,
  $$values (
    '10000000-0000-0000-0000-000000000001'::uuid,
    'ready'::public.outreach_stage,
    14::smallint,
    80::smallint
  )$$,
  'contact creation creates the semester opportunity with requested settings'
);
select is(
  (select count(*) from public.outreach_activities
    where id = (select activity_id from created_contact_result)
      and opportunity_id = (select opportunity_id from created_contact_result)
      and activity_kind = 'stage_change'),
  1::bigint,
  'contact creation appends its audit activity atomically'
);

create temporary table duplicate_contact_result on commit drop as
select * from public.create_outreach_contact_opportunity(
  p_semester_id => '10000000-0000-0000-0000-000000000001',
  p_full_name => 'Katherine Johnson',
  p_email => 'katherine@example.test'
);
select is((select created from duplicate_contact_result), false, 'duplicate open creation reports reuse');
select is(
  (select opportunity_id from duplicate_contact_result),
  (select opportunity_id from created_contact_result),
  'duplicate open creation returns the existing opportunity'
);

create temporary table updated_contact_result on commit drop as
select * from public.update_outreach_contact(
  '10000000-0000-0000-0000-000000000001',
  (select contact_id from created_contact_result),
  (select updated_at from public.outreach_contacts where id = (select contact_id from created_contact_result)),
  '{"fullName":"Katherine G. Johnson","biography":"NASA mathematician"}'::jsonb
);
select is((select full_name from updated_contact_result), 'Katherine G. Johnson', 'safe update returns the updated contact');
select is(
  (select biography from public.outreach_contacts where id = (select contact_id from created_contact_result)),
  'NASA mathematician',
  'safe update persists allowed fields'
);
select throws_ok(
  format(
    $$select * from public.update_outreach_contact(
      '10000000-0000-0000-0000-000000000001',
      %L,
      '2000-01-01 00:00:00+00',
      '{"notes":"stale overwrite"}'::jsonb
    )$$,
    (select contact_id from created_contact_result)
  ),
  '40001',
  null,
  'safe contact update rejects stale updated_at'
);
select throws_ok(
  $$select * from public.create_outreach_contact_opportunity(
    p_semester_id => '10000000-0000-0000-0000-000000000002',
    p_full_name => 'Unauthorized Contact'
  )$$,
  '42501',
  null,
  'contact creation rejects an unauthorized semester'
);
reset role;

select * from finish();
rollback;
