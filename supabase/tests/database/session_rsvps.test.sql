begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into public.semesters (id, name, start_date, end_date, lifecycle_status, configuration)
values (
  'a1000000-0000-0000-0000-000000000001',
  'RSVP policy semester',
  '2099-09-01',
  '2099-12-31',
  'active',
  '{"timezone":"America/New_York"}'::jsonb
);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('a2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rsvp-admin@example.test', '{}', '{"full_name":"RSVP Admin"}'),
  ('a2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rsvp-mentor@example.test', '{}', '{"full_name":"Maya Mentor"}'),
  ('a2000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'rsvp-founder-one@example.test', '{}', '{"full_name":"Ari Founder"}'),
  ('a2000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'rsvp-founder-two@example.test', '{}', '{"full_name":"Sam Founder"}'),
  ('a2000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'rsvp-outsider@example.test', '{}', '{"full_name":"Other Mentor"}');

insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name)
values
  ('a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'rsvp-admin@example.test', 'admin', 'approved', true, 'RSVP Admin'),
  ('a2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'rsvp-mentor@example.test', 'mentor', 'approved', true, 'Maya Mentor'),
  ('a2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000003', 'rsvp-founder-one@example.test', 'startup', 'approved', true, 'Ari Founder'),
  ('a2000000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000004', 'rsvp-founder-two@example.test', 'startup', 'approved', true, 'Sam Founder'),
  ('a2000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-000000000005', 'rsvp-outsider@example.test', 'mentor', 'approved', true, 'Other Mentor');

insert into public.semester_memberships (id, semester_id, profile_id, role, status, activated_at)
values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'admin', 'active', now()),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'mentor', 'active', now()),
  ('a3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', 'startup', 'active', now()),
  ('a3000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000004', 'startup', 'active', now()),
  ('a3000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000005', 'mentor', 'active', now());

insert into public.mentor_semesters (id, semester_id, semester_membership_id)
values
  ('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002'),
  ('a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000005');

insert into public.startup_organizations (id, name, slug)
values ('a5000000-0000-0000-0000-000000000001', 'RSVP Startup', 'rsvp-startup');

insert into public.startup_semesters (id, semester_id, startup_organization_id)
values ('a6000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001');

insert into public.startup_team_memberships (semester_id, startup_semester_id, semester_membership_id)
values
  ('a1000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000003'),
  ('a1000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000004');

insert into public.meetings (id, semester_id, meeting_date)
values
  ('a7000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '2099-09-04'),
  ('a7000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', '2000-09-01');

insert into public.sessions (id, semester_id, meeting_id, mentor_semester_id, startup_semester_id, slot, status)
values
  ('a8000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 1, 'confirmed'),
  ('a8000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 1, 'confirmed');

insert into public.session_rsvps (id, semester_id, session_id, semester_membership_id, response)
values
  ('a9000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', 'attending'),
  ('a9000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000003', 'not_attending');

select ok(not has_table_privilege('anon', 'public.session_rsvps', 'select,insert,update,delete'), 'anonymous users have no RSVP privileges');
select ok(has_table_privilege('authenticated', 'public.session_rsvps', 'select'), 'authenticated users may read policy-authorized RSVP rows');
select ok(not has_table_privilege('authenticated', 'public.session_rsvps', 'delete'), 'authenticated users cannot delete RSVP history');
select ok(not has_column_privilege('authenticated', 'public.session_rsvps', 'session_id', 'update'), 'participants cannot reassign an RSVP to another session');
select ok(not has_column_privilege('authenticated', 'public.session_rsvps', 'semester_membership_id', 'update'), 'participants cannot reassign RSVP ownership');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.session_rsvps), 2::bigint, 'an assigned startup member sees team and mentor responses');
select is((select count(*) from public.startup_team_memberships where startup_semester_id = 'a6000000-0000-0000-0000-000000000001'), 2::bigint, 'an assigned startup member sees teammate links');
select is((select count(*) from public.semester_memberships where id in ('a3000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000004')), 3::bigint, 'an assigned startup member sees session participant memberships');
select is((select count(*) from public.profiles where id in ('a2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000004')), 3::bigint, 'an assigned startup member sees session participant names');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.session_rsvps), 2::bigint, 'the assigned mentor sees startup responses');
select is((select count(*) from public.startup_team_memberships where startup_semester_id = 'a6000000-0000-0000-0000-000000000001'), 2::bigint, 'the assigned mentor sees startup attendee links');
select is((select count(*) from public.semester_memberships where id in ('a3000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000004')), 3::bigint, 'the assigned mentor sees session participant memberships');
select is((select count(*) from public.profiles where id in ('a2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000004')), 3::bigint, 'the assigned mentor sees startup attendee names');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is((select count(*) from public.session_rsvps), 0::bigint, 'an unrelated mentor sees no RSVP rows');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.session_rsvps), 2::bigint, 'a semester admin sees all RSVP rows in the semester');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.session_rsvps (semester_id, session_id, semester_membership_id, response)
    values ('a1000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000004', 'attending')$$,
  'an assigned startup member may create their own RSVP before the session'
);
select lives_ok(
  $$update public.session_rsvps set response = 'not_attending'
    where session_id = 'a8000000-0000-0000-0000-000000000001'
      and semester_membership_id = 'a3000000-0000-0000-0000-000000000004'$$,
  'a participant may change their own RSVP before the session'
);
select results_eq(
  $$update public.session_rsvps set response = 'attending'
    where session_id = 'a8000000-0000-0000-0000-000000000001'
      and semester_membership_id = 'a3000000-0000-0000-0000-000000000003'
    returning response$$,
  array[]::text[],
  'a participant cannot update a teammate response'
);
select throws_ok(
  $$insert into public.session_rsvps (semester_id, session_id, semester_membership_id, response)
    values ('a1000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000005', 'attending')$$,
  '42501', null,
  'a participant cannot create an RSVP for an unrelated membership'
);
select throws_ok(
  $$insert into public.session_rsvps (semester_id, session_id, semester_membership_id, response)
    values ('a1000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000004', 'attending')$$,
  '42501', null,
  'a participant cannot create an RSVP after a session starts'
);
select throws_ok(
  $$delete from public.session_rsvps where semester_membership_id = 'a3000000-0000-0000-0000-000000000004'$$,
  '42501', null,
  'participants cannot delete their RSVP'
);
reset role;

select is(
  (select response from public.session_rsvps where session_id = 'a8000000-0000-0000-0000-000000000001' and semester_membership_id = 'a3000000-0000-0000-0000-000000000004'),
  'not_attending',
  'the participant update is stored'
);

select * from finish();
rollback;
