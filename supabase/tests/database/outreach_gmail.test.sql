begin;

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(19);

update public.semesters set is_active=false where is_active;
insert into public.semesters(id,name,start_date,end_date,lifecycle_status,is_active,configuration) values
('e1000000-0000-4000-8000-000000000001','Email cohort','2026-09-01','2026-12-31','active',true,'{"timezone":"America/New_York"}'),
('e1000000-0000-4000-8000-000000000002','Other cohort','2026-09-01','2026-12-31','active',false,'{}');

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('e2000000-0000-4000-8000-000000000001','authenticated','authenticated','email-admin@example.test','{}','{}'),
('e2000000-0000-4000-8000-000000000002','authenticated','authenticated','other-admin@example.test','{}','{}'),
('e2000000-0000-4000-8000-000000000003','authenticated','authenticated','email-member@example.test','{}','{}');
insert into public.profiles(id,auth_user_id,email,role,status,is_active,full_name) values
('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','email-admin@example.test','admin','approved',true,'Email Admin'),
('e2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','other-admin@example.test','admin','approved',true,'Other Admin'),
('e2000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000003','email-member@example.test','startup','approved',true,'Email Member');
insert into public.semester_memberships(id,semester_id,profile_id,role,status,activated_at) values
('e2100000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','admin','active',now()),
('e2100000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','admin','active',now()),
('e2100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000003','startup','active',now());

insert into public.outreach_contacts(id,full_name,email,relationship_types,created_by) values
('e3000000-0000-4000-8000-000000000001','Ada Contact','ada@example.test',array['mentor'],'e2000000-0000-4000-8000-000000000001'),
('e3000000-0000-4000-8000-000000000002','Other Contact','other@example.test',array['mentor'],'e2000000-0000-4000-8000-000000000002');
insert into public.outreach_companies(id,name,normalized_name,created_by) values
('e4000000-0000-4000-8000-000000000001','Acme','acme','e2000000-0000-4000-8000-000000000001'),
('e4000000-0000-4000-8000-000000000002','Other','other','e2000000-0000-4000-8000-000000000002');
insert into public.outreach_contact_companies(contact_id,company_id,is_primary) values
('e3000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',true),
('e3000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000002',true);
insert into public.outreach_opportunities(id,semester_id,contact_id,relationship_types,created_by) values
('e5000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001',array['mentor'],'e2000000-0000-4000-8000-000000000001'),
('e5000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000002',array['mentor'],'e2000000-0000-4000-8000-000000000002');


update public.outreach_opportunities set owner_profile_id='e2000000-0000-4000-8000-000000000001' where id='e5000000-0000-4000-8000-000000000001';
insert into auth.users(id,aud,role,email) values ('e2000000-0000-4000-8000-000000000004','authenticated','authenticated','gmail-worker@example.test');
insert into private.calendar_worker_identities(auth_user_id,enabled) values ('e2000000-0000-4000-8000-000000000004',true);
insert into public.outreach_gmail_accounts(profile_id,connection_id,email,provider_subject,encrypted_token)
values ('e2000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001','admin@example.test','test','{}');
insert into public.outreach_gmail_messages(id,semester_id,opportunity_id,profile_id,request_key,request_digest,sender,recipient,subject,body,status)
values ('e6000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000001',repeat('a',64),'admin@example.test','ada@example.test','Test','Body','sending');
select ok(not has_table_privilege('anon','public.outreach_gmail_accounts','SELECT'),'anonymous cannot read account tokens');
select ok(not has_table_privilege('authenticated','public.outreach_gmail_messages','TRUNCATE'),'authenticated cannot truncate history');
select ok(not has_table_privilege('authenticated','public.outreach_gmail_messages','DELETE'),'authenticated cannot delete history');
set local role authenticated;
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.outreach_gmail_accounts),0,'admin cannot read encrypted credentials');
select is((select count(*)::int from public.outreach_gmail_messages),1,'semester admin reads delivery history');
select throws_ok($$select * from public.reserve_personal_gmail('{}','e6000000-0000-4000-8000-000000000001')$$,'42501',null,'browser admin cannot invoke worker claim directly');
with changed as (update public.outreach_gmail_messages set status='unknown' returning id) select is((select count(*)::int from changed),0,'admin cannot forge delivery result');
select throws_ok($$insert into public.outreach_gmail_oauth(state_hash,profile_id,semester_id,encrypted_verifier,expires_at) values(repeat('a',64),'e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','{}',now()+interval '10 minutes')$$,'42501',null,'admin cannot forge oauth transaction');
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.outreach_gmail_messages),0,'other semester admin cannot see delivery');
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000003',true);
select is((select count(*)::int from public.outreach_gmail_messages),0,'startup cannot see delivery');
select is((select count(*)::int from public.outreach_gmail_accounts),0,'startup cannot read credentials');
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000004',true);
select is((select count(*)::int from public.outreach_gmail_accounts),1,'registered integration identity can read encrypted credentials');
with changed as (update public.outreach_gmail_messages set status='unknown' returning id) select is((select count(*)::int from changed),1,'registered identity records result');
select lives_ok($$insert into public.outreach_gmail_oauth(state_hash,profile_id,semester_id,encrypted_verifier,expires_at) values(repeat('b',64),'e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','{}',now()+interval '10 minutes')$$,'registered identity records oauth transaction');
select throws_ok($$insert into public.outreach_gmail_messages select * from public.outreach_gmail_messages limit 1$$,'23505',null,'duplicate send reservation is rejected');
select throws_ok($$select * from public.reserve_personal_gmail((select to_jsonb(m)||jsonb_build_object('sender','spoof@example.test') from public.outreach_gmail_messages m limit 1),'e6000000-0000-4000-8000-000000000001')$$,'42501',null,'atomic claim rejects sender spoofing');
select throws_ok($$select * from public.reserve_personal_gmail((select to_jsonb(m)||jsonb_build_object('profile_id','e2000000-0000-4000-8000-000000000002') from public.outreach_gmail_messages m limit 1),'e6000000-0000-4000-8000-000000000001')$$,'42501',null,'atomic claim rejects wrong admin/owner');
select throws_ok($$insert into public.outreach_gmail_messages select 'e6000000-0000-4000-8000-000000000003',semester_id,opportunity_id,profile_id,'e7000000-0000-4000-8000-000000000003',request_digest,sender,recipient,subject,body,status,google_message_id,google_thread_id,created_at from public.outreach_gmail_messages limit 1$$,'23505',null,'different request keys cannot bypass unresolved gate');
update public.outreach_gmail_messages set status='reviewed';
select is((select count(*)::int from public.reserve_personal_gmail((select to_jsonb(m)||jsonb_build_object('id','e6000000-0000-4000-8000-000000000004','request_key','e7000000-0000-4000-8000-000000000004') from public.outreach_gmail_messages m limit 1),'e6000000-0000-4000-8000-000000000001')),1,'atomic claim accepts valid owning admin and mailbox');
reset role;
select * from finish();
rollback;
