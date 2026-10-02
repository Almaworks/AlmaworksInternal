begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

insert into public.semesters (id, name, start_date, end_date, lifecycle_status, configuration)
values ('ee000000-0000-4000-8000-000000000001', 'QA cleanup test', '2099-09-01', '2099-12-31', 'active', '{"timezone":"America/New_York"}');
insert into auth.users (id, aud, role, email) values
  ('ee000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'qa-cleanup-admin@example.test'),
  ('ee000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'qa-fixture@example.test');
insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name) values
  ('ee000000-0000-4000-8000-000000000011', 'ee000000-0000-4000-8000-000000000011', 'qa-cleanup-admin@example.test', 'admin', 'approved', true, 'QA Cleanup Admin'),
  ('ee000000-0000-4000-8000-000000000012', 'ee000000-0000-4000-8000-000000000012', 'qa-fixture@example.test', 'mentor', 'approved', true, 'QA Cleanup Member');
insert into public.platform_roles (profile_id, role) values ('ee000000-0000-4000-8000-000000000011', 'super_admin');
insert into public.semester_memberships (id, semester_id, profile_id, role, status, activated_at) values
  ('ee000000-0000-4000-8000-000000000021', 'ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000011', 'admin', 'active', now()),
  ('ee000000-0000-4000-8000-000000000022', 'ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000012', 'mentor', 'active', now());

insert into public.outreach_contacts (id, full_name, email, relationship_types, created_by) values
  ('ee000000-0000-4000-8000-000000000031', 'QA Mentor Outreach Fixture', 'qa-fixture@example.test', array['mentor'], 'ee000000-0000-4000-8000-000000000011'),
  ('ee000000-0000-4000-8000-000000000032', 'Real Mentor', 'real-mentor@example.test', array['mentor'], 'ee000000-0000-4000-8000-000000000011');
insert into public.outreach_companies (id, name, normalized_name, created_by) values
  ('ee000000-0000-4000-8000-000000000041', 'QA Fixture Company', 'qa fixture company', 'ee000000-0000-4000-8000-000000000011'),
  ('ee000000-0000-4000-8000-000000000042', 'Real Company', 'real company', 'ee000000-0000-4000-8000-000000000011');
insert into public.outreach_contact_companies (contact_id, company_id, is_primary) values
  ('ee000000-0000-4000-8000-000000000031', 'ee000000-0000-4000-8000-000000000041', true),
  ('ee000000-0000-4000-8000-000000000032', 'ee000000-0000-4000-8000-000000000042', true);
insert into public.outreach_opportunities (id, semester_id, contact_id, relationship_types, owner_profile_id, created_by) values
  ('ee000000-0000-4000-8000-000000000051', 'ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000031', array['mentor'], 'ee000000-0000-4000-8000-000000000011', 'ee000000-0000-4000-8000-000000000011'),
  ('ee000000-0000-4000-8000-000000000052', 'ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000032', array['mentor'], 'ee000000-0000-4000-8000-000000000011', 'ee000000-0000-4000-8000-000000000011');
insert into public.outreach_activities (semester_id, opportunity_id, actor_profile_id, activity_kind, summary)
values ('ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000051', 'ee000000-0000-4000-8000-000000000011', 'note', 'QA fixture activity');
insert into public.outreach_gmail_messages (id, semester_id, opportunity_id, profile_id, request_key, request_digest, sender, recipient, subject, body, status, google_message_id) values
  ('ee000000-0000-4000-8000-000000000061', 'ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000051', 'ee000000-0000-4000-8000-000000000011', 'ee000000-0000-4000-8000-000000000071', repeat('a', 64), 'qa-cleanup-admin@example.test', 'qa-fixture@example.test', 'QA sent message', 'QA body', 'sent', 'qa-message-1'),
  ('ee000000-0000-4000-8000-000000000062', 'ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000052', 'ee000000-0000-4000-8000-000000000011', 'ee000000-0000-4000-8000-000000000072', repeat('b', 64), 'qa-cleanup-admin@example.test', 'real-mentor@example.test', 'Real sent message', 'Real body', 'sent', 'real-message-1');
select throws_ok($$delete from public.outreach_activities where opportunity_id='ee000000-0000-4000-8000-000000000051'$$,
  '55000', 'Outreach activities are append-only', 'ordinary direct activity deletion remains prohibited');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ee000000-0000-4000-8000-000000000012","role":"authenticated"}', true);
with removed as (delete from public.outreach_gmail_messages where id='ee000000-0000-4000-8000-000000000061' returning id)
select is((select count(*)::int from removed), 0, 'ordinary member cannot directly delete Gmail history');
select throws_ok($$select public.purge_qa_outreach_contact('ee000000-0000-4000-8000-000000000031', 'qa-fixture@example.test', 1, 1)$$,
  '42501', 'Platform super-administrator access required', 'ordinary member cannot purge QA outreach');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ee000000-0000-4000-8000-000000000011","role":"authenticated"}', true);
select ok(exists(select 1 from public.preview_member_deletion('ee000000-0000-4000-8000-000000000012') preview
    where 'A matching outreach contact must be reviewed separately.' = any(preview.blockers)),
  'matching QA contact blocks member deletion before outreach cleanup');
select throws_ok($$select public.purge_qa_outreach_contact('ee000000-0000-4000-8000-000000000031', 'wrong@example.test', 1, 1)$$,
  '22023', 'QA contact email confirmation does not match', 'email mismatch is denied');
select throws_ok($$select public.purge_qa_outreach_contact('ee000000-0000-4000-8000-000000000032', 'real-mentor@example.test', 1, 1)$$,
  '42501', 'Only QA-labeled outreach contacts can be purged', 'ordinary contact is protected');
select throws_ok($$select public.purge_qa_outreach_contact('ee000000-0000-4000-8000-000000000031', 'qa-fixture@example.test', 2, 1)$$,
  'PT409', 'QA outreach preview changed', 'stale message count is denied');
select is((public.purge_qa_outreach_contact('ee000000-0000-4000-8000-000000000031', 'qa-fixture@example.test', 1, 1)->>'deletedMessages')::int,
  1, 'confirmed QA cleanup removes the exact sent-message count');
select is((select blockers from public.preview_member_deletion('ee000000-0000-4000-8000-000000000012')),
  '{}'::text[], 'outreach cleanup clears member deletion blockers');
reset role;

select is((select count(*)::int from public.outreach_contacts where id='ee000000-0000-4000-8000-000000000031'), 0, 'QA contact removed');
select is((select count(*)::int from public.outreach_opportunities where id='ee000000-0000-4000-8000-000000000051'), 0, 'QA opportunity removed');
select is((select count(*)::int from public.outreach_gmail_messages where id='ee000000-0000-4000-8000-000000000061'), 0, 'QA Gmail snapshot removed');
select is((select count(*)::int from public.outreach_activities where opportunity_id='ee000000-0000-4000-8000-000000000051'), 0, 'QA activities removed');
select is((select count(*)::int from public.outreach_companies where id='ee000000-0000-4000-8000-000000000041'), 0, 'unshared QA company removed');
select is((select count(*)::int from public.outreach_contacts where id='ee000000-0000-4000-8000-000000000032'), 1, 'ordinary contact preserved');
select is((select count(*)::int from public.outreach_opportunities where id='ee000000-0000-4000-8000-000000000052'), 1, 'ordinary opportunity preserved');
select is((select count(*)::int from public.outreach_gmail_messages where id='ee000000-0000-4000-8000-000000000062'), 1, 'ordinary Gmail snapshot preserved');
select is((select count(*)::int from public.outreach_companies where id='ee000000-0000-4000-8000-000000000042'), 1, 'ordinary company preserved');

select * from finish();
rollback;
