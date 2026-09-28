create table if not exists public.outreach_email_templates (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  subject_template text not null check (length(btrim(subject_template)) between 1 and 500),
  body_template text not null check (length(btrim(body_template)) between 1 and 20000),
  created_by uuid not null default private.current_profile_id() references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, id)
);

create index if not exists outreach_email_templates_semester_idx
  on public.outreach_email_templates (semester_id, archived_at, updated_at desc);

create table if not exists public.outreach_email_messages (
  id uuid primary key,
  semester_id uuid not null references public.semesters(id) on delete restrict,
  opportunity_id uuid not null,
  contact_id uuid not null references public.outreach_contacts(id) on delete restrict,
  template_id uuid,
  recipient_name text not null check (length(btrim(recipient_name)) between 1 and 500),
  recipient_email text not null check (recipient_email = lower(btrim(recipient_email)) and length(recipient_email) between 3 and 500),
  sender text not null check (length(btrim(sender)) between 3 and 500),
  subject text not null check (length(btrim(subject)) between 1 and 500),
  body text not null check (length(btrim(body)) between 1 and 20000),
  scheduled_at timestamptz,
  client_idempotency_key text not null check (length(btrim(client_idempotency_key)) between 1 and 200),
  request_digest text not null check (request_digest ~ '^[0-9a-f]{64}$'),
  snapshot_version smallint not null check (snapshot_version = 1),
  snapshot_key_id text not null check (length(btrim(snapshot_key_id)) between 1 and 100),
  snapshot_digest text not null check (snapshot_digest ~ '^[0-9a-f]{64}$'),
  snapshot_signature text not null check (snapshot_signature ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null,
  idempotency_expires_at timestamptz not null,
  constraint outreach_email_messages_semester_opportunity_fkey
    foreign key (semester_id, opportunity_id)
    references public.outreach_opportunities(semester_id, id) on delete restrict,
  constraint outreach_email_messages_semester_template_fkey
    foreign key (semester_id, template_id)
    references public.outreach_email_templates(semester_id, id) on delete restrict,
  constraint outreach_email_messages_retry_window_check
    check (idempotency_expires_at = created_at + interval '24 hours'),
  constraint outreach_email_messages_schedule_check
    check (scheduled_at is null or (scheduled_at > created_at and scheduled_at <= created_at + interval '30 days')),
  unique (semester_id, id),
  unique (semester_id, client_idempotency_key)
);

create index if not exists outreach_email_messages_history_idx
  on public.outreach_email_messages (semester_id, created_at desc, id desc);
create index if not exists outreach_email_messages_opportunity_idx
  on public.outreach_email_messages (semester_id, opportunity_id, created_at desc);

create table if not exists public.outreach_email_receipts (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete restrict,
  message_id uuid not null,
  sequence bigint not null default 1 check (sequence > 0),
  snapshot_digest text not null check (snapshot_digest ~ '^[0-9a-f]{64}$'),
  provider_id text,
  provider_status text not null check (length(btrim(provider_status)) between 1 and 100),
  message_status text not null check (message_status in (
    'accepted', 'bounced', 'cancel_unknown', 'cancelled', 'complained', 'delivered',
    'failed', 'scheduled', 'sent', 'submission_unknown', 'submitting', 'suppressed'
  )),
  checked_at timestamptz not null,
  sent_at timestamptz,
  delivered_at timestamptz,
  last_error text check (last_error is null or length(last_error) between 1 and 2000),
  receipt_version smallint not null check (receipt_version = 1),
  receipt_key_id text not null check (length(btrim(receipt_key_id)) between 1 and 100),
  receipt_digest text not null check (receipt_digest ~ '^[0-9a-f]{64}$'),
  receipt_signature text not null check (receipt_signature ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint outreach_email_receipts_semester_message_fkey
    foreign key (semester_id, message_id)
    references public.outreach_email_messages(semester_id, id) on delete restrict,
  constraint outreach_email_receipts_provider_id_check
    check (provider_id is null or length(btrim(provider_id)) between 1 and 500),
  constraint outreach_email_receipts_delivery_check
    check (delivered_at is null or (sent_at is not null and delivered_at >= sent_at))
);

create index if not exists outreach_email_receipts_message_idx
  on public.outreach_email_receipts (semester_id, message_id, sequence);
create index if not exists outreach_email_receipts_provider_idx
  on public.outreach_email_receipts (provider_id) where provider_id is not null;

create or replace function private.validate_outreach_email_template()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile_id uuid := private.current_profile_id();
begin
  if auth.uid() is null or not private.can_manage_semester(new.semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  if regexp_replace(new.subject_template, '\{\{\s*(company_name|contact_name|semester_name)\s*\}\}', '', 'g') ~ '\{\{|\}\}'
    or regexp_replace(new.body_template, '\{\{\s*(company_name|contact_name|semester_name)\s*\}\}', '', 'g') ~ '\{\{|\}\}' then
    raise exception 'Email template contains an unknown or malformed placeholder' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := v_profile_id;
    new.created_at := statement_timestamp();
    new.updated_at := new.created_at;
  else
    if new.id is distinct from old.id
      or new.semester_id is distinct from old.semester_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
      or old.archived_at is not null
      or (new.archived_at is null and old.archived_at is not null) then
      raise exception 'Protected outreach email template columns cannot be changed' using errcode = '42501';
    end if;
    new.updated_at := statement_timestamp();
  end if;
  return new;
end;
$$;

create or replace function private.prevent_outreach_email_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Outreach email history is immutable' using errcode = '42501';
end;
$$;

create or replace function private.validate_outreach_email_message()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contact public.outreach_contacts%rowtype;
  v_opportunity public.outreach_opportunities%rowtype;
  v_profile_id uuid := private.current_profile_id();
begin
  if auth.uid() is null or not private.can_manage_semester(new.semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.semesters semester
    where semester.id = new.semester_id and semester.is_active and semester.archived_at is null
  ) then
    raise exception 'Email can only be submitted for the active semester' using errcode = '23514';
  end if;
  select * into v_opportunity
  from public.outreach_opportunities opportunity
  where opportunity.id = new.opportunity_id and opportunity.semester_id = new.semester_id;
  if not found or v_opportunity.archived_at is not null or v_opportunity.is_silenced
    or v_opportunity.stage in ('declined', 'closed') then
    raise exception 'Outreach opportunity is unavailable for email' using errcode = '23514';
  end if;
  select * into v_contact from public.outreach_contacts contact where contact.id = v_opportunity.contact_id;
  if not found or v_contact.archived_at is not null or v_contact.email is null then
    raise exception 'Outreach contact is unavailable for email' using errcode = '23514';
  end if;
  if new.contact_id is distinct from v_contact.id
    or new.recipient_email is distinct from lower(btrim(v_contact.email))
    or new.recipient_name is distinct from v_contact.full_name then
    raise exception 'Email recipient must match the selected opportunity contact' using errcode = '23514';
  end if;
  if new.template_id is not null and not exists (
    select 1 from public.outreach_email_templates template
    where template.id = new.template_id and template.semester_id = new.semester_id and template.archived_at is null
  ) then
    raise exception 'Email template is unavailable in this semester' using errcode = '23514';
  end if;
  if new.created_by is distinct from v_profile_id then
    raise exception 'Email creator must be the authenticated profile' using errcode = '42501';
  end if;
  if new.created_at < statement_timestamp() - interval '5 minutes'
    or new.created_at > statement_timestamp() + interval '5 minutes' then
    raise exception 'Email creation time is outside the permitted window' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.validate_outreach_email_receipt()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_message public.outreach_email_messages%rowtype;
  v_previous public.outreach_email_receipts%rowtype;
begin
  if auth.uid() is null or not private.can_manage_semester(new.semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.message_id::text, 73492));
  select * into v_message from public.outreach_email_messages message
  where message.id = new.message_id and message.semester_id = new.semester_id;
  if not found then raise exception 'Email message not found' using errcode = 'P0002'; end if;
  if new.snapshot_digest is distinct from v_message.snapshot_digest then
    raise exception 'Receipt snapshot does not match the email' using errcode = '23514';
  end if;
  if new.checked_at < v_message.created_at or new.checked_at > statement_timestamp() + interval '5 minutes' then
    raise exception 'Provider check time is invalid' using errcode = '23514';
  end if;
  if new.sent_at is not null and new.sent_at > new.checked_at then
    raise exception 'Sent time cannot be after provider check' using errcode = '23514';
  end if;
  if new.delivered_at is not null and new.delivered_at > new.checked_at then
    raise exception 'Delivery time cannot be after provider check' using errcode = '23514';
  end if;
  if new.message_status in ('accepted','scheduled','sent','delivered','bounced','complained','cancel_unknown','cancelled','suppressed') and new.provider_id is null then
    raise exception 'Provider identifier is required for this status' using errcode = '23514';
  end if;
  if new.message_status in ('submission_unknown','submitting') and new.provider_id is not null then
    raise exception 'Provider identifier is not allowed for this status' using errcode = '23514';
  end if;
  if new.message_status = 'scheduled' and v_message.scheduled_at is null then
    raise exception 'Only a scheduled snapshot can have scheduled status' using errcode = '23514';
  end if;
  if new.provider_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.provider_id, 73493));
    if exists (select 1 from public.outreach_email_receipts receipt where receipt.provider_id = new.provider_id and receipt.message_id <> new.message_id) then
      raise exception 'Provider identifier belongs to another email' using errcode = '23505';
    end if;
  end if;
  select * into v_previous from public.outreach_email_receipts receipt
  where receipt.message_id = new.message_id order by receipt.sequence desc limit 1;
  new.sequence := case when found then v_previous.sequence + 1 else 1 end;
  if found then
    if v_previous.provider_id is not null and new.provider_id is distinct from v_previous.provider_id then
      raise exception 'Provider identifier cannot change' using errcode = '23514';
    end if;
    if not (
      (v_previous.message_status = 'submission_unknown' and new.message_status in ('submitting','accepted','scheduled'))
      or (v_previous.message_status = 'submitting' and new.message_status in ('failed','submission_unknown','accepted','scheduled'))
      or (v_previous.message_status = 'submitting' and new.message_status = 'submitting' and new.checked_at >= v_previous.checked_at + interval '2 minutes')
      or (v_previous.message_status = 'accepted' and new.message_status in ('accepted','sent','delivered','failed','suppressed','bounced','complained','cancelled'))
      or (v_previous.message_status = 'scheduled' and new.message_status in ('scheduled','accepted','sent','delivered','failed','suppressed','bounced','complained','cancel_unknown','cancelled'))
      or (v_previous.message_status = 'cancel_unknown' and new.message_status in ('cancel_unknown','scheduled','accepted','sent','delivered','failed','suppressed','bounced','complained','cancelled'))
      or (v_previous.message_status = 'sent' and new.message_status in ('sent','delivered','failed','suppressed','bounced','complained'))
      or (v_previous.message_status = 'delivered' and new.message_status in ('delivered','bounced','complained'))
      or (v_previous.message_status = 'bounced' and new.message_status = 'bounced')
      or (v_previous.message_status = 'complained' and new.message_status = 'complained')
      or (v_previous.message_status = 'cancelled' and new.message_status = 'cancelled')
      or (v_previous.message_status = 'suppressed' and new.message_status = 'suppressed')
    ) then
      raise exception 'Invalid outreach email status transition' using errcode = '23514';
    end if;
  elsif new.message_status <> 'submitting' then
    raise exception 'Invalid initial outreach email status' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.reserve_outreach_email_message(
  p_id uuid,
  p_semester_id uuid,
  p_opportunity_id uuid,
  p_contact_id uuid,
  p_recipient_name text,
  p_recipient_email text,
  p_sender text,
  p_subject text,
  p_body text,
  p_client_idempotency_key text,
  p_request_digest text,
  p_snapshot_version smallint,
  p_snapshot_key_id text,
  p_snapshot_digest text,
  p_snapshot_signature text,
  p_created_at timestamptz,
  p_idempotency_expires_at timestamptz,
  p_template_id uuid default null,
  p_scheduled_at timestamptz default null
)
returns setof public.outreach_email_messages
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.outreach_email_messages%rowtype;
begin
  if auth.uid() is null or not private.can_manage_semester(p_semester_id, auth.uid()) then
    raise exception 'Semester administrator access required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_semester_id::text || ':' || p_client_idempotency_key, 73491));
  select * into v_existing from public.outreach_email_messages message
  where message.semester_id = p_semester_id and message.client_idempotency_key = p_client_idempotency_key;
  if found then
    if v_existing.request_digest is distinct from p_request_digest then
      raise exception 'Idempotency key is already used for another email' using errcode = '23505';
    end if;
    return next v_existing;
    return;
  end if;
  insert into public.outreach_email_messages (
    id, semester_id, opportunity_id, contact_id, template_id, recipient_name, recipient_email,
    sender, subject, body, scheduled_at, client_idempotency_key, request_digest,
    snapshot_version, snapshot_key_id, snapshot_digest, snapshot_signature,
    created_by, created_at, idempotency_expires_at
  ) values (
    p_id, p_semester_id, p_opportunity_id, p_contact_id, p_template_id, p_recipient_name, lower(btrim(p_recipient_email)),
    p_sender, p_subject, p_body, p_scheduled_at, p_client_idempotency_key, p_request_digest,
    p_snapshot_version, p_snapshot_key_id, p_snapshot_digest, p_snapshot_signature,
    private.current_profile_id(), p_created_at, p_idempotency_expires_at
  ) returning * into v_existing;
  return next v_existing;
end;
$$;

drop trigger if exists validate_outreach_email_template on public.outreach_email_templates;
create trigger validate_outreach_email_template before insert or update on public.outreach_email_templates
for each row execute function private.validate_outreach_email_template();

drop trigger if exists prevent_outreach_email_template_delete on public.outreach_email_templates;
create trigger prevent_outreach_email_template_delete before delete on public.outreach_email_templates
for each row execute function private.prevent_outreach_email_history_mutation();

drop trigger if exists validate_outreach_email_message on public.outreach_email_messages;
create trigger validate_outreach_email_message before insert on public.outreach_email_messages
for each row execute function private.validate_outreach_email_message();

drop trigger if exists prevent_outreach_email_message_mutation on public.outreach_email_messages;
create trigger prevent_outreach_email_message_mutation before update or delete on public.outreach_email_messages
for each row execute function private.prevent_outreach_email_history_mutation();

drop trigger if exists validate_outreach_email_receipt on public.outreach_email_receipts;
create trigger validate_outreach_email_receipt before insert on public.outreach_email_receipts
for each row execute function private.validate_outreach_email_receipt();

drop trigger if exists prevent_outreach_email_receipt_mutation on public.outreach_email_receipts;
create trigger prevent_outreach_email_receipt_mutation before update or delete on public.outreach_email_receipts
for each row execute function private.prevent_outreach_email_history_mutation();
