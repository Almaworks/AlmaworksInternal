begin;
select plan(52);
select ok(to_regprocedure('public.preview_member_deletion(uuid)') is not null, 'deletion preview exists');
select ok(to_regprocedure('public.prepare_member_deletion(uuid,text,text,text)') is not null, 'deletion prepare exists');
select ok(to_regprocedure('public.finalize_member_deletion(uuid,uuid)') is not null, 'deletion finalize exists');
select ok(not has_function_privilege('anon','public.preview_member_deletion(uuid)','execute'), 'anonymous preview denied');
select ok(not has_function_privilege('anon','public.prepare_member_deletion(uuid,text,text,text)','execute'), 'anonymous prepare denied');
select ok(not has_function_privilege('anon','public.finalize_member_deletion(uuid,uuid)','execute'), 'anonymous finalize denied');
select ok(not has_function_privilege('service_role','public.prepare_member_deletion(uuid,text,text,text)','execute'), 'service-role bypass denied');
select ok((select relrowsecurity from pg_class where oid='public.member_deletion_operations'::regclass), 'operation table has RLS');
select ok(not has_table_privilege('authenticated','public.member_deletion_operations','select'), 'temporary identifiers are not directly exposed');

insert into public.semesters(id,name,start_date,end_date,lifecycle_status)
values ('c1000000-0000-0000-0000-000000000001','Deletion semester','2025-01-01','2025-05-31','closed');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values
('c2000000-0000-0000-0000-000000000001','authenticated','authenticated','deletion-admin@example.test','{}','{}'),
('c2000000-0000-0000-0000-000000000002','authenticated','authenticated','deletion-mentor@example.test','{}','{}'),
('c2000000-0000-0000-0000-000000000003','authenticated','authenticated','deletion-startup@example.test','{}','{}'),
('c2000000-0000-0000-0000-000000000004','authenticated','authenticated','deletion-teammate@example.test','{}','{}'),
('c2000000-0000-0000-0000-000000000005','authenticated','authenticated','deletion-founder@example.test','{}','{}');
insert into public.profiles(id,auth_user_id,email,full_name,role,status)
values
('c2000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','deletion-admin@example.test','Deletion Admin','admin','approved'),
('c2000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000002','deletion-mentor@example.test','Deletion Mentor','mentor','approved'),
('c2000000-0000-0000-0000-000000000003','c2000000-0000-0000-0000-000000000003','deletion-startup@example.test','Deletion Startup','startup','approved'),
('c2000000-0000-0000-0000-000000000004','c2000000-0000-0000-0000-000000000004','deletion-teammate@example.test','Deletion Teammate','startup','approved'),
('c2000000-0000-0000-0000-000000000005','c2000000-0000-0000-0000-000000000005','deletion-founder@example.test','Sole Founder','startup','approved');
insert into public.platform_roles(profile_id,role,granted_by)
values('c2000000-0000-0000-0000-000000000001','super_admin','c2000000-0000-0000-0000-000000000001');
insert into public.semester_memberships(id,semester_id,profile_id,role,status,onboarding_data)
values
('c3000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000002','mentor','alumni','{"phone":"212-555-0123"}'),
('c3000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000003','startup','alumni','{}'),
('c3000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000004','startup','alumni','{}'),
('c3000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000005','startup','alumni','{}');
insert into public.mentor_profiles(profile_id,biography,company) values('c2000000-0000-0000-0000-000000000002','Private biography','Private Company');
insert into public.mentor_semesters(id,semester_id,semester_membership_id,mentorship_goals)
values('c4000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000002','Personal goals');
insert into public.outreach_gmail_accounts(profile_id,connection_id,email,provider_subject,encrypted_token)
values('c2000000-0000-0000-0000-000000000002','c8000000-0000-0000-0000-000000000002','deletion-mentor@example.test','synthetic-provider','{}');
insert into public.outreach_gmail_oauth(state_hash,profile_id,semester_id,encrypted_verifier,expires_at)
values(repeat('a',64),'c2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','{}',now()+interval '1 hour');
insert into public.notification_deliveries(id,semester_id,event_kind,source_id,source_version,recipient_profile_id,recipient_email,status)
values('c9000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','outreach_digest',
  'c1000000-0000-0000-0000-000000000001','synthetic','c2000000-0000-0000-0000-000000000002','deletion-mentor@example.test','queued');
insert into public.outreach_contacts(id,full_name,email,relationship_types,created_by)
values('ca000000-0000-0000-0000-000000000001','Unrelated contact','unrelated@example.test',array['mentor'],'c2000000-0000-0000-0000-000000000001');
insert into public.outreach_opportunities(id,semester_id,contact_id,relationship_types,created_by)
values('cb000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',
  'ca000000-0000-0000-0000-000000000001',array['mentor'],'c2000000-0000-0000-0000-000000000001');
insert into public.startup_organizations(id,name,slug) values
('c5000000-0000-0000-0000-000000000001','Shared Startup','shared-deletion-startup'),
('c5000000-0000-0000-0000-000000000005','Founder Startup','founder-deletion-startup');
insert into public.startup_semesters(id,semester_id,startup_organization_id)
values
('c6000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','c5000000-0000-0000-0000-000000000001'),
('c6000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000001','c5000000-0000-0000-0000-000000000005');
insert into public.startup_team_memberships(id,semester_id,startup_semester_id,semester_membership_id,is_primary_contact)
values
('c7000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000001','c6000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000003',false),
('c7000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000001','c6000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000004',true),
('c7000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000001','c6000000-0000-0000-0000-000000000005','c3000000-0000-0000-0000-000000000005',true);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c2000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select throws_ok($$select * from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')$$,'42501','Platform super-administrator access required','non-admin preview denied');
select throws_ok($$select * from public.prepare_member_deletion('c2000000-0000-0000-0000-000000000002','deletion-mentor@example.test','A member request','v')$$,'42501','Platform super-administrator access required','non-admin prepare denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok($$select * from public.preview_member_deletion('c2000000-0000-0000-0000-000000000001')$$,'42501','Protected account cannot be deleted','self preview denied');
select throws_ok($$select * from public.prepare_member_deletion('c2000000-0000-0000-0000-000000000001','deletion-admin@example.test','A member request','v')$$,'42501','Protected account cannot be deleted','platform admin prepare denied');
select is((select status from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')),'ready','mentor is ready');
select is((select blockers from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')),'{}'::text[],
  'mentor without shared linked rows can delete despite new dependency tables');
select set_config('test.clean_deletion_version',(select version from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')),true);
reset role;
insert into public.outreach_gmail_messages(id,semester_id,opportunity_id,profile_id,request_key,request_digest,sender,recipient,subject,body,status)
values('cc000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',
  'cb000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001',
  'cd000000-0000-0000-0000-000000000001',repeat('a',64),'deletion-admin@example.test',
  'deletion-mentor@example.test','Personal snapshot','Private message','rejected');
set local role authenticated;
select ok((select 'Personal Gmail message snapshots require a separate ownership and privacy review.'=any(blockers)
  from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')),
  'Gmail snapshot addressed to target blocks even when another profile owns it');
select isnt((select version from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')),
  current_setting('test.clean_deletion_version'),'recipient-matched Gmail snapshot invalidates preview');
reset role;
delete from public.outreach_gmail_messages where id='cc000000-0000-0000-0000-000000000001';
insert into public.notification_deliveries(id,semester_id,event_kind,source_id,source_version,recipient_profile_id,recipient_email,status)
values('c9000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000001','outreach_digest',
  'c1000000-0000-0000-0000-000000000001','synthetic','c2000000-0000-0000-0000-000000000001','deletion-mentor@example.test','accepted');
set local role authenticated;
select ok((select 'A notification delivery snapshot addressed to this member requires a privacy review.'=any(blockers)
  from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')),
  'recipient email match blocks even when delivery points to another profile');
reset role;
delete from public.notification_deliveries where id='c9000000-0000-0000-0000-000000000003';
update public.notification_deliveries set status='submitting' where id='c9000000-0000-0000-0000-000000000002';
set local role authenticated;
select ok((select 'Resolve in-flight or uncertain notification delivery before deleting this member.'=any(blockers)
  from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')),
  'submitting delivery blocks deletion until its send outcome is known');
reset role;
update public.notification_deliveries set status='queued' where id='c9000000-0000-0000-0000-000000000002';
set local role authenticated;
select is((select counts->>'startupTeams' from public.preview_member_deletion('c2000000-0000-0000-0000-000000000003')),'1','startup team impact counted');
select is((select impact->'semesters'->>0 from public.preview_member_deletion('c2000000-0000-0000-0000-000000000003')),'Deletion semester','preview names affected semester');
select ok((select 'Transfer primary startup contact ownership before deletion.'=any(blockers) from public.preview_member_deletion('c2000000-0000-0000-0000-000000000004')),'shared primary contact must transfer ownership');
select is((select blockers from public.preview_member_deletion('c2000000-0000-0000-0000-000000000005')),'{}'::text[],'sole founder can leave admin-managed startup');
select throws_ok($$select * from public.prepare_member_deletion('c2000000-0000-0000-0000-000000000002',null,'A member request',(select version from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')))$$,'22023','Confirmation email does not match the target','null confirmation cannot bypass');
select throws_ok($$select * from public.prepare_member_deletion('c2000000-0000-0000-0000-000000000002','deletion-mentor@example.test',null,(select version from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')))$$,'22023','A deletion reason of 10–500 characters is required','null reason cannot bypass');
select throws_ok($$select * from public.prepare_member_deletion('c2000000-0000-0000-0000-000000000002','deletion-mentor@example.test','A member request',null)$$,'PT409','Deletion preview changed; review the impact again','null version cannot bypass');
select throws_ok($$select * from public.prepare_member_deletion('c2000000-0000-0000-0000-000000000002','deletion-mentor@example.test','A member request','stale')$$,'PT409','Deletion preview changed; review the impact again','stale preview denied');
select throws_ok($$select * from public.prepare_member_deletion('c2000000-0000-0000-0000-000000000002','wrong@example.test','A member request',(select version from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')))$$,'22023','Confirmation email does not match the target','wrong email denied');
select is((select status from public.prepare_member_deletion('c2000000-0000-0000-0000-000000000002','deletion-mentor@example.test','A member request',(select version from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')))),'in_progress','prepare disables access');
select is((select is_active from public.profiles where id='c2000000-0000-0000-0000-000000000002'),false,'profile disabled');
select is(private.current_profile_id('c2000000-0000-0000-0000-000000000002'::uuid),null::uuid,'prepared identity cannot resolve old session');
select throws_ok($$update public.notification_deliveries set status='submitting' where id='c9000000-0000-0000-0000-000000000002'$$,
  '55000','Deleted member delivery state cannot be recreated or advanced','prepared delivery cannot be claimed by a stale worker');
select throws_ok($$select * from public.finalize_member_deletion('c2000000-0000-0000-0000-000000000002',(select operation_id from public.prepare_member_deletion('c2000000-0000-0000-0000-000000000002','deletion-mentor@example.test','A member request',(select version from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')))))$$,'55000','Auth identity still exists; retry external cleanup','finalize requires Auth removal');
reset role;

select throws_ok($$update public.outreach_gmail_accounts
  set profile_id='c2000000-0000-0000-0000-000000000001'
  where profile_id='c2000000-0000-0000-0000-000000000002'$$,
  '55000','Deleted member delivery state cannot be recreated or advanced',
  'prepared Gmail credentials cannot be moved to another profile');

delete from auth.users where id='c2000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((select status from public.finalize_member_deletion('c2000000-0000-0000-0000-000000000002',(select operation_id from public.prepare_member_deletion('c2000000-0000-0000-0000-000000000002','deletion-mentor@example.test','A member request',(select version from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')))))),'completed','finalization completes');
select is((select email from public.profiles where id='c2000000-0000-0000-0000-000000000002'),'deleted+c2000000-0000-0000-0000-000000000002@invalid.example','email anonymized');
select is((select count(*) from public.mentor_profiles where profile_id='c2000000-0000-0000-0000-000000000002'),0::bigint,'mentor profile details deleted');
select is((select onboarding_data from public.semester_memberships where profile_id='c2000000-0000-0000-0000-000000000002'),'{}'::jsonb,'onboarding payload removed');
select is((select count(*) from public.outreach_gmail_accounts where profile_id='c2000000-0000-0000-0000-000000000002'),0::bigint,'Gmail credentials removed');
select is((select count(*) from public.outreach_gmail_oauth where profile_id='c2000000-0000-0000-0000-000000000002'),0::bigint,'pending Gmail consent removed');
select is((select count(*) from public.notification_deliveries where recipient_profile_id='c2000000-0000-0000-0000-000000000002'),0::bigint,'recipient delivery ledger removed');
select is((select count(*) from public.startup_team_memberships where semester_membership_id='c3000000-0000-0000-0000-000000000004'),1::bigint,'teammate remains linked');
select is((select impact->'sharedStartups' from public.preview_member_deletion('c2000000-0000-0000-0000-000000000002')),'[]'::jsonb,'completed preview exposes no association snapshot');
reset role;
select throws_ok($$update public.profiles set status='approved' where id='c2000000-0000-0000-0000-000000000002'$$,'55000','Deleted member identity cannot be restored or edited','completed anchor cannot re-enter directories');
select throws_ok($$update public.profiles set photo_path='c2000000-0000-0000-0000-000000000002/11111111-1111-1111-1111-111111111111.png' where id='c2000000-0000-0000-0000-000000000002'$$,'55000','Deleted member identity cannot be restored or edited','completed anchor cannot regain personal photo');
select throws_ok($$update public.semester_memberships set status='active' where profile_id='c2000000-0000-0000-0000-000000000002'$$,'55000','Deleted member cannot regain program access','completed membership cannot reactivate');
select throws_ok($$insert into public.mentor_profiles(profile_id,biography) values('c2000000-0000-0000-0000-000000000002','Stale biography')$$,'55000','Deleted member details cannot be recreated','stale mentor detail save denied');
select throws_ok($$update public.mentor_semesters set opening_talk='Stale personal detail' where id='c4000000-0000-0000-0000-000000000002'$$,'55000','Deleted member details cannot be recreated','stale mentor semester detail save denied');
select throws_ok($$insert into public.outreach_gmail_oauth(state_hash,profile_id,semester_id,encrypted_verifier,expires_at)
  values(repeat('b',64),'c2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','{}',now()+interval '1 hour')$$,
  '55000','Deleted member delivery state cannot be recreated or advanced','late Gmail OAuth callback cannot recreate consent');
select throws_ok($$insert into public.outreach_gmail_accounts(profile_id,connection_id,email,provider_subject,encrypted_token)
  values('c2000000-0000-0000-0000-000000000002','c8000000-0000-0000-0000-000000000003','deletion-mentor@example.test','synthetic-provider','{}')$$,
  '55000','Deleted member delivery state cannot be recreated or advanced','late Gmail callback cannot recreate credentials');
-- The local baseline includes the signup function but not its hosted auth.users trigger.
-- Install that function as a rollback-only trigger to exercise same-email signup semantics.
create trigger member_deletion_signup_test after insert on auth.users
for each row execute function public.handle_new_user();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values('c2000000-0000-0000-0000-000000000006','authenticated','authenticated','deletion-mentor@example.test','{}','{}');
select is((select count(*) from public.profiles where auth_user_id='c2000000-0000-0000-0000-000000000006' and id<>'c2000000-0000-0000-0000-000000000002'),1::bigint,'same-email signup creates fresh distinct profile');
select is((select count(*) from public.semester_memberships where profile_id='c2000000-0000-0000-0000-000000000006'),0::bigint,'fresh identity has no old program history');
select * from finish();
rollback;

