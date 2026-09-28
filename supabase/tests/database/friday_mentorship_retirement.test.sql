begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

select ok(
  to_regclass('public.meeting_availability') is null,
  'legacy Friday mentor availability rows and table are retired'
);
select ok(
  to_regprocedure('public.save_mentor_meeting_availability(uuid,jsonb)') is null,
  'legacy Friday mentor availability write RPC is retired'
);

select ok(
  to_regprocedure('public.commit_mentor_assignment(uuid,uuid,smallint,uuid,uuid,text,text,text,text[],text,jsonb)') is not null,
  'legacy assignment function remains for historical compatibility'
);
select ok(
  not has_function_privilege('authenticated', 'public.commit_mentor_assignment(uuid,uuid,smallint,uuid,uuid,text,text,text,text[],text,jsonb)', 'execute'),
  'authenticated users cannot create new legacy mentor assignments'
);
select ok(
  not has_column_privilege('authenticated', 'public.sessions', 'meeting_id', 'insert'),
  'authenticated users cannot insert legacy sessions directly'
);
select ok(
  has_table_privilege('authenticated', 'public.sessions', 'select'),
  'authenticated historical session visibility remains available through RLS'
);
select ok(
  has_function_privilege('authenticated', 'public.generate_friday_program(uuid,uuid,boolean)', 'execute'),
  'the separate Friday Program generation function remains available'
);

select * from finish();
rollback;
