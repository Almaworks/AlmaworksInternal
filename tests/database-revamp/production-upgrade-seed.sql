insert into public.semesters (id, name, start_date, end_date, is_active, lifecycle_status)
values ('10000000-0000-0000-0000-000000000001', 'Legacy semester', '2026-01-01', '2026-05-31', false, 'closed');

insert into public.profiles (id, email, role, semester_id, status, is_active)
select gen_random_uuid(), 'legacy-' || n || '@example.com', 'mentor',
  '10000000-0000-0000-0000-000000000001', 'approved', true
from generate_series(1, 7) n;

insert into public.profiles (id, email, role, semester_id, status, is_active)
values ('20000000-0000-0000-0000-000000000001', 'service-admin@example.com', 'admin',
  '10000000-0000-0000-0000-000000000001', 'approved', true);

insert into auth.users (id, email)
values ('40000000-0000-0000-0000-000000000001', 'attached-admin@example.com');

update public.profiles
set auth_user_id = '40000000-0000-0000-0000-000000000001'
where id = '20000000-0000-0000-0000-000000000001';
insert into public.semester_memberships (id, semester_id, profile_id, role, status)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', 'admin', 'active');
