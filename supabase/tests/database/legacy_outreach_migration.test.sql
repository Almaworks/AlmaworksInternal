begin;

select plan(22);

select has_function(
  'public',
  'commit_legacy_outreach_migration',
  array['uuid', 'text'],
  'atomic legacy commit RPC exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.commit_legacy_outreach_migration(uuid,text)',
    'EXECUTE'
  ),
  'anonymous users cannot execute legacy commit'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.commit_legacy_outreach_migration(uuid,text)',
    'EXECUTE'
  ),
  'authenticated users may execute legacy commit'
);

insert into public.semesters (id, name, start_date, end_date)
values
  ('91000000-0000-0000-0000-000000000001', 'Legacy RPC A', '2026-01-01', '2026-06-01'),
  ('91000000-0000-0000-0000-000000000002', 'Legacy RPC B', '2026-07-01', '2026-12-01');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('92000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'legacy-admin@example.test', '{}', '{"full_name":"Legacy Admin"}'),
  ('92000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'outsider@example.test', '{}', '{"full_name":"Outsider"}'),
  ('92000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'mentor@example.test', '{}', '{"full_name":"Converted Mentor"}');

update public.profiles
set role = case
      when id = '92000000-0000-0000-0000-000000000003' then 'mentor'::public.user_role
      else 'admin'::public.user_role
    end,
    status = 'approved'
where id in (
  '92000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000003'
);

insert into public.semester_memberships (
  id, semester_id, profile_id, role, status, activated_at
)
values
  ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'admin', 'active', now()),
  ('93000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', 'admin', 'active', now());

insert into public.mentor_profiles (profile_id, company)
values ('92000000-0000-0000-0000-000000000003', 'Mentor Co');
insert into public.mentors (id, user_id, semester_id, full_name)
values (
  '94000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000003',
  '91000000-0000-0000-0000-000000000001',
  'Converted Mentor'
);

insert into public.outreach_relationship_labels (id, slug, name, created_by)
values (
  '95000000-0000-0000-0000-000000000001',
  'mentor',
  'Mentor',
  '92000000-0000-0000-0000-000000000001'
);

insert into public.outreach_contacts (id, full_name, email, created_by)
values (
  '96000000-0000-0000-0000-000000000001',
  'Existing Person',
  'existing@example.test',
  '92000000-0000-0000-0000-000000000001'
);
insert into public.outreach_opportunities (
  id, semester_id, contact_id, stage, notes, created_by
)
values (
  '97000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000001',
  'contacted',
  'Existing CRM note',
  '92000000-0000-0000-0000-000000000001'
);

insert into public.outreach (
  id, admin_id, semester_id, prospect_name, status, converted_mentor_id
)
values (
  '98000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  'Existing Person',
  'onboarded',
  '94000000-0000-0000-0000-000000000001'
);
insert into public.outreach_activity_log (
  id, outreach_id, semester_id, admin_id, action_type, detail, created_at
)
values (
  '99000000-0000-0000-0000-000000000001',
  '98000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  'handwritten_follow_up',
  '{"topic":"warm introduction","count":2}',
  '2026-03-01 10:00:00+00'
);

insert into public.outreach_import_jobs (
  id, semester_id, source, status, summary, created_by
)
values (
  '9a000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  'legacy',
  'ready',
  '{"totalRows":2}',
  '92000000-0000-0000-0000-000000000001'
);
insert into public.outreach_import_rows (
  id, semester_id, import_job_id, row_number, raw_payload,
  normalized_payload, match_decision, matched_contact_id
)
values
  (
    '9b000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    '9a000000-0000-0000-0000-000000000001',
    1,
    '{"id":"98000000-0000-0000-0000-000000000001"}',
    '{
      "fullName":"Existing Person",
      "stage":"converted",
      "relationshipLabels":["mentor"],
      "legacy":{
        "notes":"Imported legacy note",
        "sourceChannel":"warm_intro",
        "referredBy":"Ada",
        "expertiseTags":["AI"],
        "lastContactedAt":"2026-03-01T09:00:00.000Z",
        "conversionDetails":{
          "legacyOutreachId":"98000000-0000-0000-0000-000000000001",
          "legacyConvertedMentorId":"94000000-0000-0000-0000-000000000001"
        }
      }
    }',
    'exact_email',
    '96000000-0000-0000-0000-000000000001'
  ),
  (
    '9b000000-0000-0000-0000-000000000002',
    '91000000-0000-0000-0000-000000000001',
    '9a000000-0000-0000-0000-000000000001',
    2,
    '{"id":"98000000-0000-0000-0000-000000000002"}',
    '{
      "fullName":"Unresolved Conversion",
      "email":"unresolved@example.test",
      "stage":"converted",
      "relationshipLabels":[],
      "legacy":{
        "conversionDetails":{
          "legacyOutreachId":"98000000-0000-0000-0000-000000000002",
          "legacyConvertedMentorId":"94000000-0000-0000-0000-000000000099"
        }
      }
    }',
    'create_new',
    null
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.commit_legacy_outreach_migration(
      '91000000-0000-0000-0000-000000000001',
      'legacy-key-1'
    )$$,
  '42501',
  null,
  'an unauthorized administrator cannot commit another semester'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.commit_legacy_outreach_migration(
      '91000000-0000-0000-0000-000000000001',
      'legacy-key-1'
    )$$,
  'an authorized administrator atomically commits the reviewed migration'
);
reset role;

select is(
  (select status from public.outreach_import_jobs where id = '9a000000-0000-0000-0000-000000000001'),
  'committed'::public.outreach_import_status,
  'the import job is committed'
);
select is(
  (select committed_by from public.outreach_import_jobs where id = '9a000000-0000-0000-0000-000000000001'),
  '92000000-0000-0000-0000-000000000001'::uuid,
  'the authenticated importer is preserved'
);
select is(
  (select committed_opportunity_id from public.outreach_import_rows where id = '9b000000-0000-0000-0000-000000000001'),
  '97000000-0000-0000-0000-000000000001'::uuid,
  'the reviewed contact merges into its existing opportunity'
);
select is(
  (select match_decision from public.outreach_import_rows where id = '9b000000-0000-0000-0000-000000000001'),
  'merge'::public.outreach_import_match_decision,
  'merged opportunity provenance is explicit on the import row'
);
select is(
  (select converted_mentor_profile_id from public.outreach_opportunities where id = '97000000-0000-0000-0000-000000000001'),
  '92000000-0000-0000-0000-000000000003'::uuid,
  'legacy mentor conversion resolves through mentor user identity'
);
select is(
  (select count(*) from public.outreach_opportunity_labels where opportunity_id = '97000000-0000-0000-0000-000000000001'),
  1::bigint,
  'relationship labels are attached to merged opportunities'
);
select is(
  (select count(*) from public.outreach_activities
    where opportunity_id = '97000000-0000-0000-0000-000000000001'
      and summary = 'Legacy activity: handwritten_follow_up'),
  1::bigint,
  'unknown legacy actions become CRM notes'
);
select is(
  (select details #>> '{legacy,action_type}' from public.outreach_activities
    where opportunity_id = '97000000-0000-0000-0000-000000000001'
      and summary = 'Legacy activity: handwritten_follow_up'),
  'handwritten_follow_up',
  'unknown activity notes retain the complete original activity JSON'
);
select results_eq(
  $$select actor_profile_id, import_job_id from public.outreach_activities
    where opportunity_id = '97000000-0000-0000-0000-000000000001'
      and summary = 'Legacy activity: handwritten_follow_up'$$,
  $$values (
      '92000000-0000-0000-0000-000000000001'::uuid,
      '9a000000-0000-0000-0000-000000000001'::uuid
    )$$,
  'replayed activities retain legacy actor and import provenance'
);
select ok(
  array_position(
    (select issue_codes from public.outreach_import_rows where id = '9b000000-0000-0000-0000-000000000002'),
    'converted_mentor_unresolved'
  ) is not null,
  'unresolvable legacy mentor conversions remain reviewable issues'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.commit_legacy_outreach_migration(
      '91000000-0000-0000-0000-000000000001',
      'legacy-key-1'
    )$$,
  'replaying the same idempotency key returns the committed result'
);
select throws_ok(
  $$select public.commit_legacy_outreach_migration(
      '91000000-0000-0000-0000-000000000001',
      'different-key'
    )$$,
  '23505',
  null,
  'a committed preview rejects a different idempotency key'
);
reset role;
select is(
  (select count(*) from public.outreach_activities
    where import_job_id = '9a000000-0000-0000-0000-000000000001'),
  2::bigint,
  'idempotent replay creates no duplicate activities'
);

insert into public.outreach_import_jobs (
  id, semester_id, source, status, summary, created_by
)
values (
  '9a000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000002',
  'legacy',
  'ready',
  '{"totalRows":1}',
  '92000000-0000-0000-0000-000000000001'
);
insert into public.outreach_import_rows (
  id, semester_id, import_job_id, row_number, raw_payload,
  normalized_payload, match_decision
)
values (
  '9b000000-0000-0000-0000-000000000003',
  '91000000-0000-0000-0000-000000000002',
  '9a000000-0000-0000-0000-000000000002',
  1,
  '{"id":"98000000-0000-0000-0000-000000000003"}',
  '{
    "fullName":"Rollback Person",
    "email":"rollback@example.test",
    "stage":"contacted",
    "legacy":{"lastContactedAt":"2026-09-01T09:00:00.000Z"}
  }',
  'create_new'
);

create function pg_temp.fail_legacy_replay()
returns trigger
language plpgsql
as $$
begin
  if new.import_job_id = '9a000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'forced legacy replay failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger force_legacy_replay_failure
before insert on public.outreach_activities
for each row execute function pg_temp.fail_legacy_replay();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.commit_legacy_outreach_migration(
      '91000000-0000-0000-0000-000000000002',
      'rollback-key'
    )$$,
  'P0001',
  null,
  'an activity failure aborts the entire legacy transaction'
);
reset role;
drop trigger force_legacy_replay_failure on public.outreach_activities;

select is(
  (select status from public.outreach_import_jobs where id = '9a000000-0000-0000-0000-000000000002'),
  'ready'::public.outreach_import_status,
  'failed commit rolls the job claim back'
);
select is(
  (select count(*) from public.outreach_contacts where email = 'rollback@example.test'),
  0::bigint,
  'failed commit rolls contact creation back'
);
select is(
  (select count(*) from public.outreach_opportunities
    where semester_id = '91000000-0000-0000-0000-000000000002'),
  0::bigint,
  'failed commit leaves no opportunity behind'
);

select * from finish();
rollback;
