begin;

select plan(6);

insert into public.semesters (id, name, start_date, end_date, lifecycle_status)
values ('d1000000-0000-0000-0000-000000000001', 'Shared tags contract', '2026-09-01', '2026-12-31', 'active');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('d2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'tag-owner@example.test', '{}', '{}'),
  ('d2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'other-mentor@example.test', '{}', '{}');

insert into public.profiles (id, auth_user_id, email, role, status, is_active)
values
  ('d3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'tag-owner@example.test', 'mentor', 'approved', true),
  ('d3000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000002', 'other-mentor@example.test', 'mentor', 'approved', true);

insert into public.semester_memberships (id, semester_id, profile_id, role, status)
values
  ('d4000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'mentor', 'active'),
  ('d4000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002', 'mentor', 'active');

insert into public.mentor_profiles (profile_id)
values
  ('d3000000-0000-0000-0000-000000000001'),
  ('d3000000-0000-0000-0000-000000000002');

insert into public.expertise_tags (id, name, normalized_name)
values ('d5000000-0000-0000-0000-000000000001', 'Go-to-market', 'go to market');

select ok(
  to_regclass('public.expertise_tags') is not null,
  'shared expertise tag catalog exists'
);

select ok(
  to_regclass('public.startup_mentor_need_tags') is not null,
  'startup mentor-need assignments exist'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.startup_mentor_need_tags'::regclass
      and pg_get_constraintdef(oid) like '%semester_id%semesters%'
  ),
  'startup mentor needs are semester-scoped'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'expertise_tags'
      and policyname = 'authenticated members create shared expertise tags'
  ),
  'the catalog has an authenticated creation policy'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.mentor_expertise_tags(mentor_profile_id, expertise_tag_id)
    values ('d3000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001')$$,
  'an eligible mentor can attach a tag to their own profile'
);

select throws_ok(
  $$insert into public.mentor_expertise_tags(mentor_profile_id, expertise_tag_id)
    values ('d3000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'a mentor cannot attach a tag to another mentor profile'
);

select * from finish();

rollback;
