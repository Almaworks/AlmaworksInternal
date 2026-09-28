begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- This fixture deliberately exercises the projection as ordinary participants.
update public.semesters set is_active=false where is_active;
insert into public.semesters(id,name,start_date,end_date,lifecycle_status,is_active,configuration)
values ('e1000000-0000-4000-8000-000000000001','Projection cohort','2099-01-01','2099-06-01','active',true,'{"timezone":"America/New_York"}');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('e2000000-0000-4000-8000-000000000001','authenticated','authenticated','projection-mentor@example.test','{}','{}'),
('e2000000-0000-4000-8000-000000000002','authenticated','authenticated','projection-startup@example.test','{}','{}'),
('e2000000-0000-4000-8000-000000000003','authenticated','authenticated','projection-outsider@example.test','{}','{}');
insert into public.profiles(id,auth_user_id,email,role,status,is_active,full_name) values
('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','projection-mentor@example.test','mentor','approved',true,'Projection Mentor'),
('e2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','projection-startup@example.test','startup','approved',true,'Projection Startup'),
('e2000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000003','projection-outsider@example.test','startup','approved',true,'Projection Outsider');
insert into public.semester_memberships(id,semester_id,profile_id,role,status,activated_at) values
('e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','mentor','active',now()),
('e3000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002','startup','active',now());
insert into public.mentor_semesters(id,semester_id,semester_membership_id)
values ('e4000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001');
insert into public.startup_organizations(id,name,slug)
values ('e5000000-0000-4000-8000-000000000002','Projection Startup','projection-startup');
insert into public.startup_semesters(id,semester_id,startup_organization_id)
values ('e6000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000002');
insert into public.startup_team_memberships(id,semester_id,startup_semester_id,semester_membership_id)
values ('e6500000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',
  'e6000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000002');
insert into public.google_calendar_connections(id,profile_id,provider_subject,account_email,status)
values ('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','projection-google-sub','projection@example.test','connected');
insert into public.mentor_calendar_settings(semester_id,mentor_semester_id,mode,time_zone,connection_id,last_success_at)
values ('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','weekly','America/New_York','e5000000-0000-4000-8000-000000000001',now());
insert into public.mentor_weekly_availability(semester_id,mentor_semester_id,weekday,starts_at,ends_at)
values ('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',1,'09:00','17:00'),
('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',5,'09:00','18:00');

-- Symmetric difference against the canonical booking predicate, evaluated
-- with the same participant identity as the projection itself.
create function pg_temp.calendar_projection_matches(p_from timestamptz,p_until timestamptz)
returns boolean language sql stable security invoker set search_path='' as $$
  with expected as (
    select g.starts_at,g.starts_at+interval '15 minutes' as ends_at
    from pg_catalog.generate_series(p_from,p_until-interval '15 minutes',interval '15 minutes') g(starts_at)
    where public.calendar_slot_available('e1000000-0000-4000-8000-000000000001',
      'e4000000-0000-4000-8000-000000000001',g.starts_at,g.starts_at+interval '15 minutes')
  ), actual as (
    select starts_at,ends_at from public.calendar_effective_slots(
      'e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',p_from,p_until)
  )
  select not exists ((select * from expected except select * from actual)
    union all (select * from actual except select * from expected))
$$;
grant execute on function pg_temp.calendar_projection_matches(timestamptz,timestamptz) to authenticated;

select is((select p.prosecdef from pg_catalog.pg_proc p
  where p.oid='public.calendar_effective_slots(uuid,uuid,timestamptz,timestamptz)'::regprocedure),
  true,'projection runs under its restricted SQL owner');
select is((select p.proowner::regrole::text from pg_catalog.pg_proc p
  where p.oid='public.calendar_effective_slots(uuid,uuid,timestamptz,timestamptz)'::regprocedure),
  'calendar_sql_internal','projection owner cannot bypass RLS');
select ok(not (select rolbypassrls from pg_catalog.pg_roles where rolname='calendar_sql_internal'),
  'projection owner has no BYPASSRLS');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok(pg_temp.calendar_projection_matches('2099-03-02 13:00Z','2099-03-02 17:00Z'),
  'mentor: weekly cells match canonical booking checks');
select ok(pg_temp.calendar_projection_matches('2099-03-06 19:00Z','2099-03-06 23:00Z'),
  'mentor: Friday in-person reservation matches canonical checks');
select is((select count(*) from public.calendar_effective_slots(
  'e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',
  '2099-03-06 19:00Z','2099-03-06 23:00Z')),8::bigint,
  'Friday 15:00-17:00 local is reserved, with adjacent working hours retained');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select set_config('test.projection_request_id',public.request_mentor_booking(
  'e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',
  '2099-03-02 15:30Z','2099-03-02 15:45Z','Projection parity')::text,true);
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.respond_to_mentor_booking_request(
  'e1000000-0000-4000-8000-000000000001',current_setting('test.projection_request_id')::uuid,'accepted'),
  'accepted','mentor can accept a working slot');
select ok(pg_temp.calendar_projection_matches('2099-03-02 15:00Z','2099-03-02 16:00Z'),
  'mentor: accepted occupancy matches canonical checks');
select is((select count(*) from public.calendar_effective_slots(
  'e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',
  '2099-03-02 15:30Z','2099-03-02 15:45Z')),0::bigint,
  'accepted occupancy removes its exact slot');
reset role;

insert into public.mentor_calendar_overrides(semester_id,mentor_semester_id,starts_at,ends_at,available) values
('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','2099-03-02 14:00Z','2099-03-02 14:15Z',false),
('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','2099-03-02 18:00Z','2099-03-02 18:30Z',true),
('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','2098-12-31 15:00Z','2098-12-31 15:15Z',true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok(pg_temp.calendar_projection_matches('2099-03-02 13:00Z','2099-03-02 19:00Z'),
  'startup: unavailable and additive overrides match canonical checks');
select ok(pg_temp.calendar_projection_matches('2098-12-31 15:00Z','2098-12-31 15:15Z'),
  'startup: available override cannot escape semester bounds');
select is((select count(*) from public.calendar_effective_slots(
  'e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',
  '2098-12-31 15:00Z','2098-12-31 15:15Z')),0::bigint,
  'semester boundary excludes out-of-term override');
reset role;

update public.mentor_calendar_settings set mode='manual' where semester_id='e1000000-0000-4000-8000-000000000001';
insert into public.mentor_calendar_manual_slots(semester_id,mentor_semester_id,starts_at,ends_at)
values ('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','2099-03-02 15:00Z','2099-03-02 16:00Z');
set local role authenticated;
select ok(pg_temp.calendar_projection_matches('2099-03-02 13:00Z','2099-03-02 19:00Z'),
  'startup: manual slots and additive override match canonical checks');
reset role;

update public.mentor_calendar_settings set mode='synced' where semester_id='e1000000-0000-4000-8000-000000000001';
insert into private.google_calendar_busy_snapshots(id,semester_id,mentor_semester_id,connection_id,coverage_start,coverage_end,fetched_at)
values ('e6000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001',
  '2099-03-02 13:00Z','2099-03-02 18:00Z',now());
insert into private.google_calendar_busy_intervals(semester_id,snapshot_id,starts_at,ends_at)
values ('e1000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001',
  '2099-03-02 15:00Z','2099-03-02 15:15Z');
set local role authenticated;
select ok(pg_temp.calendar_projection_matches('2099-03-02 13:00Z','2099-03-02 19:00Z'),
  'startup: fresh partial coverage and busy overlap match canonical checks');
reset role;
update private.google_calendar_busy_snapshots set fetched_at=now()-interval '16 minutes';
set local role authenticated;
select ok(pg_temp.calendar_projection_matches('2099-03-02 13:00Z','2099-03-02 19:00Z'),
  'startup: stale snapshot fails closed like canonical checks');
reset role;
update private.google_calendar_busy_snapshots set fetched_at=now();
update public.mentor_calendar_settings set sync_unavailable=true
  where semester_id='e1000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(pg_temp.calendar_projection_matches('2099-03-02 13:00Z','2099-03-02 19:00Z'),
  'startup: sync-unavailable fails closed like canonical checks');
reset role;
update public.mentor_calendar_settings set sync_unavailable=false
  where semester_id='e1000000-0000-4000-8000-000000000001';
update public.google_calendar_connections set status='reconnect_required'
  where id='e5000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(pg_temp.calendar_projection_matches('2099-03-02 13:00Z','2099-03-02 19:00Z'),
  'startup: disconnected account fails closed like canonical checks');
select is((select count(*) from public.calendar_effective_slots(
  'e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',
  '2099-03-02 15:00Z','2099-03-02 16:00Z')),0::bigint,
  'disconnected account exposes no synced slots');
reset role;
update public.google_calendar_connections set status='connected'
  where id='e5000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select * from public.calendar_effective_slots(
  'e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',
  '2099-03-02 13:00Z','2099-03-02 14:00Z')$$,
  '42501','Calendar is not accessible','unrelated user cannot project mentor availability');
reset role;
select ok(not has_function_privilege('anon',
  'public.calendar_effective_slots(uuid,uuid,timestamptz,timestamptz)','EXECUTE'),
  'anonymous role cannot execute projection');
select ok(not has_schema_privilege('calendar_sql_internal','public','CREATE'),
  'runtime SQL owner has no CREATE privilege');
set local role authenticated;
select throws_ok($$select * from public.calendar_effective_slots(
  'e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',
  '2099-03-02 13:00Z','2099-06-02 13:00Z')$$,
  '22023','Calendar range must be positive and at most 90 days','projection retains the range limit');
reset role;

select * from finish();
rollback;
