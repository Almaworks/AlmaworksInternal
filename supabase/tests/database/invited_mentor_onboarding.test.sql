begin;

select plan(4);

insert into public.semesters (id, name, start_date, end_date, lifecycle_status)
values ('c1000000-0000-0000-0000-000000000001', 'Invited mentor onboarding', '2026-09-01', '2026-12-31', 'active');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('c2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'invited-mentor@example.test', '{}', '{}');

delete from public.profiles where id = 'c2000000-0000-0000-0000-000000000001';

insert into public.profiles (id, auth_user_id, email, role, status, is_active)
values ('c2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'invited-mentor@example.test', 'mentor', 'approved', true);

insert into public.semester_memberships (id, semester_id, profile_id, role, status)
values ('c3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002', 'mentor', 'invited');

insert into public.mentor_semesters (id, semester_id, semester_membership_id)
values ('c4000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001');

insert into public.meetings (id, semester_id, meeting_date, label)
values ('c5000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '2026-09-04', 'Onboarding availability');


set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  private.current_profile_id(),
  'c2000000-0000-0000-0000-000000000002'::uuid,
  'the invited mentor Auth user resolves to their durable profile'
);

select is(
  (select count(*) from public.mentor_semesters where id = 'c4000000-0000-0000-0000-000000000001'),
  1::bigint,
  'the invited mentor can read their own onboarding record before updating it'
);

select is(
  (select count(*) from public.meetings where semester_id = 'c1000000-0000-0000-0000-000000000001'),
  1::bigint,
  'the invited mentor can read Friday meetings while completing onboarding'
);

select results_eq(
  $$update public.mentor_semesters set readiness_status = 'in_progress' where id = 'c4000000-0000-0000-0000-000000000001' returning readiness_status$$,
  $$values ('in_progress'::text)$$,
  'an invited mentor may update their own onboarding readiness'
);

select * from finish();

rollback;
