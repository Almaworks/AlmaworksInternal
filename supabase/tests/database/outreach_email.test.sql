begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(37);

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

select ok(not prosecdef, 'reservation is security invoker') from pg_proc where oid='public.reserve_outreach_email_message(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,smallint,text,text,text,timestamptz,timestamptz,uuid,timestamptz)'::regprocedure;
select ok((select bool_and(not prosecdef) from pg_proc where pronamespace='private'::regnamespace and proname like '%outreach_email%'), 'all outreach email guards are security invoker');
select ok(not has_table_privilege('anon','public.outreach_email_messages','SELECT'), 'anonymous users cannot read email snapshots');
select ok(not has_table_privilege('authenticated','public.outreach_email_messages','UPDATE'), 'authenticated users cannot update immutable message snapshots');
select ok(not has_table_privilege('authenticated','public.outreach_email_receipts','DELETE'), 'authenticated users cannot delete provider history');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.outreach_email_templates),0::bigint,'ordinary members cannot read templates');
select throws_ok($$insert into public.outreach_email_templates(semester_id,name,subject_template,body_template) values('e1000000-0000-4000-8000-000000000001','Nope','Subject','Body')$$,'42501',null,'ordinary members cannot create templates');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$insert into public.outreach_email_templates(semester_id,name,subject_template,body_template) values('e1000000-0000-4000-8000-000000000001','Intro','Hello {{contact_name}}','Welcome to {{semester_name}}')$$,'semester admin creates a saved template');
select set_config('test.template1',(select id::text from public.outreach_email_templates where semester_id='e1000000-0000-4000-8000-000000000001' and name='Intro'),true);
select is((select created_by from public.outreach_email_templates where id=current_setting('test.template1')::uuid),'e2000000-0000-4000-8000-000000000001'::uuid,'template creator is canonicalized');
select lives_ok($$update public.outreach_email_templates set name='Updated intro' where id=current_setting('test.template1')::uuid$$,'semester admin updates editable template content');
select is((select name from public.outreach_email_templates where id=current_setting('test.template1')::uuid),'Updated intro','template update persists');
select throws_ok($$insert into public.outreach_email_templates(semester_id,name,subject_template,body_template) values('e1000000-0000-4000-8000-000000000001','Bad','Hello {{CONTACT_NAME}}','Body')$$,'23514',null,'direct template writes reject unknown placeholders');
select ok(not has_column_privilege('authenticated','public.outreach_email_templates','created_by','INSERT'),'template creator cannot be supplied through Data API');

select set_config('test.message1',(
  select id::text from public.reserve_outreach_email_message(
    p_id=>'e7000000-0000-4000-8000-000000000001',p_semester_id=>'e1000000-0000-4000-8000-000000000001',p_opportunity_id=>'e5000000-0000-4000-8000-000000000001',p_contact_id=>'e3000000-0000-4000-8000-000000000001',
    p_recipient_name=>'Ada Contact',p_recipient_email=>'ada@example.test',p_sender=>'Almaworks <team@example.test>',p_subject=>'Hello',p_body=>'Plain body',p_client_idempotency_key=>'attempt-1',p_request_digest=>repeat('a',64),
    p_snapshot_version=>1::smallint,p_snapshot_key_id=>'test',p_snapshot_digest=>repeat('b',64),p_snapshot_signature=>repeat('c',64),p_created_at=>now()-interval '4 minutes',p_idempotency_expires_at=>now()+interval '23 hours 56 minutes',p_template_id=>current_setting('test.template1')::uuid
  )
),true);
select is(current_setting('test.message1'),'e7000000-0000-4000-8000-000000000001','valid reservation stores one immutable snapshot');
select is((select id::text from public.reserve_outreach_email_message(
    p_id=>gen_random_uuid(),p_semester_id=>'e1000000-0000-4000-8000-000000000001',p_opportunity_id=>'e5000000-0000-4000-8000-000000000001',p_contact_id=>'e3000000-0000-4000-8000-000000000001',p_recipient_name=>'Ada Contact',p_recipient_email=>'ada@example.test',p_sender=>'Changed sender',p_subject=>'Changed ignored',p_body=>'Changed ignored',p_client_idempotency_key=>'attempt-1',p_request_digest=>repeat('a',64),p_snapshot_version=>1::smallint,p_snapshot_key_id=>'other',p_snapshot_digest=>repeat('d',64),p_snapshot_signature=>repeat('e',64),p_created_at=>now(),p_idempotency_expires_at=>now()+interval '24 hours'
  )),current_setting('test.message1'),'same request digest returns the original snapshot despite later values');
select is((select count(*) from public.outreach_email_messages where client_idempotency_key='attempt-1'),1::bigint,'idempotent reservation creates one message');
select throws_ok($$select * from public.reserve_outreach_email_message(p_id=>gen_random_uuid(),p_semester_id=>'e1000000-0000-4000-8000-000000000001',p_opportunity_id=>'e5000000-0000-4000-8000-000000000001',p_contact_id=>'e3000000-0000-4000-8000-000000000001',p_recipient_name=>'Ada Contact',p_recipient_email=>'ada@example.test',p_sender=>'Sender',p_subject=>'Subject',p_body=>'Body',p_client_idempotency_key=>'attempt-1',p_request_digest=>repeat('f',64),p_snapshot_version=>1::smallint,p_snapshot_key_id=>'test',p_snapshot_digest=>repeat('b',64),p_snapshot_signature=>repeat('c',64),p_created_at=>now(),p_idempotency_expires_at=>now()+interval '24 hours')$$,'23505',null,'same idempotency key rejects a different request digest');
select throws_ok($$select * from public.reserve_outreach_email_message(p_id=>gen_random_uuid(),p_semester_id=>'e1000000-0000-4000-8000-000000000001',p_opportunity_id=>'e5000000-0000-4000-8000-000000000001',p_contact_id=>'e3000000-0000-4000-8000-000000000001',p_recipient_name=>'Ada Contact',p_recipient_email=>'mallory@example.test',p_sender=>'Sender',p_subject=>'Subject',p_body=>'Body',p_client_idempotency_key=>'forged-recipient',p_request_digest=>repeat('1',64),p_snapshot_version=>1::smallint,p_snapshot_key_id=>'test',p_snapshot_digest=>repeat('2',64),p_snapshot_signature=>repeat('3',64),p_created_at=>now(),p_idempotency_expires_at=>now()+interval '24 hours')$$,'23514',null,'direct reservation cannot forge the selected contact recipient');
select throws_ok($$select * from public.reserve_outreach_email_message(p_id=>gen_random_uuid(),p_semester_id=>'e1000000-0000-4000-8000-000000000002',p_opportunity_id=>'e5000000-0000-4000-8000-000000000002',p_contact_id=>'e3000000-0000-4000-8000-000000000002',p_recipient_name=>'Other Contact',p_recipient_email=>'other@example.test',p_sender=>'Sender',p_subject=>'Subject',p_body=>'Body',p_client_idempotency_key=>'inactive',p_request_digest=>repeat('1',64),p_snapshot_version=>1::smallint,p_snapshot_key_id=>'test',p_snapshot_digest=>repeat('2',64),p_snapshot_signature=>repeat('3',64),p_created_at=>now(),p_idempotency_expires_at=>now()+interval '24 hours')$$,'42501',null,'admin cannot reserve for an unmanaged inactive semester');
select throws_ok(format('update public.outreach_email_messages set recipient_email=%L where id=%L','changed@example.test',current_setting('test.message1')),'42501',null,'direct message snapshot mutation is denied');

select lives_ok(format($$insert into public.outreach_email_receipts(semester_id,message_id,snapshot_digest,provider_status,message_status,checked_at,receipt_version,receipt_key_id,receipt_digest,receipt_signature) values('e1000000-0000-4000-8000-000000000001',%L,repeat('b',64),'submitting','submitting',now()-interval '3 minutes',1,'test',repeat('4',64),repeat('5',64))$$,current_setting('test.message1')),'initial signed submission claim is append only');
select is((select sequence from public.outreach_email_receipts where message_id=current_setting('test.message1')::uuid),1::bigint,'first provider receipt gets sequence one');
select lives_ok(format($$insert into public.outreach_email_receipts(semester_id,message_id,snapshot_digest,provider_status,message_status,provider_id,checked_at,receipt_version,receipt_key_id,receipt_digest,receipt_signature) values('e1000000-0000-4000-8000-000000000001',%L,repeat('b',64),'accepted','accepted','email-1',now(),1,'test',repeat('6',64),repeat('7',64))$$,current_setting('test.message1')),'provider acceptance follows the claim');
select is((select max(sequence) from public.outreach_email_receipts where message_id=current_setting('test.message1')::uuid),2::bigint,'receipt sequence follows transition order');
select throws_ok(format($$insert into public.outreach_email_receipts(semester_id,message_id,snapshot_digest,provider_status,message_status,checked_at,last_error,receipt_version,receipt_key_id,receipt_digest,receipt_signature) values('e1000000-0000-4000-8000-000000000001',%L,repeat('b',64),'ambiguous','submission_unknown',now(),'late ambiguity',1,'test',repeat('8',64),repeat('9',64))$$,current_setting('test.message1')),'23514',null,'an ambiguous result cannot regress accepted provider state');
select lives_ok(format($$insert into public.outreach_email_receipts(semester_id,message_id,snapshot_digest,provider_status,message_status,provider_id,checked_at,last_error,receipt_version,receipt_key_id,receipt_digest,receipt_signature) values('e1000000-0000-4000-8000-000000000001',%L,repeat('b',64),'failed','failed','email-1',now(),'provider delivery failed',1,'test',repeat('a',64),repeat('b',64))$$,current_setting('test.message1')),'a provider-reported failure retains its provider identifier');
select set_config('test.message2',(
  select id::text from public.reserve_outreach_email_message(
    p_id=>'e7000000-0000-4000-8000-000000000002',p_semester_id=>'e1000000-0000-4000-8000-000000000001',p_opportunity_id=>'e5000000-0000-4000-8000-000000000001',p_contact_id=>'e3000000-0000-4000-8000-000000000001',p_recipient_name=>'Ada Contact',p_recipient_email=>'ada@example.test',p_sender=>'Almaworks <team@example.test>',p_subject=>'Second',p_body=>'Plain body',p_client_idempotency_key=>'attempt-2',p_request_digest=>repeat('c',64),p_snapshot_version=>1::smallint,p_snapshot_key_id=>'test',p_snapshot_digest=>repeat('d',64),p_snapshot_signature=>repeat('e',64),p_created_at=>now(),p_idempotency_expires_at=>now()+interval '24 hours'
  )
),true);
insert into public.outreach_email_receipts(semester_id,message_id,snapshot_digest,provider_status,message_status,checked_at,receipt_version,receipt_key_id,receipt_digest,receipt_signature)
values('e1000000-0000-4000-8000-000000000001',current_setting('test.message2')::uuid,repeat('d',64),'submitting','submitting',now(),1,'test',repeat('1',64),repeat('2',64));
insert into public.outreach_email_receipts(semester_id,message_id,snapshot_digest,provider_status,message_status,provider_id,checked_at,receipt_version,receipt_key_id,receipt_digest,receipt_signature)
values('e1000000-0000-4000-8000-000000000001',current_setting('test.message2')::uuid,repeat('d',64),'accepted','accepted','email-2',now(),1,'test',repeat('3',64),repeat('4',64));
insert into public.outreach_email_receipts(semester_id,message_id,snapshot_digest,provider_status,message_status,provider_id,checked_at,sent_at,receipt_version,receipt_key_id,receipt_digest,receipt_signature)
values('e1000000-0000-4000-8000-000000000001',current_setting('test.message2')::uuid,repeat('d',64),'delivery_delayed','sent','email-2',now(),now(),1,'test',repeat('5',64),repeat('6',64));
select lives_ok(format($$insert into public.outreach_email_receipts(semester_id,message_id,snapshot_digest,provider_status,message_status,provider_id,checked_at,sent_at,last_error,receipt_version,receipt_key_id,receipt_digest,receipt_signature) values('e1000000-0000-4000-8000-000000000001',%L,repeat('d',64),'failed','failed','email-2',now(),now(),'delivery failed',1,'test',repeat('7',64),repeat('8',64))$$,current_setting('test.message2')),'provider failure can follow a delayed sent state');
select throws_ok(format('update public.outreach_email_receipts set provider_status=%L where message_id=%L','forged',current_setting('test.message1')),'42501',null,'provider receipts cannot be mutated directly');
select is((select count(*) from public.outreach_activities where opportunity_id='e5000000-0000-4000-8000-000000000001'),0::bigint,'provider acceptance does not create an outreach activity');
select is((select latest_outbound_activity_at from public.outreach_opportunities where id='e5000000-0000-4000-8000-000000000001'),null::timestamptz,'provider acceptance does not advance outreach cadence');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.outreach_email_messages),0::bigint,'another semester admin cannot read private email history');
select is((select count(*) from public.outreach_email_templates),0::bigint,'another semester admin cannot read saved templates');

reset role;
select ok(not has_table_privilege('authenticated','public.outreach_email_messages','DELETE'),'immutable email history cannot be deleted through Data API');
select ok(not has_function_privilege('anon','public.reserve_outreach_email_message(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,smallint,text,text,text,timestamptz,timestamptz,uuid,timestamptz)','EXECUTE'),'anonymous users cannot reserve email messages');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.outreach_email_templates'::regclass,'public.outreach_email_messages'::regclass,'public.outreach_email_receipts'::regclass)),'every outreach email table has RLS enabled');
select ok((select bool_and(attnotnull) from pg_attribute where attrelid in ('public.outreach_email_templates'::regclass,'public.outreach_email_messages'::regclass,'public.outreach_email_receipts'::regclass) and attname='semester_id'),'every outreach email record has a non-null semester scope');
select ok(exists(select 1 from pg_constraint where conname='outreach_email_messages_semester_opportunity_fkey' and contype='f'),'message reservation has a same-semester opportunity foreign key');

select * from finish();
rollback;

