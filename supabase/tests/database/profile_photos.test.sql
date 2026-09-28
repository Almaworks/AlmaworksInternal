begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select has_column('public', 'profiles', 'photo_path', 'global profiles store the private photo object path');
select ok(has_column_privilege('authenticated', 'public.profiles', 'photo_path', 'UPDATE'), 'authenticated users receive photo path update privilege');

update public.semesters set is_active = false, lifecycle_status = 'closed' where is_active;
insert into public.semesters (id, name, start_date, end_date, is_active, lifecycle_status)
values ('c1000000-0000-0000-0000-000000000001', 'Photo active', '2099-01-01', '2099-06-01', true, 'active'),
       ('c1000000-0000-0000-0000-000000000002', 'Photo closed', '2098-01-01', '2098-06-01', false, 'closed');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('c2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'photo-owner@example.test', '{}', '{}'),
       ('c2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'photo-peer@example.test', '{}', '{}'),
       ('c2000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'photo-hidden@example.test', '{}', '{}');
insert into public.profiles (id, auth_user_id, email, role, status, full_name)
values ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'photo-owner@example.test', 'mentor', 'approved', 'Photo Owner'),
       ('c3000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'photo-peer@example.test', 'startup', 'approved', 'Photo Peer'),
       ('c3000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000003', 'photo-hidden@example.test', 'startup', 'approved', 'Photo Hidden');
insert into public.semester_memberships (id, semester_id, profile_id, role, status)
values ('c4000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'mentor', 'active'),
       ('c4000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000002', 'startup', 'active'),
       ('c4000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000003', 'startup', 'active');
insert into public.mentor_profiles (profile_id, photo_url)
values ('c3000000-0000-0000-0000-000000000001', 'https://legacy.test/owner.jpg'),
       ('c3000000-0000-0000-0000-000000000002', 'https://legacy.test/peer.jpg');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 4194304, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.objects (bucket_id, name)
values ('profile-photos', 'c3000000-0000-0000-0000-000000000002/existing.jpg'),
       ('profile-photos', 'c3000000-0000-0000-0000-000000000003/hidden.jpg');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$update public.profiles set photo_path = 'c3000000-0000-0000-0000-000000000001/c5000000-0000-0000-0000-000000000001.jpg' where id = 'c3000000-0000-0000-0000-000000000001'$$, 'owner can update own photo path');
select is((select photo_path from public.profiles where id = 'c3000000-0000-0000-0000-000000000001'), 'c3000000-0000-0000-0000-000000000001/c5000000-0000-0000-0000-000000000001.jpg', 'owner reads updated photo path');
select lives_ok($$update public.profiles set photo_path = 'forged.jpg' where id = 'c3000000-0000-0000-0000-000000000002'$$, 'unauthorized profile update is filtered by RLS');
select is((select photo_path from public.profiles where id = 'c3000000-0000-0000-0000-000000000002'), null, 'peer photo path remains unchanged');
select lives_ok($$update public.mentor_profiles set photo_url = null where profile_id = 'c3000000-0000-0000-0000-000000000001'$$, 'mentor can clear own legacy photo URL');
select lives_ok($$update public.mentor_profiles set photo_url = null where profile_id = 'c3000000-0000-0000-0000-000000000002'$$, 'cross-profile legacy update is filtered by RLS');
reset role;
select is((select photo_url from public.mentor_profiles where profile_id = 'c3000000-0000-0000-0000-000000000002'), 'https://legacy.test/peer.jpg', 'peer legacy photo URL remains unchanged');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$insert into storage.objects (bucket_id, name) values ('profile-photos', 'c3000000-0000-0000-0000-000000000001/c5000000-0000-0000-0000-000000000002.jpg')$$, 'active participant can insert into own photo folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('profile-photos', 'c3000000-0000-0000-0000-000000000002/c5000000-0000-0000-0000-000000000003.jpg')$$, '42501', null, 'participant cannot insert into another photo folder');
select is((select count(*) from storage.objects where bucket_id = 'profile-photos'), 2::bigint, 'viewer reads own and active-cohort peer photos only');
select set_config('storage.allow_delete_query', 'true', true);
select lives_ok($$delete from storage.objects where bucket_id = 'profile-photos' and name = 'c3000000-0000-0000-0000-000000000002/existing.jpg'$$, 'cross-profile delete is filtered by RLS');
select is((select count(*) from storage.objects where bucket_id = 'profile-photos' and name = 'c3000000-0000-0000-0000-000000000002/existing.jpg'), 1::bigint, 'participant cannot delete another profile photo');
select lives_ok($$delete from storage.objects where bucket_id = 'profile-photos' and name = 'c3000000-0000-0000-0000-000000000001/c5000000-0000-0000-0000-000000000002.jpg'$$, 'owner delete is allowed');
select is((select count(*) from storage.objects where bucket_id = 'profile-photos' and name = 'c3000000-0000-0000-0000-000000000001/c5000000-0000-0000-0000-000000000002.jpg'), 0::bigint, 'participant deletes own profile photo');
reset role;
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'active participants delete own profile photos' and cmd = 'DELETE'), 1::bigint, 'owner-only delete policy is installed');
select is((select file_size_limit from storage.buckets where id = 'profile-photos'), 4194304::bigint, 'bucket enforces the 4 MiB limit');
select is((select allowed_mime_types from storage.buckets where id = 'profile-photos'), array['image/jpeg','image/png','image/webp']::text[], 'bucket restricts uploads to supported image MIME types');

select * from finish();
rollback;
