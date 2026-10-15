begin;
create extension if not exists pgtap with schema extensions;
select plan(20);
select is((select r.rolname::text from pg_proc p join pg_roles r on r.oid=p.proowner
  where p.oid='public.calendar_save_dated_availability(uuid,uuid,jsonb)'::regprocedure),
  'calendar_sql_internal','dated save retains the restricted owner after migration replay');
select is((select r.rolname::text from pg_proc p join pg_roles r on r.oid=p.proowner
  where p.oid='public.calendar_owner_dated_availability(uuid,uuid,timestamptz,timestamptz)'::regprocedure),
  'calendar_sql_internal','dated projection retains the restricted owner after migration replay');
select ok((select not rolsuper and not rolbypassrls and not rolcanlogin from pg_roles where rolname='calendar_sql_internal'),
  'dated function owner cannot bypass RLS or log in');
select ok(not has_schema_privilege('calendar_sql_internal','public','CREATE'),
  'migration revokes the temporary schema creation privilege');
select ok(has_function_privilege('authenticated','public.calendar_save_dated_availability(uuid,uuid,jsonb)','EXECUTE')
  and has_function_privilege('authenticated','public.calendar_owner_dated_availability(uuid,uuid,timestamptz,timestamptz)','EXECUTE'),
  'authenticated callers retain explicit dated function grants');
select ok(not has_function_privilege('anon','public.calendar_owner_dated_availability(uuid,uuid,timestamptz,timestamptz)','EXECUTE')
  and not has_function_privilege('service_role','public.calendar_save_dated_availability(uuid,uuid,jsonb)','EXECUTE'),
  'anonymous projection and service-role save remain unavailable');
update public.semesters set is_active=false where is_active;

insert into public.semesters(id,name,start_date,end_date,lifecycle_status,is_active,configuration)
values ('e1000000-0000-4000-8000-000000000001','Dated calendar cohort','2026-10-01','2027-01-12','active',true,'{"timezone":"America/New_York"}');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('e2000000-0000-4000-8000-000000000001','authenticated','authenticated','dated-owner@example.test','{}','{}'),
('e2000000-0000-4000-8000-000000000002','authenticated','authenticated','dated-other@example.test','{}','{}'),
('e2000000-0000-4000-8000-000000000003','authenticated','authenticated','dated-startup@example.test','{}','{}');
insert into public.profiles(id,auth_user_id,email,role,status,is_active,full_name) values
('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','dated-owner@example.test','mentor','approved',true,'Dated Owner'),
('e2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','dated-other@example.test','mentor','approved',true,'Dated Other'),
('e2000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000003','dated-startup@example.test','startup','approved',true,'Dated Startup');
insert into public.semester_memberships(id,semester_id,profile_id,role,status,activated_at) values
('e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','mentor','active',now()),
('e3000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002','mentor','active',now()),
('e3000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000003','startup','active',now());
insert into public.mentor_semesters(id,semester_id,semester_membership_id) values
('e4000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001'),
('e4000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000002');
insert into public.mentor_calendar_settings(semester_id,mentor_semester_id,mode,time_zone)
values ('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','weekly','America/New_York');
insert into public.mentor_weekly_availability(semester_id,mentor_semester_id,weekday,starts_at,ends_at)
values ('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',0,'01:00','02:00');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(jsonb_array_length(public.calendar_owner_dated_availability('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','2026-11-01 04:00Z','2026-11-01 08:00Z')->'offered'),8,'DST fall-back projects both real occurrences');

select ok(public.calendar_save_dated_availability('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',
  '[{"startsAt":"2026-11-01T05:00:00Z","endsAt":"2026-11-01T05:15:00Z","available":false},{"startsAt":"2026-11-03T15:00:00Z","endsAt":"2026-11-03T15:15:00Z","available":true}]'),'owner saves one atomic batch');
select is((select count(*) from public.mentor_calendar_overrides where mentor_semester_id='e4000000-0000-4000-8000-000000000001'),2::bigint,'batch writes one override per unique slot');
select is((select count(*) from public.mentor_weekly_availability where mentor_semester_id='e4000000-0000-4000-8000-000000000001'),1::bigint,'dated save preserves weekly legacy hours');
select is((select mode from public.mentor_calendar_settings where mentor_semester_id='e4000000-0000-4000-8000-000000000001'),'weekly','dated save preserves calendar mode');
select is(jsonb_array_length(public.calendar_owner_dated_availability('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','2026-11-01 04:00Z','2026-11-01 08:00Z')->'offered'),7,'negative override removes one intended DST slot');

select throws_ok($$select public.calendar_save_dated_availability('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',
  '[{"startsAt":"2026-10-20T14:00:00Z","endsAt":"2026-10-20T14:15:00Z","available":true},{"startsAt":"2026-10-16T19:00:00Z","endsAt":"2026-10-16T19:15:00Z","available":true}]')$$,
  '22023','Invalid, reserved, or booked dated availability slot','Friday reservation rejects the whole batch');
select is((select count(*) from public.mentor_calendar_overrides where starts_at='2026-10-20 14:00Z'),0::bigint,'failed batch leaves its otherwise-valid edit unapplied');
select throws_ok($$select public.calendar_save_dated_availability('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',
  '[{"startsAt":"2026-10-20T14:00:00Z","endsAt":"2026-10-20T14:15:00Z","available":true},{"startsAt":"2026-10-20T14:00:00Z","endsAt":"2026-10-20T14:15:00Z","available":false}]')$$,
  '22023','A dated slot cannot be both available and unavailable','contradictory duplicate edits are rejected');

select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.calendar_owner_dated_availability('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','2026-11-01 04:00Z','2026-11-01 08:00Z')$$,
  '42501','Only the owning mentor can read this calendar','other mentor cannot read owner dated calendar');
select throws_ok($$select public.calendar_save_dated_availability('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','[{"startsAt":"2026-10-20T14:00:00Z","endsAt":"2026-10-20T14:15:00Z","available":true}]')$$,
  '42501','Current owning mentor required','other mentor cannot spoof dated write scope');
select is(jsonb_typeof(public.calendar_owner_dated_availability('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002','2026-11-01 04:00Z','2026-11-01 08:00Z')->'syncUnavailable'),'boolean','mentor without settings still receives the boolean contract');
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.calendar_owner_dated_availability('e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','2026-11-01 04:00Z','2026-11-01 08:00Z')$$,
  '42501','Only the owning mentor can read this calendar','startup cannot read mentor dated calendar');
reset role;
select ok(not has_function_privilege('anon','public.calendar_save_dated_availability(uuid,uuid,jsonb)','EXECUTE'),'anonymous cannot call dated save');
select * from finish();
rollback;
