begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(51);

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

-- The current workflow requests dated fifteen-minute appointments directly.
-- Published-window claims were retired; pending requests do not reserve a slot.
select ok(not prosecdef,'request command preserves caller RLS') from pg_proc where oid='public.request_mentor_booking(uuid,uuid,timestamptz,timestamptz,text)'::regprocedure;
select ok(not prosecdef,'weekly editor preserves caller RLS') from pg_proc where oid='public.replace_mentor_weekly_availability(uuid,jsonb)'::regprocedure;
select ok(not has_function_privilege('anon','public.request_mentor_booking(uuid,uuid,timestamptz,timestamptz,text)','EXECUTE'),'anonymous callers cannot request bookings');
select matches((select pg_get_constraintdef(oid) from pg_constraint where conname='mentor_booking_requests_accepted_mentor_overlap'),'mentor_profile_id WITH =','accepted mentor overlap uses durable identity');
select matches((select pg_get_constraintdef(oid) from pg_constraint where conname='mentor_booking_requests_accepted_startup_overlap'),'startup_organization_id WITH =','accepted startup overlap uses durable company identity');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.replace_mentor_weekly_availability('b1000000-0000-4000-8000-000000000001',
  (select jsonb_agg(jsonb_build_object('weekday',day,'starts_at','09:00','ends_at','17:00')) from generate_series(0,6) day))$$,'mentor saves weekly working hours');
select is((select count(*) from public.mentor_weekly_availability where mentor_semester_id='b4000000-0000-4000-8000-000000000001'),7::bigint,'weekly hours persist for the owning mentor');
select throws_ok($$select public.replace_mentor_weekly_availability('b1000000-0000-4000-8000-000000000002','[]')$$,'42501',null,'mentor cannot edit a different cohort');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.replace_mentor_weekly_availability('b1000000-0000-4000-8000-000000000001',
  (select jsonb_agg(jsonb_build_object('weekday',day,'starts_at','09:00','ends_at','17:00')) from generate_series(0,6) day));

select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.replace_mentor_weekly_availability('b1000000-0000-4000-8000-000000000001','[]')$$,'42501',null,'startup cannot change mentor hours');
select throws_ok($$select public.request_mentor_booking('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','2099-02-06T20:00:00Z','2099-02-06T20:15:00Z','Friday')$$,'22023',null,'Friday program time cannot be booked');
select set_config('test.request30',public.request_mentor_booking('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','2099-02-01T15:00:00Z','2099-02-01T15:30:00Z','Thirty minutes')::text,true);
select is((select ends_at-starts_at from public.mentor_booking_requests where id=current_setting('test.request30')::uuid),interval '30 minutes','startup may request a contiguous thirty-minute appointment');
select throws_ok($$select public.request_mentor_booking('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','2099-02-01T15:00:00Z','2099-02-01T15:45:00Z','Too long')$$,'22023',null,'appointments must be fifteen or thirty minutes');
select throws_ok($$select public.request_mentor_booking('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','2099-02-01T15:01:00Z','2099-02-01T15:16:00Z','Unaligned')$$,'22023',null,'appointments must align to quarter hours');
select throws_ok($$select public.request_mentor_booking('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','2099-02-01T05:00:00Z','2099-02-01T05:15:00Z','Outside hours')$$,'55000',null,'appointments must fit actual availability');
select set_config('test.request1',public.request_mentor_booking('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','2099-02-01T15:00:00Z','2099-02-01T15:15:00Z','Pricing strategy')::text,true);
select is((select status from public.mentor_booking_requests where id=current_setting('test.request1')::uuid),'pending','startup request starts pending');
select is(public.request_mentor_booking('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','2099-02-01T15:00:00Z','2099-02-01T15:15:00Z','Pricing strategy')::text,current_setting('test.request1'),'request retry returns the same booking');
select is((select count(*) from public.mentor_booking_accepted_occupancy),0::bigint,'pending request does not reserve the mentor');
select throws_ok(format('update public.mentor_booking_requests set topic=%L where id=%L','Tampered',current_setting('test.request1')),'42501',null,'request topic is protected after submission');

select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*) from public.mentor_booking_requests),0::bigint,'another startup cannot read private request details');
select set_config('test.request2',public.request_mentor_booking('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','2099-02-01T15:00:00Z','2099-02-01T15:15:00Z','Fundraising')::text,true);
select is((select status from public.mentor_booking_requests where id=current_setting('test.request2')::uuid),'pending','another startup may request the still-unreserved slot');

select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select is((select topic from public.mentor_booking_requests where id=current_setting('test.request1')::uuid),'Pricing strategy','cohort admin can read booking details');
select throws_ok(format('select public.respond_to_mentor_booking_request(%L,%L,%L)','b1000000-0000-4000-8000-000000000001',current_setting('test.request1'),'accepted'),'42501',null,'admin cannot accept for a mentor');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok(format('select public.respond_to_mentor_booking_request(%L,%L,%L)','b1000000-0000-4000-8000-000000000001',current_setting('test.request1'),'accepted'),'P0002',null,'another mentor cannot discover or accept the request');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.respond_to_mentor_booking_request('b1000000-0000-4000-8000-000000000001',current_setting('test.request1')::uuid,'accepted'),'accepted','owning mentor accepts the request');
select is(public.respond_to_mentor_booking_request('b1000000-0000-4000-8000-000000000001',current_setting('test.request1')::uuid,'accepted'),'accepted','accept retry is idempotent');
select is((select count(*) from public.mentor_booking_accepted_occupancy where request_id=current_setting('test.request1')::uuid),1::bigint,'acceptance creates safe occupancy');
select throws_ok(format('select public.respond_to_mentor_booking_request(%L,%L,%L)','b1000000-0000-4000-8000-000000000001',current_setting('test.request2'),'accepted'),'55000',null,'acceptance rejects a pending request after another booking occupied its slot');

select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is((select count(*) from public.mentor_booking_requests),0::bigint,'unrelated startup still cannot read accepted request details');
select is((select count(*) from public.mentor_booking_accepted_occupancy where request_id=current_setting('test.request1')::uuid),1::bigint,'unrelated startup sees privacy-safe occupied time');
select throws_ok($$select public.request_mentor_booking('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','2099-02-01T15:00:00Z','2099-02-01T15:15:00Z','Occupied')$$,'55000',null,'new requests reject accepted occupied time');
select set_config('test.request4',public.request_mentor_booking('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','2099-02-01T17:00:00Z','2099-02-01T17:15:00Z','Hiring')::text,true);

select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('test.request3',public.request_mentor_booking('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000002','2099-02-01T15:00:00Z','2099-02-01T15:15:00Z','Operations')::text,true);
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok(format('select public.respond_to_mentor_booking_request(%L,%L,%L)','b1000000-0000-4000-8000-000000000001',current_setting('test.request3'),'accepted'),'23P01',null,'one startup cannot accept overlapping mentors');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.respond_to_mentor_booking_request('b1000000-0000-4000-8000-000000000001',current_setting('test.request4')::uuid,'declined'),'declined','owning mentor can decline');
select is((select count(*) from public.mentor_booking_accepted_occupancy where request_id=current_setting('test.request4')::uuid),0::bigint,'declined request never reserves availability');
select is((select count(*) from public.mentor_booking_requests where id=current_setting('test.request4')::uuid),1::bigint,'declined request remains historical');

select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select is((select count(*) from public.mentor_booking_requests),0::bigint,'other-cohort startup cannot read bookings');
select is((select count(*) from public.mentor_booking_accepted_occupancy),0::bigint,'other-cohort startup cannot read occupancy');
select throws_ok($$select public.request_mentor_booking('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','2099-02-01T18:00:00Z','2099-02-01T18:15:00Z','Cross cohort')$$,'42501',null,'other-cohort startup cannot request this mentor');

select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.cancel_mentor_booking_request('b1000000-0000-4000-8000-000000000001',current_setting('test.request1')::uuid),'cancelled','requesting startup can cancel acceptance');
select is(public.cancel_mentor_booking_request('b1000000-0000-4000-8000-000000000001',current_setting('test.request1')::uuid),'cancelled','cancel retry is idempotent');
select is((select count(*) from public.mentor_booking_accepted_occupancy where request_id=current_setting('test.request1')::uuid),0::bigint,'cancellation releases occupancy');
select is((select status from public.mentor_booking_requests where id=current_setting('test.request1')::uuid),'cancelled','cancelled booking remains historical');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.mentor_booking_requests set status='declined' where id=current_setting('test.request2')::uuid;
select is((select status from public.mentor_booking_requests where id=current_setting('test.request2')::uuid),'declined','direct mentor decline follows protected transitions');

select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
with inserted as (
  insert into public.mentor_booking_requests(semester_id,mentor_semester_id,mentor_profile_id,mentor_name,startup_semester_id,startup_organization_id,startup_name,requested_by_profile_id,topic,status,starts_at,ends_at)
  values('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000002',gen_random_uuid(),'Spoofed mentor',gen_random_uuid(),gen_random_uuid(),'Spoofed startup',gen_random_uuid(),'Direct request','accepted','2099-02-01T16:00:00Z','2099-02-01T16:15:00Z') returning id
) select set_config('test.direct_request',id::text,true) from inserted;
select is((select status from public.mentor_booking_requests where id=current_setting('test.direct_request')::uuid),'pending','direct insert cannot force acceptance');
select is((select startup_semester_id from public.mentor_booking_requests where id=current_setting('test.direct_request')::uuid),'b6000000-0000-4000-8000-000000000002'::uuid,'direct insert cannot spoof startup identity');
select is((select mentor_profile_id from public.mentor_booking_requests where id=current_setting('test.direct_request')::uuid),'b2000000-0000-4000-8000-000000000002'::uuid,'direct insert cannot spoof mentor identity');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
update public.mentor_booking_requests set status='accepted' where id=current_setting('test.direct_request')::uuid;
select is((select count(*) from public.mentor_booking_accepted_occupancy where request_id=current_setting('test.direct_request')::uuid),1::bigint,'direct acceptance creates occupancy transactionally');
-- RLS filters this direct DELETE to zero rows; rejection need not raise an error.
delete from public.mentor_booking_accepted_occupancy where request_id=current_setting('test.direct_request')::uuid;
select is((select count(*) from public.mentor_booking_accepted_occupancy where request_id=current_setting('test.direct_request')::uuid),1::bigint,'participant cannot directly remove accepted occupancy');
update public.mentor_booking_requests set status='cancelled' where id=current_setting('test.direct_request')::uuid;
select is((select count(*) from public.mentor_booking_accepted_occupancy where request_id=current_setting('test.direct_request')::uuid),0::bigint,'direct cancellation releases occupancy transactionally');
select is((select count(*) from public.mentor_booking_requests where id=current_setting('test.direct_request')::uuid),1::bigint,'direct cancelled booking remains historical');
reset role;
select ok(not has_table_privilege('anon','public.mentor_booking_requests','SELECT'),'anonymous users cannot read booking details');
select ok(not has_table_privilege('authenticated','public.mentor_booking_requests','DELETE'),'Data API cannot delete booking history');
select * from finish();
rollback;
