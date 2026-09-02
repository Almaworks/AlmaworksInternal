begin;

select plan(39);

insert into public.semesters (id, name, start_date, end_date, lifecycle_status)
values
  ('b1000000-0000-0000-0000-000000000001', 'Retained history alumni semester', '2025-01-01', '2025-05-31', 'closed'),
  ('b1000000-0000-0000-0000-000000000002', 'Retained history active semester', '2026-09-01', '2026-12-31', 'active');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('b2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'account-super-admin@example.test', '{}', '{"full_name":"Account Super Admin"}'),
  ('b2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'account-ordinary@example.test', '{}', '{"full_name":"Account Ordinary Admin"}'),
  ('b2000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'retained@example.com', '{}', '{"full_name":"Retained Mentor"}'),
  ('b2000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'protected-platform@example.test', '{}', '{"full_name":"Protected Platform Admin"}'),
  ('b2000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'session-startup@example.test', '{}', '{"full_name":"Session Startup"}');

insert into public.profiles (id, auth_user_id, email, full_name, role, status)
values
  ('b2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'account-super-admin@example.test', 'Account Super Admin', 'admin', 'approved'),
  ('b2000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'account-ordinary@example.test', 'Account Ordinary Admin', 'admin', 'approved'),
  ('b2000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000003', 'retained@example.com', 'Retained Mentor', 'mentor', 'approved'),
  ('b2000000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-000000000004', 'protected-platform@example.test', 'Protected Platform Admin', 'admin', 'approved'),
  ('b2000000-0000-0000-0000-000000000005', 'b2000000-0000-0000-0000-000000000005', 'session-startup@example.test', 'Session Startup', 'startup', 'approved');

insert into public.platform_roles (profile_id, role, granted_by)
values
  ('b2000000-0000-0000-0000-000000000001', 'super_admin', 'b2000000-0000-0000-0000-000000000001'),
  ('b2000000-0000-0000-0000-000000000004', 'super_admin', 'b2000000-0000-0000-0000-000000000001');

insert into public.semester_memberships (id, semester_id, profile_id, role, status, activated_at, alumni_at)
values
  ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000003', 'mentor', 'alumni', now(), now()),
  ('b3000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000003', 'mentor', 'active', now(), null),
  ('b3000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000005', 'startup', 'active', now(), null);

insert into public.mentor_profiles (profile_id, biography, company, title, expertise_tags)
values ('b2000000-0000-0000-0000-000000000003', 'Retained biography', 'Retained Company', 'Retained Title', array['retained expertise']);

insert into public.mentor_semesters (id, semester_id, semester_membership_id)
values
  ('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001'),
  ('b4000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'b3000000-0000-0000-0000-000000000002');

insert into public.startup_organizations (id, name, slug, durable_contact_data)
values ('b5000000-0000-0000-0000-000000000001', 'Retained Session Startup', 'retained-session-startup', '{"phone":"212-555-0100"}');

insert into public.startup_semesters (id, semester_id, startup_organization_id, company_snapshot)
values ('b6000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-000000000001', 'Retained Session Startup');

insert into public.startup_team_memberships (id, semester_id, startup_semester_id, semester_membership_id, is_primary_contact)
values ('b7000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'b6000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000003', true);

insert into public.meetings (id, semester_id, meeting_date, label)
values ('b8000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', '2026-09-04', 'Retained history meeting');

insert into public.sessions (id, semester_id, meeting_id, mentor_semester_id, startup_semester_id, slot, status, topic)
values ('b9000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'b8000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000002', 'b6000000-0000-0000-0000-000000000001', 1, 'confirmed', 'Retained session history');

select ok(to_regprocedure('public.preview_member_login_removal(uuid)') is not null, 'preview RPC exists');
select ok(to_regprocedure('public.prepare_member_login_removal(uuid,text)') is not null, 'preparation RPC exists');
select ok(to_regprocedure('public.attach_replacement_auth_identity(uuid,uuid)') is not null, 'attachment RPC exists');
select ok(not has_function_privilege('anon', 'public.preview_member_login_removal(uuid)', 'execute'), 'anon cannot preview removal');
select ok(not has_function_privilege('anon', 'public.prepare_member_login_removal(uuid,text)', 'execute'), 'anon cannot prepare removal');
select ok(not has_function_privilege('anon', 'public.attach_replacement_auth_identity(uuid,uuid)', 'execute'), 'anon cannot attach replacement identities');
select ok(has_function_privilege('authenticated', 'public.preview_member_login_removal(uuid)', 'execute'), 'authenticated may invoke the authorized preview RPC');
select ok(has_function_privilege('authenticated', 'public.prepare_member_login_removal(uuid,text)', 'execute'), 'authenticated may invoke the authorized preparation RPC');
select ok(has_function_privilege('authenticated', 'public.attach_replacement_auth_identity(uuid,uuid)', 'execute'), 'authenticated may invoke the authorized attachment RPC');
select ok(not has_function_privilege('service_role', 'public.prepare_member_login_removal(uuid,text)', 'execute'), 'service_role is not the application authorization path');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.preview_member_login_removal('b2000000-0000-0000-0000-000000000003'::uuid)$$,
  '42501',
  'Platform super-administrator access required',
  'ordinary authenticated actors cannot preview removal'
);
select throws_ok(
  $$select * from public.prepare_member_login_removal('b2000000-0000-0000-0000-000000000003'::uuid, 'reason')$$,
  '42501',
  'Platform super-administrator access required',
  'ordinary authenticated actors cannot prepare removal'
);
select throws_ok(
  $$select * from public.attach_replacement_auth_identity('b2000000-0000-0000-0000-000000000003'::uuid, 'b2000000-0000-0000-0000-000000000005'::uuid)$$,
  '42501',
  'Platform super-administrator access required',
  'ordinary authenticated actors cannot attach replacement identities'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select profile_id, full_name, email, profile_is_active, semester_count, session_count, suspend_membership_ids, already_prepared
    from public.preview_member_login_removal('b2000000-0000-0000-0000-000000000003'::uuid)$$,
  $$values (
    'b2000000-0000-0000-0000-000000000003'::uuid,
    'Retained Mentor'::text,
    'retained@example.com'::text,
    true,
    2::bigint,
    1::bigint,
    array['b3000000-0000-0000-0000-000000000002'::uuid],
    false
  )$$,
  'preview reports retained history and only suspendable memberships'
);
select throws_ok(
  $$select * from public.prepare_member_login_removal('b2000000-0000-0000-0000-000000000001'::uuid, 'Self removal')$$,
  '42501',
  'You cannot remove your own login account',
  'self-removal is rejected'
);
select throws_ok(
  $$select * from public.prepare_member_login_removal('b2000000-0000-0000-0000-000000000004'::uuid, 'Platform removal')$$,
  '42501',
  'Platform role holders cannot have their login account removed',
  'platform-role targets are rejected'
);
select throws_ok(
  $$select * from public.prepare_member_login_removal('b2000000-0000-0000-0000-000000000003'::uuid, '   ')$$,
  '22023',
  'Removal reason is required',
  'blank removal reasons are rejected'
);
select results_eq(
  $$select profile_is_active from public.prepare_member_login_removal('b2000000-0000-0000-0000-000000000003'::uuid, 'Duplicate test account')$$,
  array[false],
  'a platform super-administrator disables the retained profile'
);
reset role;

select is((select status::text from public.semester_memberships where id = 'b3000000-0000-0000-0000-000000000002'), 'suspended', 'active membership is suspended');
select is((select status::text from public.semester_memberships where id = 'b3000000-0000-0000-0000-000000000001'), 'alumni', 'alumni membership remains alumni');
select is((select email from public.profiles where id = 'b2000000-0000-0000-0000-000000000003'), 'retained@example.com', 'profile contact email is retained');
select is((select biography from public.mentor_profiles where profile_id = 'b2000000-0000-0000-0000-000000000003'), 'Retained biography', 'mentor profile extension is retained');
select is((select topic from public.sessions where id = 'b9000000-0000-0000-0000-000000000001'), 'Retained session history', 'session history is retained');
select is(
  (select count(*) from public.program_audit_events where action = 'member.login_removal_prepared' and subject_id = 'b2000000-0000-0000-0000-000000000003'),
  2::bigint,
  'preparation creates one audit event for each retained semester'
);
select is(
  (select count(distinct semester_id) from public.program_audit_events where action = 'member.login_removal_prepared' and subject_id = 'b2000000-0000-0000-0000-000000000003'),
  2::bigint,
  'preparation audit events do not duplicate a semester'
);
select ok(
  (select bool_and(details ->> 'reason' = 'Duplicate test account' and details ->> 'target_profile_id' = 'b2000000-0000-0000-0000-000000000003')
   from public.program_audit_events
   where action = 'member.login_removal_prepared' and subject_id = 'b2000000-0000-0000-0000-000000000003'),
  'preparation audits identify the target and reason'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select profile_is_active, suspended_membership_ids from public.prepare_member_login_removal('b2000000-0000-0000-0000-000000000003'::uuid, 'Retry removal')$$,
  $$values (false, '{}'::uuid[])$$,
  'an idempotent retry makes no second membership transition'
);
reset role;

select is(
  (select count(*) from public.program_audit_events where action = 'member.login_removal_prepared' and subject_id = 'b2000000-0000-0000-0000-000000000003'),
  2::bigint,
  'an idempotent retry creates no duplicate audit events'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (select already_prepared from public.preview_member_login_removal('b2000000-0000-0000-0000-000000000003'::uuid)),
  true,
  'preview marks a prepared account after the durable command commits'
);
reset role;

delete from auth.users where id = 'b2000000-0000-0000-0000-000000000003';
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('ba000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'retained@example.com', '{}', '{"full_name":"Unsafe Placeholder"}');
insert into public.profiles (id, auth_user_id, email, full_name, role, status)
values ('ba000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001', 'retained@example.com', 'Unsafe Placeholder', 'mentor', 'pending');
insert into public.semester_memberships (semester_id, profile_id, role, status)
values ('b1000000-0000-0000-0000-000000000002', 'ba000000-0000-0000-0000-000000000001', 'mentor', 'invited');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.attach_replacement_auth_identity('b2000000-0000-0000-0000-000000000003'::uuid, 'ba000000-0000-0000-0000-000000000001'::uuid)$$,
  '55000',
  'Replacement profile contains durable references',
  'a placeholder with a membership cannot be deleted'
);
select ok(exists(select 1 from public.profiles where id = 'ba000000-0000-0000-0000-000000000001'), 'an unsafe placeholder is preserved');
reset role;

delete from public.semester_memberships where profile_id = 'ba000000-0000-0000-0000-000000000001';
insert into public.mentor_profiles (profile_id, biography)
values ('ba000000-0000-0000-0000-000000000001', 'Unsafe extension');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.attach_replacement_auth_identity('b2000000-0000-0000-0000-000000000003'::uuid, 'ba000000-0000-0000-0000-000000000001'::uuid)$$,
  '55000',
  'Replacement profile contains durable references',
  'a placeholder with a profile extension cannot be deleted'
);
reset role;

delete from public.mentor_profiles where profile_id = 'ba000000-0000-0000-0000-000000000001';
delete from auth.users where id = 'ba000000-0000-0000-0000-000000000001';
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('ba000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'Retained@Example.COM', '{}', '{"full_name":"Safe Placeholder"}');
insert into public.profiles (id, auth_user_id, email, full_name, role, status)
values ('ba000000-0000-0000-0000-000000000002', 'ba000000-0000-0000-0000-000000000002', 'Retained@Example.COM', 'Safe Placeholder', 'startup', 'pending');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select profile_id, auth_user_id, profile_is_active from public.attach_replacement_auth_identity(
      'b2000000-0000-0000-0000-000000000003'::uuid,
      'ba000000-0000-0000-0000-000000000002'::uuid
    )$$,
  $$values ('b2000000-0000-0000-0000-000000000003'::uuid, 'ba000000-0000-0000-0000-000000000002'::uuid, true)$$,
  'a normalized-email replacement identity attaches to the retained profile'
);
reset role;

select ok(not exists(select 1 from public.profiles where id = 'ba000000-0000-0000-0000-000000000002'), 'the verified empty placeholder is removed');
select is((select auth_user_id from public.profiles where id = 'b2000000-0000-0000-0000-000000000003'), 'ba000000-0000-0000-0000-000000000002'::uuid, 'the retained profile owns the replacement Auth identity');
select is((select status::text from public.semester_memberships where id = 'b3000000-0000-0000-0000-000000000002'), 'suspended', 'restoration does not reactivate suspended membership');
select is((select status::text from public.semester_memberships where id = 'b3000000-0000-0000-0000-000000000001'), 'alumni', 'restoration leaves alumni membership unchanged');
select is(
  (select count(*) from public.program_audit_events where action = 'member.login_restored' and subject_id = 'b2000000-0000-0000-0000-000000000003'),
  2::bigint,
  'restoration creates one audit event for each retained semester'
);
select is(
  (select count(distinct semester_id) from public.program_audit_events where action = 'member.login_restored' and subject_id = 'b2000000-0000-0000-0000-000000000003'),
  2::bigint,
  'restoration audit events do not duplicate a semester'
);

select * from finish();

rollback;
