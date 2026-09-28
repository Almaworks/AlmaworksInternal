begin;

create extension if not exists pgtap with schema extensions;
select plan(39);

insert into public.semesters (id, name, start_date, end_date, lifecycle_status, configuration)
values (
  'f1000000-0000-4000-8000-000000000001',
  'Registration approval onboarding test',
  '2099-09-01',
  '2099-12-31',
  'active',
  '{"timezone":"America/New_York"}'::jsonb
);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('f2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'approval-admin@example.test', '{}', '{}'),
  ('f2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'new-mentor@example.test', '{}', '{}'),
  ('f2000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'new-startup@example.test', '{}', '{}'),
  ('f2000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'new-admin@example.test', '{}', '{}'),
  ('f2000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'retry-mentor@example.test', '{}', '{}'),
  ('f2000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'active-startup@example.test', '{}', '{}'),
  ('f2000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'ordinary-actor@example.test', '{}', '{}'),
  ('f2000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'unauthorized-target@example.test', '{}', '{}'),
  ('f2000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'linked-startup@example.test', '{}', '{}'),
  ('f2000000-0000-4000-8000-000000000010', 'authenticated', 'authenticated', 'invited-mentor@example.test', '{}', '{}'),
  ('f2000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'suspended-mentor@example.test', '{}', '{}'),
  ('f2000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'alumni-startup@example.test', '{}', '{}');

insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name)
values
  ('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'approval-admin@example.test', 'admin', 'approved', true, 'Approval Admin'),
  ('f2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', 'new-mentor@example.test', 'mentor', 'pending', true, 'New Mentor'),
  ('f2000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000003', 'new-startup@example.test', 'startup', 'pending', true, 'New Startup'),
  ('f2000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000004', 'new-admin@example.test', 'admin', 'pending', true, 'New Admin'),
  ('f2000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000005', 'retry-mentor@example.test', 'mentor', 'approved', true, 'Retry Mentor'),
  ('f2000000-0000-4000-8000-000000000006', 'f2000000-0000-4000-8000-000000000006', 'active-startup@example.test', 'startup', 'approved', true, 'Active Startup'),
  ('f2000000-0000-4000-8000-000000000007', 'f2000000-0000-4000-8000-000000000007', 'ordinary-actor@example.test', 'mentor', 'approved', true, 'Ordinary Actor'),
  ('f2000000-0000-4000-8000-000000000008', 'f2000000-0000-4000-8000-000000000008', 'unauthorized-target@example.test', 'mentor', 'pending', true, 'Unauthorized Target'),
  ('f2000000-0000-4000-8000-000000000009', 'f2000000-0000-4000-8000-000000000009', 'linked-startup@example.test', 'startup', 'approved', true, 'Linked Startup'),
  ('f2000000-0000-4000-8000-000000000010', 'f2000000-0000-4000-8000-000000000010', 'invited-mentor@example.test', 'mentor', 'pending', true, 'Invited Mentor'),
  ('f2000000-0000-4000-8000-000000000011', 'f2000000-0000-4000-8000-000000000011', 'suspended-mentor@example.test', 'mentor', 'approved', true, 'Suspended Mentor'),
  ('f2000000-0000-4000-8000-000000000012', 'f2000000-0000-4000-8000-000000000012', 'alumni-startup@example.test', 'startup', 'approved', true, 'Alumni Startup');

insert into public.semester_memberships (
  id, semester_id, profile_id, role, status, activated_at,
  onboarding_data, onboarding_started_at
)
values
  ('f3000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'admin', 'active', '2099-08-01 12:00:00+00', '{}', null),
  ('f3000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000005', 'mentor', 'onboarding', null, '{"step":"availability","notes":"keep me"}', '2099-08-15 12:00:00+00'),
  ('f3000000-0000-4000-8000-000000000006', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000006', 'startup', 'active', '2099-08-10 12:00:00+00', '{"completed":true}', '2099-08-09 12:00:00+00'),
  ('f3000000-0000-4000-8000-000000000007', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000007', 'mentor', 'active', '2099-08-11 12:00:00+00', '{}', null),
  ('f3000000-0000-4000-8000-000000000009', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000009', 'startup', 'active', '2099-08-12 12:00:00+00', '{}', null),
  ('f3000000-0000-4000-8000-000000000010', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000010', 'mentor', 'invited', null, '{}', null),
  ('f3000000-0000-4000-8000-000000000011', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000011', 'mentor', 'suspended', '2099-08-13 12:00:00+00', '{"saved":"suspended"}', '2099-08-12 12:00:00+00'),
  ('f3000000-0000-4000-8000-000000000012', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000012', 'startup', 'alumni', '2099-08-14 12:00:00+00', '{"saved":"alumni"}', '2099-08-13 12:00:00+00');

insert into public.mentor_profiles (profile_id, biography)
values ('f2000000-0000-4000-8000-000000000005', 'Preserved mentor biography');

insert into public.mentor_semesters (
  id, semester_id, semester_membership_id, readiness_status, mentorship_goals
)
values (
  'f4000000-0000-4000-8000-000000000005',
  'f1000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000005',
  'in_progress',
  'Preserve this onboarding work'
);

insert into public.startup_organizations (id, name, slug)
values ('f5000000-0000-4000-8000-000000000009', 'Linked Startup', 'linked-startup-approval-test');

insert into public.startup_semesters (id, semester_id, startup_organization_id)
values (
  'f6000000-0000-4000-8000-000000000009',
  'f1000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000009'
);

insert into public.startup_team_memberships (
  semester_id, startup_semester_id, semester_membership_id
)
values (
  'f1000000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000009',
  'f3000000-0000-4000-8000-000000000009'
);

select lives_ok(
  $$select public.set_semester_member_access('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'mentor', true, 'New Mentor', 'new-mentor@example.test')$$,
  'an administrator can approve a new mentor'
);
select is((select status::text from public.semester_memberships where profile_id = 'f2000000-0000-4000-8000-000000000002'), 'onboarding', 'a new mentor starts onboarding');
select ok((select activated_at is null from public.semester_memberships where profile_id = 'f2000000-0000-4000-8000-000000000002'), 'a new mentor is not activated before onboarding finishes');
select is((select readiness_status from public.mentor_semesters where semester_membership_id = (select id from public.semester_memberships where profile_id = 'f2000000-0000-4000-8000-000000000002')), 'not_started', 'a new mentor receives a not-started mentor semester');

select lives_ok(
  $$select public.set_semester_member_access('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'startup', true, 'New Startup', 'new-startup@example.test')$$,
  'an administrator can approve a new startup participant'
);
select is((select status::text from public.semester_memberships where profile_id = 'f2000000-0000-4000-8000-000000000003'), 'onboarding', 'a new startup participant starts onboarding');
select ok((select activated_at is null from public.semester_memberships where profile_id = 'f2000000-0000-4000-8000-000000000003'), 'a new startup participant is not activated before onboarding finishes');

select lives_ok(
  $$select public.set_semester_member_access('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'admin', true, 'New Admin', 'new-admin@example.test')$$,
  'an administrator can approve a new administrator'
);
select is((select status::text from public.semester_memberships where profile_id = 'f2000000-0000-4000-8000-000000000004'), 'active', 'a new administrator remains immediately active');
select ok((select activated_at is not null from public.semester_memberships where profile_id = 'f2000000-0000-4000-8000-000000000004'), 'a new administrator receives an activation timestamp');

select lives_ok(
  $$select public.set_semester_member_access('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000001', 'mentor', true, 'Retry Mentor', 'retry-mentor@example.test')$$,
  'repeating mentor approval is idempotent'
);
select is((select status::text from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000005'), 'onboarding', 'repeated approval preserves onboarding lifecycle');
select is((select onboarding_data from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000005'), '{"step":"availability","notes":"keep me"}'::jsonb, 'repeated approval preserves onboarding data');
select is((select onboarding_started_at from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000005'), '2099-08-15 12:00:00+00'::timestamptz, 'repeated approval preserves onboarding start time');
select ok((select activated_at is null from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000005'), 'repeated approval does not activate an onboarding mentor');
select is((select readiness_status from public.mentor_semesters where id = 'f4000000-0000-4000-8000-000000000005'), 'in_progress', 'repeated approval preserves mentor readiness');
select is((select mentorship_goals from public.mentor_semesters where id = 'f4000000-0000-4000-8000-000000000005'), 'Preserve this onboarding work', 'repeated approval preserves mentor onboarding details');

select lives_ok(
  $$select public.set_semester_member_access('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000006', 'f1000000-0000-4000-8000-000000000001', 'startup', true, 'Active Startup', 'active-startup@example.test')$$,
  'repeating approval for an established member is idempotent'
);
select is((select status::text from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000006'), 'active', 'repeated approval preserves active lifecycle');
select is((select activated_at from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000006'), '2099-08-10 12:00:00+00'::timestamptz, 'repeated approval preserves the original activation time');
select is((select onboarding_data from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000006'), '{"completed":true}'::jsonb, 'repeated approval preserves established onboarding data');

select lives_ok(
  $$select public.set_semester_member_access('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000010', 'f1000000-0000-4000-8000-000000000001', 'mentor', true, 'Invited Mentor', 'invited-mentor@example.test')$$,
  'approving an invited mentor begins onboarding'
);
select is((select status::text from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000010'), 'onboarding', 'an invited mentor advances to onboarding');
select ok((select activated_at is null from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000010'), 'an invited mentor remains unactivated during onboarding');

select lives_ok(
  $$select public.set_semester_member_access('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000011', 'f1000000-0000-4000-8000-000000000001', 'mentor', true, 'Suspended Mentor', 'suspended-mentor@example.test')$$,
  'repeated approval accepts an existing suspended mentor without reactivation'
);
select is((select status::text from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000011'), 'suspended', 'repeated approval preserves suspended lifecycle');
select is((select onboarding_data from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000011'), '{"saved":"suspended"}'::jsonb, 'repeated approval preserves suspended onboarding data');

select lives_ok(
  $$select public.set_semester_member_access('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000011', 'f1000000-0000-4000-8000-000000000001', 'mentor', false, 'Renamed Suspended Mentor', 'suspended-mentor@example.test')$$,
  'the existing direct administrator edit path still reactivates a member'
);
select is((select status::text from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000011'), 'active', 'a direct administrator edit retains its prior activation behavior');
select is((select full_name from public.profiles where id = 'f2000000-0000-4000-8000-000000000011'), 'Renamed Suspended Mentor', 'a direct administrator edit still updates profile fields');

select lives_ok(
  $$select public.set_semester_member_access('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000012', 'f1000000-0000-4000-8000-000000000001', 'startup', true, 'Alumni Startup', 'alumni-startup@example.test')$$,
  'repeated approval accepts an alumni member without reactivation'
);
select is((select status::text from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000012'), 'alumni', 'repeated approval preserves alumni lifecycle');

select throws_ok(
  $$select public.set_semester_member_access('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000008', 'f1000000-0000-4000-8000-000000000001', 'mentor', false, 'Unauthorized Target', 'unauthorized-target@example.test')$$,
  'P0002',
  'Semester member not found',
  'the direct administrator edit path still requires an existing membership'
);

select throws_ok(
  $$select public.set_semester_member_access('f2000000-0000-4000-8000-000000000007', 'f2000000-0000-4000-8000-000000000008', 'f1000000-0000-4000-8000-000000000001', 'mentor', true, 'Unauthorized Target', 'unauthorized-target@example.test')$$,
  '42501',
  'Semester administrator access required',
  'a non-administrator cannot approve a registration'
);
select is((select status from public.profiles where id = 'f2000000-0000-4000-8000-000000000008'), 'pending', 'denied approval leaves the profile pending');
select is((select count(*) from public.semester_memberships where profile_id = 'f2000000-0000-4000-8000-000000000008'), 0::bigint, 'denied approval creates no membership');

select throws_ok(
  $$select public.set_semester_member_access('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000009', 'f1000000-0000-4000-8000-000000000001', 'mentor', true, 'Linked Startup', 'linked-startup@example.test')$$,
  '23514',
  'Role transition requires explicit data migration',
  'approval cannot change a linked startup membership into a mentor'
);
select is((select role::text from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000009'), 'startup', 'denied role transition preserves the startup role');
select is((select status::text from public.semester_memberships where id = 'f3000000-0000-4000-8000-000000000009'), 'active', 'denied role transition preserves membership lifecycle');

select * from finish();
rollback;
