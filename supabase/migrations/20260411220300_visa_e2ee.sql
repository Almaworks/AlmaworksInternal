create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  public_key_jwk jsonb,
  public_key_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_agents_updated_at on public.agents;
create trigger set_agents_updated_at
before update on public.agents
for each row execute function public.set_updated_at();

create table if not exists public.visa_application_drafts (
  id uuid primary key default gen_random_uuid(),
  passport_type text not null,
  destination_country text not null default 'China',
  travelers_count int not null check (travelers_count > 0),
  status text not null default 'draft' check (status in ('draft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_drafts_updated_at on public.visa_application_drafts;
create trigger set_drafts_updated_at
before update on public.visa_application_drafts
for each row execute function public.set_updated_at();

create table if not exists public.visa_application_orders (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null unique references public.visa_application_drafts(id) on delete cascade,
  passport_type text not null,
  destination_country text not null default 'China',
  travelers_count int not null check (travelers_count > 0),
  status text not null default 'draft' check (status in ('draft','pending_payment','paid','processing','completed')),
  paid_at timestamptz,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  processing_due_at timestamptz,
  stripe_checkout_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_orders_updated_at on public.visa_application_orders;
create trigger set_orders_updated_at
before update on public.visa_application_orders
for each row execute function public.set_updated_at();

create table if not exists public.visa_application_passenger_payloads (
  order_id uuid not null references public.visa_application_orders(id) on delete cascade,
  passenger_index int not null check (passenger_index >= 0),
  payload_type text not null check (payload_type in ('personal_info','passport_info')),
  iv bytea not null,
  ciphertext bytea not null,
  created_at timestamptz not null default now(),
  primary key (order_id, passenger_index, payload_type)
);

create table if not exists public.visa_application_data_keys (
  order_id uuid not null references public.visa_application_orders(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  encrypted_data_key bytea not null,
  algorithm text not null default 'RSA-OAEP',
  created_at timestamptz not null default now(),
  primary key (order_id, agent_id)
);

alter table public.agents enable row level security;
alter table public.visa_application_drafts enable row level security;
alter table public.visa_application_orders enable row level security;
alter table public.visa_application_passenger_payloads enable row level security;
alter table public.visa_application_data_keys enable row level security;

drop policy if exists "agents_select_own" on public.agents;
create policy "agents_select_own"
on public.agents for select to authenticated
using (user_id = auth.uid());

drop policy if exists "agents_insert_own" on public.agents;
create policy "agents_insert_own"
on public.agents for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "agents_update_own" on public.agents;
create policy "agents_update_own"
on public.agents for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "orders_select_for_agent" on public.visa_application_orders;
create policy "orders_select_for_agent"
on public.visa_application_orders for select to authenticated
using (
  exists (
    select 1 from public.visa_application_data_keys dk
    join public.agents a on a.id = dk.agent_id
    where dk.order_id = visa_application_orders.id and a.user_id = auth.uid()
  )
);

drop policy if exists "orders_update_for_agent" on public.visa_application_orders;
create policy "orders_update_for_agent"
on public.visa_application_orders for update to authenticated
using (
  exists (
    select 1 from public.visa_application_data_keys dk
    join public.agents a on a.id = dk.agent_id
    where dk.order_id = visa_application_orders.id and a.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.visa_application_data_keys dk
    join public.agents a on a.id = dk.agent_id
    where dk.order_id = visa_application_orders.id and a.user_id = auth.uid()
  )
);

drop policy if exists "payloads_select_for_agent" on public.visa_application_passenger_payloads;
create policy "payloads_select_for_agent"
on public.visa_application_passenger_payloads for select to authenticated
using (
  exists (
    select 1 from public.visa_application_data_keys dk
    join public.agents a on a.id = dk.agent_id
    where dk.order_id = visa_application_passenger_payloads.order_id and a.user_id = auth.uid()
  )
);

drop policy if exists "data_keys_select_own_agent" on public.visa_application_data_keys;
create policy "data_keys_select_own_agent"
on public.visa_application_data_keys for select to authenticated
using (
  agent_id = (
    select id from public.agents a where a.user_id = auth.uid() limit 1
  )
);;
