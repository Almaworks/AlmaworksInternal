begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select is(
  (
    select count(*)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = any(array[
        'discard_replacement_auth_placeholder',
        'log_outreach_activity',
        'set_outreach_silence',
        'set_outreach_snooze',
        'suspend_outreach_membership',
        'transfer_outreach_owner'
      ])
      and procedure.prosrc like '%40001%'
  ),
  0::bigint,
  'business-conflict functions reserve 40001 for genuine serialization failures'
);

select is(
  (
    select count(*)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'discard_replacement_auth_placeholder'
      and procedure.prosrc like '%Replacement placeholder changed during discard%PT409%'
  ),
  1::bigint,
  'the race-only placeholder discard conflict uses the application conflict SQLSTATE'
);

update public.semesters set is_active = false where is_active;

insert into public.semesters (id, name, start_date, end_date, lifecycle_status, is_active, configuration)
values ('e1000000-0000-4000-8000-000000000001', 'Business conflict regression', '2099-01-01', '2099-05-31', 'active', true, '{}');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('e2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'conflict-admin@example.test', '{}', '{}'),
  ('e2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'conflict-owner@example.test', '{}', '{}'),
  ('e2000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'conflict-outsider@example.test', '{}', '{}');

insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name)
values
  ('e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'conflict-admin@example.test', 'admin', 'approved', true, 'Conflict Admin'),
  ('e2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'conflict-owner@example.test', 'admin', 'approved', true, 'Conflict Owner'),
  ('e2000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000003', 'conflict-outsider@example.test', 'startup', 'approved', true, 'Conflict Outsider');

insert into public.semester_memberships (id, semester_id, profile_id, role, status, activated_at)
values
  ('e4000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'admin', 'active', now()),
  ('e4000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 'admin', 'active', now()),
  ('e4000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000003', 'startup', 'active', now());

insert into public.outreach_contacts (id, full_name, email, created_by)
values ('e5000000-0000-4000-8000-000000000001', 'Conflict Contact', 'conflict-contact@example.test', 'e2000000-0000-4000-8000-000000000001');

insert into public.outreach_opportunities (
  id, semester_id, contact_id, owner_profile_id, stage, relationship_types, created_by
)
values (
  'e6000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000002',
  'not_contacted',
  array['mentor'],
  'e2000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select public.log_outreach_activity('e6000000-0000-4000-8000-000000000001', 'note', now(), null, 'stale log', '{}', null, 'contacted', '2000-01-01')$$,
  'PT409', 'Outreach opportunity is stale',
  'stale activity logging returns an application conflict'
);
reset role;
select is((select count(*) from public.outreach_activities where opportunity_id = 'e6000000-0000-4000-8000-000000000001'), 0::bigint, 'stale activity logging is a no-op');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.set_outreach_silence('e6000000-0000-4000-8000-000000000001', true, 'stale silence', null, '2000-01-01')$$,
  'PT409', 'Outreach opportunity is stale',
  'stale silence returns an application conflict'
);
reset role;
select is((select is_silenced from public.outreach_opportunities where id = 'e6000000-0000-4000-8000-000000000001'), false, 'stale silence is a no-op');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.set_outreach_snooze('e6000000-0000-4000-8000-000000000001', '2099-03-01', 'stale snooze', '2000-01-01')$$,
  'PT409', 'Outreach opportunity is stale',
  'stale snooze returns an application conflict'
);
reset role;
select is((select snoozed_until from public.outreach_opportunities where id = 'e6000000-0000-4000-8000-000000000001'), null::timestamptz, 'stale snooze is a no-op');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.transfer_outreach_owner('e6000000-0000-4000-8000-000000000001', null, 'stale transfer', '2000-01-01')$$,
  'PT409', 'Outreach opportunity is stale',
  'stale owner transfer returns an application conflict'
);
reset role;
select is((select owner_profile_id from public.outreach_opportunities where id = 'e6000000-0000-4000-8000-000000000001'), 'e2000000-0000-4000-8000-000000000002'::uuid, 'stale owner transfer is a no-op');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.suspend_outreach_membership('e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 'stale suspension', '2000-01-01')$$,
  'PT409', 'Semester membership is stale',
  'stale membership suspension returns an application conflict'
);
reset role;
select is((select status from public.semester_memberships where id = 'e4000000-0000-4000-8000-000000000002'), 'active'::public.membership_lifecycle_status, 'stale membership suspension is a no-op');

select set_config('test.opportunity_updated_at', (select updated_at::text from public.outreach_opportunities where id = 'e6000000-0000-4000-8000-000000000001'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  format($sql$select public.log_outreach_activity('e6000000-0000-4000-8000-000000000001', 'note', now(), null, 'fresh log', '{}', null, 'contacted', %L)$sql$, current_setting('test.opportunity_updated_at')),
  'fresh activity logging succeeds'
);
reset role;
select is((select stage from public.outreach_opportunities where id = 'e6000000-0000-4000-8000-000000000001'), 'contacted', 'fresh activity logging mutates the opportunity');
select is((select count(*) from public.outreach_activities where opportunity_id = 'e6000000-0000-4000-8000-000000000001'), 1::bigint, 'fresh activity logging appends one audit activity');

select set_config('test.opportunity_updated_at', (select updated_at::text from public.outreach_opportunities where id = 'e6000000-0000-4000-8000-000000000001'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  format($sql$select public.set_outreach_snooze('e6000000-0000-4000-8000-000000000001', '2099-03-01', 'unauthorized', %L)$sql$, current_setting('test.opportunity_updated_at')),
  '42501', 'Not authorized to manage this semester',
  'outreach mutation still denies an unauthorized participant'
);
select throws_ok(
  format($sql$select * from public.suspend_outreach_membership('e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 'unauthorized', %L)$sql$, (select updated_at::text from public.semester_memberships where id = 'e4000000-0000-4000-8000-000000000002')),
  '42501', 'Not authorized to suspend membership in this semester',
  'membership suspension still denies an unauthorized participant'
);
reset role;

select set_config('test.opportunity_updated_at', (select updated_at::text from public.outreach_opportunities where id = 'e6000000-0000-4000-8000-000000000001'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  format($sql$select public.set_outreach_snooze('e6000000-0000-4000-8000-000000000001', '2099-03-01', 'fresh snooze', %L)$sql$, current_setting('test.opportunity_updated_at')),
  'fresh snooze succeeds'
);
reset role;
select is((select snoozed_until from public.outreach_opportunities where id = 'e6000000-0000-4000-8000-000000000001'), '2099-03-01'::timestamptz, 'fresh snooze persists');

select set_config('test.membership_updated_at', (select updated_at::text from public.semester_memberships where id = 'e4000000-0000-4000-8000-000000000002'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  format($sql$select * from public.suspend_outreach_membership('e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 'fresh suspension', %L)$sql$, current_setting('test.membership_updated_at')),
  'fresh membership suspension succeeds'
);
reset role;
select is((select status from public.semester_memberships where id = 'e4000000-0000-4000-8000-000000000002'), 'suspended'::public.membership_lifecycle_status, 'fresh membership suspension persists');
select is((select owner_profile_id from public.outreach_opportunities where id = 'e6000000-0000-4000-8000-000000000001'), null::uuid, 'fresh membership suspension atomically releases owned work');

select * from finish();
rollback;
