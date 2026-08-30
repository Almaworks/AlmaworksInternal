begin;

select plan(2);

select is(
  (
    select lifecycle_status::text
    from public.semesters
    where is_active
  ),
  'active',
  'the current semester has active lifecycle status'
);

select throws_ok(
  $$
    update public.semesters
    set lifecycle_status = 'draft'
    where is_active
  $$,
  '23514',
  null,
  'an active semester cannot be marked as a draft'
);

select * from finish();

rollback;
