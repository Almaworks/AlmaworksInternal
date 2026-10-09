begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Exercise the real Auth handler even in local replays that omit auth-schema triggers.
create trigger test_member_first_sign_in after insert on auth.users
for each row execute function public.handle_new_user();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('fa000000-0000-4000-8000-000000000001','authenticated','authenticated','google-first@example.test','{}','{}'),
('fa000000-0000-4000-8000-000000000002','authenticated','authenticated','request-first@example.test','{}','{"access_request_submitted":true}'),
('fa000000-0000-4000-8000-000000000003','authenticated','authenticated','admin-first@example.test','{}','{}'),
('fa000000-0000-4000-8000-000000000004','authenticated','authenticated','rejected-first@example.test','{}','{}');
update public.profiles set status='approved' where id='fa000000-0000-4000-8000-000000000003';
update public.profiles set status='rejected' where id='fa000000-0000-4000-8000-000000000004';
insert into public.platform_roles(profile_id,role) values ('fa000000-0000-4000-8000-000000000003','super_admin');
insert into public.semesters(id,name,start_date,end_date,lifecycle_status,configuration) values
('fa100000-0000-4000-8000-000000000001','First sign-in fixture','2099-09-01','2099-12-31','active','{}');

select is((select status from public.profiles where id='fa000000-0000-4000-8000-000000000001'),'unregistered','ordinary sign-in does not submit a request');
select is((select status from public.profiles where id='fa000000-0000-4000-8000-000000000002'),'pending','explicit signup submits a request');
select ok(not has_function_privilege('anon','public.request_own_access(text)','EXECUTE'),'anonymous callers cannot submit a request');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.request_own_access(text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC has no request command grant');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.request_own_access('First User')$$,'owner explicitly submits their request');
select is((select status from public.profiles where id='fa000000-0000-4000-8000-000000000001'),'pending','request saves pending state');
select throws_ok($$select public.set_semester_member_access('fa000000-0000-4000-8000-000000000003','fa000000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','mentor',true,'First User','google-first@example.test')$$,'42501','Authenticated actor does not match administrator','a participant cannot impersonate an administrator');
select throws_ok($$select public.set_semester_member_access('fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','admin',true,'First User','google-first@example.test')$$,'42501','Semester administrator access required','a participant cannot approve their own request');
select throws_ok($$update public.profiles set status='approved' where id='fa000000-0000-4000-8000-000000000001'$$,'42501','Profile status cannot be changed directly','direct self-approval remains denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$select public.set_semester_member_access('fa000000-0000-4000-8000-000000000003','fa000000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','mentor',true,'First User','google-first@example.test')$$,'administrator adds an existing request through the authenticated command');
select is((select status from public.profiles where id='fa000000-0000-4000-8000-000000000001'),'approved','adding already approves identity');
select is((select status::text from public.semester_memberships where profile_id='fa000000-0000-4000-8000-000000000001' and semester_id='fa100000-0000-4000-8000-000000000001'),'onboarding','added mentor can start onboarding without a second approval');
select lives_ok($$select public.set_semester_member_access('fa000000-0000-4000-8000-000000000003','fa000000-0000-4000-8000-000000000004','fa100000-0000-4000-8000-000000000001','mentor',true,'Restored User','rejected-first@example.test')$$,'administrator restores an existing rejected identity');
select is((select status from public.profiles where id='fa000000-0000-4000-8000-000000000004'),'approved','restoration saves approval on the original identity');
reset role;
select * from finish();
rollback;
