begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.semesters(id,name,start_date,end_date,lifecycle_status,is_active)
values ('d1000000-0000-4000-8000-000000000001','Notification worker QA','2099-01-01','2099-06-01','active',true),
       ('d1000000-0000-4000-8000-000000000002','Other cohort','2099-01-01','2099-06-01','draft',false);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('d2000000-0000-4000-8000-000000000001','authenticated','authenticated','notification-mentor@example.test','{}','{}'),
('d2000000-0000-4000-8000-000000000002','authenticated','authenticated','notification-startup@example.test','{}','{}'),
('d2000000-0000-4000-8000-000000000003','authenticated','authenticated','notification-worker@example.test','{}','{}');
insert into public.profiles(id,auth_user_id,email,role,status,is_active,full_name) values
('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','notification-mentor@example.test','mentor','approved',true,'QA Mentor'),
('d2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002','notification-startup@example.test','startup','approved',true,'QA Startup');
insert into public.mentor_profiles(profile_id,biography)
values ('d2000000-0000-4000-8000-000000000001','Test biography');
insert into public.semester_memberships(id,semester_id,profile_id,role,status) values
('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','mentor','active'),
('d3000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','startup','active');
insert into public.mentor_semesters(id,semester_id,semester_membership_id)
values ('d4000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001');
insert into public.startup_organizations(id,name,slug)
values ('d5000000-0000-4000-8000-000000000001','QA Startup','notification-worker-qa-startup');
insert into public.startup_semesters(id,semester_id,startup_organization_id)
values ('d6000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001');
insert into public.startup_team_memberships(id,semester_id,startup_semester_id,semester_membership_id)
values ('d6000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002');

alter table public.mentor_booking_requests disable trigger guard_mentor_booking_requests;
alter table public.mentor_booking_requests disable trigger z_calendar_booking_freshness;
insert into public.mentor_booking_requests(id,semester_id,mentor_semester_id,mentor_profile_id,mentor_name,startup_semester_id,startup_organization_id,startup_name,requested_by_profile_id,topic,status,starts_at,ends_at,requested_at)
values
('d7000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','QA Mentor','d6000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','QA Startup','d2000000-0000-4000-8000-000000000002','Allowed request','pending','2099-02-01T15:00:00Z','2099-02-01T15:30:00Z','2099-01-15T12:00:00Z'),
('d7000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','QA Mentor','d6000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','QA Startup','d2000000-0000-4000-8000-000000000002','Hidden request','pending','2099-02-01T16:00:00Z','2099-02-01T16:30:00Z','2099-01-15T12:05:00Z');
alter table public.mentor_booking_requests enable trigger guard_mentor_booking_requests;
alter table public.mentor_booking_requests enable trigger z_calendar_booking_freshness;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.can_manage_semester('d1000000-0000-4000-8000-000000000001'),false,'startup is not a semester administrator');
select is((select count(*)::int from public.mentor_booking_requests),2,'startup can see its booking requests');
insert into public.notification_deliveries(semester_id,event_kind,source_id,source_version,recipient_profile_id,recipient_email,status)
values ('d1000000-0000-4000-8000-000000000001','booking_requested','d7000000-0000-4000-8000-000000000001','2099-01-15T12:00:00Z','d2000000-0000-4000-8000-000000000001','notification-mentor@example.test','queued');
select is((select count(*)::int from public.notification_deliveries),1,'startup can queue its exact mentor request');
select throws_ok($$insert into public.notification_deliveries(semester_id,event_kind,source_id,source_version,recipient_profile_id,recipient_email,status)
values ('d1000000-0000-4000-8000-000000000001','booking_requested','d7000000-0000-4000-8000-000000000002','2099-01-15T12:00:00Z','d2000000-0000-4000-8000-000000000001','notification-mentor@example.test','queued')$$,'42501','new row violates row-level security policy for table "notification_deliveries"','startup cannot queue mismatched booking version');
update public.notification_deliveries set status='accepted' where source_id='d7000000-0000-4000-8000-000000000001';
select is((select status from public.notification_deliveries where source_id='d7000000-0000-4000-8000-000000000001'),'accepted','startup request path can record provider acceptance');
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.notification_deliveries),0,'mentor cannot impersonate the startup delivery writer');
reset role;
select * from finish();
rollback;
