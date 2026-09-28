begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(24);

-- Regression gate for generated migration engines that omit column/function ACLs.
select is(has_table_privilege('anon', 'public.mentor_booking_meeting_details', 'SELECT'), false, 'anonymous cannot read meeting details');
select is(has_column_privilege('authenticated', 'public.mentor_booking_meeting_details', 'location', 'UPDATE'), true, 'authenticated has the narrow location update grant');
select is(has_column_privilege('authenticated', 'public.mentor_booking_meeting_details', 'request_id', 'UPDATE'), false, 'authenticated cannot retarget meeting details');
select is(has_function_privilege('anon', 'public.transition_mentor_booking_with_note(uuid,uuid,text,text,text)', 'EXECUTE'), false, 'anonymous cannot call the transition');
select is(has_function_privilege('authenticated', 'public.transition_mentor_booking_with_note(uuid,uuid,text,text,text)', 'EXECUTE'), true, 'authenticated can call the invoker transition');

insert into public.semesters(id,name,start_date,end_date,lifecycle_status,is_active,configuration) values
  ('c1000000-0000-4000-8000-000000000001','Context cohort','2020-01-01','2099-12-31','active',true,'{}'),
  ('c1000000-0000-4000-8000-000000000002','Other context cohort','2020-01-01','2099-12-31','active',false,'{}');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
  ('c2000000-0000-4000-8000-000000000001','authenticated','authenticated','context-mentor@example.test','{}','{}'),
  ('c2000000-0000-4000-8000-000000000002','authenticated','authenticated','context-startup@example.test','{}','{}'),
  ('c2000000-0000-4000-8000-000000000003','authenticated','authenticated','context-outsider@example.test','{}','{}'),
  ('c2000000-0000-4000-8000-000000000004','authenticated','authenticated','context-admin@example.test','{}','{}');
insert into public.profiles(id,auth_user_id,email,role,status,is_active,full_name) values
  ('c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','context-mentor@example.test','mentor','approved',true,'Context Mentor'),
  ('c2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000002','context-startup@example.test','startup','approved',true,'Context Founder'),
  ('c2000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000003','context-outsider@example.test','startup','approved',true,'Other Founder'),
  ('c2000000-0000-4000-8000-000000000004','c2000000-0000-4000-8000-000000000004','context-admin@example.test','admin','approved',true,'Context Admin');
insert into public.semester_memberships(id,semester_id,profile_id,role,status,activated_at) values
  ('c3000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','mentor','active',now()),
  ('c3000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002','startup','active',now()),
  ('c3000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000003','startup','active',now()),
  ('c3000000-0000-4000-8000-000000000004','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000004','admin','active',now());
insert into public.mentor_semesters(id,semester_id,semester_membership_id) values
  ('c4000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001');
insert into public.startup_organizations(id,name,slug) values
  ('c5000000-0000-4000-8000-000000000001','Context Startup','context-startup'),
  ('c5000000-0000-4000-8000-000000000002','Other Startup','context-other-startup');
insert into public.startup_semesters(id,semester_id,startup_organization_id) values
  ('c6000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001'),
  ('c6000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002');
insert into public.startup_team_memberships(id,semester_id,startup_semester_id,semester_membership_id) values
  ('c7000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000002'),
  ('c7000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000003');

-- Fixture dates are independent of the clock. Booking trigger guards are
-- disabled only while seeding valid, linked history; tests exercise context RLS.
alter table public.mentor_booking_windows disable trigger user;
insert into public.mentor_booking_windows(id,semester_id,mentor_semester_id,mentor_profile_id,mentor_name,starts_at,ends_at) values
  ('c8000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Context Mentor',now()-interval '2 days',now()-interval '2 days'+interval '30 minutes'),
  ('c8000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Context Mentor',now()+interval '2 days',now()+interval '2 days'+interval '30 minutes'),
  ('c8000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Context Mentor',now()+interval '3 days',now()+interval '3 days'+interval '30 minutes');
alter table public.mentor_booking_windows enable trigger user;
alter table public.mentor_booking_requests disable trigger user;
insert into public.mentor_booking_requests(id,semester_id,window_id,mentor_semester_id,mentor_profile_id,mentor_name,startup_semester_id,startup_organization_id,startup_name,requested_by_profile_id,topic,status,starts_at,ends_at,responded_at) values
  ('c9000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Context Mentor','c6000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','Context Startup','c2000000-0000-4000-8000-000000000002','Past meeting','accepted',now()-interval '2 days',now()-interval '2 days'+interval '30 minutes',now()-interval '3 days'),
  ('c9000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Context Mentor','c6000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','Context Startup','c2000000-0000-4000-8000-000000000002','Future meeting','accepted',now()+interval '2 days',now()+interval '2 days'+interval '30 minutes',now()),
  ('c9000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Context Mentor','c6000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','Context Startup','c2000000-0000-4000-8000-000000000002','Pending request','pending',now()+interval '3 days',now()+interval '3 days'+interval '30 minutes',null);
alter table public.mentor_booking_requests enable trigger user;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.mentor_booking_meeting_details(semester_id,request_id,location,video_url,updated_by_profile_id) values
  ('c1000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000002','Library','https://meet.example.test/room','c2000000-0000-4000-8000-000000000001');
select is((select location from public.mentor_booking_meeting_details where request_id='c9000000-0000-4000-8000-000000000002'),'Library','mentor saves shared meeting location');
select throws_ok($$insert into public.mentor_booking_meeting_details(semester_id,request_id,video_url,updated_by_profile_id) values('c1000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','javascript:alert(1)','c2000000-0000-4000-8000-000000000001')$$,'23514',null,'database rejects non-http video URLs');
select throws_ok($$insert into public.mentor_booking_meeting_details(semester_id,request_id,video_url,updated_by_profile_id) values('c1000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','https://name:secret@meet.example.test/room','c2000000-0000-4000-8000-000000000001')$$,'23514',null,'database rejects credentials in video URL');
select throws_ok($$insert into public.mentor_booking_meeting_details(semester_id,request_id,updated_by_profile_id) values('c1000000-0000-4000-8000-000000000002','c9000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001')$$,'42501',null,'semester mismatch cannot attach meeting details');
select throws_ok($$insert into public.mentor_booking_outcomes(semester_id,request_id,reporter_profile_id,attendance) values('c1000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','attended')$$,'42501',null,'future accepted meeting cannot receive outcome');
insert into public.mentor_booking_outcomes(semester_id,request_id,reporter_profile_id,attendance,feedback) values
  ('c1000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','attended','Shared mentor reflection');
select is((select attendance from public.mentor_booking_outcomes where reporter_profile_id='c2000000-0000-4000-8000-000000000001'),'attended','mentor reports own outcome');
select throws_ok($$select public.transition_mentor_booking_with_note('c1000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000003','declined','   ',null)$$,'22023',null,'blank note rejects transition');
select is((select status from public.mentor_booking_requests where id='c9000000-0000-4000-8000-000000000003'),'pending','invalid note leaves booking pending atomically');
select is(public.transition_mentor_booking_with_note('c1000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000003','declined','Unavailable','Next week'),'declined','mentor declines with note');
select is((select note from public.mentor_booking_decision_notes where request_id='c9000000-0000-4000-8000-000000000003'),'Unavailable','decision note persisted with transition');
select throws_ok($$select public.transition_mentor_booking_with_note('c1000000-0000-4000-8000-000000000002','c9000000-0000-4000-8000-000000000003','declined','Wrong term',null)$$,'P0002',null,'mismatched semester cannot locate booking');

select set_config('request.jwt.claims','{"sub":"c2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into public.mentor_booking_outcomes(semester_id,request_id,reporter_profile_id,attendance) values
  ('c1000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002','missed');
select is((select attendance from public.mentor_booking_outcomes where reporter_profile_id='c2000000-0000-4000-8000-000000000002'),'missed','startup reports its own outcome');
update public.mentor_booking_outcomes set attendance='missed' where reporter_profile_id='c2000000-0000-4000-8000-000000000001';
select is((select attendance from public.mentor_booking_outcomes where reporter_profile_id='c2000000-0000-4000-8000-000000000001'),'attended','startup cannot overwrite mentor report');
select throws_ok($$insert into public.mentor_booking_outcomes(semester_id,request_id,reporter_profile_id,attendance) values('c1000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','missed')$$,'42501',null,'startup cannot impersonate mentor report');

select set_config('request.jwt.claims','{"sub":"c2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.mentor_booking_meeting_details),0::bigint,'unrelated startup cannot read meeting details');
select is((select count(*) from public.mentor_booking_outcomes),0::bigint,'unrelated startup cannot read outcomes');
select is((select count(*) from public.mentor_booking_decision_notes),0::bigint,'unrelated startup cannot read decision notes');
select throws_ok($$insert into public.mentor_booking_meeting_details(semester_id,request_id,updated_by_profile_id) values('c1000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000003')$$,'42501',null,'unrelated startup cannot attach details by request ID');
select throws_ok($$insert into public.mentor_booking_outcomes(semester_id,request_id,reporter_profile_id,attendance) values('c1000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000003','attended')$$,'42501',null,'unrelated startup cannot report by request ID');

reset role;
select * from finish();
rollback;
