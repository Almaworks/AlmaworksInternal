begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

insert into public.semesters (id, name, start_date, end_date, lifecycle_status, configuration)
values ('b1000000-0000-0000-0000-000000000001', 'Startup deletion test', '2099-09-01', '2099-12-31', 'active', '{"timezone":"America/New_York"}'::jsonb);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('b2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'delete-super-admin@example.test', '{}', '{}'),
  ('b2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'delete-founder@example.test', '{}', '{}'),
  ('b2000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'delete-mentor@example.test', '{}', '{}'),
  ('b2000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'keep-founder@example.test', '{}', '{}'),
  ('b2000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'third-founder@example.test', '{}', '{}');

insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name)
values
  ('b2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'delete-super-admin@example.test', 'admin', 'approved', true, 'Delete Super Admin'),
  ('b2000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'delete-founder@example.test', 'startup', 'approved', true, 'Delete Founder'),
  ('b2000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000003', 'delete-mentor@example.test', 'mentor', 'approved', true, 'Delete Mentor'),
  ('b2000000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-000000000004', 'keep-founder@example.test', 'startup', 'approved', true, 'Keep Founder'),
  ('b2000000-0000-0000-0000-000000000005', 'b2000000-0000-0000-0000-000000000005', 'third-founder@example.test', 'startup', 'approved', true, 'Third Founder');

insert into public.platform_roles (profile_id, role)
values ('b2000000-0000-0000-0000-000000000001', 'super_admin');

insert into public.semester_memberships (id, semester_id, profile_id, role, status, activated_at)
values
  ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'startup', 'active', now()),
  ('b3000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000003', 'mentor', 'active', now()),
  ('b3000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000004', 'startup', 'active', now()),
  ('b3000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000005', 'startup', 'active', now());

insert into public.mentor_semesters (id, semester_id, semester_membership_id)
values ('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000002');

insert into public.startup_organizations (id, name, slug)
values
  ('b5000000-0000-0000-0000-000000000001', 'Delete Me Startup', 'delete-me-startup'),
  ('b5000000-0000-0000-0000-000000000002', 'Keep Me Startup', 'keep-me-startup'),
  ('b5000000-0000-0000-0000-000000000003', 'Third Startup', 'third-startup');

insert into public.startup_semesters (id, semester_id, startup_organization_id)
values
  ('b6000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001'),
  ('b6000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000002'),
  ('b6000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000003');

insert into public.startup_team_memberships (semester_id, startup_semester_id, semester_membership_id)
values
  ('b1000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000002', 'b3000000-0000-0000-0000-000000000003'),
  ('b1000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000003', 'b3000000-0000-0000-0000-000000000004');

insert into public.meetings (id, semester_id, meeting_date)
values ('b7000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '2099-09-04');

insert into public.friday_programs (id, semester_id, meeting_id, startup_count, generated_by_profile_id)
values ('ba000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001', 3, 'b2000000-0000-0000-0000-000000000001');

insert into public.friday_program_assignments (semester_id, program_id, startup_semester_id, startup_organization_id, startup_name, startup_slug, group_code, group_position)
values
  ('b1000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', 'Delete Me Startup', 'delete-me-startup', 'A', 1),
  ('b1000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-000000000002', 'Keep Me Startup', 'keep-me-startup', 'A', 2),
  ('b1000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000003', 'b5000000-0000-0000-0000-000000000003', 'Third Startup', 'third-startup', 'B', 1);

insert into public.sessions (id, semester_id, meeting_id, mentor_semester_id, startup_semester_id, slot, status)
values ('b8000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000001', 1, 'confirmed');

insert into public.session_rsvps (id, semester_id, session_id, semester_membership_id, response)
values ('b9000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'attending');

-- Build calendar-first requests through the normal guards. All fixtures and
-- active-semester changes are rolled back at the end of this local test.
update public.semesters set is_active = false where is_active;
update public.semesters set is_active = true where id = 'b1000000-0000-0000-0000-000000000001';
insert into public.mentor_weekly_availability (semester_id, mentor_semester_id, weekday, starts_at, ends_at)
values ('b1000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', extract(dow from date '2099-09-07')::smallint, '09:00', '11:00');

select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.request_mentor_booking('b1000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', '2099-09-07 13:00:00+00', '2099-09-07 13:15:00+00', 'Accepted deletion fixture');
select public.request_mentor_booking('b1000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', '2099-09-07 13:30:00+00', '2099-09-07 13:45:00+00', 'Pending deletion fixture');
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
update public.mentor_booking_requests set status = 'accepted' where startup_organization_id = 'b5000000-0000-0000-0000-000000000001' and topic = 'Accepted deletion fixture';
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select public.request_mentor_booking('b1000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', '2099-09-07 14:00:00+00', '2099-09-07 14:15:00+00', 'Preserved booking fixture');
insert into public.mentor_booking_decision_notes (semester_id, request_id, kind, note, author_profile_id)
select semester_id, id, 'cancelled', 'Disposable booking decision', 'b2000000-0000-0000-0000-000000000002'
from public.mentor_booking_requests where topic in ('Accepted deletion fixture', 'Preserved booking fixture');
insert into public.mentor_booking_meeting_details (semester_id, request_id, location, updated_by_profile_id)
select semester_id, id, 'Disposable meeting location', 'b2000000-0000-0000-0000-000000000002'
from public.mentor_booking_requests where topic = 'Accepted deletion fixture';
insert into public.mentor_booking_outcomes (semester_id, request_id, reporter_profile_id, attendance, feedback)
select semester_id, id, 'b2000000-0000-0000-0000-000000000002', 'attended', 'Disposable booking feedback'
from public.mentor_booking_requests where topic = 'Accepted deletion fixture';
select is((select count(*) from public.mentor_booking_decision_notes), 2::bigint, 'target and retained booking notes exist before deletion');
select is((select count(*) from public.mentor_booking_requests where startup_organization_id = 'b5000000-0000-0000-0000-000000000001'), 2::bigint, 'target has pending and accepted bookings before deletion');
select is((select count(*) from public.mentor_booking_accepted_occupancy where semester_id = 'b1000000-0000-0000-0000-000000000001'), 1::bigint, 'accepted booking occupancy exists before deletion');
set constraints all immediate;
set constraints all deferred;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.delete_startup_permanently('b5000000-0000-0000-0000-000000000001', 'Delete Me Startup')$$,
  '42501', 'Platform super-administrator access required',
  'a startup founder cannot permanently delete a startup'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.delete_startup_permanently('b5000000-0000-0000-0000-000000000001', 'Wrong Name')$$,
  '22023', 'Startup name confirmation does not match',
  'a super administrator must enter the exact startup name'
);
select throws_ok(
  $$select public.delete_startup_permanently('b5000000-0000-0000-0000-000000000001', null)$$,
  '22023', 'Startup name confirmation does not match',
  'null cannot bypass the exact-name confirmation'
);
select is(
  (select public.delete_startup_permanently('b5000000-0000-0000-0000-000000000001', 'Delete Me Startup')->>'deletedSessions'),
  '1',
  'a super administrator can permanently delete a confirmed startup session'
);
reset role;

set constraints all immediate;
select is((select count(*) from public.startup_organizations where id = 'b5000000-0000-0000-0000-000000000001'), 0::bigint, 'the durable startup organization is deleted');
select is((select count(*) from public.startup_semesters where id = 'b6000000-0000-0000-0000-000000000001'), 0::bigint, 'all cohort participation is deleted');
select is((select count(*) from public.sessions where id = 'b8000000-0000-0000-0000-000000000001'), 0::bigint, 'startup sessions are deleted');
select is((select count(*) from public.session_rsvps where id = 'b9000000-0000-0000-0000-000000000001'), 0::bigint, 'session RSVPs are deleted with the session');
select is((select count(*) from public.profiles where id = 'b2000000-0000-0000-0000-000000000002'), 1::bigint, 'the founder profile remains available for separate deletion');
select is((select count(*) from public.friday_program_assignments where startup_organization_id = 'b5000000-0000-0000-0000-000000000001'), 0::bigint, 'the deleted startup Friday assignments are removed');
select is((select count(*) from public.friday_program_assignments where startup_organization_id = 'b5000000-0000-0000-0000-000000000002'), 1::bigint, 'another startup Friday assignment remains');
select is((select count(*) from public.friday_programs where id = 'ba000000-0000-0000-0000-000000000001'), 1::bigint, 'the shared Friday program remains');
select is((select count(*) from public.startup_organizations where id = 'b5000000-0000-0000-0000-000000000002'), 1::bigint, 'another startup organization remains');
select is((select count(*) from public.mentor_booking_requests where startup_organization_id = 'b5000000-0000-0000-0000-000000000001'), 0::bigint, 'target pending and accepted bookings are deleted');
select is((select count(*) from public.mentor_booking_accepted_occupancy where semester_id = 'b1000000-0000-0000-0000-000000000001'), 0::bigint, 'target accepted occupancy is released');
select is((select count(*) from public.mentor_booking_requests where startup_organization_id = 'b5000000-0000-0000-0000-000000000002'), 1::bigint, 'another startup booking remains');
select is((select count(*) from public.mentor_booking_decision_notes), 1::bigint, 'target booking note is removed while another startup note remains');
select is((select count(*) from public.mentor_booking_meeting_details), 0::bigint, 'target meeting details are removed');
select is((select count(*) from public.mentor_booking_outcomes), 0::bigint, 'target booking outcome is removed');
select is((select count(*) from public.mentor_weekly_availability where mentor_semester_id = 'b4000000-0000-0000-0000-000000000001'), 1::bigint, 'mentor weekly availability remains');

-- Deleting the final startup retains an empty program and must also commit
-- without suppressing the deferred publication validator.
set constraints all deferred;
update public.semesters set is_active = false where id = 'b1000000-0000-0000-0000-000000000001';
update public.semester_memberships set status = 'alumni' where semester_id = 'b1000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.delete_startup_permanently('b5000000-0000-0000-0000-000000000002', 'Keep Me Startup');
reset role;
set constraints all immediate;
set constraints all deferred;
set local role authenticated;
select public.delete_startup_permanently('b5000000-0000-0000-0000-000000000003', 'Third Startup');
reset role;
set constraints all immediate;
select is((select count(*) from public.friday_programs where id = 'ba000000-0000-0000-0000-000000000001'), 1::bigint, 'deleting the final startup preserves the shared program');
select is((select startup_count from public.friday_programs where id = 'ba000000-0000-0000-0000-000000000001'), 0, 'the empty shared program records zero startups');
select is((select count(*) from public.friday_program_assignments where program_id = 'ba000000-0000-0000-0000-000000000001'), 0::bigint, 'the empty shared program has no assignments');

select * from finish();
rollback;
