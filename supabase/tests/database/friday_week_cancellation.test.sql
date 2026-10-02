begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
set local search_path = public, extensions;
select plan(26);

update public.semesters set is_active = false where is_active;
insert into public.semesters (id, name, start_date, end_date, lifecycle_status, is_active, configuration)
values
  ('c1000000-0000-4000-8000-000000000001', 'Cancellation A', '2099-01-01', '2099-05-31', 'active', true, '{}'),
  ('c1000000-0000-4000-8000-000000000002', 'Cancellation B', '2098-01-01', '2098-05-31', 'archived', false, '{}');
insert into public.meetings (id, semester_id, meeting_date, label)
values
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '2099-01-09', 'Week A'),
  ('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', '2098-01-10', 'Week B');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('c3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'cancel-admin@example.test', '{}', '{}'),
  ('c3000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'cancel-startup@example.test', '{}', '{}');
insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name)
values
  ('c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'cancel-admin@example.test', 'admin', 'approved', true, 'Cancel Admin'),
  ('c3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000002', 'cancel-startup@example.test', 'startup', 'approved', true, 'Cancel Startup');
insert into public.semester_memberships (id, semester_id, profile_id, role, status, activated_at)
values
  ('c4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'admin', 'active', now()),
  ('c4000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001', 'admin', 'active', now()),
  ('c4000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', 'startup', 'active', now());
insert into public.startup_organizations (id, name, slug)
values ('c5000000-0000-4000-8000-000000000001', 'Cancel Startup', 'cancel-startup');
insert into public.startup_semesters (id, semester_id, startup_organization_id)
values ('c6000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001');
insert into public.startup_team_memberships (id, semester_id, startup_semester_id, semester_membership_id)
values ('c7000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000003');

select has_column('public', 'meetings', 'friday_canceled_at', 'Friday meetings store canceled state');
select has_column('public', 'meetings', 'friday_canceled_by_profile_id', 'Friday meetings store the canceling administrator');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select assignment_count from public.generate_friday_program('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001')), 1, 'admin publishes groups before cancellation');
select lives_ok($$insert into public.friday_speakers (semester_id, meeting_id, name, bio, expertise, topic, contact_email)
values ('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Saved speaker', 'Bio', 'Product', 'Launch', 'saved@example.test')$$, 'admin saves a speaker before cancellation');
select is(public.set_friday_week_canceled('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', true), true, 'admin cancels one Friday week');
select ok((select friday_canceled_at is not null and friday_canceled_by_profile_id = 'c3000000-0000-4000-8000-000000000001' from public.meetings where id = 'c2000000-0000-4000-8000-000000000001'), 'canceled state records its time and actor');
select throws_ok($$select public.set_friday_week_canceled('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', null)$$, '22004', 'Canceled state is required', 'the database rejects an ambiguous null cancellation state');
select throws_ok($$update public.meetings set friday_canceled_by_profile_id = 'c3000000-0000-4000-8000-000000000002' where id = 'c2000000-0000-4000-8000-000000000001'$$, '23514', 'Canceled Friday weeks must record the acting administrator', 'direct writes cannot forge the canceling administrator');
select throws_ok($$select public.generate_friday_program('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', true)$$, 'P0003', 'Canceled Friday weeks cannot generate or regenerate groups', 'canceled weeks reject group regeneration');
select throws_ok($$update public.friday_speakers set topic = 'Changed' where meeting_id = 'c2000000-0000-4000-8000-000000000001'$$, 'P0003', 'Canceled Friday weeks cannot change speaker details', 'canceled weeks reject speaker edits');
select throws_ok($$delete from public.friday_speakers where meeting_id = 'c2000000-0000-4000-8000-000000000001'$$, 'P0003', 'Canceled Friday weeks cannot change speaker details', 'canceled weeks reject speaker removal');
select is((select count(*) from public.friday_programs where meeting_id = 'c2000000-0000-4000-8000-000000000001'), 1::bigint, 'cancellation preserves the saved program');
select is((select count(*) from public.friday_program_assignments assignment join public.friday_programs program on program.id = assignment.program_id where program.meeting_id = 'c2000000-0000-4000-8000-000000000001'), 1::bigint, 'cancellation preserves group history');
select is((select name from public.friday_speakers where meeting_id = 'c2000000-0000-4000-8000-000000000001'), 'Saved speaker', 'cancellation preserves the saved speaker');
select lives_ok($$update public.meetings set label = 'Thanksgiving break' where id = 'c2000000-0000-4000-8000-000000000001'$$, 'semester admin can rename a Friday week');
select is((select label from public.meetings where id = 'c2000000-0000-4000-8000-000000000001'), 'Thanksgiving break', 'renamed week is persisted');
select is((select label from public.meetings where id = 'c2000000-0000-4000-8000-000000000002'), 'Week B', 'other semester is unchanged');
select throws_ok($$select public.set_friday_week_canceled('c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', true)$$, 'P0002', 'Meeting does not belong to the selected semester', 'an administrator cannot cross semester boundaries');

select set_config('request.jwt.claims', '{"sub":"c3000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.meetings where id = 'c2000000-0000-4000-8000-000000000001' and friday_canceled_at is not null), 1::bigint, 'participants can read the canceled status');
select throws_ok($$select public.set_friday_week_canceled('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', false)$$, '42501', 'Semester administrator access required', 'startup participants cannot restore weeks');
select lives_ok($$update public.meetings set label = 'Unauthorized' where id = 'c2000000-0000-4000-8000-000000000001'$$, 'startup update is safely ignored by row policy');
select is((select label from public.meetings where id = 'c2000000-0000-4000-8000-000000000001'), 'Thanksgiving break', 'startup participants cannot rename a Friday week');

select set_config('request.jwt.claims', '{"sub":"c3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.set_friday_week_canceled('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', false), true, 'admin restores the canceled week');
select ok((select friday_canceled_at is null and friday_canceled_by_profile_id is null from public.meetings where id = 'c2000000-0000-4000-8000-000000000001'), 'restoration clears canceled state');
select lives_ok($$update public.friday_speakers set topic = 'Restored topic' where meeting_id = 'c2000000-0000-4000-8000-000000000001'$$, 'restored weeks allow speaker edits');
select is((select topic from public.friday_speakers where meeting_id = 'c2000000-0000-4000-8000-000000000001'), 'Restored topic', 'restored speaker history remains editable');

select * from finish();
rollback;
