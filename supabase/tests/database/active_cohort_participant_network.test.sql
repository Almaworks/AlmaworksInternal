begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.semesters (id, name, start_date, end_date, lifecycle_status, is_active, configuration)
values
  ('c1000000-0000-0000-0000-000000000001', 'Network cohort', '2099-01-01', '2099-05-31', 'active', true, '{"timezone":"America/New_York"}'::jsonb),
  ('c1000000-0000-0000-0000-000000000002', 'Other network cohort', '2098-01-01', '2098-05-31', 'archived', false, '{"timezone":"America/New_York"}'::jsonb);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('c2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'network-founder@example.test', '{}', '{}'),
  ('c2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'network-mentor@example.test', '{}', '{}'),
  ('c2000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'network-peer@example.test', '{}', '{}'),
  ('c2000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'onboarding-mentor@example.test', '{}', '{}'),
  ('c2000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'alumni-mentor@example.test', '{}', '{}'),
  ('c2000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'onboarding-founder@example.test', '{}', '{}'),
  ('c2000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'other-mentor@example.test', '{}', '{}'),
  ('c2000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'other-founder@example.test', '{}', '{}'),
  ('c2000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'network-admin@example.test', '{}', '{}'),
  ('c2000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'unassigned-peer@example.test', '{}', '{}');

insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name)
values
  ('c2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'network-founder@example.test', 'startup', 'approved', true, 'Network Founder'),
  ('c2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'network-mentor@example.test', 'mentor', 'approved', true, 'Network Mentor'),
  ('c2000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000003', 'network-peer@example.test', 'startup', 'approved', true, 'Network Peer'),
  ('c2000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000004', 'onboarding-mentor@example.test', 'mentor', 'approved', true, 'Onboarding Mentor'),
  ('c2000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-000000000005', 'alumni-mentor@example.test', 'mentor', 'approved', true, 'Alumni Mentor'),
  ('c2000000-0000-0000-0000-000000000006', 'c2000000-0000-0000-0000-000000000006', 'onboarding-founder@example.test', 'startup', 'approved', true, 'Onboarding Founder'),
  ('c2000000-0000-0000-0000-000000000007', 'c2000000-0000-0000-0000-000000000007', 'other-mentor@example.test', 'mentor', 'approved', true, 'Other Mentor'),
  ('c2000000-0000-0000-0000-000000000008', 'c2000000-0000-0000-0000-000000000008', 'other-founder@example.test', 'startup', 'approved', true, 'Other Founder'),
  ('c2000000-0000-0000-0000-000000000009', 'c2000000-0000-0000-0000-000000000009', 'network-admin@example.test', 'admin', 'approved', true, 'Network Admin'),
  ('c2000000-0000-0000-0000-000000000010', 'c2000000-0000-0000-0000-000000000010', 'unassigned-peer@example.test', 'startup', 'approved', true, 'Unassigned Peer');

insert into public.semester_memberships (id, semester_id, profile_id, role, status, activated_at, alumni_at)
values
  ('c3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'startup', 'active', now(), null),
  ('c3000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002', 'mentor', 'active', now(), null),
  ('c3000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000003', 'startup', 'active', now(), null),
  ('c3000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000004', 'mentor', 'onboarding', null, null),
  ('c3000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000005', 'mentor', 'alumni', now(), now()),
  ('c3000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000006', 'startup', 'onboarding', null, null),
  ('c3000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000007', 'mentor', 'active', now(), null),
  ('c3000000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000008', 'startup', 'active', now(), null),
  ('c3000000-0000-0000-0000-000000000009', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000009', 'admin', 'active', now(), null),
  ('c3000000-0000-0000-0000-000000000010', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000010', 'startup', 'active', now(), null),
  ('c3000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'startup', 'active', now(), null);

insert into public.mentor_profiles (profile_id, company, title, linkedin_url)
values
  ('c2000000-0000-0000-0000-000000000002', 'Network Co', 'Advisor', 'https://www.linkedin.com/in/network-mentor'),
  ('c2000000-0000-0000-0000-000000000004', 'Onboarding Co', 'Advisor', 'https://www.linkedin.com/in/onboarding-mentor'),
  ('c2000000-0000-0000-0000-000000000005', 'Alumni Co', 'Advisor', 'https://www.linkedin.com/in/alumni-mentor'),
  ('c2000000-0000-0000-0000-000000000007', 'Other Co', 'Advisor', 'https://www.linkedin.com/in/other-mentor');

insert into public.startup_organizations (id, name, slug)
values
  ('c4000000-0000-0000-0000-000000000001', 'Viewer Startup', 'viewer-startup'),
  ('c4000000-0000-0000-0000-000000000002', 'Peer Startup', 'peer-startup'),
  ('c4000000-0000-0000-0000-000000000003', 'Onboarding Startup', 'onboarding-startup'),
  ('c4000000-0000-0000-0000-000000000004', 'Other Startup', 'other-startup');

insert into public.startup_semesters (id, semester_id, startup_organization_id)
values
  ('c5000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001'),
  ('c5000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000002'),
  ('c5000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000003'),
  ('c5000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000004');

insert into public.startup_team_memberships (id, semester_id, startup_semester_id, semester_membership_id)
values
  ('c6000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001'),
  ('c6000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000003'),
  ('c6000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000006'),
  ('c6000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000008');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.semester_memberships where id in (
    'c3000000-0000-0000-0000-000000000001',
    'c3000000-0000-0000-0000-000000000002',
    'c3000000-0000-0000-0000-000000000003',
    'c3000000-0000-0000-0000-000000000010'
  )),
  4::bigint,
  'an active startup member sees active participant memberships in their cohort, including unassigned peers'
);
select is((select count(*) from public.semester_memberships where id = 'c3000000-0000-0000-0000-000000000004'), 0::bigint, 'an active startup member cannot see an onboarding mentor membership');
select is((select count(*) from public.semester_memberships where id = 'c3000000-0000-0000-0000-000000000005'), 0::bigint, 'an active startup member cannot see an alumni mentor membership');
select is((select count(*) from public.semester_memberships where id = 'c3000000-0000-0000-0000-000000000006'), 0::bigint, 'an active startup member cannot see an onboarding startup membership');
select is((select count(*) from public.semester_memberships where id in ('c3000000-0000-0000-0000-000000000007', 'c3000000-0000-0000-0000-000000000008')), 0::bigint, 'stale active memberships do not reopen an inactive prior cohort');

select results_eq(
  $$select email from public.profiles where id in ('c2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000010') order by email$$,
  $$values ('network-mentor@example.test'::text), ('network-peer@example.test'::text), ('unassigned-peer@example.test'::text)$$,
  'active cohort participant profile rows expose network-card contact email'
);
select is((select count(*) from public.profiles where id in ('c2000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-000000000006', 'c2000000-0000-0000-0000-000000000007', 'c2000000-0000-0000-0000-000000000008')), 0::bigint, 'inactive and other-cohort participant profiles stay hidden');
select results_eq(
  $$select linkedin_url from public.mentor_profiles order by linkedin_url$$,
  $$values ('https://www.linkedin.com/in/network-mentor'::text)$$,
  'the mentor directory exposes only active mentors in the viewer cohort'
);
select is((select count(*) from public.startup_team_memberships where id in ('c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002')), 2::bigint, 'an active participant sees active startup team assignments in their cohort');
select is((select count(*) from public.startup_team_memberships where id = 'c6000000-0000-0000-0000-000000000003'), 0::bigint, 'an onboarding startup team assignment stays hidden');
select is((select count(*) from public.startup_team_memberships where id = 'c6000000-0000-0000-0000-000000000004'), 0::bigint, 'an active startup team assignment in another cohort stays hidden');

reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2000000-0000-0000-0000-000000000009","role":"authenticated"}', true);
select is((select count(*) from public.semester_memberships where semester_id = 'c1000000-0000-0000-0000-000000000001'), 8::bigint, 'the cohort administrator retains membership visibility');
select is((select count(*) from public.mentor_profiles where profile_id in ('c2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000005')), 3::bigint, 'the cohort administrator retains mentor profile visibility');
reset role;

select * from finish();
rollback;
