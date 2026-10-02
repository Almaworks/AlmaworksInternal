-- New managed logos are private. Existing public startup-logos objects/URLs
-- are legacy assets and are deliberately not moved or made inaccessible.
alter table public.startup_organizations add column if not exists logo_path text;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.startup_organizations'::regclass and conname='startup_organizations_logo_path_check') then
    alter table public.startup_organizations add constraint startup_organizations_logo_path_check
      check (logo_path is null or logo_path ~ ('^' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'));
  end if;
end $$;

create or replace function private.can_manage_startup_logo(organization_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.startup_semesters term
    join public.semesters semester on semester.id=term.semester_id
    join public.startup_team_memberships team on team.startup_semester_id=term.id and team.semester_id=term.semester_id
    join public.semester_memberships member on member.id=team.semester_membership_id and member.semester_id=team.semester_id
    join public.profiles profile on profile.id=member.profile_id
    where term.startup_organization_id=organization_id and semester.is_active
      and member.role='startup' and member.status in ('onboarding','active')
      and profile.auth_user_id=(select auth.uid()) and profile.is_active and profile.status='approved'
  );
$$;
revoke all on function private.can_manage_startup_logo(uuid) from public,anon,service_role;
grant execute on function private.can_manage_startup_logo(uuid) to authenticated;
grant update (logo_path,logo_url) on public.startup_organizations to authenticated;

create or replace function private.guard_startup_logo_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.logo_path,new.logo_url) is distinct from (old.logo_path,old.logo_url)
     and not private.can_manage_startup_logo(old.id) then
    raise exception 'An active assigned startup membership is required to change this logo.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_startup_logo_update() from public,anon,authenticated,service_role;
create trigger guard_startup_logo_update before update of logo_path,logo_url
on public.startup_organizations for each row execute function private.guard_startup_logo_update();

create policy "cohort viewers read managed startup logos" on storage.objects
for select to authenticated using (
  bucket_id='startup-profile-logos' and exists (
    select 1 from public.startup_organizations organization
    where organization.id::text=(storage.foldername(storage.objects.name))[1]
  )
);
create policy "assigned startup members insert managed logos" on storage.objects
for insert to authenticated with check (
  bucket_id='startup-profile-logos'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and exists (select 1 from public.startup_organizations organization
    where organization.id::text=(storage.foldername(storage.objects.name))[1]
      and private.can_manage_startup_logo(organization.id))
);
create policy "assigned startup members delete managed logos" on storage.objects
for delete to authenticated using (
  bucket_id='startup-profile-logos'
  and exists (select 1 from public.startup_organizations organization
    where organization.id::text=(storage.foldername(storage.objects.name))[1]
      and private.can_manage_startup_logo(organization.id))
);
