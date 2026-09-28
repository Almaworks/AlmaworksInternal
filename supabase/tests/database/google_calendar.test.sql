begin;
create extension if not exists pgtap with schema extensions;
select plan(113);
select is(private.calendar_hold_event_id('d6000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000001'),
  'aa213e3478d109dce20cb947939340229ae1092620f180a67ad57f448ae972367',
  'database hold identifier matches Google provider SHA256 fixture');

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

select ok((select relrowsecurity from pg_class where oid='private.google_calendar_credentials'::regclass),'credential table has RLS');
select ok((select relrowsecurity from pg_class where oid='private.google_calendar_busy_intervals'::regclass),'busy intervals have RLS');
select ok(not has_table_privilege('authenticated','private.google_calendar_credentials','SELECT'),'credential table has no direct participant grant');
select ok(not has_table_privilege('authenticated','private.google_calendar_busy_intervals','SELECT'),'busy table has no direct participant grant');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.google_calendar_connections),0::bigint,'startup cannot enumerate mentor connection metadata');
select is((select count(*) from public.mentor_calendar_settings),0::bigint,'startup cannot read mentor settings raw');
select is((select count(*) from public.calendar_effective_slots('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','2099-03-02 14:00Z','2099-03-02 16:00Z')),0::bigint,'synced projection fails closed after stale snapshot');
select ok(not public.calendar_slot_available('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','2099-03-02 15:00Z','2099-03-02 15:15Z'),'busy slot cannot be booked by startup');
select ok(not private.is_calendar_worker(),'JWT role metadata does not confer worker identity');
reset role;

-- A global administrator need not have a participant membership in this cohort.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values ('d2000000-0000-4000-8000-000000000004','authenticated','authenticated','calendar-admin@example.test','{}','{}');
insert into public.profiles(id,auth_user_id,email,role,status,is_active,full_name)
values ('d2000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-000000000004','calendar-admin@example.test','admin','approved',true,'Calendar Admin');
insert into public.platform_roles(profile_id,role) values ('d2000000-0000-4000-8000-000000000004','super_admin');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select ok(private.calendar_can_read_mentor('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001'),'global administrator can read active mentor availability');
reset role;
update public.profiles set is_active=false where id='d2000000-0000-4000-8000-000000000004';
set local role authenticated;
select ok(not private.calendar_can_read_mentor('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001'),'disabled administrator cannot read availability');
reset role;
update public.profiles set is_active=false where id='d2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok(not private.calendar_can_read_mentor('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001'),'disabled mentor is not available to startups');
reset role;
update public.profiles set is_active=true where id='d2000000-0000-4000-8000-000000000001';

update private.google_calendar_busy_snapshots set fetched_at=now();
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok(public.calendar_slot_available('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','2099-03-02 14:00Z','2099-03-02 14:15Z'),'covered working slot remains free');
select ok(not public.calendar_slot_available('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','2099-03-02 15:00Z','2099-03-02 15:15Z'),'fresh Google busy blocks booking');
select is((select count(*) from public.calendar_effective_slots('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','2099-03-02 14:00Z','2099-03-02 15:30Z')),5::bigint,'safe projection excludes only Google busy slot');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated","user_metadata":{"calendar_worker":true}}',true);
select ok(private.is_calendar_worker(),'enabled registry recognizes actual machine identity');
select is((select count(*) from public.google_calendar_connections),1::bigint,'registered worker can read safe connection metadata');
reset role;

update private.google_calendar_sync_jobs set id='d7000000-0000-4000-8000-000000000001',
  run_after=now()-interval '1 minute'
where semester_id='d1000000-0000-4000-8000-000000000001'
  and mentor_semester_id='d4000000-0000-4000-8000-000000000001';
insert into private.google_calendar_credentials(connection_id,refresh_token_ciphertext)
values ('d5000000-0000-4000-8000-000000000001','encrypted-fixture-refresh-token');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.calendar_lease_sync_jobs(1)),1::bigint,'worker can lease one due sync job');
select is((select count(*) from public.calendar_lease_sync_jobs(1)),0::bigint,'unexpired lease cannot be reacquired');
select ok(not public.calendar_finish_sync_job('d7000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000000',true,null),'stale lease result is fenced');
reset role;

-- A failed FreeBusy call must retain a refresh-token rotation. The lease is
-- also rechecked against current participant and semester state.
select set_config('test.sync_token',(select lease_token::text from private.google_calendar_sync_jobs
  where id='d7000000-0000-4000-8000-000000000001'),true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select ok(public.calendar_finish_sync_job('d7000000-0000-4000-8000-000000000001',
  current_setting('test.sync_token')::uuid,false,'retryable',1,'encrypted-rotated-refresh-token',
  'encrypted-new-access-token',now()+interval '1 hour'),'failed FreeBusy retains refreshed credentials');
reset role;
select is((select refresh_token_ciphertext from private.google_calendar_credentials
  where connection_id='d5000000-0000-4000-8000-000000000001'),
  'encrypted-rotated-refresh-token','rotated refresh token is persisted on provider failure');
select is((select generation from private.google_calendar_credentials
  where connection_id='d5000000-0000-4000-8000-000000000001'),2::bigint,
  'credential generation advances after rotation');

update private.google_calendar_sync_jobs set run_after=now()-interval '1 minute'
  where id='d7000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.calendar_lease_sync_jobs(1)),1::bigint,'worker leases reconnect failure fixture');
reset role;
select set_config('test.sync_token',(select lease_token::text from private.google_calendar_sync_jobs
  where id='d7000000-0000-4000-8000-000000000001'),true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select ok(public.calendar_finish_sync_job('d7000000-0000-4000-8000-000000000001',
  current_setting('test.sync_token')::uuid,
  false,'reconnect',2,null,null,null),'terminal reconnect failure finishes under the active lease');
reset role;
select is((select status from public.google_calendar_connections where id='d5000000-0000-4000-8000-000000000001'),
  'reconnect_required','terminal reconnect failure exposes the reconnect action');
update public.google_calendar_connections set status='connected' where id='d5000000-0000-4000-8000-000000000001';

update private.google_calendar_sync_jobs set run_after=now()-interval '1 minute'
  where id='d7000000-0000-4000-8000-000000000001';
update public.semester_memberships set status='suspended'
  where id='d3000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.calendar_lease_sync_jobs(1)),0::bigint,
  'suspended mentor has no sync lease');
reset role;
update public.semester_memberships set status='active'
  where id='d3000000-0000-4000-8000-000000000001';
update public.profiles set is_active=false where id='d2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.calendar_lease_sync_jobs(1)),0::bigint,
  'disabled mentor has no sync lease');
reset role;
update public.profiles set is_active=true where id='d2000000-0000-4000-8000-000000000001';
update public.semesters set is_active=false,lifecycle_status='closed'
  where id='d1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.calendar_lease_sync_jobs(1)),0::bigint,
  'inactive semester has no sync lease');
reset role;
update public.semesters set is_active=true,lifecycle_status='active'
  where id='d1000000-0000-4000-8000-000000000001';
update public.semester_memberships set status='onboarding'
  where id='d3000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.calendar_lease_sync_jobs(1)),1::bigint,
  'onboarding mentor may sync before membership activation');
reset role;
update private.google_calendar_sync_jobs set lease_token=null,leased_until=null,
  run_after=now()-interval '1 minute'
  where id='d7000000-0000-4000-8000-000000000001';
update public.semester_memberships set status='active'
  where id='d3000000-0000-4000-8000-000000000001';
update public.mentor_calendar_settings set sync_unavailable=false
  where semester_id='d1000000-0000-4000-8000-000000000001'
    and mentor_semester_id='d4000000-0000-4000-8000-000000000001';

insert into public.startup_organizations(id,name,slug)
values ('d8000000-0000-4000-8000-000000000001','Calendar Startup','calendar-startup-fixture');
insert into public.startup_semesters(id,semester_id,startup_organization_id)
values ('d8000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000001');
insert into public.startup_team_memberships(id,semester_id,startup_semester_id,semester_membership_id)
values ('d8000000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($test$select public.replace_mentor_weekly_availability(
  'd1000000-0000-4000-8000-000000000001','[]'::jsonb)$test$,
  '55000','Use Calendar availability settings to change these working hours',
  'legacy weekly editor cannot overwrite Calendar settings');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($test$select public.request_mentor_booking(
  'd1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001',
  '2099-03-02 15:00Z','2099-03-02 15:15Z','Busy fixture')$test$,
  '55000','Selected time is no longer available','request creation rejects Google busy time');
select set_config('test.request',public.request_mentor_booking(
  'd1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001',
  '2099-03-02 16:00Z','2099-03-02 16:15Z','Fixture meeting')::text,true);
reset role;
insert into private.google_calendar_busy_intervals(semester_id,snapshot_id,starts_at,ends_at)
values ('d1000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001','2099-03-02 16:00Z','2099-03-02 16:15Z');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok(format('select public.respond_to_mentor_booking_request(%L,%L,%L)',
  'd1000000-0000-4000-8000-000000000001',current_setting('test.request'),'accepted'),
  '55000','Selected time is no longer available','acceptance rechecks a new Google conflict');
select is((select status::text from public.mentor_booking_requests where id=current_setting('test.request')::uuid),
  'pending','rejected acceptance preserves the pending request');
reset role;
delete from private.google_calendar_busy_intervals where snapshot_id='d6000000-0000-4000-8000-000000000001' and starts_at='2099-03-02 16:00Z';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.respond_to_mentor_booking_request('d1000000-0000-4000-8000-000000000001',
  current_setting('test.request')::uuid,'accepted');
reset role;
select is((select count(*) from private.google_calendar_hold_jobs
  where request_id=current_setting('test.request')::uuid),1::bigint,
  'accepted booking enqueues connected mentor hold');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.calendar_hold_statuses('d1000000-0000-4000-8000-000000000001',array[current_setting('test.request')::uuid])),1::bigint,
  'mentor can read own hold status for requested booking');
select is((select count(*) from public.calendar_hold_statuses('d1000000-0000-4000-8000-000000000002',array[current_setting('test.request')::uuid])),0::bigint,
  'hold status does not cross semesters');
select throws_ok($$select public.calendar_hold_statuses('d1000000-0000-4000-8000-000000000001',array_fill(current_setting('test.request')::uuid,array[101]))$$,
  '22023','At most 100 booking statuses may be read','hold status batch is bounded');
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.calendar_hold_statuses('d1000000-0000-4000-8000-000000000001',array[current_setting('test.request')::uuid])),0::bigint,
  'startup cannot read the mentor Google hold status');
reset role;
update public.profiles set is_active=false where id='d2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.calendar_hold_statuses('d1000000-0000-4000-8000-000000000001',array[current_setting('test.request')::uuid])),0::bigint,
  'disabled owner cannot read hold statuses');
reset role;
update public.profiles set is_active=true where id='d2000000-0000-4000-8000-000000000001';

-- Active sync work excludes a hold on the same credentials.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.calendar_lease_sync_jobs(1)),1::bigint,
  'worker can lease sync after participant access is restored');
select is((select count(*) from public.calendar_lease_hold_jobs(1)),0::bigint,
  'hold does not race an active sync token refresh');
reset role;
update private.google_calendar_sync_jobs set lease_token=null,leased_until=null,run_after=now()+interval '1 hour'
  where id='d7000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('test.hold_lease',(select row_to_json(h)::text from public.calendar_lease_hold_jobs(1) h),true);
select is((current_setting('test.hold_lease')::jsonb->>'starts_at')::timestamptz,
  '2099-03-02 16:00Z'::timestamptz,'hold lease supplies booking start');
select is((current_setting('test.hold_lease')::jsonb->>'ends_at')::timestamptz,
  '2099-03-02 16:15Z'::timestamptz,'hold lease supplies booking end');
select is((current_setting('test.hold_lease')::jsonb->>'credential_generation')::bigint,2::bigint,
  'hold lease uses latest serialized credential generation');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.cancel_mentor_booking_request('d1000000-0000-4000-8000-000000000001',
  current_setting('test.request')::uuid);
reset role;
select is((select desired_state from private.google_calendar_hold_jobs
  where request_id=current_setting('test.request')::uuid),'absent',
  'cancellation changes desired provider state');
select is((select applied_state from private.google_calendar_hold_jobs
  where request_id=current_setting('test.request')::uuid),'unknown',
  'cancellation forces reconciliation even if an old lease reported absent');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select ok(not public.calendar_finish_hold_job(
  (current_setting('test.hold_lease')::jsonb->>'job_id')::uuid,
  (current_setting('test.hold_lease')::jsonb->>'lease_token')::uuid,
  (current_setting('test.hold_lease')::jsonb->>'generation')::bigint,true,null,
  null,null,null,(current_setting('test.hold_lease')::jsonb->>'credential_generation')::bigint),
  'old hold generation cannot acknowledge after cancellation');
reset role;
update private.google_calendar_hold_jobs set leased_until=now()-interval '1 second',
  run_after=now()-interval '1 second'
  where request_id=current_setting('test.request')::uuid;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('test.cancel_lease',(select row_to_json(h)::text from public.calendar_lease_hold_jobs(1) h),true);
select is(current_setting('test.cancel_lease')::jsonb->>'desired_state','absent',
  'next hold lease reconciles cancellation');
select ok(public.calendar_finish_hold_job(
  (current_setting('test.cancel_lease')::jsonb->>'job_id')::uuid,
  (current_setting('test.cancel_lease')::jsonb->>'lease_token')::uuid,
  (current_setting('test.cancel_lease')::jsonb->>'generation')::bigint,false,'retryable',
  'encrypted-hold-refresh-rotation',null,null,
  (current_setting('test.cancel_lease')::jsonb->>'credential_generation')::bigint),
  'failed Google hold persists its refresh-token rotation');
reset role;
select is((select refresh_token_ciphertext from private.google_calendar_credentials
  where connection_id='d5000000-0000-4000-8000-000000000001'),
  'encrypted-hold-refresh-rotation','hold failure retains rotated token for retry');

-- Re-consent while a hold is leased must fence the old provider result and
-- leave a new reconciliation attempt for the current credentials.
update private.google_calendar_hold_jobs set run_after=now()-interval '1 minute'
  where request_id=current_setting('test.request')::uuid;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('test.reconsent_lease',(select row_to_json(h)::text from public.calendar_lease_hold_jobs(1) h),true);
select is(current_setting('test.reconsent_lease')::jsonb->>'desired_state','absent',
  'retry lease still targets cancellation');
select set_config('test.oauth_transaction',(select transaction_id::text from public.calendar_begin_oauth(
  'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
  repeat('e',32),'encrypted-pkce-verifier-reconsent',now()+interval '10 minutes')),true);
select is((select count(*) from public.calendar_consume_oauth(repeat('e',32),
  'd2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001')),
  1::bigint,'re-consent state is consumed once');
select throws_ok($$select public.calendar_complete_oauth(current_setting('test.oauth_transaction')::uuid,
  'different-google-sub','other@example.test','primary','replacement-token',null,null)$$,
  'PGC01','Disconnect existing Google Calendar before switching accounts',
  'different account cannot replace a connection with pending hold cleanup');
reset role;
select is((select refresh_token_ciphertext from private.google_calendar_credentials
  where connection_id='d5000000-0000-4000-8000-000000000001'),
  'encrypted-hold-refresh-rotation','rejected account switch preserves cleanup credentials');
select is((select provider_subject from public.google_calendar_connections
  where id='d5000000-0000-4000-8000-000000000001'),'google-sub',
  'rejected account switch preserves original provider identity');
set local role authenticated;
select is(public.calendar_complete_oauth(current_setting('test.oauth_transaction')::uuid,
  'google-sub','mentor@example.test','primary','encrypted-new-consent-refresh',null,null),
  'd5000000-0000-4000-8000-000000000001'::uuid,
  're-consent replaces credentials for the same connection');
select ok(not public.calendar_finish_hold_job(
  (current_setting('test.reconsent_lease')::jsonb->>'job_id')::uuid,
  (current_setting('test.reconsent_lease')::jsonb->>'lease_token')::uuid,
  (current_setting('test.reconsent_lease')::jsonb->>'generation')::bigint,true,null,
  null,null,null,(current_setting('test.reconsent_lease')::jsonb->>'credential_generation')::bigint),
  'pre-consent provider result cannot acknowledge on new credentials');
reset role;
select is((select applied_state from private.google_calendar_hold_jobs
  where request_id=current_setting('test.request')::uuid),'unknown',
  're-consent keeps hold reconciliation outstanding');
select is((select refresh_token_ciphertext from private.google_calendar_credentials
  where connection_id='d5000000-0000-4000-8000-000000000001'),
  'encrypted-new-consent-refresh','stale hold result did not overwrite new consent');
update private.google_calendar_hold_jobs set leased_until=now()-interval '1 second',
  run_after=now()-interval '1 second'
  where request_id=current_setting('test.request')::uuid;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('test.reconciled_lease',(select row_to_json(h)::text from public.calendar_lease_hold_jobs(1) h),true);
select is(current_setting('test.reconciled_lease')::jsonb->>'desired_state','absent',
  'next lease reconciles stale in-flight hold after re-consent');
select ok(public.calendar_finish_hold_job(
  (current_setting('test.reconciled_lease')::jsonb->>'job_id')::uuid,
  (current_setting('test.reconciled_lease')::jsonb->>'lease_token')::uuid,
  (current_setting('test.reconciled_lease')::jsonb->>'generation')::bigint,true,null,
  null,null,null,(current_setting('test.reconciled_lease')::jsonb->>'credential_generation')::bigint),
  'reconciliation can acknowledge on current credentials');
reset role;
select is((select applied_state from private.google_calendar_hold_jobs
  where request_id=current_setting('test.request')::uuid),'absent',
  'reconciled cancellation is marked applied');

update private.google_calendar_hold_jobs set applied_state='unknown',run_after=now()-interval '1 minute'
  where request_id=current_setting('test.request')::uuid;
update public.profiles set is_active=false where id='d2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.calendar_lease_hold_jobs(1)),0::bigint,
  'disabled participant has no hold lease');
reset role;
update public.profiles set is_active=true where id='d2000000-0000-4000-8000-000000000001';
update public.semester_memberships set status='suspended'
  where id='d3000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.calendar_lease_hold_jobs(1)),0::bigint,
  'suspended participant has no hold lease');
reset role;
update public.semester_memberships set status='active'
  where id='d3000000-0000-4000-8000-000000000001';
update public.semesters set is_active=false,lifecycle_status='closed'
  where id='d1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.calendar_lease_hold_jobs(1)),0::bigint,
  'inactive semester has no hold lease');
reset role;

update public.semesters set is_active=true,lifecycle_status='active'
  where id='d1000000-0000-4000-8000-000000000001';
update public.semester_memberships set status='onboarding'
  where id='d3000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok(public.calendar_save_settings('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001',
  'America/New_York','[{"weekday":1,"starts_at":"09:00","ends_at":"12:00"}]','weekly'),
  'onboarding mentor atomically saves working hours');
select is((select count(*) from public.mentor_weekly_availability where mentor_semester_id='d4000000-0000-4000-8000-000000000001'),1::bigint,
  'working hours replacement persists one range');
select throws_ok($$select public.calendar_save_settings('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001',
  'America/New_York','[{"weekday":1,"starts_at":"09:00","ends_at":"12:00"},{"weekday":1,"starts_at":"11:00","ends_at":"13:00"}]','weekly')$$,
  '22023','Working hour ranges must not overlap','overlapping hours are rejected');
select is((select count(*) from public.mentor_weekly_availability where mentor_semester_id='d4000000-0000-4000-8000-000000000001'),1::bigint,
  'invalid replacement preserves previous hours');
select throws_ok($$select public.calendar_set_override('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001',
  now()-interval '1 hour',now()-interval '45 minutes',true)$$,
  '22023','Choose a future fifteen-minute slot within ninety days','past dated overrides rejected');
select throws_ok($$select public.calendar_import_snapshot('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001',
  now(),now()+interval '7 days')$$,'55000','A successful Calendar sync is required before importing',
  'manual import cannot fabricate availability before a successful sync');
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.calendar_save_settings('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001',
  'America/New_York','[]','weekly')$$,'42501','Current owning mentor required','startup cannot edit mentor hours');
reset role;
update public.mentor_calendar_settings set mode='synced',connection_id='d5000000-0000-4000-8000-000000000001'
  where mentor_semester_id='d4000000-0000-4000-8000-000000000001';
update private.google_calendar_sync_jobs set run_after=now()+interval '1 hour'
  where mentor_semester_id='d4000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok(public.calendar_request_sync('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001'),
  'owning onboarding mentor can queue a Calendar refresh');
reset role;
select ok((select run_after<=now() from private.google_calendar_sync_jobs where mentor_semester_id='d4000000-0000-4000-8000-000000000001'),
  'requested refresh is immediately due for the next worker');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.calendar_request_sync('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001')$$,
  '42501','Owning mentor with synced availability required','startup cannot queue another mentor refresh');
reset role;
update public.profiles set is_active=false where id='d2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.calendar_request_sync('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001')$$,
  '42501','Owning mentor with synced availability required','inactive profile cannot queue a refresh');
reset role;
update public.profiles set is_active=true where id='d2000000-0000-4000-8000-000000000001';
update public.semesters set is_active=false,lifecycle_status='closed' where id='d1000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.calendar_request_sync('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001')$$,
  '42501','Owning mentor with synced availability required','closed semester cannot queue a refresh');
reset role;
update public.semesters set is_active=true,lifecycle_status='active' where id='d1000000-0000-4000-8000-000000000001';
update public.google_calendar_connections set status='reconnect_required' where id='d5000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.calendar_request_sync('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001')$$,
  '42501','Owning mentor with synced availability required','connection requiring consent cannot queue a refresh');
reset role;
update public.google_calendar_connections set status='connected' where id='d5000000-0000-4000-8000-000000000001';
update public.mentor_calendar_settings set mode='weekly' where mentor_semester_id='d4000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.calendar_request_sync('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001')$$,
  '42501','Owning mentor with synced availability required','weekly mode cannot queue a Google availability refresh');
reset role;
-- Disconnect is a drain/cleanup operation, not an immediate credential delete.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.calendar_disconnect('d5000000-0000-4000-8000-000000000001',false)$$,
  '42501','Own connection required','startup cannot disconnect the mentor connection');
reset role;
update private.google_calendar_hold_jobs set leased_until=now()+interval '1 minute',lease_token=gen_random_uuid()
  where connection_id='d5000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok(not public.calendar_disconnect('d5000000-0000-4000-8000-000000000001',false),
  'disconnect waits for an active provider write');
reset role;
select is((select status from public.google_calendar_connections where id='d5000000-0000-4000-8000-000000000001'),
  'connected','busy disconnect leaves connection unchanged');
update private.google_calendar_hold_jobs set leased_until=now()-interval '1 second'
  where connection_id='d5000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok(public.calendar_disconnect('d5000000-0000-4000-8000-000000000001',false),
  'owner queues disconnect after writes drain');
reset role;
select is((select status from public.google_calendar_connections where id='d5000000-0000-4000-8000-000000000001'),
  'disconnecting','queued disconnect is not reported as finished');
select is((select count(*) from private.google_calendar_credentials where connection_id='d5000000-0000-4000-8000-000000000001'),
  1::bigint,'encrypted credential retained only for queued cleanup');
select is((select desired_state from private.google_calendar_hold_jobs where request_id=current_setting('test.request')::uuid),
  'absent','disconnect queues removal of existing owned holds');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.calendar_lease_disconnect_jobs(1)),0::bigint,
  'credential removal cannot precede hold cleanup');
select throws_ok($$select public.calendar_begin_oauth('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
  repeat('f',32),'encrypted-verifier-disconnect',now()+interval '10 minutes')$$,
  '55000','Calendar disconnect cleanup is still in progress','new consent cannot race disconnect cleanup');
select set_config('test.disconnect_hold',(select row_to_json(h)::text from public.calendar_lease_hold_jobs(1) h),true);
select is(current_setting('test.disconnect_hold')::jsonb->>'desired_state','absent',
  'cleanup leases only removal after disconnect');
select ok(public.calendar_finish_hold_job(
  (current_setting('test.disconnect_hold')::jsonb->>'job_id')::uuid,
  (current_setting('test.disconnect_hold')::jsonb->>'lease_token')::uuid,
  (current_setting('test.disconnect_hold')::jsonb->>'generation')::bigint,true,null,
  null,null,null,(current_setting('test.disconnect_hold')::jsonb->>'credential_generation')::bigint),
  'owned hold cleanup is acknowledged before credential removal');
select set_config('test.disconnect_lease',(select row_to_json(d)::text from public.calendar_lease_disconnect_jobs(1) d),true);
select ok(not public.calendar_finish_disconnect_job('d5000000-0000-4000-8000-000000000001',
  (current_setting('test.disconnect_lease')::jsonb->>'lease_token')::uuid,
  (current_setting('test.disconnect_lease')::jsonb->>'credential_generation')::bigint+1),
  'wrong credential generation cannot finish disconnect');
select ok(public.calendar_finish_disconnect_job('d5000000-0000-4000-8000-000000000001',
  (current_setting('test.disconnect_lease')::jsonb->>'lease_token')::uuid,
  (current_setting('test.disconnect_lease')::jsonb->>'credential_generation')::bigint),
  'current cleanup acknowledgement finishes disconnect');
reset role;
select is((select status from public.google_calendar_connections where id='d5000000-0000-4000-8000-000000000001'),
  'disconnected','finished cleanup reports disconnected');
select is((select count(*) from private.google_calendar_credentials where connection_id='d5000000-0000-4000-8000-000000000001'),
  0::bigint,'finished cleanup removes encrypted credentials');
select ok((select disconnect_cleanup_incomplete from public.google_calendar_connections where id='d5000000-0000-4000-8000-000000000001'),
  'an expired provider write remains warned even after subsequent cleanup acknowledgement');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.calendar_save_settings('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001',
  'America/New_York','[]','synced','d5000000-0000-4000-8000-000000000001')$$,
  '42501','Own connected Google Calendar required','stale editor cannot re-enable a disconnected calendar');
reset role;
-- A denied provider cleanup still forgets local credentials with a warning.
update public.google_calendar_connections set status='disconnecting',disconnected_at=null,disconnect_cleanup_incomplete=false
  where id='d5000000-0000-4000-8000-000000000001';
insert into private.google_calendar_credentials(connection_id,refresh_token_ciphertext)
  values('d5000000-0000-4000-8000-000000000001','encrypted-failed-cleanup-refresh');
insert into private.google_calendar_hold_jobs(semester_id,request_id,connection_id,profile_id,event_id,desired_state,applied_state,last_error,attempts)
  values('d1000000-0000-4000-8000-000000000001',current_setting('test.request')::uuid,
    'd5000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
    private.calendar_hold_event_id(current_setting('test.request')::uuid,'d5000000-0000-4000-8000-000000000001'),
    'absent','unknown','ownership',1);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('test.disconnect_retry',(select row_to_json(d)::text from public.calendar_lease_disconnect_jobs(1) d),true);
select ok(not (current_setting('test.disconnect_retry')::jsonb ? 'refresh_token_ciphertext'),
  'local finalization does not expose provider credentials to the worker');
select is((select count(*) from public.calendar_lease_disconnect_jobs(1)),0::bigint,
  'local finalization cannot be leased twice concurrently');
select ok(public.calendar_finish_disconnect_job('d5000000-0000-4000-8000-000000000001',
  (current_setting('test.disconnect_retry')::jsonb->>'lease_token')::uuid,
  (current_setting('test.disconnect_retry')::jsonb->>'credential_generation')::bigint),
  'terminal hold cleanup failure still allows local credential deletion');
reset role;
select ok((select disconnect_cleanup_incomplete from public.google_calendar_connections where id='d5000000-0000-4000-8000-000000000001'),
  'unconfirmed hold cleanup remains visibly warned');
select is((select count(*) from private.google_calendar_credentials where connection_id='d5000000-0000-4000-8000-000000000001'),
  0::bigint,'terminal hold cleanup removes encrypted credentials');
select is((select count(*) from private.google_calendar_hold_jobs where connection_id='d5000000-0000-4000-8000-000000000001'),
  0::bigint,'finished disconnect cannot lease further Google hold writes');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('test.switch_transaction',(select transaction_id::text from public.calendar_begin_oauth(
  'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
  repeat('f',32),'encrypted-pkce-after-disconnect',now()+interval '10 minutes')),true);
select * from public.calendar_consume_oauth(repeat('f',32),
  'd2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001');
select is(public.calendar_complete_oauth(current_setting('test.switch_transaction')::uuid,
  'different-google-sub','other@example.test','primary','replacement-after-cleanup',null,null),
  'd5000000-0000-4000-8000-000000000001'::uuid,
  'different account may connect after local disconnect has completed');
select ok(not public.calendar_abort_oauth(current_setting('test.switch_transaction')::uuid),
  'late abort cannot undo a completed connection');
select set_config('test.inflight_transaction',(select transaction_id::text from public.calendar_begin_oauth(
  'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
  repeat('g',32),'encrypted-inflight-verifier',now()+interval '10 minutes')),true);
select * from public.calendar_consume_oauth(repeat('g',32),
  'd2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001');
select throws_ok($$select public.calendar_begin_oauth(
  'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
  repeat('h',32),'encrypted-new-verifier',now()+interval '10 minutes')$$,
  'PGC02','Google Calendar callback is in progress','new consent cannot supersede a consumed callback');
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok(not public.calendar_disconnect('d5000000-0000-4000-8000-000000000001',false),
  'disconnect waits for consumed callback even without provider job leases');
select throws_ok($$select public.calendar_abort_oauth(current_setting('test.inflight_transaction')::uuid)$$,
  '42501','Calendar worker required','participant cannot abort worker transactions directly');
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select ok(public.calendar_abort_oauth(current_setting('test.inflight_transaction')::uuid),'failed callback releases its consumed transaction');
select ok(not public.calendar_abort_oauth(current_setting('test.inflight_transaction')::uuid),'repeated abort is a harmless no-op');
select throws_ok($$select public.calendar_complete_oauth(current_setting('test.inflight_transaction')::uuid,
  'different-google-sub','other@example.test','primary','late-token',null,null)$$,
  '55000','OAuth transaction consumed or expired','aborted callback cannot later save credentials');
select is((select count(*) from public.calendar_begin_oauth(
  'd1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
  repeat('h',32),'encrypted-new-verifier',now()+interval '10 minutes')),1::bigint,
  'retry starts immediately after a failed callback releases its transaction');
reset role;
select * from finish();
rollback;

