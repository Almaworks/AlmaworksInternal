begin;

select plan(8);

select has_function(
  'public',
  'create_mentor_records',
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'text[]', 'boolean', 'text', 'text', 'text', 'text', 'text'],
  'canonical mentor admin RPC exists'
);

select ok(
  coalesce(has_function_privilege(
    'service_role',
    to_regprocedure('public.create_mentor_records(uuid,uuid,uuid,text,text,text,text[],boolean,text,text,text,text,text)'),
    'EXECUTE'
  ), false),
  'service role may execute mentor creation'
);

select ok(
  not coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.create_mentor_records(uuid,uuid,uuid,text,text,text,text[],boolean,text,text,text,text,text)'),
    'EXECUTE'
  ), false),
  'authenticated users cannot execute the privileged mentor RPC directly'
);

insert into public.semesters (id, name, start_date, end_date, lifecycle_status)
values
  ('e1000000-0000-0000-0000-000000000001', 'Mentor RPC semester', '2026-09-01', '2026-12-31', 'draft'),
  ('e1000000-0000-0000-0000-000000000002', 'Unauthorized semester', '2027-01-01', '2027-05-31', 'draft');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('e2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rpc-admin@example.test', '{}', '{"full_name":"RPC Admin"}'),
  ('e2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'unrelated-admin@example.test', '{}', '{"full_name":"Unrelated Admin"}'),
  ('e2000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'rpc-mentor@example.test', '{}', '{"full_name":"RPC Mentor"}');

update public.profiles
set status = 'approved', is_active = true
where id in (
  'e2000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000002'
);

insert into public.semester_memberships (semester_id, profile_id, role, status, activated_at)
values
  ('e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'admin', 'active', now()),
  ('e1000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', 'admin', 'active', now());

set local role service_role;

select lives_ok(
  $$select public.create_mentor_records(
    'e2000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000011',
    'e1000000-0000-0000-0000-000000000001',
    'rpc-mentor@example.test',
    'Helps early-stage founders.',
    'Northstar Labs',
    array['Product strategy'],
    false,
    'https://www.linkedin.com/in/rpc-mentor',
    'Founder',
    'Friday afternoons',
    'Can deliver an opening talk',
    'online'
  )$$,
  'service RPC accepts an active semester admin actor without a JWT subject'
);

reset role;

select is(
  (select status::text from public.semester_memberships where semester_id = 'e1000000-0000-0000-0000-000000000001' and profile_id = 'e2000000-0000-0000-0000-000000000011'),
  'onboarding',
  'new mentor membership starts onboarding'
);

select is(
  (select company from public.mentor_profiles where profile_id = 'e2000000-0000-0000-0000-000000000011'),
  'Northstar Labs',
  'durable mentor profile data is stored canonically'
);

select is(
  (select readiness_status from public.mentor_semesters where semester_id = 'e1000000-0000-0000-0000-000000000001'),
  'not_started',
  'semester mentor onboarding starts incomplete'
);

set local role service_role;

select throws_ok(
  $$select public.create_mentor_records(
    'e2000000-0000-0000-0000-000000000002',
    'e2000000-0000-0000-0000-000000000011',
    'e1000000-0000-0000-0000-000000000001',
    'rpc-mentor@example.test', null, null, '{}', false,
    null, null, null, null, null
  )$$,
  '42501',
  null,
  'an admin from another semester is rejected'
);

reset role;

select * from finish();

rollback;
