begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

update public.semesters set is_active = false where is_active;
insert into public.semesters (id, name, start_date, end_date, lifecycle_status, is_active, configuration)
values
  ('a1000000-0000-4000-8000-000000000001', 'Speakers A', '2099-01-01', '2099-05-31', 'active', true, '{}'),
  ('a1000000-0000-4000-8000-000000000002', 'Speakers B', '2098-01-01', '2098-05-31', 'archived', false, '{}');
insert into public.meetings (id, semester_id, meeting_date, label)
values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '2099-01-09', 'Friday A'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', '2098-01-10', 'Friday B');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('a3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'speaker-admin@example.test', '{}', '{}'),
  ('a3000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'speaker-mentor@example.test', '{}', '{}'),
  ('a3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'speaker-outsider@example.test', '{}', '{}');
insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name)
values
  ('a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'speaker-admin@example.test', 'admin', 'approved', true, 'Speaker Admin'),
  ('a3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002', 'speaker-mentor@example.test', 'mentor', 'approved', true, 'Speaker Mentor'),
  ('a3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 'speaker-outsider@example.test', 'startup', 'approved', true, 'Speaker Outsider');
insert into public.semester_memberships (id, semester_id, profile_id, role, status, activated_at)
values
  ('a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'admin', 'active', now()),
  ('a4000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'mentor', 'active', now()),
  ('a4000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000003', 'startup', 'active', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.friday_speakers (semester_id, meeting_id, name, bio, expertise, topic, contact_email)
values ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'First speaker', 'Biography', 'Product', 'Launch', 'speaker@example.test');
select is((select name from public.friday_speakers), 'First speaker', 'semester admin inserts and reads a speaker');
update public.friday_speakers set name = 'Updated speaker';
select is((select name from public.friday_speakers), 'Updated speaker', 'semester admin updates a speaker');
select throws_ok($$insert into public.friday_speakers (semester_id, meeting_id, name, bio, expertise, topic, contact_email)
values ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'Wrong semester', 'Bio', 'Product', 'Launch', 'speaker@example.test')$$,
  '42501', null, 'admin cannot insert into another semester');
reset role;
select throws_ok($$insert into public.friday_speakers (semester_id, meeting_id, name, bio, expertise, topic, contact_email)
values ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'Mismatched', 'Bio', 'Product', 'Launch', 'speaker@example.test')$$,
  '23503', null, 'speaker meeting must belong to its semester');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select name from public.friday_speakers), 'Updated speaker', 'active mentor reads the speaker');
with changed as (update public.friday_speakers set name = 'Unauthorized' returning meeting_id)
select is((select count(*) from changed), 0::bigint, 'mentor cannot update speaker');
with removed as (delete from public.friday_speakers returning meeting_id)
select is((select count(*) from removed), 0::bigint, 'mentor cannot remove speaker');
select throws_ok($$insert into public.friday_speakers (semester_id, meeting_id, name, bio, expertise, topic, contact_email)
values ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Unauthorized', 'Bio', 'Product', 'Launch', 'speaker@example.test')$$,
  '42501', null, 'mentor cannot insert speaker');

select set_config('request.jwt.claims', '{"sub":"a3000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.friday_speakers), 0::bigint, 'other semester member cannot read speaker');
with removed as (delete from public.friday_speakers returning meeting_id)
select is((select count(*) from removed), 0::bigint, 'other semester member cannot remove speaker');

select set_config('request.jwt.claims', '{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
with removed as (delete from public.friday_speakers returning meeting_id)
select is((select count(*) from removed), 1::bigint, 'semester admin removes speaker');

select * from finish();
rollback;
