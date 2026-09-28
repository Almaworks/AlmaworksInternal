begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
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
insert into public.google_calendar_connections(id,profile_id,provider_subject,account_email,status)
values ('d5000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','google-sub','mentor@example.test','connected');
insert into public.mentor_calendar_settings(semester_id,mentor_semester_id,mode,time_zone,connection_id,last_success_at)
values ('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','synced','America/New_York','d5000000-0000-4000-8000-000000000001',now());
insert into public.mentor_weekly_availability(semester_id,mentor_semester_id,weekday,starts_at,ends_at)
values ('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001',1,'09:00','17:00');
insert into private.google_calendar_busy_snapshots(id,semester_id,mentor_semester_id,connection_id,coverage_start,coverage_end,fetched_at)
values ('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','2099-03-02 13:00Z','2099-03-03 00:00Z',now()-interval '1 hour');
insert into private.google_calendar_busy_intervals(semester_id,snapshot_id,starts_at,ends_at)
values ('d1000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001','2099-03-02 15:00Z','2099-03-02 15:15Z');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(jsonb_array_length(public.calendar_owner_week('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','2099-03-01')->'busy'),1,'owner sees busy interval');
select is((public.calendar_owner_week('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','2099-03-01')->>'weekStart'),'2099-03-01','week normalized to Sunday');
select ok(not (public.calendar_owner_week('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','2099-03-01')::text like '%mentor@example%'),'view contains no provider identity');
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.calendar_owner_week('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','2099-03-01')$$,'42501','Only the owning mentor can read this calendar','startup cannot view private busy blocks');
reset role;
select ok(not has_function_privilege('anon','public.calendar_owner_week(uuid,uuid,date)','EXECUTE'),'anonymous has no calendar access');
select * from finish();
rollback;
