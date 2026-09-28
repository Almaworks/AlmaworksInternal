-- Account integration is global; OAuth attempts and deliveries are semester scoped.
-- Use the existing ordinary server integration identity, protected by its registry/RLS.
-- Gmail credentials are separate from Calendar credentials and never returned to clients.
create table public.outreach_gmail_accounts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  connection_id uuid not null unique,
  email text not null,
  provider_subject text not null,
  encrypted_token jsonb not null,
  connected_at timestamptz not null default now()
);
create table public.outreach_gmail_oauth (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  encrypted_verifier jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create table public.outreach_gmail_messages (
  id uuid primary key,
  semester_id uuid not null references public.semesters(id) on delete restrict,
  opportunity_id uuid not null references public.outreach_opportunities(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  request_key uuid not null,
  request_digest text not null check (request_digest ~ '^[a-f0-9]{64}$'),
  sender text not null,
  recipient text not null,
  subject text not null check (length(subject) between 1 and 500),
  body text not null check (length(body) between 1 and 20000),
  status text not null check (status in ('sending','sent','rejected','unknown','reviewed')),
  google_message_id text,
  google_thread_id text,
  created_at timestamptz not null default now(),
  unique(profile_id,request_key),
  foreign key (semester_id,opportunity_id) references public.outreach_opportunities(semester_id,id) on delete restrict,
  check ((status='sent' and google_message_id is not null) or (status<>'sent' and google_message_id is null))
);
create index outreach_gmail_messages_scope_idx on public.outreach_gmail_messages(semester_id,opportunity_id,created_at desc);
create unique index outreach_gmail_one_unresolved on public.outreach_gmail_messages(profile_id,opportunity_id) where status in ('sending','unknown');
create index outreach_gmail_oauth_profile_idx on public.outreach_gmail_oauth(profile_id,semester_id);
alter table public.outreach_gmail_accounts enable row level security;
alter table public.outreach_gmail_oauth enable row level security;
alter table public.outreach_gmail_messages enable row level security;
revoke all on public.outreach_gmail_accounts,public.outreach_gmail_oauth,public.outreach_gmail_messages from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.outreach_gmail_accounts,public.outreach_gmail_oauth to authenticated;
grant select,insert,update on public.outreach_gmail_messages to authenticated;
create policy "integration identity manages gmail accounts" on public.outreach_gmail_accounts for all to authenticated using (private.is_calendar_worker()) with check (private.is_calendar_worker());
create policy "integration identity manages gmail oauth" on public.outreach_gmail_oauth for all to authenticated using (private.is_calendar_worker()) with check (private.is_calendar_worker());
create policy "integration identity manages gmail messages" on public.outreach_gmail_messages for all to authenticated using (private.is_calendar_worker()) with check (private.is_calendar_worker());
create policy "semester admins read gmail delivery history" on public.outreach_gmail_messages for select to authenticated using (private.can_manage_semester(semester_id,auth.uid()));

-- An existing NOLOGIN/NOBYPASSRLS internal role validates the current owner and
-- reserves in one transaction. Browser callers cannot invoke it as the worker.
grant select on public.outreach_opportunities,public.outreach_contacts to calendar_sql_internal;
grant execute on function private.actor_can_manage_semester(uuid,uuid) to calendar_sql_internal;
create policy "gmail claim reads opportunity" on public.outreach_opportunities for select to calendar_sql_internal using (true);
create policy "gmail claim reads contact" on public.outreach_contacts for select to calendar_sql_internal using (true);
create function public.reserve_personal_gmail(p_message jsonb,p_connection_id uuid)
returns setof public.outreach_gmail_messages language plpgsql security definer set search_path='' as $$
declare m public.outreach_gmail_messages; valid boolean;
begin
  if not private.is_calendar_worker() then raise exception 'Integration identity required' using errcode='42501'; end if;
  m := jsonb_populate_record(null::public.outreach_gmail_messages,p_message);
  if not private.actor_can_manage_semester(m.semester_id,m.profile_id) then raise exception 'Administrator access required' using errcode='42501'; end if;
  select true into valid from public.outreach_opportunities o join public.outreach_contacts c on c.id=o.contact_id
  where o.id=m.opportunity_id and o.semester_id=m.semester_id and o.owner_profile_id=m.profile_id
    and o.archived_at is null and not o.is_silenced and o.stage not in ('declined','closed')
    and c.archived_at is null and c.email=m.recipient;
  if valid is distinct from true then raise exception 'Outreach owner or recipient changed' using errcode='42501'; end if;
  if not exists(select 1 from public.outreach_gmail_accounts a where a.profile_id=m.profile_id and a.connection_id=p_connection_id and a.email=m.sender) then raise exception 'Mailbox connection changed' using errcode='42501'; end if;
  m.status := 'sending'; m.google_message_id := null; m.google_thread_id := null; m.created_at := now();
  return query insert into public.outreach_gmail_messages select m.* on conflict (profile_id,request_key) do nothing returning *;
end $$;
grant create on schema public to calendar_sql_internal;
alter function public.reserve_personal_gmail(jsonb,uuid) owner to calendar_sql_internal;
revoke create on schema public from calendar_sql_internal;
revoke all on function public.reserve_personal_gmail(jsonb,uuid) from public,anon,service_role;
grant execute on function public.reserve_personal_gmail(jsonb,uuid) to authenticated;
