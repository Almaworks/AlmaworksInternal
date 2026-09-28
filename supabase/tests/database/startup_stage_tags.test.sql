begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
set local search_path = public, extensions;
select plan(11);

insert into public.semesters (id, name, start_date, end_date, lifecycle_status, is_active, configuration)
values ('b1000000-1000-4000-8000-000000000001', 'Profile access', '2099-01-01', '2099-05-31', 'draft', false, '{}');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('b2000000-1000-4000-8000-000000000001', 'authenticated', 'authenticated', 'profile-owner@example.test', '{}', '{}'),
  ('b2000000-1000-4000-8000-000000000002', 'authenticated', 'authenticated', 'profile-outsider@example.test', '{}', '{}');
insert into public.profiles (id, auth_user_id, email, role, status, is_active, full_name)
values
  ('b2000000-1000-4000-8000-000000000001', 'b2000000-1000-4000-8000-000000000001', 'profile-owner@example.test', 'startup', 'approved', true, 'Profile Owner'),
  ('b2000000-1000-4000-8000-000000000002', 'b2000000-1000-4000-8000-000000000002', 'profile-outsider@example.test', 'startup', 'approved', true, 'Profile Outsider');
insert into public.semester_memberships (id, semester_id, profile_id, role, status, activated_at)
values
  ('b3000000-1000-4000-8000-000000000001', 'b1000000-1000-4000-8000-000000000001', 'b2000000-1000-4000-8000-000000000001', 'startup', 'active', now()),
  ('b3000000-1000-4000-8000-000000000002', 'b1000000-1000-4000-8000-000000000001', 'b2000000-1000-4000-8000-000000000002', 'startup', 'active', now());
insert into public.startup_organizations (id, name, slug)
values
  ('b4000000-1000-4000-8000-000000000001', 'Owned Org', 'owned-org'),
  ('b4000000-1000-4000-8000-000000000002', 'Other Org', 'other-org');
insert into public.startup_semesters (id, semester_id, startup_organization_id, stage)
values
  ('b5000000-1000-4000-8000-000000000001', 'b1000000-1000-4000-8000-000000000001', 'b4000000-1000-4000-8000-000000000001', 'mvp'),
  ('b5000000-1000-4000-8000-000000000002', 'b1000000-1000-4000-8000-000000000001', 'b4000000-1000-4000-8000-000000000002', 'mvp');
insert into public.startup_team_memberships (id, semester_id, startup_semester_id, semester_membership_id)
values
  ('b6000000-1000-4000-8000-000000000001', 'b1000000-1000-4000-8000-000000000001', 'b5000000-1000-4000-8000-000000000001', 'b3000000-1000-4000-8000-000000000001'),
  ('b6000000-1000-4000-8000-000000000002', 'b1000000-1000-4000-8000-000000000001', 'b5000000-1000-4000-8000-000000000002', 'b3000000-1000-4000-8000-000000000002');

select ok(has_column_privilege('authenticated', 'public.startup_organizations', 'name', 'UPDATE'), 'authenticated callers receive the organization profile update grant');
select ok(has_column_privilege('authenticated', 'public.startup_semesters', 'stage', 'UPDATE'), 'authenticated callers receive the stage update grant');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-1000-4000-8000-000000000001","role":"authenticated"}', true);
with changed as (update public.startup_organizations set name = 'Owned Updated', industry = 'Software', description = 'Updated description', website_url = 'https://owned.example' where id = 'b4000000-1000-4000-8000-000000000001' returning id)
select is((select count(*) from changed), 1::bigint, 'assigned active startup updates its organization profile');
with changed as (update public.startup_semesters set stage = 'growth' where id = 'b5000000-1000-4000-8000-000000000001' returning id)
select is((select count(*) from changed), 1::bigint, 'assigned active startup updates its stage');
with changed as (update public.startup_organizations set name = 'Intrusion' where id = 'b4000000-1000-4000-8000-000000000002' returning id)
select is((select count(*) from changed), 0::bigint, 'startup cannot update another organization');
with changed as (update public.startup_semesters set stage = 'idea' where id = 'b5000000-1000-4000-8000-000000000002' returning id)
select is((select count(*) from changed), 0::bigint, 'startup cannot update another cohort profile');

reset role;
select col_type_is('public', 'startup_semesters', 'stage', 'text', 'stage stores custom single tags while preserving existing values');
set local role authenticated;
with changed as (update public.startup_semesters set stage = 'pivoting' where id = 'b5000000-1000-4000-8000-000000000001' returning stage)
select is((select stage from changed), 'pivoting', 'assigned startup can persist a custom stage');
select throws_ok($$update public.startup_semesters set stage = 'raising,building' where id = 'b5000000-1000-4000-8000-000000000001'$$, '23514', null, 'comma-separated multi-tags are rejected');
select throws_ok($$update public.startup_semesters set stage = repeat('a',41) where id = 'b5000000-1000-4000-8000-000000000001'$$, '23514', null, 'overlong tags are rejected');
with changed as (update public.startup_semesters set stage = 'pilot' where id = 'b5000000-1000-4000-8000-000000000001' returning stage)
select is((select stage from changed), 'pilot', 'existing stage labels remain valid');
select * from finish();
rollback;
