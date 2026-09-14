begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

select has_column('public', 'startup_organizations', 'logo_path', 'startup organizations store a managed logo path');
select ok(has_column_privilege('authenticated', 'public.startup_organizations', 'logo_path', 'UPDATE'), 'authenticated users receive narrow logo path update privilege');

update public.semesters set is_active = false, lifecycle_status = 'closed' where is_active;
insert into public.semesters (id, name, start_date, end_date, is_active, lifecycle_status)
values ('d1000000-0000-0000-0000-000000000001', 'Logo active', '2099-01-01', '2099-06-01', true, 'active');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('d2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'logo-owner@example.test', '{}', '{}'),
       ('d2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'logo-peer@example.test', '{}', '{}'),
       ('d2000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'logo-unrelated@example.test', '{}', '{}'),
       ('d2000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'logo-inactive@example.test', '{}', '{}');
insert into public.profiles (id, auth_user_id, email, role, status, full_name)
values ('d3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'logo-owner@example.test', 'startup', 'approved', 'Logo Owner'),
       ('d3000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000002', 'logo-peer@example.test', 'startup', 'approved', 'Logo Peer'),
       ('d3000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000003', 'logo-unrelated@example.test', 'startup', 'approved', 'Logo Unrelated'),
       ('d3000000-0000-0000-0000-000000000004', 'd2000000-0000-0000-0000-000000000004', 'logo-inactive@example.test', 'startup', 'approved', 'Logo Inactive');
insert into public.semester_memberships (id, semester_id, profile_id, role, status)
values ('d4000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'startup', 'active'),
       ('d4000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002', 'startup', 'active'),
       ('d4000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000004', 'startup', 'suspended');

insert into public.startup_organizations (id, name, slug)
values ('d5000000-0000-0000-0000-000000000001', 'Logo Owner Org', 'logo-owner-org'),
       ('d5000000-0000-0000-0000-000000000002', 'Logo Peer Org', 'logo-peer-org'),
       ('d5000000-0000-0000-0000-000000000004', 'Logo Inactive Org', 'logo-inactive-org');
insert into public.startup_semesters (id, semester_id, startup_organization_id)
values ('d6000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001'),
       ('d6000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000002'),
       ('d6000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000004');
insert into public.startup_team_memberships (id, semester_id, startup_semester_id, semester_membership_id)
values ('d7000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001'),
       ('d7000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000002'),
       ('d7000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000004', 'd4000000-0000-0000-0000-000000000004');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('startup-logos', 'startup-logos', false, 4194304, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.objects (bucket_id, name)
values ('startup-logos', 'd5000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000001.jpg'),
       ('startup-logos', 'd5000000-0000-0000-0000-000000000002/d8000000-0000-0000-0000-000000000002.png'),
       ('startup-logos', 'd5000000-0000-0000-0000-000000000004/d8000000-0000-0000-0000-000000000004.webp');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$update public.startup_organizations set logo_path = 'd5000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000011.jpg' where id = 'd5000000-0000-0000-0000-000000000001'$$, 'assigned member updates their organization logo path');
select is((select logo_path from public.startup_organizations where id = 'd5000000-0000-0000-0000-000000000001'), 'd5000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000011.jpg', 'assigned member reads the updated path');
select lives_ok($$update public.startup_organizations set logo_path = 'd5000000-0000-0000-0000-000000000002/d8000000-0000-0000-0000-000000000012.jpg' where id = 'd5000000-0000-0000-0000-000000000002'$$, 'cross-organization update is filtered by RLS');
reset role;
select is((select logo_path from public.startup_organizations where id = 'd5000000-0000-0000-0000-000000000002'), null, 'peer organization path remains unchanged');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$update public.startup_organizations set logo_path = 'd5000000-0000-0000-0000-000000000002/d8000000-0000-0000-0000-000000000013.jpg' where id = 'd5000000-0000-0000-0000-000000000001'$$, '23514', null, 'logo path folder must match the organization');
select throws_ok($$update public.startup_organizations set logo_path = 'd5000000-0000-0000-0000-000000000001/not-versioned.jpg' where id = 'd5000000-0000-0000-0000-000000000001'$$, '23514', null, 'logo filename must be a UUID');
select throws_ok($$update public.startup_organizations set logo_path = 'd5000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000014.gif' where id = 'd5000000-0000-0000-0000-000000000001'$$, '23514', null, 'logo extension must be an allowed image type');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('startup-logos', 'd5000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000015.webp')$$, 'assigned member inserts into their organization folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('startup-logos', 'd5000000-0000-0000-0000-000000000002/d8000000-0000-0000-0000-000000000016.webp')$$, '42501', null, 'assigned member cannot insert into another organization folder');
select set_config('storage.allow_delete_query', 'true', true);
select lives_ok($$delete from storage.objects where bucket_id = 'startup-logos' and name = 'd5000000-0000-0000-0000-000000000002/d8000000-0000-0000-0000-000000000002.png'$$, 'cross-organization delete is filtered by RLS');
reset role;
select is((select count(*) from storage.objects where bucket_id = 'startup-logos' and name = 'd5000000-0000-0000-0000-000000000002/d8000000-0000-0000-0000-000000000002.png'), 1::bigint, 'assigned member cannot delete another organization logo');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('storage.allow_delete_query', 'true', true);
select lives_ok($$delete from storage.objects where bucket_id = 'startup-logos' and name = 'd5000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000015.webp'$$, 'assigned member deletes from their organization folder');
reset role;
select is((select count(*) from storage.objects where bucket_id = 'startup-logos' and name = 'd5000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000015.webp'), 0::bigint, 'assigned member deletion persists');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*) from storage.objects where bucket_id = 'startup-logos' and name = 'd5000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000001.jpg'), 1::bigint, 'active cohort peer reads logo object metadata');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('startup-logos', 'd5000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000021.jpg')$$, '42501', null, 'cohort peer cannot insert into another organization folder');
select set_config('storage.allow_delete_query', 'true', true);
select lives_ok($$delete from storage.objects where bucket_id = 'startup-logos' and name = 'd5000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000001.jpg'$$, 'cohort peer delete is filtered by RLS');
reset role;
select is((select count(*) from storage.objects where bucket_id = 'startup-logos' and name = 'd5000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000001.jpg'), 1::bigint, 'cohort peer cannot delete another organization logo');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*) from storage.objects where bucket_id = 'startup-logos'), 0::bigint, 'unrelated user cannot read startup logo metadata');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('startup-logos', 'd5000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000031.jpg')$$, '42501', null, 'unrelated user cannot insert startup logos');
select set_config('storage.allow_delete_query', 'true', true);
select lives_ok($$delete from storage.objects where bucket_id = 'startup-logos' and name = 'd5000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000001.jpg'$$, 'unrelated user delete is filtered by RLS');
reset role;
select is((select count(*) from storage.objects where bucket_id = 'startup-logos' and name = 'd5000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000001.jpg'), 1::bigint, 'unrelated user cannot delete startup logos');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*) from storage.objects where bucket_id = 'startup-logos'), 0::bigint, 'inactive assigned member cannot read startup logo metadata');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('startup-logos', 'd5000000-0000-0000-0000-000000000004/d8000000-0000-0000-0000-000000000041.jpg')$$, '42501', null, 'inactive assigned member cannot insert startup logos');
select set_config('storage.allow_delete_query', 'true', true);
select lives_ok($$delete from storage.objects where bucket_id = 'startup-logos' and name = 'd5000000-0000-0000-0000-000000000004/d8000000-0000-0000-0000-000000000004.webp'$$, 'inactive assigned member delete is filtered by RLS');
reset role;
select is((select count(*) from storage.objects where bucket_id = 'startup-logos' and name = 'd5000000-0000-0000-0000-000000000004/d8000000-0000-0000-0000-000000000004.webp'), 1::bigint, 'inactive assigned member cannot delete startup logos');

select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'), 1::bigint, 'storage select policy remains consolidated');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'INSERT'), 1::bigint, 'storage insert policy remains consolidated');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'DELETE'), 1::bigint, 'storage delete policy remains consolidated');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'UPDATE'), 0::bigint, 'versioned uploads require no storage update policy');
select is((select public from storage.buckets where id = 'startup-logos'), false, 'startup logo bucket remains private');
select is((select file_size_limit from storage.buckets where id = 'startup-logos'), 4194304::bigint, 'startup logo bucket enforces the 4 MiB limit');
select is((select allowed_mime_types from storage.buckets where id = 'startup-logos'), array['image/jpeg','image/png','image/webp']::text[], 'startup logo bucket restricts uploads to supported image MIME types');

select * from finish();
rollback;
