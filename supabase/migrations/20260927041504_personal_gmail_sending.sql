revoke all on schema "public" from "calendar_sql_internal";

grant create, usage on schema "public" to "calendar_sql_internal";

set local check_function_bodies = off;

create table "public"."outreach_gmail_accounts" (
  "profile_id"       uuid                     not null,
  "connection_id"    uuid                     not null,
  "email"            text                     not null,
  "provider_subject" text                     not null,
  "encrypted_token"  jsonb                    not null,
  "connected_at"     timestamp with time zone not null default now(),
  constraint "outreach_gmail_accounts_connection_id_key" unique (connection_id),
  constraint "outreach_gmail_accounts_pkey" primary key (profile_id)
);

alter table "public"."outreach_gmail_accounts"
  enable row level security;

create table "public"."outreach_gmail_messages" (
  "id"                uuid                     not null,
  "semester_id"       uuid                     not null,
  "opportunity_id"    uuid                     not null,
  "profile_id"        uuid                     not null,
  "request_key"       uuid                     not null,
  "request_digest"    text                     not null,
  "sender"            text                     not null,
  "recipient"         text                     not null,
  "subject"           text                     not null,
  "body"              text                     not null,
  "status"            text                     not null,
  "google_message_id" text,
  "google_thread_id"  text,
  "created_at"        timestamp with time zone not null default now(),
  constraint "outreach_gmail_messages_body_check" check (((length(body) >= 1) AND (length(body) <= 20000))),
  constraint "outreach_gmail_messages_check" check ((((status = 'sent'::text) AND (google_message_id IS NOT NULL)) OR ((status <> 'sent'::text) AND (google_message_id IS NULL)))),
  constraint "outreach_gmail_messages_pkey" primary key (id),
  constraint "outreach_gmail_messages_profile_id_request_key_key" unique (profile_id, request_key),
  constraint "outreach_gmail_messages_request_digest_check" check ((request_digest ~ '^[a-f0-9]{64}$'::text)),
  constraint "outreach_gmail_messages_status_check" check ((status = ANY (ARRAY['sending'::text, 'sent'::text, 'rejected'::text, 'unknown'::text, 'reviewed'::text]))),
  constraint "outreach_gmail_messages_subject_check" check (((length(subject) >= 1) AND (length(subject) <= 500)))
);

alter table "public"."outreach_gmail_messages"
  enable row level security;

create table "public"."outreach_gmail_oauth" (
  "state_hash"         text                     not null,
  "profile_id"         uuid                     not null,
  "semester_id"        uuid                     not null,
  "encrypted_verifier" jsonb                    not null,
  "expires_at"         timestamp with time zone not null,
  "consumed_at"        timestamp with time zone,
  constraint "outreach_gmail_oauth_pkey" primary key (state_hash),
  constraint "outreach_gmail_oauth_state_hash_check" check ((state_hash ~ '^[a-f0-9]{64}$'::text))
);

alter table "public"."outreach_gmail_oauth"
  enable row level security;

create or replace function public.reserve_personal_gmail (
  p_message       jsonb,
  p_connection_id uuid
)
  returns SETOF public.outreach_gmail_messages
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
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
end $function$;

alter function "public"."reserve_personal_gmail"(jsonb, uuid) owner to "calendar_sql_internal";

alter table "public"."outreach_gmail_accounts"
  add constraint "outreach_gmail_accounts_profile_id_fkey" foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table "public"."outreach_gmail_messages"
  add constraint "outreach_gmail_messages_opportunity_id_fkey" foreign key (opportunity_id) references public.outreach_opportunities(id) on delete restrict;

alter table "public"."outreach_gmail_messages"
  add constraint "outreach_gmail_messages_profile_id_fkey" foreign key (profile_id) references public.profiles(id) on delete restrict;

alter table "public"."outreach_gmail_messages"
  add constraint "outreach_gmail_messages_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete restrict;

alter table "public"."outreach_gmail_messages"
  add constraint "outreach_gmail_messages_semester_id_opportunity_id_fkey" foreign key (semester_id, opportunity_id) references public.outreach_opportunities(semester_id, id)
    on delete restrict;

alter table "public"."outreach_gmail_oauth"
  add constraint "outreach_gmail_oauth_profile_id_fkey" foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table "public"."outreach_gmail_oauth"
  add constraint "outreach_gmail_oauth_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

create index outreach_gmail_messages_scope_idx on public.outreach_gmail_messages using btree (semester_id, opportunity_id, created_at desc);

create index outreach_gmail_oauth_profile_idx on public.outreach_gmail_oauth using btree (profile_id, semester_id);

create unique index outreach_gmail_one_unresolved on public.outreach_gmail_messages using btree (profile_id, opportunity_id)
  where (status = ANY (ARRAY['sending'::text, 'unknown'::text]));

create policy "gmail claim reads contact" on "public"."outreach_contacts"
  for select
  to "calendar_sql_internal"
  using (true);

create policy "integration identity manages gmail accounts" on "public"."outreach_gmail_accounts"
  for all
  to "authenticated"
  using (private.is_calendar_worker())
  with check (private.is_calendar_worker());

create policy "integration identity manages gmail messages" on "public"."outreach_gmail_messages"
  for all
  to "authenticated"
  using (private.is_calendar_worker())
  with check (private.is_calendar_worker());

create policy "semester admins read gmail delivery history" on "public"."outreach_gmail_messages"
  for select
  to "authenticated"
  using (private.can_manage_semester(semester_id, auth.uid()));

create policy "integration identity manages gmail oauth" on "public"."outreach_gmail_oauth"
  for all
  to "authenticated"
  using (private.is_calendar_worker())
  with check (private.is_calendar_worker());

create policy "gmail claim reads opportunity" on "public"."outreach_opportunities"
  for select
  to "calendar_sql_internal"
  using (true);

revoke all on function "private"."actor_can_manage_semester"(uuid, uuid) from "calendar_sql_internal";

grant execute on function "private"."actor_can_manage_semester"(uuid, uuid) to "calendar_sql_internal";

revoke all on function "public"."reserve_personal_gmail"(jsonb, uuid) from public;

grant execute on function "public"."reserve_personal_gmail"(jsonb, uuid) to "authenticated";

revoke all on function "public"."reserve_personal_gmail"(jsonb, uuid) from "calendar_sql_internal";

grant execute on function "public"."reserve_personal_gmail"(jsonb, uuid) to "calendar_sql_internal";

revoke all on table "public"."outreach_contacts" from "calendar_sql_internal";

grant select on table "public"."outreach_contacts" to "calendar_sql_internal";

grant delete, insert, select, update on table "public"."outreach_gmail_accounts" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_gmail_accounts" to "postgres";

grant insert, select, update on table "public"."outreach_gmail_messages" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_gmail_messages" to "postgres";

grant delete, insert, select, update on table "public"."outreach_gmail_oauth" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_gmail_oauth" to "postgres";

revoke all on table "public"."outreach_opportunities" from "calendar_sql_internal";

grant select on table "public"."outreach_opportunities" to "calendar_sql_internal";

revoke all on schema "public" from "calendar_sql_internal";

grant usage on schema "public" to "calendar_sql_internal";
