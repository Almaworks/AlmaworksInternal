begin;

create extension if not exists pgtap with schema extensions;
select plan(36);
-- At this run's time, Honolulu is still Friday while a Kiritimati Friday slot
-- has finished. On other weekdays the conditional fixture stays absent.
set local timezone to 'Pacific/Honolulu';

-- Two semesters keep the target's past and future records distinct. Every row
-- rolls back with this test; only the deletion RPCs exercise production guards.
insert into public.semesters(id,name,start_date,end_date,lifecycle_status,is_active) values
  ('d1000000-0000-4000-8000-000000000001','Deletion future','2099-01-01','2099-06-01','draft',false),
  ('d1000000-0000-4000-8000-000000000002','Deletion past','2025-01-01','2025-06-01','closed',false);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
  ('d2000000-0000-4000-8000-000000000001','authenticated','authenticated','booking-deletion-admin@example.test','{}','{}'),
  ('d2000000-0000-4000-8000-000000000002','authenticated','authenticated','booking-deletion-target@example.test','{}','{}'),
  ('d2000000-0000-4000-8000-000000000003','authenticated','authenticated','booking-deletion-other@example.test','{}','{}'),
  ('d2000000-0000-4000-8000-000000000004','authenticated','authenticated','booking-deletion-startup@example.test','{}','{}');
insert into public.profiles(id,auth_user_id,email,full_name,role,status) values
  ('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','booking-deletion-admin@example.test','Deletion Admin','admin','approved'),
  ('d2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002','booking-deletion-target@example.test','Deletion Target','mentor','approved'),
  ('d2000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000003','booking-deletion-other@example.test','Other Mentor','mentor','approved'),
  ('d2000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-000000000004','booking-deletion-startup@example.test','Startup Member','startup','approved');
insert into public.platform_roles(profile_id,role,granted_by)
values('d2000000-0000-4000-8000-000000000001','super_admin','d2000000-0000-4000-8000-000000000001');
insert into public.semester_memberships(id,semester_id,profile_id,role,status) values
  ('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','mentor','active'),
  ('d3000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002','mentor','alumni'),
  ('d3000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000003','mentor','active'),
  ('d3000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000004','startup','active'),
  ('d3000000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000004','startup','alumni');
insert into public.mentor_semesters(id,semester_id,semester_membership_id) values
  ('d4000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001'),
  ('d4000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002'),
  ('d4000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000003');
insert into public.startup_organizations(id,name,slug)
values('d5000000-0000-4000-8000-000000000001','Booking Fixture Startup','booking-deletion-fixture');
insert into public.startup_semesters(id,semester_id,startup_organization_id) values
  ('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001'),
  ('d6000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000001');
insert into public.startup_team_memberships(id,semester_id,startup_semester_id,semester_membership_id) values
  ('d7000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000004'),
  ('d7000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','d6000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000005');
insert into public.meetings(id,semester_id,meeting_date,label) values
  ('d8000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','2099-02-06','Future Friday fixture'),
  ('d8000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','2025-02-07','Past Friday fixture');

-- The normal insert guards require currently active semesters and future time.
-- Disable only those guards while creating synthetic historical fixtures.
alter table public.mentor_booking_windows disable trigger guard_mentor_booking_windows;
insert into public.mentor_booking_windows(id,semester_id,mentor_semester_id,mentor_profile_id,mentor_name,starts_at,ends_at) values
  ('d9000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','Deletion Target','2099-02-02T15:00:00Z','2099-02-02T15:15:00Z'),
  ('d9000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002','Deletion Target','2025-02-03T15:00:00Z','2025-02-03T15:15:00Z'),
  ('d9000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','Deletion Target','2099-02-03T15:00:00Z','2099-02-03T15:15:00Z'),
  ('d9000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000003','Other Mentor','2099-02-02T16:00:00Z','2099-02-02T16:15:00Z');
alter table public.mentor_booking_windows enable trigger guard_mentor_booking_windows;
alter table public.mentor_booking_requests disable trigger guard_mentor_booking_requests;
alter table public.mentor_booking_requests disable trigger z_calendar_booking_freshness;
insert into public.mentor_booking_requests(id,semester_id,window_id,mentor_semester_id,mentor_profile_id,mentor_name,startup_semester_id,startup_organization_id,startup_name,requested_by_profile_id,topic,status,starts_at,ends_at,responded_at) values
  ('da000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','Deletion Target','d6000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','Booking Fixture Startup','d2000000-0000-4000-8000-000000000004','Private future topic','accepted','2099-02-02T15:00:00Z','2099-02-02T15:15:00Z',now()),
  ('da000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','d9000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002','Deletion Target','d6000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000001','Booking Fixture Startup','d2000000-0000-4000-8000-000000000004','Private past topic','accepted','2025-02-03T15:00:00Z','2025-02-03T15:15:00Z',now()),
  ('da000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001',null,'d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','Deletion Target','d6000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','Booking Fixture Startup','d2000000-0000-4000-8000-000000000004','Private pending topic','pending','2099-02-04T15:00:00Z','2099-02-04T15:15:00Z',null),
  ('da000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000004','d4000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000003','Other Mentor','d6000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','Booking Fixture Startup','d2000000-0000-4000-8000-000000000004','Other mentor topic','accepted','2099-02-02T16:00:00Z','2099-02-02T16:15:00Z',now());
alter table public.mentor_booking_requests enable trigger guard_mentor_booking_requests;
alter table public.mentor_booking_requests enable trigger z_calendar_booking_freshness;
insert into public.sessions(id,semester_id,meeting_id,mentor_semester_id,startup_semester_id,slot,status,topic,notes) values
  ('db000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001',1,'confirmed','Private future Friday','Private note'),
  ('db000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','d8000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000002','d6000000-0000-4000-8000-000000000002',1,'confirmed','Private past Friday','Private note'),
  ('db000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000003','d6000000-0000-4000-8000-000000000001',2,'confirmed','Other mentor Friday','Other note');

-- Shared booking text blocks even when someone else authored it. Text authored
-- by the target on another mentor's booking also needs review.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('test.booking_clean_version',(select version from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),true);
reset role;
insert into public.mentor_booking_decision_notes(id,semester_id,request_id,kind,note,author_profile_id)
values('de000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000002','declined','Shared explanation','d2000000-0000-4000-8000-000000000003');
set local role authenticated;
select ok((select 'Shared booking notes, logistics, or feedback require a privacy review.'=any(blockers)
  from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),'another author’s note on target booking blocks deletion');
select isnt((select version from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),
  current_setting('test.booking_clean_version'),'new shared text invalidates the prior preview');
reset role;
delete from public.mentor_booking_decision_notes where id='de000000-0000-4000-8000-000000000001';
insert into public.mentor_booking_decision_notes(id,semester_id,request_id,kind,note,author_profile_id)
values('de000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000004','declined','Target authored explanation','d2000000-0000-4000-8000-000000000002');
set local role authenticated;
select ok((select 'Shared booking notes, logistics, or feedback require a privacy review.'=any(blockers)
  from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),'target authored note on another booking blocks deletion');
reset role;
delete from public.mentor_booking_decision_notes where id='de000000-0000-4000-8000-000000000002';
insert into public.mentor_booking_meeting_details(id,semester_id,request_id,location,updated_by_profile_id)
values('df000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000002','Shared location','d2000000-0000-4000-8000-000000000003');
set local role authenticated;
select ok((select 'Shared booking notes, logistics, or feedback require a privacy review.'=any(blockers)
  from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),'meeting logistics on target booking block deletion');
reset role;
delete from public.mentor_booking_meeting_details where id='df000000-0000-4000-8000-000000000001';
insert into public.mentor_booking_outcomes(id,semester_id,request_id,reporter_profile_id,attendance,feedback)
values('e0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-000000000002','attended','Private feedback');
set local role authenticated;
select ok((select 'Shared booking notes, logistics, or feedback require a privacy review.'=any(blockers)
  from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),'target feedback on another booking blocks deletion');
reset role;
update public.mentor_booking_outcomes set feedback=null where id='e0000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select cardinality(blockers) from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),0,
  'attendance without personal feedback remains anonymous history');
reset role;

-- A same-calendar-day Friday slot can already be over in the semester's zone.
-- The row is inserted only when current_date is Friday, respecting the meeting
-- table's Friday constraint during routine weekday runs of this test.
insert into public.semesters(id,name,start_date,end_date,lifecycle_status,is_active,configuration)
select 'd1000000-0000-4000-8000-000000000003','Deletion same-day Friday',current_date-7,current_date+7,
  'draft',false,'{"timezone":"Pacific/Kiritimati"}'::jsonb
where extract(isodow from current_date)=5;
insert into public.semester_memberships(id,semester_id,profile_id,role,status)
select 'd3000000-0000-4000-8000-000000000006','d1000000-0000-4000-8000-000000000003',
  'd2000000-0000-4000-8000-000000000002','mentor','alumni'
where extract(isodow from current_date)=5;
insert into public.mentor_semesters(id,semester_id,semester_membership_id)
select 'd4000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000003',
  'd3000000-0000-4000-8000-000000000006'
where extract(isodow from current_date)=5;
insert into public.startup_semesters(id,semester_id,startup_organization_id)
select 'd6000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000003',
  'd5000000-0000-4000-8000-000000000001'
where extract(isodow from current_date)=5;
insert into public.meetings(id,semester_id,meeting_date,label)
select 'd8000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000003',
  current_date,'Finished same-day Friday'
where extract(isodow from current_date)=5;
insert into public.sessions(id,semester_id,meeting_id,mentor_semester_id,startup_semester_id,slot,status,topic,notes)
select 'db000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000003',
  'd8000000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000004',
  'd6000000-0000-4000-8000-000000000003',1,'confirmed','Finished private Friday','Private note'
where extract(isodow from current_date)=5;

insert into public.google_calendar_connections(id,profile_id,provider_subject,account_email,status)
values ('dc000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002',
  'deletion-provider-fixture','calendar-deletion@example.test','connected');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok((select 'Disconnect Google Calendar and wait for hold cleanup before deleting this member.'=any(blockers)
  from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),
  'connected Calendar must be disconnected before personal deletion');
reset role;
update public.google_calendar_connections set status='disconnecting'
  where id='dc000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok((select 'Disconnect Google Calendar and wait for hold cleanup before deleting this member.'=any(blockers)
  from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),
  'pending Calendar cleanup blocks personal deletion');
reset role;
update public.google_calendar_connections set status='disconnected',disconnected_at=now()
  where id='dc000000-0000-4000-8000-000000000001';
insert into private.google_calendar_oauth_transactions(id,semester_id,profile_id,connection_id,
  state_hash,verifier_ciphertext,expires_at,consumed_at)
values ('dd000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000002','dc000000-0000-4000-8000-000000000001',
  repeat('d',32),repeat('fixture-ciphertext',2),now()+interval '5 minutes',now());
set local role authenticated;
select ok((select 'Wait for the Google Calendar connection attempt to finish before deleting this member.'=any(blockers)
  from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),
  'in-flight Calendar callback blocks deletion even while disconnected');
reset role;
update private.google_calendar_oauth_transactions set expires_at=now()-interval '1 second'
  where id='dd000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select cardinality(blockers) from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),0,
  'finished Calendar disconnect allows personal deletion');
select is((select status from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),'ready','mentor deletion preview is available');
select is((select (counts->>'upcomingMentorMeetings')::integer from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),
  3,'finished same-day Friday slot is absent from upcoming meeting count');
select ok((select exists(select 1 from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002') preview,
  jsonb_array_elements_text(preview.impact->'upcomingMentorMeetings') as meeting(label) where meeting.label like '%2099-02-06%')),
  'impact preview identifies the future Friday session that finalization will cancel');
select set_config('test.deletion_version',(select version from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),true);
reset role;

-- Reschedule an existing pending request without changing the request count.
alter table public.mentor_booking_requests disable trigger guard_mentor_booking_requests;
alter table public.mentor_booking_requests disable trigger z_calendar_booking_freshness;
update public.mentor_booking_requests set starts_at='2099-02-04T16:00:00Z',ends_at='2099-02-04T16:15:00Z'
where id='da000000-0000-4000-8000-000000000003';
alter table public.mentor_booking_requests enable trigger guard_mentor_booking_requests;
alter table public.mentor_booking_requests enable trigger z_calendar_booking_freshness;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select isnt((select version from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),current_setting('test.deletion_version'),'same-count booking reschedule changes preview version');
select throws_ok(format('select * from public.prepare_member_deletion(%L,%L,%L,%L)',
  'd2000000-0000-4000-8000-000000000002','booking-deletion-target@example.test','Synthetic fixture removal',current_setting('test.deletion_version')),
  'PT409','Deletion preview changed; review the impact again','stale same-count preview cannot prepare deletion');
select set_config('test.deletion_version',(select version from public.preview_member_deletion('d2000000-0000-4000-8000-000000000002')),true);
select set_config('test.deletion_operation',(select operation_id from public.prepare_member_deletion(
  'd2000000-0000-4000-8000-000000000002','booking-deletion-target@example.test','Synthetic fixture removal',current_setting('test.deletion_version')))::text,true);
select ok(not has_table_privilege('authenticated','public.member_deletion_operations','select'),
  'operation internals remain hidden from authenticated callers');
reset role;

delete from auth.users where id='d2000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select status from public.finalize_member_deletion('d2000000-0000-4000-8000-000000000002',current_setting('test.deletion_operation')::uuid)),'completed',
  'deletion finalizes with future and past booking history and Friday sessions');
reset role;
set constraints all immediate;
select is((select count(*) from public.google_calendar_connections
  where profile_id='d2000000-0000-4000-8000-000000000002'),0::bigint,
  'personal deletion removes the disconnected Calendar identity');
select is((select count(*) from private.google_calendar_oauth_transactions
  where profile_id='d2000000-0000-4000-8000-000000000002'),0::bigint,
  'personal deletion removes old Calendar consent state');

select is((select status from public.mentor_booking_requests where id='da000000-0000-4000-8000-000000000001'),'cancelled','future accepted booking is cancelled');
select is((select status from public.mentor_booking_requests where id='da000000-0000-4000-8000-000000000003'),'cancelled','future pending booking is cancelled');
select is((select count(*) from public.mentor_booking_accepted_occupancy where request_id='da000000-0000-4000-8000-000000000001'),0::bigint,'future accepted occupancy is released');
select is((select status from public.mentor_booking_requests where id='da000000-0000-4000-8000-000000000002'),'accepted','past accepted booking remains historical');
select is((select mentor_name from public.mentor_booking_requests where id='da000000-0000-4000-8000-000000000002'),'Deleted member','past booking snapshot is anonymized');
select is((select topic from public.mentor_booking_requests where id='da000000-0000-4000-8000-000000000002'),'Private request removed','past booking free text is redacted');
select is((select withdrawn_at is not null from public.mentor_booking_windows where id='d9000000-0000-4000-8000-000000000001'),true,'referenced future window is withdrawn');
select is((select mentor_name from public.mentor_booking_windows where id='d9000000-0000-4000-8000-000000000002'),'Deleted member','referenced past window is anonymized');
select is((select count(*) from public.mentor_booking_windows where id='d9000000-0000-4000-8000-000000000003'),0::bigint,'unreferenced personal window is deleted');
select is((select status from public.sessions where id='db000000-0000-4000-8000-000000000001'),'cancelled','future Friday session is cancelled');
select is((select status from public.sessions where id='db000000-0000-4000-8000-000000000002'),'confirmed','past Friday session remains historical');
select ok(not exists(select 1 from public.sessions where id='db000000-0000-4000-8000-000000000004')
    or (select status='confirmed' from public.sessions where id='db000000-0000-4000-8000-000000000004'),
  'finished same-day Friday session remains historical');
select is((select topic from public.sessions where id='db000000-0000-4000-8000-000000000002'),null::text,'past Friday free text is redacted');
select is((select status from public.mentor_booking_requests where id='da000000-0000-4000-8000-000000000004'),'accepted','other mentor booking is untouched');
select is((select mentor_name from public.mentor_booking_windows where id='d9000000-0000-4000-8000-000000000004'),'Other Mentor','other mentor window is untouched');
select is((select topic from public.sessions where id='db000000-0000-4000-8000-000000000003'),'Other mentor Friday','other mentor Friday session is untouched');
select is((select attendance from public.mentor_booking_outcomes where id='e0000000-0000-4000-8000-000000000001'),
  'attended','non-text attendance remains with anonymized reporter identity');

select * from finish();
rollback;

