begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(38);

update public.semesters set is_active = false where is_active;

insert into public.semesters (id, name, start_date, end_date, lifecycle_status, is_active, configuration)
values
  ('f1000000-0000-4000-8000-000000000001', 'Friday cohort', '2099-01-01', '2099-05-31', 'active', true, '{}'),
  ('f1000000-0000-4000-8000-000000000002', 'Other cohort', '2098-01-01', '2098-05-31', 'archived', false, '{}'),
  ('f1000000-0000-4000-8000-000000000003', 'Empty Friday cohort', '2100-01-01', '2100-05-31', 'draft', false, '{}');

insert into public.meetings (id, semester_id, meeting_date, label)
values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', '2099-01-09', 'Week 1'),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', '2099-01-16', 'Week 2'),
  ('f2000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000002', '2098-01-10', 'Other week'),
  ('f2000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000003', '2100-01-08', 'Empty week');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('f3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'friday-admin@example.test', '{}', '{}'),
  ('f3000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'friday-mentor@example.test', '{}', '{}'),
  ('f3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'friday-founder-a@example.test', '{}', '{}'),
  ('f3000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'friday-founder-b@example.test', '{}', '{}'),
  ('f3000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'friday-founder-c@example.test', '{}', '{}'),
  ('f3000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'friday-inactive-founder@example.test', '{}', '{}'),
  ('f3000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'other-founder@example.test', '{}', '{}'),
  ('f3000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'friday-alumni@example.test', '{}', '{}'),
  ('f3000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'friday-super-admin@example.test', '{}', '{}');

insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name)
select id, id, email,
  case when email like '%admin%' then 'admin'::public.user_role
       when email like '%mentor%' or email like '%alumni%' then 'mentor'::public.user_role
       else 'startup'::public.user_role end,
  'approved', true, split_part(email, '@', 1)
from auth.users
where id::text like 'f3000000-%';

insert into public.platform_roles (profile_id, role)
values ('f3000000-0000-4000-8000-000000000009', 'super_admin');

insert into public.semester_memberships (id, semester_id, profile_id, role, status, activated_at, alumni_at)
values
  ('f4000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'admin', 'active', now(), null),
  ('f4000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002', 'mentor', 'active', now(), null),
  ('f4000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000003', 'startup', 'active', now(), null),
  ('f4000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000004', 'startup', 'active', now(), null),
  ('f4000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000005', 'startup', 'active', now(), null),
  ('f4000000-0000-4000-8000-000000000006', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000006', 'startup', 'suspended', now(), null),
  ('f4000000-0000-4000-8000-000000000007', 'f1000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000007', 'startup', 'active', now(), null),
  ('f4000000-0000-4000-8000-000000000008', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000008', 'mentor', 'alumni', now(), now()),
  ('f4000000-0000-4000-8000-000000000009', 'f1000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000001', 'admin', 'active', now(), null);

insert into public.startup_organizations (id, name, slug)
values
  ('f5000000-0000-4000-8000-000000000001', 'Friday Alpha', 'friday-alpha'),
  ('f5000000-0000-4000-8000-000000000002', 'Friday Beta', 'friday-beta'),
  ('f5000000-0000-4000-8000-000000000003', 'Friday Gamma', 'friday-gamma'),
  ('f5000000-0000-4000-8000-000000000004', 'Friday Inactive', 'friday-inactive'),
  ('f5000000-0000-4000-8000-000000000005', 'Other Startup', 'other-startup-friday');

insert into public.startup_semesters (id, semester_id, startup_organization_id)
values
  ('f6000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001'),
  ('f6000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002'),
  ('f6000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000003'),
  ('f6000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000004'),
  ('f6000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000005');

insert into public.startup_team_memberships (id, semester_id, startup_semester_id, semester_membership_id)
values
  ('f7000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000003'),
  ('f7000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000004'),
  ('f7000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000003', 'f4000000-0000-4000-8000-000000000005'),
  ('f7000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000004', 'f4000000-0000-4000-8000-000000000006'),
  ('f7000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000002', 'f6000000-0000-4000-8000-000000000005', 'f4000000-0000-4000-8000-000000000007');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select was_created from public.generate_friday_program('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001')), true, 'first generation publishes a Friday program');
select set_config('test.friday_assignment_signature', (select string_agg(startup_semester_id::text || ':' || group_code || ':' || group_position::text, ',' order by startup_semester_id) from public.friday_program_assignments), true);
select is((select assignment_count from public.generate_friday_program('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001')), 3, 'retry returns the saved eligible-company count');
select is((select count(*) from public.friday_programs where meeting_id = 'f2000000-0000-4000-8000-000000000001'), 1::bigint, 'retry does not create another program');
select is((select count(*) from public.friday_program_assignments assignment join public.friday_programs program on program.id = assignment.program_id where program.meeting_id = 'f2000000-0000-4000-8000-000000000001'), 3::bigint, 'each eligible company is assigned once');
select is((select max(group_count) - min(group_count) from (select count(*) group_count from public.friday_program_assignments assignment join public.friday_programs program on program.id = assignment.program_id where program.meeting_id = 'f2000000-0000-4000-8000-000000000001' group by assignment.group_code) groups), 1::bigint, 'odd rosters are balanced within one company');
select is((select count(*) from public.friday_program_assignments where startup_semester_id = 'f6000000-0000-4000-8000-000000000004'), 0::bigint, 'a suspended startup membership is not eligible');
select is((select string_agg(startup_semester_id::text || ':' || group_code || ':' || group_position::text, ',' order by startup_semester_id) from public.friday_program_assignments), current_setting('test.friday_assignment_signature'), 'retry preserves the saved assignment');
select is((select was_created from public.generate_friday_program('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002')), true, 'a second meeting is generated independently');
select is((select count(*) from public.friday_programs), 2::bigint, 'weekly programs remain separate');
select throws_ok($$select public.generate_friday_program('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000003')$$, 'P0002', 'Meeting does not belong to the active semester', 'cross-semester meeting generation is rejected');
set constraints all immediate;
set constraints all deferred;

reset role;
update public.semester_memberships set status = 'active', suspended_at = null where id = 'f4000000-0000-4000-8000-000000000006';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select assignment_count from public.generate_friday_program('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001')), 3, 'retry stays stable after the eligible roster grows');
select throws_ok(
  $sql$do $body$
  begin
    insert into public.friday_program_assignments (
      semester_id, program_id, startup_semester_id, startup_organization_id,
      startup_name, startup_slug, group_code, group_position
    )
    select
      program.semester_id, program.id, 'f6000000-0000-4000-8000-000000000004',
      'f5000000-0000-4000-8000-000000000004', 'Friday Inactive', 'friday-inactive', 'B', 2
    from public.friday_programs program
    where program.meeting_id = 'f2000000-0000-4000-8000-000000000001';
    set constraints all immediate;
  end
  $body$$sql$,
  '23514', null,
  'a later roster addition cannot extend an immutable saved publication'
);
select is((select count(*) from public.friday_program_assignments assignment join public.friday_programs program on program.id = assignment.program_id where program.meeting_id = 'f2000000-0000-4000-8000-000000000001'), 3::bigint, 'failed extension leaves the original publication unchanged');
select is((select was_created from public.generate_friday_program('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', true)), false, 'regeneration replaces the saved program rather than creating a new one');
select is((select assignment_count from public.generate_friday_program('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001')), 4, 'regeneration uses the selected Friday''s current eligible roster');
select is((select count(*) from public.friday_programs where meeting_id = 'f2000000-0000-4000-8000-000000000001'), 1::bigint, 'regeneration retains one program for the selected Friday');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
select is((select assignment_count from public.generate_friday_program('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001')), 4, 'an unassigned super administrator can manage an existing Friday program through RLS');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.generate_friday_program('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001')$$, '42501', 'Semester administrator access required', 'startup participants cannot generate groups');
select is((select count(*) from public.friday_programs), 2::bigint, 'active startup participants read only their semester programs');
select is((select count(*) from public.friday_program_assignments), 7::bigint, 'active startup participants read saved group assignments');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
select is((select count(*) from public.friday_programs), 2::bigint, 'same-semester alumni retain historical Friday program access');
select is((select count(*) from public.friday_program_assignments), 7::bigint, 'same-semester alumni retain historical assignment access');
select is((select count(*) from public.meetings where semester_id = 'f1000000-0000-4000-8000-000000000001'), 2::bigint, 'same-semester alumni retain historical Friday meeting access');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select is((select count(*) from public.friday_programs), 0::bigint, 'another semester cannot read Friday programs');
select is((select count(*) from public.friday_program_assignments), 0::bigint, 'another semester cannot read Friday assignments');

reset role;
update public.semesters set is_active = false where id = 'f1000000-0000-4000-8000-000000000001';
update public.semesters set lifecycle_status = 'active', is_active = true where id = 'f1000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.generate_friday_program('f1000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000004')$$, 'P0001', 'No active startup companies are eligible for this Friday meeting', 'empty eligible rosters return an actionable error');
select throws_ok(
  $sql$do $body$
  begin
    insert into public.friday_programs (id, semester_id, meeting_id, startup_count, generated_by_profile_id)
    values ('f8000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000004', 1, 'f3000000-0000-4000-8000-000000000001');
    set constraints all immediate;
  end
  $body$$sql$,
  '23514', null,
  'deferred validation rejects malformed direct publication'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.friday_programs), 2::bigint, 'active mentors can read their published programs');
select is((select count(*) from public.friday_program_assignments), 7::bigint, 'active mentors can read both startup groups');
select throws_ok($$select public.generate_friday_program('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001')$$, '42501', 'Semester administrator access required', 'mentors cannot generate groups');

reset role;
update public.semester_memberships set status = 'suspended' where id = 'f4000000-0000-4000-8000-000000000006';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is((select count(*) from public.friday_programs), 0::bigint, 'suspended participants cannot read Friday programs');
select is((select count(*) from public.friday_program_assignments), 0::bigint, 'suspended participants cannot read Friday assignments');

reset role;
select ok(not has_table_privilege('anon', 'public.friday_programs', 'SELECT'), 'anonymous access to Friday programs is not granted');
select ok(not has_table_privilege('anon', 'public.friday_program_assignments', 'SELECT'), 'anonymous access to Friday assignments is not granted');
update public.semesters set is_active = false where is_active;
update public.semesters set is_active = true where id = 'f1000000-0000-4000-8000-000000000001';
update public.semester_memberships set status = 'active' where id = 'f4000000-0000-4000-8000-000000000006';
insert into public.meetings (id, semester_id, meeting_date, label)
values ('f2000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000001', '2099-01-23', 'Even roster week');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select assignment_count from public.generate_friday_program('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000005')), 4, 'a later week uses its current four-company roster');
select is((select array_agg(group_count order by group_code) from (select group_code, count(*)::integer as group_count from public.friday_program_assignments where program_id = (select id from public.friday_programs where meeting_id = 'f2000000-0000-4000-8000-000000000005') group by group_code) counts), array[2,2], 'even rosters split equally across both groups');
select throws_ok($$insert into public.friday_programs (semester_id,meeting_id,startup_count,generated_by_profile_id) values ('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000003',1,'f3000000-0000-4000-8000-000000000001')$$, '23503', null, 'composite foreign key rejects a meeting from another semester');
reset role;
insert into public.meetings (id, semester_id, meeting_date, label)
values ('f2000000-0000-4000-8000-000000000006', 'f1000000-0000-4000-8000-000000000001', '2099-01-30', 'Super admin week');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
select is((select assignment_count from public.generate_friday_program('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000006')), 4, 'an unassigned super administrator can publish a new week through RLS');
set constraints all immediate;

select * from finish();
rollback;
