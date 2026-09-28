begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

select has_table('public', 'mentor_booking_accepted_occupancy', 'accepted occupancy has a privacy-safe relation');
select has_column('public', 'mentor_booking_accepted_occupancy', 'semester_id', 'accepted occupancy is semester scoped');
select has_column('public', 'mentor_booking_accepted_occupancy', 'mentor_semester_id', 'accepted occupancy identifies only the mentor membership');
select has_column('public', 'mentor_booking_accepted_occupancy', 'starts_at', 'accepted occupancy exposes its start');
select has_column('public', 'mentor_booking_accepted_occupancy', 'ends_at', 'accepted occupancy exposes its end');
select ok(
  coalesce((select not has_table_privilege('anon', oid, 'SELECT') from pg_class where oid = to_regclass('public.mentor_booking_accepted_occupancy')), false),
  'anonymous callers cannot read accepted occupancy'
);
select ok(
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.mentor_booking_accepted_occupancy')), false),
  'accepted occupancy enforces RLS'
);

insert into public.semesters (id,name,start_date,end_date,lifecycle_status,is_active,configuration)
values ('c1000000-0000-4000-8000-000000000001','Occupancy cohort','2099-01-01','2099-06-01','active',true,'{"timezone":"America/New_York"}');
insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('c2000000-0000-4000-8000-000000000001','authenticated','authenticated','occupancy-mentor@example.test','{}','{}'),
('c2000000-0000-4000-8000-000000000002','authenticated','authenticated','occupancy-startup@example.test','{}','{}');
insert into public.profiles (id,auth_user_id,email,role,status,is_active,full_name) values
('c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','occupancy-mentor@example.test','mentor','approved',true,'Occupancy Mentor'),
('c2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000002','occupancy-startup@example.test','startup','approved',true,'Occupancy Startup');
insert into public.semester_memberships (id,semester_id,profile_id,role,status,activated_at) values
('c3000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','mentor','active',now()),
('c3000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002','startup','active',now());
insert into public.mentor_semesters (id,semester_id,semester_membership_id)
values ('c4000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001');
-- Acceptance now rechecks actual availability. Give this fixture working hours
-- covering the requested appointment instead of relying on the old unchecked path.
insert into public.mentor_weekly_availability(semester_id,mentor_semester_id,weekday,starts_at,ends_at)
select 'c1000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001',
  extract(dow from timestamptz '2099-02-01T15:00:00Z' at time zone 'America/New_York')::smallint,
  time '09:00',time '17:00';
insert into public.startup_organizations (id,name,slug)
values ('c5000000-0000-4000-8000-000000000001','Occupancy Startup','occupancy-startup');
insert into public.startup_semesters (id,semester_id,startup_organization_id)
values ('c6000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001');
insert into public.startup_team_memberships (id,semester_id,startup_semester_id,semester_membership_id)
values ('c6500000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000002');

alter table public.mentor_booking_requests disable trigger guard_mentor_booking_requests;
alter table public.mentor_booking_requests disable trigger z_calendar_booking_freshness;
insert into public.mentor_booking_requests (
  id,semester_id,mentor_semester_id,mentor_profile_id,mentor_name,startup_semester_id,
  startup_organization_id,startup_name,requested_by_profile_id,topic,status,starts_at,ends_at
) values (
  'c7000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Occupancy Mentor',
  'c6000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','Private Startup',
  'c2000000-0000-4000-8000-000000000002','Private topic','pending','2099-02-01T15:00:00Z','2099-02-01T15:15:00Z'
);
select is((select count(*) from public.mentor_booking_accepted_occupancy where request_id='c7000000-0000-4000-8000-000000000001'),0::bigint,'pending requests do not block availability');

alter table public.mentor_booking_requests enable trigger guard_mentor_booking_requests;
alter table public.mentor_booking_requests enable trigger z_calendar_booking_freshness;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.respond_to_mentor_booking_request('c1000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001','accepted'),'accepted','owning mentor accepts the request');
reset role;
select is((select count(*) from public.mentor_booking_accepted_occupancy where request_id='c7000000-0000-4000-8000-000000000001'),1::bigint,'acceptance transactionally creates occupancy');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.mentor_booking_accepted_occupancy where request_id='c7000000-0000-4000-8000-000000000001'),1::bigint,'active startups can see safe mentor occupancy');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name='mentor_booking_accepted_occupancy'),5::bigint,'safe occupancy exposes no startup identity or topic columns');
delete from public.mentor_booking_accepted_occupancy where request_id='c7000000-0000-4000-8000-000000000001';
select is((select count(*) from public.mentor_booking_accepted_occupancy where request_id='c7000000-0000-4000-8000-000000000001'),1::bigint,'a startup cannot prematurely release accepted occupancy');

select is(public.cancel_mentor_booking_request('c1000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001'),'cancelled','requesting startup cancels the accepted request');
reset role;
select is((select count(*) from public.mentor_booking_accepted_occupancy where request_id='c7000000-0000-4000-8000-000000000001'),0::bigint,'cancellation transactionally releases occupancy');

select * from finish();
rollback;
