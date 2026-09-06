begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select has_table('public', 'participant_notification_reads', 'read receipts exist');

insert into public.semesters (id, name, start_date, end_date)
values ('b1000000-0000-0000-0000-000000000001', 'Receipt test', '2099-01-01', '2099-06-01'),
       ('b1000000-0000-0000-0000-000000000002', 'Other receipt test', '2099-07-01', '2099-12-01');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('b2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'receipt-owner@example.test', '{}', '{}'),
       ('b2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'receipt-other@example.test', '{}', '{}');
insert into public.profiles (id, auth_user_id, email, role, status, full_name)
values ('b3000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'receipt-owner@example.test', 'mentor', 'approved', 'Receipt Owner'),
       ('b3000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'receipt-other@example.test', 'startup', 'approved', 'Receipt Other');
insert into public.semester_memberships (semester_id, profile_id, role, status)
values ('b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'mentor', 'active'),
       ('b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000002', 'startup', 'active');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$insert into public.participant_notification_reads (profile_id, semester_id, notification_key)
values ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'session-test-confirmed')$$, 'owner can save a receipt using canonical profile identity');
select lives_ok($$insert into public.participant_notification_reads (profile_id, semester_id, notification_key)
values ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'session-test-confirmed')
on conflict (profile_id, semester_id, notification_key) do nothing$$, 'opening twice is idempotent');
select is((select count(*) from public.participant_notification_reads), 1::bigint, 'owner reads one persisted receipt');
select throws_ok($$insert into public.participant_notification_reads (profile_id, semester_id, notification_key)
values ('b3000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'session-forged')$$,
'42501', null, 'cannot mark another participant notification read');
select throws_ok($$insert into public.participant_notification_reads (profile_id, semester_id, notification_key)
values ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'session-wrong-term')$$,
'42501', null, 'cannot write outside own semester memberships');
select throws_ok($$insert into public.participant_notification_reads (profile_id, semester_id, notification_key)
values ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', ' ')$$,
'23514', null, 'blank notification keys are rejected');
select throws_ok($$update public.participant_notification_reads set notification_key = 'changed'$$, '42501', null, 'receipts cannot be reassigned');
select throws_ok($$delete from public.participant_notification_reads$$, '42501', null, 'receipts cannot be deleted by participants');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.participant_notification_reads), 0::bigint, 'another participant cannot read owner receipts');
select lives_ok($$insert into public.participant_notification_reads (profile_id, semester_id, notification_key)
values ('b3000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'session-test-confirmed')$$, 'startup participant can save the same notification key independently');
reset role;
set local role anon;
select throws_ok($$select * from public.participant_notification_reads$$, '42501', null, 'anonymous users cannot read receipts');
select throws_ok($$insert into public.participant_notification_reads (profile_id, semester_id, notification_key)
values ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'anonymous')$$,
'42501', null, 'anonymous users cannot write receipts');
reset role;
select * from finish();
rollback;
