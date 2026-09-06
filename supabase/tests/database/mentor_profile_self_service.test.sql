begin;

select plan(2);

select ok(
  (
    select bool_and(
      has_column_privilege(
        'authenticated',
        'public.mentor_profiles',
        column_name,
        'UPDATE'
      )
    )
    from unnest(array[
      'biography',
      'company',
      'title',
      'expertise_tags',
      'website_url',
      'linkedin_url'
    ]) as editable(column_name)
  ),
  'authenticated mentors can update every self-service mentor profile field'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.mentor_profiles',
    'profile_id',
    'UPDATE'
  ),
  'authenticated mentors cannot change mentor profile ownership'
);

select * from finish();

rollback;
