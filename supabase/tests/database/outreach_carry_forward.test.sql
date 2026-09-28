begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

update public.semesters set is_active = false where is_active;

insert into public.semesters (id, name, start_date, end_date, lifecycle_status, is_active)
values
  ('d1000000-0000-0000-0000-000000000001', 'Carry-forward source', '2098-01-01', '2098-05-31', 'archived', false),
  ('d1000000-0000-0000-0000-000000000002', 'Carry-forward target', '2099-01-01', '2099-05-31', 'active', true);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('d2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'carry-forward-admin@example.test', '{}', '{}'),
  ('d2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'carry-forward-source-only@example.test', '{}', '{}');

insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name)
values
  ('d3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'carry-forward-admin@example.test', 'admin', 'approved', true, 'Carry Forward Admin'),
  ('d3000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000002', 'carry-forward-source-only@example.test', 'admin', 'approved', true, 'Source Only Admin');

insert into public.semester_memberships (semester_id, profile_id, role, status, activated_at)
values
  ('d1000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'admin', 'active', now()),
  ('d1000000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000001', 'admin', 'active', now()),
  ('d1000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002', 'admin', 'active', now());

insert into public.outreach_contacts (id, full_name, email, archived_at)
values
  ('d4000000-0000-0000-0000-000000000001', 'New target person', 'new-target@example.test', null),
  ('d4000000-0000-0000-0000-000000000002', 'Existing target person', 'existing-target@example.test', null),
  ('d4000000-0000-0000-0000-000000000003', 'Archived source opportunity', 'archived-opportunity@example.test', null),
  ('d4000000-0000-0000-0000-000000000004', 'Archived global contact', 'archived-contact@example.test', now());

insert into public.outreach_opportunities (
  id,
  semester_id,
  contact_id,
  owner_profile_id,
  next_follow_up_at,
  stage,
  relationship_types,
  semester_notes,
  source_context,
  archived_at
)
values
  (
    'd5000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    'd4000000-0000-0000-0000-000000000001',
    'd3000000-0000-0000-0000-000000000001',
    '2098-05-01T14:00:00Z',
    'replied',
    array['mentor'],
    'Preserve only in source history',
    '{"origin":"fixture"}'::jsonb,
    null
  ),
  (
    'd5000000-0000-0000-0000-000000000002',
    'd1000000-0000-0000-0000-000000000001',
    'd4000000-0000-0000-0000-000000000002',
    null,
    null,
    'ready',
    array['startup'],
    null,
    '{}'::jsonb,
    null
  ),
  (
    'd5000000-0000-0000-0000-000000000003',
    'd1000000-0000-0000-0000-000000000001',
    'd4000000-0000-0000-0000-000000000003',
    null,
    null,
    'contacted',
    array['mentor'],
    null,
    '{}'::jsonb,
    now()
  ),
  (
    'd5000000-0000-0000-0000-000000000004',
    'd1000000-0000-0000-0000-000000000001',
    'd4000000-0000-0000-0000-000000000004',
    null,
    null,
    'researching',
    array['mentor'],
    null,
    '{}'::jsonb,
    null
  ),
  (
    'd5000000-0000-0000-0000-000000000005',
    'd1000000-0000-0000-0000-000000000002',
    'd4000000-0000-0000-0000-000000000002',
    null,
    null,
    'contacted',
    array['startup'],
    'Existing target history',
    '{"existing":true}'::jsonb,
    null
  );

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  public.carry_forward_outreach_contacts(
    'd1000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000002',
    array[
      'd4000000-0000-0000-0000-000000000001',
      'd4000000-0000-0000-0000-000000000002',
      'd4000000-0000-0000-0000-000000000003',
      'd4000000-0000-0000-0000-000000000004'
    ]::uuid[]
  ),
  1,
  'carry-forward inserts only an eligible contact not already present in the target'
);

select is(
  (select count(*) from public.outreach_opportunities where semester_id = 'd1000000-0000-0000-0000-000000000002'),
  2::bigint,
  'target contains the new opportunity and the pre-existing duplicate only'
);

select is(
  (select stage from public.outreach_opportunities where semester_id = 'd1000000-0000-0000-0000-000000000002' and contact_id = 'd4000000-0000-0000-0000-000000000001'),
  'not_contacted'::text,
  'the new target opportunity starts at not contacted'
);

select is(
  (select owner_profile_id from public.outreach_opportunities where semester_id = 'd1000000-0000-0000-0000-000000000002' and contact_id = 'd4000000-0000-0000-0000-000000000001'),
  null::uuid,
  'the new target opportunity is unassigned'
);

select is(
  (select relationship_types from public.outreach_opportunities where semester_id = 'd1000000-0000-0000-0000-000000000002' and contact_id = 'd4000000-0000-0000-0000-000000000001'),
  array['mentor']::text[],
  'relationship types carry into the new semester'
);

select is(
  (select source_context from public.outreach_opportunities where semester_id = 'd1000000-0000-0000-0000-000000000002' and contact_id = 'd4000000-0000-0000-0000-000000000001'),
  '{"carried_from_semester_id":"d1000000-0000-0000-0000-000000000001","carried_from_opportunity_id":"d5000000-0000-0000-0000-000000000001"}'::jsonb,
  'the new opportunity records its source semester and opportunity'
);

select is(
  (select stage from public.outreach_opportunities where id = 'd5000000-0000-0000-0000-000000000001'),
  'replied'::text,
  'the source opportunity history remains unchanged'
);

select is(
  (select semester_notes from public.outreach_opportunities where id = 'd5000000-0000-0000-0000-000000000005'),
  'Existing target history'::text,
  'a duplicate target opportunity remains unchanged'
);

select is(
  public.carry_forward_outreach_contacts(
    'd1000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000002',
    array['d4000000-0000-0000-0000-000000000001']::uuid[]
  ),
  0,
  'repeating carry-forward is idempotent'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.carry_forward_outreach_contacts(
    'd1000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000002',
    array['d4000000-0000-0000-0000-000000000001']::uuid[]
  )$$,
  'P0001',
  'Not authorized to carry outreach contacts between semesters',
  'an administrator without target-semester access cannot carry contacts forward'
);
reset role;

select * from finish();
rollback;
