begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
update public.semesters set is_active=false where is_active;

insert into public.semesters(id,name,start_date,end_date,lifecycle_status,is_active,configuration)
values ('d1000000-0000-4000-8000-000000000001','Calendar cohort','2099-01-01','2099-06-01','active',true,'{"timezone":"America/New_York"}');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('d2000000-0000-4000-8000-000000000001','authenticated','authenticated','calendar-mentor@example.test','{}','{}'),
('d2000000-0000-4000-8000-000000000002','authenticated','authenticated','calendar-startup@example.test','{}','{}'),
('d2000000-0000-4000-8000-000000000003','authenticated','authenticated','calendar-worker@example.test','{}','{}');
insert into public.profiles(id,auth_user_id,email,role,status,is_active,full_name) values
('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','calendar-mentor@example.test','mentor','approved',true,'Calendar Mentor'),
('d2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002','calendar-startup@example.test','startup','approved',true,'Calendar Startup');
insert into public.semester_memberships(id,semester_id,profile_id,role,status,activated_at) values
('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','mentor','active',now()),
('d3000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','startup','active',now());
insert into public.mentor_semesters(id,semester_id,semester_membership_id)
values ('d4000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001');
insert into private.calendar_worker_identities(auth_user_id,enabled) values ('d2000000-0000-4000-8000-000000000003',true);

insert into public.mentor_weekly_availability(semester_id,mentor_semester_id,weekday,starts_at,ends_at)
values ('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001',1,'09:00','17:00');

-- Exercise the real worker RPC sequence, never insert a successful callback directly.

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('test.flow', (select transaction_id::text from public.calendar_begin_oauth('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','state-fixture-1xxxxxxxxxxxxxxxxxxxxxxxxx','encrypted-verifier-fixture',now()+interval '10 minutes')),true);
select * from public.calendar_consume_oauth('state-fixture-1xxxxxxxxxxxxxxxxxxxxxxxxx','d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001');
select public.calendar_complete_oauth(current_setting('test.flow')::uuid,'google-fixture-d2000000-0000-4000-8000-000000000001','fixture@example.test','primary','encrypted-refresh-token-fixture',null,null);
reset role;

select is((select mode from public.mentor_calendar_settings),'synced','first mentor connection automatically enables sync');
select is((select time_zone from public.mentor_calendar_settings),'America/New_York','initial settings use program timezone');
select is((select connection_id from public.mentor_calendar_settings),
  (select id from public.google_calendar_connections where profile_id='d2000000-0000-4000-8000-000000000001'),'settings bind own connection');
select is((select count(*) from private.google_calendar_sync_jobs),1::bigint,'first connection queues an immediate sync');
select ok((select last_success_at is null from public.mentor_calendar_settings),'connection does not pretend Google sync already succeeded');
select is((select starts_at::text||'-'||ends_at::text from public.mentor_weekly_availability),'09:00:00-17:00:00','existing hours are retained');

update public.mentor_calendar_settings set mode='weekly',connection_id=null,time_zone='Europe/London';
set local role authenticated;
select set_config('test.flow', (select transaction_id::text from public.calendar_begin_oauth('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','state-fixture-2xxxxxxxxxxxxxxxxxxxxxxxxx','encrypted-verifier-fixture',now()+interval '10 minutes')),true);
select * from public.calendar_consume_oauth('state-fixture-2xxxxxxxxxxxxxxxxxxxxxxxxx','d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001');
select public.calendar_complete_oauth(current_setting('test.flow')::uuid,'google-fixture-d2000000-0000-4000-8000-000000000001','fixture@example.test','primary','encrypted-refresh-token-fixture',null,null);
reset role;
select is((select mode from public.mentor_calendar_settings),'weekly','reconnect preserves an explicit weekly preference');
select is((select time_zone from public.mentor_calendar_settings),'Europe/London','reconnect preserves the chosen timezone');
update public.mentor_calendar_settings set mode='manual';
set local role authenticated;
select set_config('test.flow', (select transaction_id::text from public.calendar_begin_oauth('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','state-fixture-3xxxxxxxxxxxxxxxxxxxxxxxxx','encrypted-verifier-fixture',now()+interval '10 minutes')),true);
select * from public.calendar_consume_oauth('state-fixture-3xxxxxxxxxxxxxxxxxxxxxxxxx','d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001');
select public.calendar_complete_oauth(current_setting('test.flow')::uuid,'google-fixture-d2000000-0000-4000-8000-000000000001','fixture@example.test','primary','encrypted-refresh-token-fixture',null,null);
select set_config('test.flow', (select transaction_id::text from public.calendar_begin_oauth('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','state-fixture-4xxxxxxxxxxxxxxxxxxxxxxxxx','encrypted-verifier-fixture',now()+interval '10 minutes')),true);
select * from public.calendar_consume_oauth('state-fixture-4xxxxxxxxxxxxxxxxxxxxxxxxx','d2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001');
select public.calendar_complete_oauth(current_setting('test.flow')::uuid,'google-fixture-d2000000-0000-4000-8000-000000000002','fixture@example.test','primary','encrypted-refresh-token-fixture',null,null);
reset role;
select is((select mode from public.mentor_calendar_settings),'manual','reconnect preserves manual imports');
select is((select count(*) from public.mentor_calendar_settings),1::bigint,'startup connection creates no mentor settings');

delete from public.mentor_calendar_settings;
delete from public.mentor_weekly_availability;
update public.semester_memberships set status='onboarding' where role='mentor';
set local role authenticated;
select set_config('test.flow', (select transaction_id::text from public.calendar_begin_oauth('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','state-fixture-5xxxxxxxxxxxxxxxxxxxxxxxxx','encrypted-verifier-fixture',now()+interval '10 minutes')),true);
select * from public.calendar_consume_oauth('state-fixture-5xxxxxxxxxxxxxxxxxxxxxxxxx','d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001');
select public.calendar_complete_oauth(current_setting('test.flow')::uuid,'google-fixture-d2000000-0000-4000-8000-000000000001','fixture@example.test','primary','encrypted-refresh-token-fixture',null,null);
reset role;
select is((select mode from public.mentor_calendar_settings),'synced','onboarding mentor also receives initial sync setup');
select is((select count(*) from public.mentor_weekly_availability),0::bigint,'first connection never invents working hours');
select ok(not has_schema_privilege('calendar_sql_internal','private','CREATE'),'initialization leaves no schema creation privilege');
select * from finish();
rollback;


