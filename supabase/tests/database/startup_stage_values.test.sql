begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

select results_eq(
  $$select enumlabel from pg_enum where enumtypid = 'public.startup_stage'::regtype order by enumsortorder$$,
  $$values ('idea'::name), ('mvp'::name), ('pilot'::name), ('growth'::name), ('fundraising'::name)$$,
  'startup stages retain old values and place pilot before growth with fundraising last'
);

insert into public.semesters (id, name, start_date, end_date, lifecycle_status, is_active, configuration)
values ('e2000000-0000-4000-8000-000000000001', 'Startup stages', '2099-01-01', '2099-05-31', 'active', false, '{}');

insert into public.startup_organizations (id, name, slug)
values
  ('e2100000-0000-4000-8000-000000000001', 'Idea startup', 'stage-idea'),
  ('e2100000-0000-4000-8000-000000000002', 'MVP startup', 'stage-mvp'),
  ('e2100000-0000-4000-8000-000000000003', 'Growth startup', 'stage-growth'),
  ('e2100000-0000-4000-8000-000000000004', 'Pilot startup', 'stage-pilot'),
  ('e2100000-0000-4000-8000-000000000005', 'Fundraising startup', 'stage-fundraising');

insert into public.startup_semesters (semester_id, startup_organization_id, stage)
select
  'e2000000-0000-4000-8000-000000000001',
  organization_id,
  stage::public.startup_stage
from (values
  ('e2100000-0000-4000-8000-000000000001'::uuid, 'idea'),
  ('e2100000-0000-4000-8000-000000000002'::uuid, 'mvp'),
  ('e2100000-0000-4000-8000-000000000003'::uuid, 'growth'),
  ('e2100000-0000-4000-8000-000000000004'::uuid, 'pilot'),
  ('e2100000-0000-4000-8000-000000000005'::uuid, 'fundraising')
) as stages(organization_id, stage);

select results_eq(
  $$select stage::text from public.startup_semesters where semester_id = 'e2000000-0000-4000-8000-000000000001' and stage in ('idea', 'mvp', 'growth') order by stage::text$$,
  $$values ('growth'::text), ('idea'::text), ('mvp'::text)$$,
  'existing startup stage values still save'
);
select is(
  (select count(*) from public.startup_semesters where semester_id = 'e2000000-0000-4000-8000-000000000001' and stage = 'pilot'),
  1::bigint,
  'pilot saves to startup semesters'
);
select is(
  (select count(*) from public.startup_semesters where semester_id = 'e2000000-0000-4000-8000-000000000001' and stage = 'fundraising'),
  1::bigint,
  'fundraising saves to startup semesters'
);

select * from finish();
rollback;
