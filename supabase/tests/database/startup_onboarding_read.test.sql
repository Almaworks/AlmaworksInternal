begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
set local search_path = public, extensions;
select plan(27);
select ok(has_column_privilege('authenticated', 'public.startup_semesters', 'company_snapshot', 'UPDATE'), 'startup setup can save its company snapshot');
select ok(has_column_privilege('authenticated', 'public.startup_semesters', 'mentor_need_context', 'UPDATE'), 'startup setup can save its team contact context');
select ok(has_column_privilege('authenticated', 'public.startup_semesters', 'readiness_status', 'UPDATE'), 'startup setup can save its readiness');

insert into public.semesters (id, name, start_date, end_date, lifecycle_status, is_active, configuration)
values
  ('a1100000-0000-4000-8000-000000000001', 'Startup onboarding access', '2099-01-01', '2099-05-31', 'active', true, '{}'),
  ('a1100000-0000-4000-8000-000000000002', 'Other startup semester', '2099-08-01', '2099-12-31', 'draft', false, '{}');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('a1200000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'invited-startup@example.test', '{}', '{}'),
  ('a1200000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'onboarding-startup@example.test', '{}', '{}'),
  ('a1200000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'unrelated-startup@example.test', '{}', '{}'),
  ('a1200000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'suspended-startup@example.test', '{}', '{}'),
  ('a1200000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'pending-startup@example.test', '{}', '{}'),
  ('a1200000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'inactive-startup@example.test', '{}', '{}'),
  ('a1200000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'active-startup@example.test', '{}', '{}'),
  ('a1200000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'startup-admin@example.test', '{}', '{}');

insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name)
values
  ('a1200000-0000-4000-8000-000000000001', 'a1200000-0000-4000-8000-000000000001', 'invited-startup@example.test', 'startup', 'approved', true, 'Invited Startup'),
  ('a1200000-0000-4000-8000-000000000002', 'a1200000-0000-4000-8000-000000000002', 'onboarding-startup@example.test', 'startup', 'approved', true, 'Onboarding Startup'),
  ('a1200000-0000-4000-8000-000000000003', 'a1200000-0000-4000-8000-000000000003', 'unrelated-startup@example.test', 'startup', 'approved', true, 'Unrelated Startup'),
  ('a1200000-0000-4000-8000-000000000004', 'a1200000-0000-4000-8000-000000000004', 'suspended-startup@example.test', 'startup', 'approved', true, 'Suspended Startup'),
  ('a1200000-0000-4000-8000-000000000005', 'a1200000-0000-4000-8000-000000000005', 'pending-startup@example.test', 'startup', 'pending', true, 'Pending Startup'),
  ('a1200000-0000-4000-8000-000000000006', 'a1200000-0000-4000-8000-000000000006', 'inactive-startup@example.test', 'startup', 'approved', false, 'Inactive Startup'),
  ('a1200000-0000-4000-8000-000000000007', 'a1200000-0000-4000-8000-000000000007', 'active-startup@example.test', 'startup', 'approved', true, 'Active Startup'),
  ('a1200000-0000-4000-8000-000000000008', 'a1200000-0000-4000-8000-000000000008', 'startup-admin@example.test', 'admin', 'approved', true, 'Startup Admin');

insert into public.semester_memberships (id, semester_id, profile_id, role, status, activated_at)
values
  ('a1300000-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000001', 'a1200000-0000-4000-8000-000000000001', 'startup', 'invited', null),
  ('a1300000-0000-4000-8000-000000000002', 'a1100000-0000-4000-8000-000000000001', 'a1200000-0000-4000-8000-000000000002', 'startup', 'onboarding', null),
  ('a1300000-0000-4000-8000-000000000003', 'a1100000-0000-4000-8000-000000000001', 'a1200000-0000-4000-8000-000000000003', 'startup', 'onboarding', null),
  ('a1300000-0000-4000-8000-000000000004', 'a1100000-0000-4000-8000-000000000001', 'a1200000-0000-4000-8000-000000000004', 'startup', 'suspended', null),
  ('a1300000-0000-4000-8000-000000000005', 'a1100000-0000-4000-8000-000000000001', 'a1200000-0000-4000-8000-000000000005', 'startup', 'onboarding', null),
  ('a1300000-0000-4000-8000-000000000006', 'a1100000-0000-4000-8000-000000000001', 'a1200000-0000-4000-8000-000000000006', 'startup', 'onboarding', null),
  ('a1300000-0000-4000-8000-000000000007', 'a1100000-0000-4000-8000-000000000001', 'a1200000-0000-4000-8000-000000000007', 'startup', 'active', now()),
  ('a1300000-0000-4000-8000-000000000008', 'a1100000-0000-4000-8000-000000000001', 'a1200000-0000-4000-8000-000000000008', 'admin', 'active', now()),
  ('a1300000-0000-4000-8000-000000000009', 'a1100000-0000-4000-8000-000000000002', 'a1200000-0000-4000-8000-000000000003', 'startup', 'onboarding', null);

insert into public.startup_organizations (id, name, slug)
values
  ('a1400000-0000-4000-8000-000000000001', 'Invited Organization', 'invited-organization'),
  ('a1400000-0000-4000-8000-000000000002', 'Onboarding Organization', 'onboarding-organization'),
  ('a1400000-0000-4000-8000-000000000003', 'Unrelated Organization', 'unrelated-organization'),
  ('a1400000-0000-4000-8000-000000000004', 'Suspended Organization', 'suspended-organization'),
  ('a1400000-0000-4000-8000-000000000005', 'Pending Organization', 'pending-organization'),
  ('a1400000-0000-4000-8000-000000000006', 'Inactive Organization', 'inactive-organization'),
  ('a1400000-0000-4000-8000-000000000007', 'Other Semester Organization', 'other-semester-organization');

insert into public.startup_semesters (id, semester_id, startup_organization_id, stage)
values
  ('a1500000-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000001', 'mvp'),
  ('a1500000-0000-4000-8000-000000000002', 'a1100000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000002', 'mvp'),
  ('a1500000-0000-4000-8000-000000000003', 'a1100000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000003', 'mvp'),
  ('a1500000-0000-4000-8000-000000000004', 'a1100000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000004', 'mvp'),
  ('a1500000-0000-4000-8000-000000000005', 'a1100000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000005', 'mvp'),
  ('a1500000-0000-4000-8000-000000000006', 'a1100000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000006', 'mvp'),
  ('a1500000-0000-4000-8000-000000000007', 'a1100000-0000-4000-8000-000000000002', 'a1400000-0000-4000-8000-000000000007', 'mvp');

insert into public.startup_team_memberships (id, semester_id, startup_semester_id, semester_membership_id)
values
  ('a1600000-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000001', 'a1500000-0000-4000-8000-000000000001', 'a1300000-0000-4000-8000-000000000001'),
  ('a1600000-0000-4000-8000-000000000002', 'a1100000-0000-4000-8000-000000000001', 'a1500000-0000-4000-8000-000000000002', 'a1300000-0000-4000-8000-000000000002'),
  ('a1600000-0000-4000-8000-000000000003', 'a1100000-0000-4000-8000-000000000001', 'a1500000-0000-4000-8000-000000000003', 'a1300000-0000-4000-8000-000000000003'),
  ('a1600000-0000-4000-8000-000000000004', 'a1100000-0000-4000-8000-000000000001', 'a1500000-0000-4000-8000-000000000004', 'a1300000-0000-4000-8000-000000000004'),
  ('a1600000-0000-4000-8000-000000000005', 'a1100000-0000-4000-8000-000000000001', 'a1500000-0000-4000-8000-000000000005', 'a1300000-0000-4000-8000-000000000005'),
  ('a1600000-0000-4000-8000-000000000006', 'a1100000-0000-4000-8000-000000000001', 'a1500000-0000-4000-8000-000000000006', 'a1300000-0000-4000-8000-000000000006'),
  ('a1600000-0000-4000-8000-000000000007', 'a1100000-0000-4000-8000-000000000002', 'a1500000-0000-4000-8000-000000000007', 'a1300000-0000-4000-8000-000000000009');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"a1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.startup_semesters where id = 'a1500000-0000-4000-8000-000000000001'), 1::bigint, 'an invited startup reads its assigned startup semester');
select is((select count(*) from public.startup_organizations where id = 'a1400000-0000-4000-8000-000000000001'), 1::bigint, 'an invited startup reads its assigned organization');
select is((select count(*) from public.startup_semesters where id = 'a1500000-0000-4000-8000-000000000003'), 0::bigint, 'an invited startup cannot read another startup in its semester');
select is((select count(*) from public.startup_organizations where id = 'a1400000-0000-4000-8000-000000000003'), 0::bigint, 'an invited startup cannot read another organization in its semester');
select is((select count(*) from public.startup_semesters where id = 'a1500000-0000-4000-8000-000000000007'), 0::bigint, 'an invited startup cannot read a startup in another semester');
select is((select count(*) from public.startup_organizations where id = 'a1400000-0000-4000-8000-000000000007'), 0::bigint, 'an invited startup cannot read an organization in another semester');

select set_config('request.jwt.claims', '{"sub":"a1200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.startup_semesters where id = 'a1500000-0000-4000-8000-000000000002'), 1::bigint, 'an onboarding startup reads its assigned startup semester');
select is((select count(*) from public.startup_organizations where id = 'a1400000-0000-4000-8000-000000000002'), 1::bigint, 'an onboarding startup reads its assigned organization');
with changed as (
  update public.startup_semesters
  set stage = 'growth', company_snapshot = 'QA setup snapshot', mentor_need_context = 'QA team contact', readiness_status = 'in_progress'
  where id = 'a1500000-0000-4000-8000-000000000002'
  returning id
)
select is((select count(*) from changed), 1::bigint, 'an onboarding startup updates its assigned startup semester');
with changed as (
  update public.startup_organizations
  set name = 'Onboarding Organization Updated'
  where id = 'a1400000-0000-4000-8000-000000000002'
  returning id
)
select is((select count(*) from changed), 1::bigint, 'an onboarding startup updates its assigned organization');
with changed as (
  update public.startup_semesters
  set stage = 'idea'
  where id = 'a1500000-0000-4000-8000-000000000003'
  returning id
)
select is((select count(*) from changed), 0::bigint, 'an onboarding startup cannot update another startup semester');
with changed as (
  update public.startup_organizations
  set name = 'Cross-organization intrusion'
  where id = 'a1400000-0000-4000-8000-000000000003'
  returning id
)
select is((select count(*) from changed), 0::bigint, 'an onboarding startup cannot update another organization');

select set_config('request.jwt.claims', '{"sub":"a1200000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*) from public.startup_semesters where id = 'a1500000-0000-4000-8000-000000000004'), 0::bigint, 'a suspended startup cannot read its former startup semester');
select is((select count(*) from public.startup_organizations where id = 'a1400000-0000-4000-8000-000000000004'), 0::bigint, 'a suspended startup cannot read its former organization');

select set_config('request.jwt.claims', '{"sub":"a1200000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*) from public.startup_semesters where id = 'a1500000-0000-4000-8000-000000000005'), 0::bigint, 'a pending profile cannot read an assigned startup semester');
select is((select count(*) from public.startup_organizations where id = 'a1400000-0000-4000-8000-000000000005'), 0::bigint, 'a pending profile cannot read an assigned organization');

select set_config('request.jwt.claims', '{"sub":"a1200000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is((select count(*) from public.startup_semesters where id = 'a1500000-0000-4000-8000-000000000006'), 0::bigint, 'an inactive profile cannot read an assigned startup semester');
select is((select count(*) from public.startup_organizations where id = 'a1400000-0000-4000-8000-000000000006'), 0::bigint, 'an inactive profile cannot read an assigned organization');

select set_config('request.jwt.claims', '{"sub":"a1200000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select is((select count(*) from public.startup_semesters where semester_id = 'a1100000-0000-4000-8000-000000000001'), 6::bigint, 'an active startup retains cohort startup visibility');
select is((select count(*) from public.startup_organizations where id between 'a1400000-0000-4000-8000-000000000001' and 'a1400000-0000-4000-8000-000000000006'), 6::bigint, 'an active startup retains cohort organization visibility');
select is((select count(*) from public.startup_semesters where semester_id = 'a1100000-0000-4000-8000-000000000002'), 0::bigint, 'an active startup does not gain another semester');

select set_config('request.jwt.claims', '{"sub":"a1200000-0000-4000-8000-000000000008","role":"authenticated"}', true);
select is((select count(*) from public.startup_semesters where semester_id = 'a1100000-0000-4000-8000-000000000001'), 6::bigint, 'an active semester administrator retains cohort startup visibility');
select is((select count(*) from public.startup_organizations where id between 'a1400000-0000-4000-8000-000000000001' and 'a1400000-0000-4000-8000-000000000006'), 6::bigint, 'an active semester administrator retains cohort organization visibility');
select is((select count(*) from public.startup_semesters where semester_id = 'a1100000-0000-4000-8000-000000000002'), 0::bigint, 'a semester administrator does not gain another semester');

select * from finish();
rollback;
