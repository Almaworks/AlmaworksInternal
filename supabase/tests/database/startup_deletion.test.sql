begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.semesters (id, name, start_date, end_date, lifecycle_status, configuration)
values ('b1000000-0000-0000-0000-000000000001', 'Startup deletion test', '2099-09-01', '2099-12-31', 'active', '{"timezone":"America/New_York"}'::jsonb);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('b2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'delete-super-admin@example.test', '{}', '{}'),
  ('b2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'delete-founder@example.test', '{}', '{}'),
  ('b2000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'delete-mentor@example.test', '{}', '{}');

insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name)
values
  ('b2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'delete-super-admin@example.test', 'admin', 'approved', true, 'Delete Super Admin'),
  ('b2000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'delete-founder@example.test', 'startup', 'approved', true, 'Delete Founder'),
  ('b2000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000003', 'delete-mentor@example.test', 'mentor', 'approved', true, 'Delete Mentor');

insert into public.platform_roles (profile_id, role)
values ('b2000000-0000-0000-0000-000000000001', 'super_admin');

insert into public.semester_memberships (id, semester_id, profile_id, role, status, activated_at)
values
  ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'startup', 'active', now()),
  ('b3000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000003', 'mentor', 'active', now());

insert into public.mentor_semesters (id, semester_id, semester_membership_id)
values ('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000002');

insert into public.startup_organizations (id, name, slug)
values ('b5000000-0000-0000-0000-000000000001', 'Delete Me Startup', 'delete-me-startup');

insert into public.startup_semesters (id, semester_id, startup_organization_id)
values ('b6000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001');

insert into public.startup_team_memberships (semester_id, startup_semester_id, semester_membership_id)
values ('b1000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001');

insert into public.meetings (id, semester_id, meeting_date)
values ('b7000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '2099-09-04');

insert into public.sessions (id, semester_id, meeting_id, mentor_semester_id, startup_semester_id, slot, status)
values ('b8000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000001', 1, 'confirmed');

insert into public.session_rsvps (id, semester_id, session_id, semester_membership_id, response)
values ('b9000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'attending');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.delete_startup_permanently('b5000000-0000-0000-0000-000000000001', 'Delete Me Startup')$$,
  '42501', 'Platform super-administrator access required',
  'a startup founder cannot permanently delete a startup'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.delete_startup_permanently('b5000000-0000-0000-0000-000000000001', 'Wrong Name')$$,
  '22023', 'Startup name confirmation does not match',
  'a super administrator must enter the exact startup name'
);
select is(
  (select public.delete_startup_permanently('b5000000-0000-0000-0000-000000000001', 'Delete Me Startup')->>'deletedSessions'),
  '1',
  'a super administrator can permanently delete a confirmed startup session'
);
reset role;

select is((select count(*) from public.startup_organizations where id = 'b5000000-0000-0000-0000-000000000001'), 0::bigint, 'the durable startup organization is deleted');
select is((select count(*) from public.startup_semesters where id = 'b6000000-0000-0000-0000-000000000001'), 0::bigint, 'all cohort participation is deleted');
select is((select count(*) from public.sessions where id = 'b8000000-0000-0000-0000-000000000001'), 0::bigint, 'startup sessions are deleted');
select is((select count(*) from public.session_rsvps where id = 'b9000000-0000-0000-0000-000000000001'), 0::bigint, 'session RSVPs are deleted with the session');
select is((select count(*) from public.profiles where id = 'b2000000-0000-0000-0000-000000000002'), 1::bigint, 'the founder profile remains available for separate deletion');

select * from finish();
rollback;
