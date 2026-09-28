create table if not exists public.friday_speakers (
  semester_id uuid not null,
  meeting_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 160),
  bio text not null check (length(btrim(bio)) between 1 and 3000),
  expertise text not null check (length(btrim(expertise)) between 1 and 500),
  topic text not null check (length(btrim(topic)) between 1 and 300),
  contact_email text not null check (length(btrim(contact_email)) between 3 and 254),
  contact_phone text check (contact_phone is null or length(contact_phone) <= 100),
  linkedin_url text check (linkedin_url is null or (length(linkedin_url) <= 500 and linkedin_url ~ '^https://')),
  website_url text check (website_url is null or (length(website_url) <= 500 and website_url ~ '^https://')),
  updated_at timestamptz not null default now(),
  primary key (meeting_id),
  constraint friday_speakers_semester_id_fkey foreign key (semester_id) references public.semesters(id) on delete cascade,
  constraint friday_speakers_meeting_fkey foreign key (semester_id, meeting_id) references public.meetings(semester_id, id) on delete cascade
);

create index if not exists friday_speakers_semester_idx on public.friday_speakers (semester_id);
alter table public.friday_speakers enable row level security;

create policy "semester members read Friday speakers"
on public.friday_speakers for select to authenticated
using (
  private.can_manage_semester(semester_id, (select auth.uid()))
  or exists (
    select 1 from public.semester_memberships membership
    where membership.semester_id = friday_speakers.semester_id
      and membership.profile_id = (select private.current_profile_id((select auth.uid())))
      and membership.role in ('mentor', 'startup', 'admin')
      and membership.status in ('active', 'alumni')
  )
);

create policy "semester admins insert Friday speakers"
on public.friday_speakers for insert to authenticated
with check (private.can_manage_semester(semester_id, (select auth.uid())));

create policy "semester admins update Friday speakers"
on public.friday_speakers for update to authenticated
using (private.can_manage_semester(semester_id, (select auth.uid())))
with check (private.can_manage_semester(semester_id, (select auth.uid())));

create policy "semester admins delete Friday speakers"
on public.friday_speakers for delete to authenticated
using (private.can_manage_semester(semester_id, (select auth.uid())));

revoke all privileges on table public.friday_speakers from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.friday_speakers to authenticated;
grant select on table public.friday_speakers to service_role;
