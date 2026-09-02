begin;

select plan(72);

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
select ok(to_regprocedure('public.discard_replacement_auth_placeholder(uuid,uuid)') is not null, 'placeholder discard RPC exists');
select ok(not has_function_privilege('anon', 'public.preview_member_login_removal(uuid)', 'execute'), 'anon cannot preview removal');
select ok(not has_function_privilege('anon', 'public.prepare_member_login_removal(uuid,text)', 'execute'), 'anon cannot prepare removal');
select ok(not has_function_privilege('anon', 'public.attach_replacement_auth_identity(uuid,uuid)', 'execute'), 'anon cannot attach replacement identities');
select ok(not has_function_privilege('anon', 'public.discard_replacement_auth_placeholder(uuid,uuid)', 'execute'), 'anon cannot discard replacement placeholders');
select ok(has_function_privilege('authenticated', 'public.preview_member_login_removal(uuid)', 'execute'), 'authenticated may invoke the authorized preview RPC');
select ok(has_function_privilege('authenticated', 'public.prepare_member_login_removal(uuid,text)', 'execute'), 'authenticated may invoke the authorized preparation RPC');
select ok(has_function_privilege('authenticated', 'public.attach_replacement_auth_identity(uuid,uuid)', 'execute'), 'authenticated may invoke the authorized attachment RPC');
select ok(has_function_privilege('authenticated', 'public.discard_replacement_auth_placeholder(uuid,uuid)', 'execute'), 'authenticated may invoke the authorized placeholder discard RPC');
select ok(not has_function_privilege('service_role', 'public.prepare_member_login_removal(uuid,text)', 'execute'), 'service_role is not the application authorization path');
select ok(not has_function_privilege('service_role', 'public.discard_replacement_auth_placeholder(uuid,uuid)', 'execute'), 'service_role cannot bypass placeholder discard authorization');

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
select throws_ok(
  $$select * from public.discard_replacement_auth_placeholder('b2000000-0000-0000-0000-000000000003'::uuid, 'b2000000-0000-0000-0000-000000000005'::uuid)$$,
  '42501',
  'Platform super-administrator access required',
  'ordinary authenticated actors cannot discard replacement placeholders'
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
values
  ('bb000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'id-mismatch@example.com', '{}', '{"full_name":"ID Mismatch Placeholder"}'),
  ('bb000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'nontrigger@example.com', '{}', '{"full_name":"Linked Non-trigger Profile"}'),
  ('bb000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'altered-role@example.com', '{}', '{"full_name":"Altered Role Placeholder"}'),
  ('bb000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'altered-status@example.com', '{}', '{"full_name":"Altered Status Placeholder"}'),
  ('bb000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'retained@example.com', '{}', '{"full_name":"Divergent Email Placeholder"}');

insert into public.profiles (id, auth_user_id, email, full_name, role, status, is_active)
values
  ('bc000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'id-mismatch@example.com', 'ID Mismatch Placeholder', 'startup', 'pending', true),
  ('bb000000-0000-0000-0000-000000000002', 'bb000000-0000-0000-0000-000000000002', 'nontrigger@example.com', 'Linked Non-trigger Profile', 'startup', 'pending', false),
  ('bb000000-0000-0000-0000-000000000003', 'bb000000-0000-0000-0000-000000000003', 'altered-role@example.com', 'Altered Role Placeholder', 'mentor', 'pending', true),
  ('bb000000-0000-0000-0000-000000000004', 'bb000000-0000-0000-0000-000000000004', 'altered-status@example.com', 'Altered Status Placeholder', 'startup', 'approved', true),
  ('bb000000-0000-0000-0000-000000000005', 'bb000000-0000-0000-0000-000000000005', 'profile-diverged@example.com', 'Divergent Email Placeholder', 'startup', 'pending', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.attach_replacement_auth_identity('b2000000-0000-0000-0000-000000000003'::uuid, 'bb000000-0000-0000-0000-000000000001'::uuid)$$,
  '55000',
  'Replacement profile ID must match Auth user ID',
  'a linked profile with a non-trigger ID is rejected'
);
select throws_ok(
  $$select * from public.attach_replacement_auth_identity('b2000000-0000-0000-0000-000000000003'::uuid, 'bb000000-0000-0000-0000-000000000002'::uuid)$$,
  '55000',
  'Replacement profile is not an untouched Auth-trigger placeholder',
  'a linked non-trigger profile is rejected'
);
select throws_ok(
  $$select * from public.attach_replacement_auth_identity('b2000000-0000-0000-0000-000000000003'::uuid, 'bb000000-0000-0000-0000-000000000003'::uuid)$$,
  '55000',
  'Replacement profile is not an untouched Auth-trigger placeholder',
  'a placeholder with an altered role is rejected'
);
select throws_ok(
  $$select * from public.attach_replacement_auth_identity('b2000000-0000-0000-0000-000000000003'::uuid, 'bb000000-0000-0000-0000-000000000004'::uuid)$$,
  '55000',
  'Replacement profile is not an untouched Auth-trigger placeholder',
  'a placeholder with an altered status is rejected'
);
select throws_ok(
  $$select * from public.attach_replacement_auth_identity('b2000000-0000-0000-0000-000000000003'::uuid, 'bb000000-0000-0000-0000-000000000005'::uuid)$$,
  '22023',
  'Replacement profile email does not match its Auth identity',
  'Auth and placeholder profile email divergence is rejected'
);
reset role;

delete from public.profiles
where id in (
  'bc000000-0000-0000-0000-000000000001',
  'bb000000-0000-0000-0000-000000000002',
  'bb000000-0000-0000-0000-000000000003',
  'bb000000-0000-0000-0000-000000000004',
  'bb000000-0000-0000-0000-000000000005'
);
delete from auth.users where id::text like 'bb000000-0000-0000-0000-00000000000%';

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('ba000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'retained@example.com', '{}', '{"full_name":"Unsafe Placeholder"}');
insert into public.profiles (id, auth_user_id, email, full_name, role, status)
values ('ba000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001', 'retained@example.com', 'Unsafe Placeholder', 'startup', 'pending');
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
delete from public.profiles where id = 'ba000000-0000-0000-0000-000000000001';
delete from auth.users where id = 'ba000000-0000-0000-0000-000000000001';
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('ba000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'Retained@Example.COM', '{}', '{"full_name":"Safe Placeholder"}');
insert into public.profiles (id, auth_user_id, email, full_name, role, status)
values ('ba000000-0000-0000-0000-000000000002', 'ba000000-0000-0000-0000-000000000002', 'retained@example.com', 'Safe Placeholder', 'startup', 'pending');

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

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select profile_is_active, suspended_membership_ids from public.prepare_member_login_removal('b2000000-0000-0000-0000-000000000003'::uuid, 'Second removal cycle')$$,
  $$values (false, '{}'::uuid[])$$,
  'preparation after restoration creates a new removal cycle without changing memberships'
);
reset role;

select is(
  (select count(*) from public.program_audit_events where action = 'member.login_removal_prepared' and subject_id = 'b2000000-0000-0000-0000-000000000003'),
  4::bigint,
  'a second removal cycle creates exactly one new preparation audit per semester'
);
select ok(
  (select max(created_at) from public.program_audit_events where action = 'member.login_removal_prepared' and subject_id = 'b2000000-0000-0000-0000-000000000003')
    >
  (select max(created_at) from public.program_audit_events where action = 'member.login_restored' and subject_id = 'b2000000-0000-0000-0000-000000000003'),
  'the post-restoration preparation has a causally later audit timestamp'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select profile_is_active, suspended_membership_ids from public.prepare_member_login_removal('b2000000-0000-0000-0000-000000000003'::uuid, 'Second-cycle retry')$$,
  $$values (false, '{}'::uuid[])$$,
  'a retry in the second removal cycle makes no state change'
);
select is(
  (select already_prepared from public.preview_member_login_removal('b2000000-0000-0000-0000-000000000003'::uuid)),
  true,
  'preview resolves the causally latest second-cycle preparation'
);
reset role;

select is(
  (select count(*) from public.program_audit_events where action = 'member.login_removal_prepared' and subject_id = 'b2000000-0000-0000-0000-000000000003'),
  4::bigint,
  'a second-cycle retry creates no duplicate preparation audits'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.discard_replacement_auth_placeholder(
      'b2000000-0000-0000-0000-000000000001'::uuid,
      'b2000000-0000-0000-0000-000000000001'::uuid
    )$$,
  '42501',
  'You cannot discard a replacement placeholder for your own login identity',
  'placeholder discard rejects the actor target'
);
select throws_ok(
  $$select * from public.discard_replacement_auth_placeholder(
      'b2000000-0000-0000-0000-000000000004'::uuid,
      'b2000000-0000-0000-0000-000000000004'::uuid
    )$$,
  '42501',
  'Platform role holders cannot have replacement placeholders discarded',
  'placeholder discard rejects platform-role targets'
);
reset role;

insert into public.profiles (id, auth_user_id, email, full_name, role, status, is_active)
values
  ('bd000000-0000-0000-0000-000000000001', null, 'cleanup@example.com', 'Cleanup Retained', 'mentor', 'approved', false),
  ('bd000000-0000-0000-0000-000000000002', null, 'referenced-cleanup@example.com', 'Referenced Cleanup Retained', 'mentor', 'approved', false),
  ('bd000000-0000-0000-0000-000000000003', null, 'shape-cleanup@example.com', 'Shape Cleanup Retained', 'mentor', 'approved', false),
  ('bd000000-0000-0000-0000-000000000004', null, 'email-cleanup@example.com', 'Email Cleanup Retained', 'mentor', 'approved', false),
  ('bd000000-0000-0000-0000-000000000005', null, 'absent-cleanup@example.com', 'Absent Cleanup Retained', 'mentor', 'approved', false),
  ('bd000000-0000-0000-0000-000000000006', null, 'missing-auth-cleanup@example.com', 'Missing Auth Cleanup Retained', 'mentor', 'approved', false),
  ('bd000000-0000-0000-0000-000000000007', null, 'active-cleanup@example.com', 'Active Cleanup Retained', 'mentor', 'approved', true);

insert into public.semester_memberships (id, semester_id, profile_id, role, status, suspended_at)
values ('bd300000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'bd000000-0000-0000-0000-000000000001', 'mentor', 'suspended', now());
insert into public.mentor_profiles (profile_id, biography)
values ('bd000000-0000-0000-0000-000000000001', 'Cleanup retained biography');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('be000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'Cleanup@Example.COM', '{}', '{"full_name":"Safe Cleanup Placeholder"}');
insert into public.profiles (id, auth_user_id, email, full_name, role, status, is_active)
values ('be000000-0000-0000-0000-000000000001', 'be000000-0000-0000-0000-000000000001', 'cleanup@example.com', 'Safe Cleanup Placeholder', 'startup', 'pending', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select profile_id, auth_user_id, placeholder_discarded
    from public.discard_replacement_auth_placeholder(
      'bd000000-0000-0000-0000-000000000001'::uuid,
      'be000000-0000-0000-0000-000000000001'::uuid
    )$$,
  $$values ('bd000000-0000-0000-0000-000000000001'::uuid, 'be000000-0000-0000-0000-000000000001'::uuid, true)$$,
  'a verified empty Auth-trigger placeholder is discarded'
);
reset role;

select ok(not exists(select 1 from public.profiles where id = 'be000000-0000-0000-0000-000000000001'), 'discard removes only the verified placeholder');
select results_eq(
  $$select auth_user_id, is_active from public.profiles where id = 'bd000000-0000-0000-0000-000000000001'::uuid$$,
  $$values (null::uuid, false)$$,
  'discard preserves the unlinked and disabled retained profile'
);
select is(
  (select status::text from public.semester_memberships where id = 'bd300000-0000-0000-0000-000000000001'),
  'suspended',
  'discard preserves retained membership state'
);
select is(
  (select biography from public.mentor_profiles where profile_id = 'bd000000-0000-0000-0000-000000000001'),
  'Cleanup retained biography',
  'discard preserves retained profile extensions'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select profile_id, auth_user_id, placeholder_discarded
    from public.discard_replacement_auth_placeholder(
      'bd000000-0000-0000-0000-000000000001'::uuid,
      'be000000-0000-0000-0000-000000000001'::uuid
    )$$,
  $$values ('bd000000-0000-0000-0000-000000000001'::uuid, 'be000000-0000-0000-0000-000000000001'::uuid, false)$$,
  'discard is idempotent when only the already-absent verified placeholder remains to clean up'
);
reset role;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('be000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'referenced-cleanup@example.com', '{}', '{"full_name":"Referenced Cleanup Placeholder"}');
insert into public.profiles (id, auth_user_id, email, full_name, role, status, is_active)
values ('be000000-0000-0000-0000-000000000002', 'be000000-0000-0000-0000-000000000002', 'referenced-cleanup@example.com', 'Referenced Cleanup Placeholder', 'startup', 'pending', true);
insert into public.semester_memberships (semester_id, profile_id, role, status)
values ('b1000000-0000-0000-0000-000000000002', 'be000000-0000-0000-0000-000000000002', 'startup', 'invited');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.discard_replacement_auth_placeholder(
      'bd000000-0000-0000-0000-000000000002'::uuid,
      'be000000-0000-0000-0000-000000000002'::uuid
    )$$,
  '55000',
  'Replacement profile contains durable references',
  'discard rejects a referenced placeholder'
);
reset role;
select ok(exists(select 1 from public.profiles where id = 'be000000-0000-0000-0000-000000000002'), 'discard preserves a referenced placeholder');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('be000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'shape-cleanup@example.com', '{}', '{"full_name":"Altered Cleanup Placeholder"}');
insert into public.profiles (id, auth_user_id, email, full_name, role, status, is_active)
values ('be000000-0000-0000-0000-000000000003', 'be000000-0000-0000-0000-000000000003', 'shape-cleanup@example.com', 'Altered Cleanup Placeholder', 'startup', 'approved', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.discard_replacement_auth_placeholder(
      'bd000000-0000-0000-0000-000000000003'::uuid,
      'be000000-0000-0000-0000-000000000003'::uuid
    )$$,
  '55000',
  'Replacement profile is not an untouched Auth-trigger placeholder',
  'discard rejects an altered placeholder shape'
);
reset role;
select ok(exists(select 1 from public.profiles where id = 'be000000-0000-0000-0000-000000000003'), 'discard preserves an altered placeholder');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('be000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'email-cleanup@example.com', '{}', '{"full_name":"Divergent Cleanup Placeholder"}');
insert into public.profiles (id, auth_user_id, email, full_name, role, status, is_active)
values ('be000000-0000-0000-0000-000000000004', 'be000000-0000-0000-0000-000000000004', 'profile-diverged-cleanup@example.com', 'Divergent Cleanup Placeholder', 'startup', 'pending', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.discard_replacement_auth_placeholder(
      'bd000000-0000-0000-0000-000000000004'::uuid,
      'be000000-0000-0000-0000-000000000004'::uuid
    )$$,
  '22023',
  'Replacement profile email does not match its Auth identity',
  'discard rejects Auth and placeholder email divergence'
);
reset role;
select ok(exists(select 1 from public.profiles where id = 'be000000-0000-0000-0000-000000000004'), 'discard preserves an email-divergent placeholder');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('be000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'different-absent-cleanup@example.com', '{}', '{"full_name":"Absent Mismatch Auth"}'),
  ('be000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'active-cleanup@example.com', '{}', '{"full_name":"Active Cleanup Auth"}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.discard_replacement_auth_placeholder(
      'bd000000-0000-0000-0000-000000000005'::uuid,
      'be000000-0000-0000-0000-000000000005'::uuid
    )$$,
  '22023',
  'Replacement email does not match the retained profile',
  'an absent placeholder is not idempotent when Auth and retained emails diverge'
);
select throws_ok(
  $$select * from public.discard_replacement_auth_placeholder(
      'bd000000-0000-0000-0000-000000000006'::uuid,
      'be000000-0000-0000-0000-000000000006'::uuid
    )$$,
  'P0002',
  'Replacement Auth user not found',
  'an absent placeholder is not idempotent when the authoritative Auth user is absent'
);
select throws_ok(
  $$select * from public.discard_replacement_auth_placeholder(
      'bd000000-0000-0000-0000-000000000007'::uuid,
      'be000000-0000-0000-0000-000000000007'::uuid
    )$$,
  '55000',
  'Retained profile must be unlinked and disabled',
  'an absent placeholder is not idempotent when the retained target is active'
);
reset role;

select * from finish();

rollback;
