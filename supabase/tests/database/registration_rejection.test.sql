begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'active-super@example.test', '{}', '{}'),
  ('e1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'inactive-super@example.test', '{}', '{}'),
  ('e1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'rejected-super@example.test', '{}', '{}'),
  ('e1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'ordinary@example.test', '{}', '{}'),
  ('e1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'pending-target@example.test', '{}', '{}'),
  ('e1000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'approved-target@example.test', '{}', '{}'),
  ('e1000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'self-pending@example.test', '{}', '{}');

insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name)
values
  ('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'active-super@example.test', 'admin', 'approved', true, 'Active Super Admin'),
  ('e1000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'inactive-super@example.test', 'admin', 'approved', false, 'Inactive Super Admin'),
  ('e1000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000003', 'rejected-super@example.test', 'admin', 'rejected', true, 'Rejected Super Admin'),
  ('e1000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000004', 'ordinary@example.test', 'admin', 'approved', true, 'Ordinary Admin'),
  ('e1000000-0000-4000-8000-000000000005', 'e1000000-0000-4000-8000-000000000005', 'pending-target@example.test', 'startup', 'pending', true, 'Pending Target'),
  ('e1000000-0000-4000-8000-000000000006', 'e1000000-0000-4000-8000-000000000006', 'approved-target@example.test', 'mentor', 'approved', true, 'Approved Target'),
  ('e1000000-0000-4000-8000-000000000007', 'e1000000-0000-4000-8000-000000000007', 'self-pending@example.test', 'startup', 'pending', true, 'Self Pending');

insert into public.platform_roles (profile_id, role)
values
  ('e1000000-0000-4000-8000-000000000001', 'super_admin'),
  ('e1000000-0000-4000-8000-000000000002', 'super_admin'),
  ('e1000000-0000-4000-8000-000000000003', 'super_admin');

select has_function(
  'private',
  'can_reject_pending_registration',
  array['uuid'],
  'registration rejection uses a dedicated active-approved Super Admin authorization boundary'
);
select ok(
  not has_function_privilege('anon', 'private.can_reject_pending_registration(uuid)', 'execute'),
  'anonymous callers cannot execute the registration rejection authorization helper'
);
select ok(
  not exists (
    select 1
    from pg_proc procedure
    cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
    where procedure.oid = 'private.can_reject_pending_registration(uuid)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no default execute privilege on the registration rejection authorization helper'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
with changed as (
  update public.profiles set status = 'rejected'
  where id = 'e1000000-0000-4000-8000-000000000005'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'an ordinary actor cannot reject another pending registration'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select throws_ok(
  $$update public.profiles set status = 'rejected' where id = 'e1000000-0000-4000-8000-000000000007'$$,
  '42501',
  'Profile status cannot be changed directly',
  'a pending registrant cannot reject their own registration'
);
select throws_ok(
  $$update public.profiles set status = 'approved' where id = 'e1000000-0000-4000-8000-000000000007'$$,
  '42501',
  'Profile status cannot be changed directly',
  'a pending registrant cannot approve their own registration'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
with changed as (
  update public.profiles set status = 'rejected'
  where id = 'e1000000-0000-4000-8000-000000000005'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'an inactive Super Admin cannot reject a pending registration'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
with changed as (
  update public.profiles set status = 'rejected'
  where id = 'e1000000-0000-4000-8000-000000000005'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'a rejected Super Admin cannot reject a pending registration'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  private.can_reject_pending_registration('e1000000-0000-4000-8000-000000000004'),
  false,
  'an active Super Admin cannot authorize by spoofing another candidate identity'
);
with changed as (
  update public.profiles set status = 'rejected'
  where id = 'e1000000-0000-4000-8000-000000000005'
  returning id
)
select is(
  (select count(*) from changed),
  1::bigint,
  'an active approved Super Admin rejects a pending registration'
);
select is(
  (select status from public.profiles where id = 'e1000000-0000-4000-8000-000000000005'),
  'rejected',
  'the authorized rejection persists'
);
with changed as (
  update public.profiles set status = 'rejected'
  where id = 'e1000000-0000-4000-8000-000000000006'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'an active Super Admin cannot reject an approved profile'
);
select throws_ok(
  $$update public.profiles set status = 'approved' where id = 'e1000000-0000-4000-8000-000000000007'$$,
  '42501',
  'Profile status cannot be changed directly',
  'an active Super Admin cannot directly approve a pending registration'
);
reset role;

select is(
  (select status from public.profiles where id = 'e1000000-0000-4000-8000-000000000006'),
  'approved',
  'denied rejection preserves the approved profile'
);
select is(
  (select status from public.profiles where id = 'e1000000-0000-4000-8000-000000000007'),
  'pending',
  'denied self and Super Admin approval attempts preserve pending status'
);

select * from finish();
rollback;
