-- Keep the legacy seeded current semester consistent with the lifecycle model.
update public.semesters
set lifecycle_status = 'active'
where is_active
  and lifecycle_status <> 'active';
