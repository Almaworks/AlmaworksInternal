begin;

create extension if not exists pgtap with schema extensions;
select plan(29);

insert into public.semesters (id, name, start_date, end_date, lifecycle_status, is_active)
values
  ('d1000000-0000-0000-0000-000000000001', 'Lifecycle source', '2096-01-01', '2096-05-31', 'active', true),
  ('d1000000-0000-0000-0000-000000000002', 'Lifecycle target', '2096-09-01', '2096-12-31', 'draft', false),
  ('d1000000-0000-0000-0000-000000000003', 'Unrelated cohort', '2097-01-01', '2097-05-31', 'closed', false);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('d2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'semester-super-admin@example.test', '{}', '{}'),
  ('d2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'semester-admin@example.test', '{}', '{}'),
  ('d2000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'unrelated-super-admin@example.test', '{}', '{}'),
  ('d2000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'semester-participant@example.test', '{}', '{}');

insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name)
values
  ('d2000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'semester-super-admin@example.test', 'admin', 'approved', true, 'Semester Super Admin'),
  ('d2000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000002', 'semester-admin@example.test', 'admin', 'approved', true, 'Semester Admin'),
  ('d2000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000003', 'unrelated-super-admin@example.test', 'admin', 'approved', true, 'Unrelated Super Admin'),
  ('d2000000-0000-0000-0000-000000000004', 'd2000000-0000-0000-0000-000000000004', 'semester-participant@example.test', 'mentor', 'approved', true, 'Semester Participant');

insert into public.semester_memberships (id, semester_id, profile_id, role, status, activated_at)
values
  ('d3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'admin', 'active', now()),
  ('d3000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002', 'admin', 'active', now()),
  ('d3000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000003', 'admin', 'active', now()),
  ('d3000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000004', 'mentor', 'active', now()),
  ('d3000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000002', 'admin', 'active', now());

insert into public.platform_roles (profile_id, role, granted_by)
values
  ('d2000000-0000-0000-0000-000000000001', 'super_admin', 'd2000000-0000-0000-0000-000000000001'),
  ('d2000000-0000-0000-0000-000000000003', 'super_admin', 'd2000000-0000-0000-0000-000000000001');

insert into public.meetings (id, semester_id, meeting_date, label)
values ('d4000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', '2096-09-07', 'Original draft meeting');

select ok(has_function_privilege('authenticated', 'public.create_semester_draft(uuid,text,date,date,jsonb)', 'execute'), 'authenticated callers may invoke the authorized draft RPC');
select ok(has_function_privilege('authenticated', 'public.activate_semester_transition(uuid,uuid)', 'execute'), 'authenticated callers may invoke the authorized activation RPC');
select ok(has_function_privilege('authenticated', 'public.replace_draft_meetings(uuid,jsonb)', 'execute'), 'authenticated callers may invoke the authorized meeting replacement RPC');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select ok(public.can_manage_semester('d1000000-0000-0000-0000-000000000001'), 'ordinary active admins retain normal semester management authorization');
select results_eq(
  $$select profile_id from public.platform_roles order by profile_id$$,
  $$values ('d2000000-0000-0000-0000-000000000001'::uuid)$$,
  'ordinary admins see the super-admin grant for a member of their managed semester only'
);
select is((select count(*) from public.platform_roles where profile_id = 'd2000000-0000-0000-0000-000000000003'), 0::bigint, 'ordinary admins cannot see unrelated super-admin grants');

select throws_ok(
  $$insert into public.semesters (name, start_date, end_date) values ('Direct admin draft', '2098-01-01', '2098-05-31')$$,
  '42501',
  null,
  'ordinary admins cannot insert semesters directly'
);
select throws_ok(
  $$update public.semesters set is_active = true, lifecycle_status = 'active' where id = 'd1000000-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'ordinary admins cannot activate semesters directly'
);
select throws_ok(
  $$delete from public.semesters where id = 'd1000000-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'ordinary admins cannot delete semesters directly'
);
select throws_ok(
  $$insert into public.platform_roles (profile_id, role) values ('d2000000-0000-0000-0000-000000000002', 'super_admin')$$,
  '42501',
  null,
  'ordinary admins cannot grant platform roles directly'
);
select throws_ok(
  $$update public.platform_roles set granted_by = 'd2000000-0000-0000-0000-000000000002' where profile_id = 'd2000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'ordinary admins cannot update visible platform roles directly'
);
select throws_ok(
  $$delete from public.platform_roles where profile_id = 'd2000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'ordinary admins cannot delete visible platform roles directly'
);
select throws_ok(
  $$select * from public.create_semester_draft('d1000000-0000-0000-0000-000000000001', 'Admin RPC draft', '2098-01-01', '2098-05-31', '{}')$$,
  '42501',
  'Platform super-administrator access required',
  'ordinary admins cannot create semester drafts through the RPC'
);
select throws_ok(
  $$select public.replace_draft_meetings('d1000000-0000-0000-0000-000000000002', '[{"date":"2096-09-14","label":"Unauthorized replacement"}]')$$,
  '42501',
  'Platform super-administrator access required',
  'ordinary admins cannot replace draft meetings through the RPC'
);
select throws_ok(
  $$select * from public.activate_semester_transition('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002')$$,
  '42501',
  'Platform super-administrator access required',
  'ordinary admins cannot activate semester transitions through the RPC'
);
reset role;

select is((select count(*) from public.meetings where id = 'd4000000-0000-0000-0000-000000000001'), 1::bigint, 'denied meeting replacement leaves the draft schedule intact');
select results_eq(
  $$select lifecycle_status::text, is_active from public.semesters where id in ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002') order by id$$,
  $$values ('active'::text, true), ('draft'::text, false)$$,
  'denied activation leaves semester lifecycle state unchanged'
);

-- Reset the fixtures so the super-admin success cases remain independent if
-- a future regression lets one of the denied calls above mutate state.
update public.semesters
set is_active = false,
    lifecycle_status = 'draft',
    closed_at = null
where id = 'd1000000-0000-0000-0000-000000000002';
update public.semesters
set is_active = true,
    lifecycle_status = 'active',
    closed_at = null
where id = 'd1000000-0000-0000-0000-000000000001';
update public.semester_memberships
set status = 'active',
    alumni_at = null
where id = 'd3000000-0000-0000-0000-000000000004';
delete from public.meetings where semester_id = 'd1000000-0000-0000-0000-000000000002';
insert into public.meetings (id, semester_id, meeting_date, label)
values ('d4000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', '2096-09-07', 'Original draft meeting');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*) from public.semesters where id in ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000003')), 3::bigint, 'participants retain authenticated semester reads');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select count(*) from public.platform_roles), 2::bigint, 'super admins retain visibility of all platform-role grants');
select results_eq(
  $$select semester_name from public.create_semester_draft(
      'd1000000-0000-0000-0000-000000000001',
      'Super-admin draft',
      '2098-01-01',
      '2098-05-31',
      '{"timezone":"America/New_York"}'
    )$$,
  $$values ('Super-admin draft'::text)$$,
  'super admins can create semester drafts through the lifecycle RPC'
);
select is(
  (select count(*) from public.semester_memberships membership join public.semesters semester on semester.id = membership.semester_id where semester.name = 'Super-admin draft' and membership.profile_id = 'd2000000-0000-0000-0000-000000000001' and membership.role = 'admin' and membership.status = 'active'),
  1::bigint,
  'draft creation enrolls the super-admin actor as the draft administrator'
);
select is(
  public.replace_draft_meetings('d1000000-0000-0000-0000-000000000002', '[{"date":"2096-09-14","label":"Authorized replacement"}]'),
  1,
  'super admins can replace draft meetings through the lifecycle RPC'
);
reset role;
select results_eq(
  $$select meeting_date, label from public.meetings where semester_id = 'd1000000-0000-0000-0000-000000000002'$$,
  $$values ('2096-09-14'::date, 'Authorized replacement'::text)$$,
  'authorized draft meeting replacement persists the proposed schedule'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select closed_semester_id, active_semester_id, alumni_count from public.activate_semester_transition('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002')$$,
  $$values ('d1000000-0000-0000-0000-000000000001'::uuid, 'd1000000-0000-0000-0000-000000000002'::uuid, 1)$$,
  'super admins can activate the next semester through the lifecycle RPC'
);
select results_eq(
  $$select lifecycle_status::text, is_active from public.semesters where id in ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002') order by id$$,
  $$values ('closed'::text, false), ('active'::text, true)$$,
  'authorized activation closes the source and activates the target'
);
select is((select status::text from public.semester_memberships where id = 'd3000000-0000-0000-0000-000000000004'), 'alumni', 'authorized activation moves source participants to alumni');
select throws_ok(
  $$update public.semesters set name = 'Direct super-admin edit' where id = 'd1000000-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'super admins also use RPC-only semester writes'
);
reset role;

select is((select count(*) from public.semesters where name = 'Direct admin draft'), 0::bigint, 'no denied direct semester insert persists');
select is((select count(*) from public.semesters where name = 'Admin RPC draft'), 0::bigint, 'no denied ordinary-admin RPC draft persists');

select * from finish();
rollback;
