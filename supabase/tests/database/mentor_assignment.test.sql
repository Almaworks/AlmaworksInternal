begin;

select plan(69);

select has_table('public', 'mentor_assignment_requests', 'assignment requests table exists');
select has_table('public', 'mentor_assignment_audit', 'assignment audit table exists');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.mentor_assignment_requests'::regclass),
  'assignment requests have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.mentor_assignment_audit'::regclass),
  'assignment audit has RLS enabled'
);
select has_function(
  'public',
  'commit_mentor_assignment',
  array['uuid', 'uuid', 'text', 'uuid', 'uuid', 'text', 'text', 'text', 'text[]', 'text', 'jsonb'],
  'atomic mentor assignment RPC exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.commit_mentor_assignment(uuid,uuid,text,uuid,uuid,text,text,text,text[],text,jsonb)',
    'EXECUTE'
  ),
  'anonymous users cannot execute mentor assignments'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.commit_mentor_assignment(uuid,uuid,text,uuid,uuid,text,text,text,text[],text,jsonb)',
    'EXECUTE'
  ),
  'authenticated users may execute the assignment RPC'
);

with assignment_tables(table_name) as (
  values
    ('public.mentor_assignment_requests'::text),
    ('public.mentor_assignment_audit'::text)
), assignment_roles(role_name) as (
  values ('anon'::name), ('authenticated'::name)
), assignment_privileges(privilege_name) as (
  values
    ('select'::text), ('insert'::text), ('update'::text), ('delete'::text),
    ('truncate'::text), ('trigger'::text), ('references'::text), ('maintain'::text)
)
select ok(
  has_table_privilege(role_name, table_name, privilege_name)
    = (role_name = 'authenticated'::name and privilege_name = 'select'),
  format('%s has only the expected %s privilege on %s', role_name, privilege_name, table_name)
)
from assignment_tables
cross join assignment_roles
cross join assignment_privileges;

insert into public.semesters (id, name, start_date, end_date, lifecycle_status)
values
  ('a1000000-0000-0000-0000-000000000001', 'Assignment semester A', '2026-09-01', '2026-12-31', 'active'),
  ('a1000000-0000-0000-0000-000000000002', 'Assignment semester B', '2027-01-01', '2027-05-31', 'active');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('a2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'assignment-admin@example.test', '{}', '{"full_name":"Assignment Admin"}'),
  ('a2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'assignment-outsider@example.test', '{}', '{"full_name":"Assignment Outsider"}'),
  ('a2000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'mentor-one@example.test', '{}', '{"full_name":"Mentor One"}'),
  ('a2000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'mentor-two@example.test', '{}', '{"full_name":"Mentor Two"}'),
  ('a2000000-0000-0000-0000-000000000013', 'authenticated', 'authenticated', 'mentor-three@example.test', '{}', '{"full_name":"Mentor Three"}'),
  ('a2000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated', 'startup-one@example.test', '{}', '{"full_name":"Startup One Founder"}'),
  ('a2000000-0000-0000-0000-000000000022', 'authenticated', 'authenticated', 'startup-two@example.test', '{}', '{"full_name":"Startup Two Founder"}');

update public.profiles
set role = case
      when id in ('a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002') then 'admin'::public.user_role
      when id in ('a2000000-0000-0000-0000-000000000011', 'a2000000-0000-0000-0000-000000000012', 'a2000000-0000-0000-0000-000000000013') then 'mentor'::public.user_role
      else 'startup'::public.user_role
    end,
    status = 'approved'
where id::text like 'a2000000-%';

insert into public.semester_memberships (id, semester_id, profile_id, role, status)
values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('a3000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000011', 'mentor', 'active'),
  ('a3000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000012', 'mentor', 'active'),
  ('a3000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000013', 'mentor', 'active'),
  ('a3000000-0000-0000-0000-000000000021', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000021', 'startup', 'active'),
  ('a3000000-0000-0000-0000-000000000022', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000022', 'startup', 'active');

insert into public.mentor_profiles (profile_id, expertise_tags)
values
  ('a2000000-0000-0000-0000-000000000011', array['Product strategy']),
  ('a2000000-0000-0000-0000-000000000012', array['Product strategy']),
  ('a2000000-0000-0000-0000-000000000013', array['Enterprise sales']);

insert into public.mentor_semesters (id, semester_id, semester_membership_id, capacity, readiness_status)
values
  ('a4000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000011', 4, 'ready'),
  ('a4000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000012', 1, 'ready'),
  ('a4000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000013', 4, 'ready');

insert into public.startup_organizations (id, name, slug)
values
  ('a5000000-0000-0000-0000-000000000001', 'Startup One', 'assignment-startup-one'),
  ('a5000000-0000-0000-0000-000000000002', 'Startup Two', 'assignment-startup-two');

insert into public.startup_semesters (id, semester_id, startup_organization_id, mentorship_needs, preferred_expertise_tags, readiness_status)
values
  ('a6000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', array['Product strategy'], array['Product strategy'], 'ready'),
  ('a6000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002', array['Product strategy'], array['Product strategy'], 'ready');

insert into public.startup_team_memberships (semester_id, startup_semester_id, semester_membership_id, is_primary_contact)
values
  ('a1000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000021', true),
  ('a1000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000022', true);

insert into public.mentors (id, user_id, semester_id, full_name, expertise_tags)
values
  ('a7000000-0000-0000-0000-000000000011', 'a2000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', 'Mentor One', array['Product strategy']),
  ('a7000000-0000-0000-0000-000000000012', 'a2000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000001', 'Mentor Two', array['Product strategy']),
  ('a7000000-0000-0000-0000-000000000013', 'a2000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000001', 'Mentor Three', array['Enterprise sales']);

insert into public.startups (id, user_id, semester_id, name, preferred_tags)
values
  ('a8000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000021', 'a1000000-0000-0000-0000-000000000001', 'Startup One', array['Product strategy']),
  ('a8000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000022', 'a1000000-0000-0000-0000-000000000001', 'Startup Two', array['Product strategy']);

insert into public.session_dates (id, semester_id, date, label)
values
  ('a9000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '2026-09-04', 'Week 1'),
  ('a9000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', '2026-09-11', 'Week 2'),
  ('a9000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', '2027-01-08', 'Other semester');

insert into public.availability (user_id, session_date_id, is_available)
values
  ('a2000000-0000-0000-0000-000000000011', 'a9000000-0000-0000-0000-000000000001', true),
  ('a2000000-0000-0000-0000-000000000012', 'a9000000-0000-0000-0000-000000000001', false),
  ('a2000000-0000-0000-0000-000000000013', 'a9000000-0000-0000-0000-000000000002', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001',
    '3:30-4:15', 'a6000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000011',
    'assignment-success', 'online', 'Product strategy', '{}', null, '{"score":120,"rank":1}'
  )$$,
  'an active semester admin can commit an eligible assignment'
);
select is((select count(*) from public.sessions where topic = 'Product strategy'), 1::bigint, 'assignment creates one session');
select is((select count(*) from public.mentor_assignment_requests), 1::bigint, 'assignment creates one request record');
select is((select count(*) from public.mentor_assignment_audit), 1::bigint, 'assignment creates one audit record');
select is(
  (select ranking_context ->> 'score' from public.mentor_assignment_audit where idempotency_key = 'assignment-success'),
  '120',
  'audit preserves deterministic ranking context'
);
select is(
  (select actor_profile_id from public.mentor_assignment_audit where idempotency_key = 'assignment-success'),
  'a2000000-0000-0000-0000-000000000001'::uuid,
  'audit records the authenticated actor'
);

set local role postgres;
select throws_ok(
  $$delete from public.mentor_assignment_requests where idempotency_key = 'assignment-success'$$,
  '23503',
  'update or delete on table "mentor_assignment_requests" violates foreign key constraint "mentor_assignment_audit_request_id_fkey" on table "mentor_assignment_audit"',
  'an assignment audit prevents its request from being deleted'
);
set local role authenticated;

select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000002',
    '3:30-4:15', 'a6000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000012',
    'unauthorized', 'online', null, '{}', null, '{}'
  )$$,
  '42501', 'Semester administrator access required',
  'an admin from another semester cannot assign'
);
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$select public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000003',
    '3:30-4:15', 'a6000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000012',
    'cross-semester', 'online', null, '{}', null, '{}'
  )$$,
  '22023', 'Session date must belong to the target semester',
  'cross-semester dates cannot be overridden'
);

select throws_ok(
  $$select public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001',
    '3:30-4:15', 'a6000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000011',
    'mentor-conflict', 'online', null, '{}', null, '{}'
  )$$,
  '23505', 'Mentor is already assigned in this slot',
  'a mentor cannot be assigned to two startups in one slot'
);
select throws_ok(
  $$select public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001',
    '3:30-4:15', 'a6000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000012',
    'startup-conflict', 'online', null, array['availability'], 'needed for conflict test', '{}'
  )$$,
  '23505', 'Startup already has an assignment in this slot',
  'a startup cannot receive two mentors in one slot'
);
select throws_ok(
  $$select public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001',
    '4:15-5:00', 'a6000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000011',
    'second-slot', 'online', null, '{}', null, '{}'
  )$$,
  '23505', 'Second slot must use a different mentor unless overridden',
  'the first-slot mentor is excluded from the startup second slot'
);

select throws_ok(
  $$select public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000002',
    '3:30-4:15', 'a6000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000013',
    'missing-reason', 'online', null, array['expertise'], '   ', '{}'
  )$$,
  '22023', 'Override reason is required when overrides are used',
  'an override requires a nonblank reason'
);
select throws_ok(
  $$select public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001',
    '4:15-5:00', 'a6000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000012',
    'unavailable', 'online', null, '{}', null, '{}'
  )$$,
  '23514', 'Mentor is unavailable for this date; availability override required',
  'unavailable mentors require an availability override'
);
select is((select count(*) from public.sessions), 1::bigint, 'a failed assignment rolls back the session write');
select is((select count(*) from public.mentor_assignment_requests), 1::bigint, 'a failed assignment rolls back the request write');
select is((select count(*) from public.mentor_assignment_audit), 1::bigint, 'a failed assignment rolls back the audit write');

select lives_ok(
  $$select public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001',
    '4:15-5:00', 'a6000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000012',
    'availability-override', 'online', null, array['availability'], 'Mentor confirmed by phone', '{"rank":2}'
  )$$,
  'an availability override with a reason commits'
);
select is(
  (select override_reason from public.mentor_assignment_audit where idempotency_key = 'availability-override'),
  'Mentor confirmed by phone',
  'the override reason is audited'
);

set local role postgres;
create function public.test_fail_mentor_assignment_audit_insert()
returns trigger
language plpgsql
as $$
begin
  raise exception 'forced assignment audit failure' using errcode = 'P0001';
end;
$$;
create trigger test_fail_mentor_assignment_audit_insert
before insert on public.mentor_assignment_audit
for each row execute function public.test_fail_mentor_assignment_audit_insert();
set local role authenticated;
select throws_ok(
  $$select public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000002',
    '3:30-4:15', 'a6000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000013',
    'late-audit-failure', 'online', null, array['expertise'], 'Deliberate rollback proof', '{}'
  )$$,
  'P0001', 'forced assignment audit failure',
  'an audit failure after request and session inserts aborts the assignment'
);
set local role postgres;
drop trigger test_fail_mentor_assignment_audit_insert on public.mentor_assignment_audit;
drop function public.test_fail_mentor_assignment_audit_insert();
set local role authenticated;
select is((select count(*) from public.sessions), 2::bigint, 'a late audit failure rolls back the session write');
select is((select count(*) from public.mentor_assignment_requests), 2::bigint, 'a late audit failure rolls back the request write');
select is((select count(*) from public.mentor_assignment_audit), 2::bigint, 'a late audit failure rolls back the audit write');

select throws_ok(
  $$select public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000002',
    '3:30-4:15', 'a6000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000012',
    'capacity', 'online', null, '{}', null, '{}'
  )$$,
  '23514', 'Mentor capacity has been reached; capacity override required',
  'capacity cannot be exceeded without an override'
);
select throws_ok(
  $$select public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000002',
    '3:30-4:15', 'a6000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000013',
    'expertise', 'online', null, '{}', null, '{}'
  )$$,
  '23514', 'Mentor expertise does not match startup needs; expertise override required',
  'expertise mismatch cannot commit without an override'
);

set local role postgres;
update public.startup_team_memberships
set is_primary_contact = false
where startup_semester_id = 'a6000000-0000-0000-0000-000000000001'
  and semester_membership_id = 'a3000000-0000-0000-0000-000000000021';
insert into public.startup_team_memberships (
  semester_id, startup_semester_id, semester_membership_id, is_primary_contact
) values (
  'a1000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  true
);
insert into public.startups (id, user_id, semester_id, name, preferred_tags)
values (
  'a0000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'Decoy admin schedule startup', array['Product strategy']
);
set local role authenticated;
select lives_ok(
  $$select public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000002',
    '3:30-4:15', 'a6000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000012',
    'mixed-role-team', 'online', 'Role-safe startup lookup', array['capacity'], 'Capacity exception for role lookup test', '{}'
  )$$,
  'a non-startup team membership cannot select the scheduled startup'
);
select is(
  (select startup_id from public.sessions where topic = 'Role-safe startup lookup'),
  'a8000000-0000-0000-0000-000000000001'::uuid,
  'startup selection uses an active startup-role membership'
);

select is(
  (public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001',
    '3:30-4:15', 'a6000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000011',
    'assignment-success', 'online', 'Product strategy', '{}', null, '{"score":120,"rank":1}'
  ) ->> 'replayed'),
  'true',
  'replaying the same idempotency key returns the committed result'
);
select is((select count(*) from public.sessions), 3::bigint, 'idempotent replay does not duplicate the session');
select throws_ok(
  $$select public.commit_mentor_assignment(
    'a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001',
    '4:15-5:00', 'a6000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000011',
    'assignment-success', 'online', null, array['second_slot'], 'Different payload', '{}'
  )$$,
  '23505', 'Idempotency key is already bound to a different assignment',
  'an idempotency key cannot be reused for a different assignment'
);

select * from finish();
rollback;
