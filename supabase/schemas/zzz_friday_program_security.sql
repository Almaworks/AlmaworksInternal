revoke all privileges on table public.friday_programs from public, anon, authenticated, service_role;
revoke all privileges on table public.friday_program_assignments from public, anon, authenticated, service_role;
revoke all privileges on function public.validate_friday_program_publication() from public, anon, authenticated, service_role;
revoke all privileges on function public.generate_friday_program(uuid, uuid, boolean) from public, anon, authenticated, service_role;

grant select, insert, update on table public.friday_programs to authenticated;
grant select, insert, delete on table public.friday_program_assignments to authenticated;
grant select on table public.friday_programs to service_role;
grant select on table public.friday_program_assignments to service_role;
grant execute on function public.generate_friday_program(uuid, uuid, boolean) to authenticated;
