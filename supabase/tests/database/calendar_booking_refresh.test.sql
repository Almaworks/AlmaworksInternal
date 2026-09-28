begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(17);

update public.semesters set is_active = false where is_active;
insert into public.semesters (id,name,start_date,end_date,lifecycle_status,is_active,configuration) values
('b1000000-0000-4000-8000-000000000001','Booking cohort','2099-01-01','2099-06-01','active',true,'{"timezone":"America/New_York"}'),
('b1000000-0000-4000-8000-000000000002','Other cohort','2099-01-01','2099-06-01','active',false,'{}');

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('b2000000-0000-4000-8000-000000000001','authenticated','authenticated','booking-mentor-1@example.test','{}','{}'),
('b2000000-0000-4000-8000-000000000002','authenticated','authenticated','booking-mentor-2@example.test','{}','{}'),
('b2000000-0000-4000-8000-000000000003','authenticated','authenticated','booking-startup-1@example.test','{}','{}'),
('b2000000-0000-4000-8000-000000000004','authenticated','authenticated','booking-startup-2@example.test','{}','{}'),
('b2000000-0000-4000-8000-000000000005','authenticated','authenticated','booking-startup-3@example.test','{}','{}'),
('b2000000-0000-4000-8000-000000000006','authenticated','authenticated','booking-admin@example.test','{}','{}'),
('b2000000-0000-4000-8000-000000000007','authenticated','authenticated','booking-other@example.test','{}','{}');

insert into public.profiles (id,auth_user_id,email,role,status,is_active,full_name)
select id,id,email,case when email like '%mentor%' then 'mentor'::public.user_role when email like '%admin%' then 'admin'::public.user_role else 'startup'::public.user_role end,'approved',true,
case id when 'b2000000-0000-4000-8000-000000000001' then 'Mentor One' when 'b2000000-0000-4000-8000-000000000002' then 'Mentor Two' else split_part(email,'@',1) end
from auth.users where id::text like 'b2000000-%';

insert into public.semester_memberships (id,semester_id,profile_id,role,status,activated_at) values
('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','mentor','active',now()),
('b3000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','mentor','active',now()),
('b3000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000003','startup','active',now()),
('b3000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000004','startup','active',now()),
('b3000000-0000-4000-8000-000000000005','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000005','startup','active',now()),
('b3000000-0000-4000-8000-000000000006','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000006','admin','active',now()),
('b3000000-0000-4000-8000-000000000007','b1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000007','startup','active',now());

insert into public.mentor_semesters (id,semester_id,semester_membership_id) values
('b4000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001'),
('b4000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002');

insert into public.startup_organizations (id,name,slug) values
('b5000000-0000-4000-8000-000000000001','Startup One','booking-startup-one'),
('b5000000-0000-4000-8000-000000000002','Startup Two','booking-startup-two'),
('b5000000-0000-4000-8000-000000000003','Startup Three','booking-startup-three'),
('b5000000-0000-4000-8000-000000000004','Other Startup','booking-other');
insert into public.startup_semesters (id,semester_id,startup_organization_id) values
('b6000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001'),
('b6000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000002'),
('b6000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000003'),
('b6000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000002','b5000000-0000-4000-8000-000000000004');
insert into public.startup_team_memberships (id,semester_id,startup_semester_id,semester_membership_id) values
('b7000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000003'),
('b7000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000004'),
('b7000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000005'),
('b7000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000002','b6000000-0000-4000-8000-000000000004','b3000000-0000-4000-8000-000000000007');

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values ('b2000000-0000-4000-8000-000000000008','authenticated','authenticated','refresh-worker@example.test','{}','{}');
insert into private.calendar_worker_identities(auth_user_id,enabled)
values ('b2000000-0000-4000-8000-000000000008',true);
insert into public.google_calendar_connections(id,profile_id,provider_subject,account_email,status)
values ('be000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','refresh-test','refresh@example.test','connected');
insert into private.google_calendar_credentials(connection_id,refresh_token_ciphertext)
values ('be000000-0000-4000-8000-000000000001',repeat('encrypted-fixture',3));
insert into public.mentor_calendar_settings(semester_id,mentor_semester_id,mode,time_zone,connection_id,last_success_at)
values ('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','synced','UTC','be000000-0000-4000-8000-000000000001',now()-interval '1 minute');
insert into public.mentor_weekly_availability(semester_id,mentor_semester_id,weekday,starts_at,ends_at)
select 'b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',day,time '09:00',time '17:00' from generate_series(0,6) day;
insert into private.google_calendar_busy_snapshots(semester_id,mentor_semester_id,connection_id,coverage_start,coverage_end,fetched_at)
values ('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','be000000-0000-4000-8000-000000000001','2099-02-01T00:00:00Z','2099-02-02T00:00:00Z',now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select ok(public.calendar_booking_refresh_required('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001'),'one-minute synced cache requires a booking refresh');
select throws_ok($$update public.mentor_calendar_settings set last_success_at=now()
  where semester_id='b1000000-0000-4000-8000-000000000001'$$,'42501',null,'participant cannot forge a fresh provider check');
select throws_ok($$select public.request_mentor_booking('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','2099-02-01T15:00:00Z','2099-02-01T15:15:00Z','Refresh me')$$,'55000','Refresh Calendar before requesting or accepting this time','direct request cannot bypass freshness');
select throws_ok($$select * from public.calendar_lease_booking_sync('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001')$$,'42501','Calendar worker required','participant cannot lease encrypted credentials');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select throws_ok($$select public.calendar_booking_refresh_required('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001')$$,'42501',null,'different cohort cannot inspect booking freshness');
reset role;
update public.mentor_calendar_settings set last_success_at=now();
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select ok(not public.calendar_booking_refresh_required('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001'),'fresh sync is ready for booking');
select set_config('test.refresh_request',public.request_mentor_booking('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','2099-02-01T15:00:00Z','2099-02-01T15:15:00Z','Fresh request')::text,true);
select is((select status from public.mentor_booking_requests where id=current_setting('test.refresh_request')::uuid),'pending','fresh request is saved');
reset role;
update public.mentor_calendar_settings set last_success_at=now()-interval '1 minute';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok(format('select public.respond_to_mentor_booking_request(%L,%L,%L)','b1000000-0000-4000-8000-000000000001',current_setting('test.refresh_request'),'accepted'),'55000','Refresh Calendar before requesting or accepting this time','direct acceptance cannot bypass freshness');
reset role;
update public.mentor_calendar_settings set last_success_at=now();
set local role authenticated;
select is(public.respond_to_mentor_booking_request('b1000000-0000-4000-8000-000000000001',current_setting('test.refresh_request')::uuid,'accepted'),'accepted','fresh acceptance succeeds');
reset role;
update public.mentor_calendar_settings set last_success_at=now()+interval '1 minute';
set local role authenticated;
select ok(public.calendar_booking_refresh_required('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001'),'future freshness timestamp is rejected');
reset role;
update public.mentor_calendar_settings set mode='weekly',last_success_at=null;
set local role authenticated;
select ok(not public.calendar_booking_refresh_required('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001'),'weekly availability does not require Google');
reset role;
update public.mentor_calendar_settings set mode='manual';
set local role authenticated;
select ok(not public.calendar_booking_refresh_required('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001'),'manual import does not require Google');
reset role;
update public.mentor_calendar_settings set mode='synced';
update private.google_calendar_sync_jobs set run_after=now()+interval '5 minutes';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select is((select count(*) from public.calendar_lease_booking_sync('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001')),1::bigint,'booking leases its specific mentor without waiting for the periodic timer');
select is((select count(*) from public.calendar_lease_booking_sync('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001')),0::bigint,'booking cannot steal a live sync lease');
select is((select count(*) from public.calendar_lease_booking_sync('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000002')),0::bigint,'targeted lease never returns an unrelated mentor');
reset role;
update private.google_calendar_sync_jobs set leased_until=now()-interval '1 second';
update private.google_calendar_hold_jobs set lease_token=gen_random_uuid(),leased_until=now()+interval '1 minute';
set local role authenticated;
select is((select count(*) from public.calendar_lease_booking_sync('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001')),0::bigint,'booking waits for a live hold credential lease');
reset role;
select ok(not has_schema_privilege('calendar_sql_internal','private','CREATE'),'booking RPC setup removes temporary schema CREATE privilege');
select * from finish();
rollback;
