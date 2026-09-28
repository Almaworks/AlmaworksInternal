-- Friday generation executes with the caller's RLS permissions. A platform
-- administrator may manage a semester without holding a cohort membership.
create policy "Friday administrators read eligible startup semesters"
on public.startup_semesters for select to authenticated
using (private.can_manage_semester(semester_id, (select auth.uid())));

create policy "Friday administrators read eligible startup organizations"
on public.startup_organizations for select to authenticated
using (exists (
  select 1 from public.startup_semesters startup_term
  where startup_term.startup_organization_id = startup_organizations.id
    and private.can_manage_semester(startup_term.semester_id, (select auth.uid()))
));
