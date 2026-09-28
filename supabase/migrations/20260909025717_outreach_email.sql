set local check_function_bodies = off;

create table "public"."outreach_email_messages" (
  "id"                     uuid                     not null,
  "semester_id"            uuid                     not null,
  "opportunity_id"         uuid                     not null,
  "contact_id"             uuid                     not null,
  "template_id"            uuid,
  "recipient_name"         text                     not null,
  "recipient_email"        text                     not null,
  "sender"                 text                     not null,
  "subject"                text                     not null,
  "body"                   text                     not null,
  "scheduled_at"           timestamp with time zone,
  "client_idempotency_key" text                     not null,
  "request_digest"         text                     not null,
  "snapshot_version"       smallint                 not null,
  "snapshot_key_id"        text                     not null,
  "snapshot_digest"        text                     not null,
  "snapshot_signature"     text                     not null,
  "created_by"             uuid                     not null,
  "created_at"             timestamp with time zone not null,
  "idempotency_expires_at" timestamp with time zone not null,
  constraint "outreach_email_messages_body_check" check (((length(btrim(body)) >= 1) AND (length(btrim(body)) <= 20000))),
  constraint "outreach_email_messages_client_idempotency_key_check" check (((length(btrim(client_idempotency_key)) >= 1) AND (length(btrim(client_idempotency_key)) <= 200))),
  constraint "outreach_email_messages_pkey" primary key (id),
  constraint "outreach_email_messages_recipient_email_check"
    check (((recipient_email = lower(btrim(recipient_email))) AND ((length(recipient_email) >= 3) AND (length(recipient_email) <= 500)))),
  constraint "outreach_email_messages_recipient_name_check" check (((length(btrim(recipient_name)) >= 1) AND (length(btrim(recipient_name)) <= 500))),
  constraint "outreach_email_messages_request_digest_check" check ((request_digest ~ '^[0-9a-f]{64}$'::text)),
  constraint "outreach_email_messages_retry_window_check" check ((idempotency_expires_at = (created_at + '24:00:00'::interval))),
  constraint "outreach_email_messages_schedule_check" check (((scheduled_at IS NULL) OR ((scheduled_at > created_at) AND (scheduled_at <= (created_at + '30 days'::interval))))),
  constraint "outreach_email_messages_semester_id_client_idempotency_key_key" unique (semester_id, client_idempotency_key),
  constraint "outreach_email_messages_semester_id_id_key" unique (semester_id, id),
  constraint "outreach_email_messages_sender_check" check (((length(btrim(sender)) >= 3) AND (length(btrim(sender)) <= 500))),
  constraint "outreach_email_messages_snapshot_digest_check" check ((snapshot_digest ~ '^[0-9a-f]{64}$'::text)),
  constraint "outreach_email_messages_snapshot_key_id_check" check (((length(btrim(snapshot_key_id)) >= 1) AND (length(btrim(snapshot_key_id)) <= 100))),
  constraint "outreach_email_messages_snapshot_signature_check" check ((snapshot_signature ~ '^[0-9a-f]{64}$'::text)),
  constraint "outreach_email_messages_snapshot_version_check" check ((snapshot_version = 1)),
  constraint "outreach_email_messages_subject_check" check (((length(btrim(subject)) >= 1) AND (length(btrim(subject)) <= 500)))
);

alter table "public"."outreach_email_messages"
  enable row level security;

create table "public"."outreach_email_receipts" (
  "id"                uuid                     not null default gen_random_uuid(),
  "semester_id"       uuid                     not null,
  "message_id"        uuid                     not null,
  "sequence"          bigint                   not null default 1,
  "snapshot_digest"   text                     not null,
  "provider_id"       text,
  "provider_status"   text                     not null,
  "message_status"    text                     not null,
  "checked_at"        timestamp with time zone not null,
  "sent_at"           timestamp with time zone,
  "delivered_at"      timestamp with time zone,
  "last_error"        text,
  "receipt_version"   smallint                 not null,
  "receipt_key_id"    text                     not null,
  "receipt_digest"    text                     not null,
  "receipt_signature" text                     not null,
  "created_at"        timestamp with time zone not null default now(),
  constraint "outreach_email_receipts_delivery_check" check (((delivered_at IS NULL) OR ((sent_at IS NOT NULL) AND (delivered_at >= sent_at)))),
  constraint "outreach_email_receipts_last_error_check" check (((last_error IS NULL) OR ((length(last_error) >= 1) AND (length(last_error) <= 2000)))),
  constraint "outreach_email_receipts_message_status_check"
    check
    ((message_status = ANY (ARRAY['accepted'::text, 'bounced'::text, 'cancel_unknown'::text, 'cancelled'::text, 'complained'::text, 'delivered'::text, 'failed'::text,
    'scheduled'::text, 'sent'::text, 'submission_unknown'::text, 'submitting'::text, 'suppressed'::text]))),
  constraint "outreach_email_receipts_pkey" primary key (id),
  constraint "outreach_email_receipts_provider_id_check" check (((provider_id IS NULL) OR ((length(btrim(provider_id)) >= 1) AND (length(btrim(provider_id)) <= 500)))),
  constraint "outreach_email_receipts_provider_status_check" check (((length(btrim(provider_status)) >= 1) AND (length(btrim(provider_status)) <= 100))),
  constraint "outreach_email_receipts_receipt_digest_check" check ((receipt_digest ~ '^[0-9a-f]{64}$'::text)),
  constraint "outreach_email_receipts_receipt_key_id_check" check (((length(btrim(receipt_key_id)) >= 1) AND (length(btrim(receipt_key_id)) <= 100))),
  constraint "outreach_email_receipts_receipt_signature_check" check ((receipt_signature ~ '^[0-9a-f]{64}$'::text)),
  constraint "outreach_email_receipts_receipt_version_check" check ((receipt_version = 1)),
  constraint "outreach_email_receipts_sequence_check" check ((sequence > 0)),
  constraint "outreach_email_receipts_snapshot_digest_check" check ((snapshot_digest ~ '^[0-9a-f]{64}$'::text))
);

alter table "public"."outreach_email_receipts"
  enable row level security;

create table "public"."outreach_email_templates" (
  "id"               uuid                     not null default gen_random_uuid(),
  "semester_id"      uuid                     not null,
  "name"             text                     not null,
  "subject_template" text                     not null,
  "body_template"    text                     not null,
  "archived_at"      timestamp with time zone,
  "created_at"       timestamp with time zone not null default now(),
  "updated_at"       timestamp with time zone not null default now(),
  constraint "outreach_email_templates_body_template_check" check (((length(btrim(body_template)) >= 1) AND (length(btrim(body_template)) <= 20000))),
  constraint "outreach_email_templates_name_check" check (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 120))),
  constraint "outreach_email_templates_pkey" primary key (id),
  constraint "outreach_email_templates_semester_id_id_key" unique (semester_id, id),
  constraint "outreach_email_templates_subject_template_check" check (((length(btrim(subject_template)) >= 1) AND (length(btrim(subject_template)) <= 500))),
  "created_by"       uuid                     not null default private.current_profile_id()
);

alter table "public"."outreach_email_templates"
  enable row level security;

create or replace function private.prevent_outreach_email_history_mutation()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
begin
  raise exception 'Outreach email history is immutable' using errcode = '42501';
end;
$function$;

create or replace function private.validate_outreach_email_message()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
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
$function$;

create or replace function private.validate_outreach_email_receipt()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
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
$function$;

create or replace function private.validate_outreach_email_template()
  returns trigger
  language plpgsql
  set search_path to ''
  AS $function$
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
$function$;

create or replace function public.reserve_outreach_email_message (
  p_id                     uuid,
  p_semester_id            uuid,
  p_opportunity_id         uuid,
  p_contact_id             uuid,
  p_recipient_name         text,
  p_recipient_email        text,
  p_sender                 text,
  p_subject                text,
  p_body                   text,
  p_client_idempotency_key text,
  p_request_digest         text,
  p_snapshot_version       smallint,
  p_snapshot_key_id        text,
  p_snapshot_digest        text,
  p_snapshot_signature     text,
  p_created_at             timestamp with time zone,
  p_idempotency_expires_at timestamp with time zone,
  p_template_id            uuid                     default null::uuid,
  p_scheduled_at           timestamp with time zone default null::timestamp with time zone
)
  returns SETOF public.outreach_email_messages
  language plpgsql
  set search_path to ''
  AS $function$
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
$function$;

alter table "public"."outreach_email_messages"
  add constraint "outreach_email_messages_contact_id_fkey" foreign key (contact_id) references public.outreach_contacts(id) on delete restrict;

alter table "public"."outreach_email_messages"
  add constraint "outreach_email_messages_created_by_fkey" foreign key (created_by) references public.profiles(id) on delete restrict;

alter table "public"."outreach_email_messages"
  add constraint "outreach_email_messages_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete restrict;

alter table "public"."outreach_email_messages"
  add constraint "outreach_email_messages_semester_opportunity_fkey" foreign key (semester_id, opportunity_id) references public.outreach_opportunities(semester_id, id)
    on delete restrict;

alter table "public"."outreach_email_receipts"
  add constraint "outreach_email_receipts_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete restrict;

alter table "public"."outreach_email_receipts"
  add constraint "outreach_email_receipts_semester_message_fkey" foreign key (semester_id, message_id) references public.outreach_email_messages(semester_id, id) on delete restrict;

alter table "public"."outreach_email_templates"
  add constraint "outreach_email_templates_semester_id_fkey" foreign key (semester_id) references public.semesters(id) on delete cascade;

alter table "public"."outreach_email_messages"
  add constraint "outreach_email_messages_semester_template_fkey" foreign key (semester_id, template_id) references public.outreach_email_templates(semester_id, id)
    on delete restrict;

create index outreach_email_messages_history_idx on public.outreach_email_messages using btree (semester_id, created_at desc, id desc);

create index outreach_email_messages_opportunity_idx on public.outreach_email_messages using btree (semester_id, opportunity_id, created_at desc);

create index outreach_email_receipts_message_idx on public.outreach_email_receipts using btree (semester_id, message_id, sequence);

create index outreach_email_receipts_provider_idx on public.outreach_email_receipts using btree (provider_id)
  where (provider_id is not null);

create index outreach_email_templates_semester_idx on public.outreach_email_templates using btree (semester_id, archived_at, updated_at desc);

create trigger prevent_outreach_email_message_mutation
  before delete or update on public.outreach_email_messages
  for each row
  execute function private.prevent_outreach_email_history_mutation();

create trigger validate_outreach_email_message
  before insert on public.outreach_email_messages
  for each row
  execute function private.validate_outreach_email_message();

create trigger prevent_outreach_email_receipt_mutation
  before delete or update on public.outreach_email_receipts
  for each row
  execute function private.prevent_outreach_email_history_mutation();

create trigger validate_outreach_email_receipt
  before insert on public.outreach_email_receipts
  for each row
  execute function private.validate_outreach_email_receipt();

create trigger prevent_outreach_email_template_delete
  before delete on public.outreach_email_templates
  for each row
  execute function private.prevent_outreach_email_history_mutation();

create trigger validate_outreach_email_template
  before insert or update on public.outreach_email_templates
  for each row
  execute function private.validate_outreach_email_template();

create policy "semester admins read outreach email messages" on "public"."outreach_email_messages"
  for select
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)));

create policy "semester admins reserve outreach email messages" on "public"."outreach_email_messages"
  for insert
  to "authenticated"
  with check (private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)));

create policy "semester admins read outreach email receipts" on "public"."outreach_email_receipts"
  for select
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)));

create policy "semester admins record outreach email receipts" on "public"."outreach_email_receipts"
  for insert
  to "authenticated"
  with check (private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)));

create policy "semester admins create outreach email templates" on "public"."outreach_email_templates"
  for insert
  to "authenticated"
  with check (private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)));

create policy "semester admins read outreach email templates" on "public"."outreach_email_templates"
  for select
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)));

create policy "semester admins update outreach email templates" on "public"."outreach_email_templates"
  for update
  to "authenticated"
  using (private.can_manage_semester(semester_id, ( select auth.uid() as uid)))
  with check (private.can_manage_semester(semester_id, ( SELECT auth.uid() AS uid)));

revoke all on function "private"."prevent_outreach_email_history_mutation"() from public;

grant execute on function "private"."prevent_outreach_email_history_mutation"() to "postgres";

revoke all on function "private"."validate_outreach_email_message"() from public;

grant execute on function "private"."validate_outreach_email_message"() to "postgres";

revoke all on function "private"."validate_outreach_email_receipt"() from public;

grant execute on function "private"."validate_outreach_email_receipt"() to "postgres";

revoke all on function "private"."validate_outreach_email_template"() from public;

grant execute on function "private"."validate_outreach_email_template"() to "postgres";

revoke all
  on function "public"."reserve_outreach_email_message"(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, smallint, text, text, text, timestamp
    with time zone, timestamp with time zone, uuid, timestamp with time zone)
  from public;

grant execute
  on function "public"."reserve_outreach_email_message"(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, smallint, text, text, text, timestamp
    with time zone, timestamp with time zone, uuid, timestamp with time zone)
  to "authenticated", "postgres";

grant insert ("body") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("client_idempotency_key") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("contact_id") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("created_at") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("created_by") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("idempotency_expires_at") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("id") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("opportunity_id") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("recipient_email") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("recipient_name") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("request_digest") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("scheduled_at") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("semester_id") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("sender") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("snapshot_digest") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("snapshot_key_id") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("snapshot_signature") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("snapshot_version") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("subject") on table "public"."outreach_email_messages" to "authenticated";

grant insert ("template_id") on table "public"."outreach_email_messages" to "authenticated";

grant select on table "public"."outreach_email_messages" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_email_messages" to "postgres";

grant insert ("checked_at") on table "public"."outreach_email_receipts" to "authenticated";

grant insert ("delivered_at") on table "public"."outreach_email_receipts" to "authenticated";

grant insert ("last_error") on table "public"."outreach_email_receipts" to "authenticated";

grant insert ("message_id") on table "public"."outreach_email_receipts" to "authenticated";

grant insert ("message_status") on table "public"."outreach_email_receipts" to "authenticated";

grant insert ("provider_id") on table "public"."outreach_email_receipts" to "authenticated";

grant insert ("provider_status") on table "public"."outreach_email_receipts" to "authenticated";

grant insert ("receipt_digest") on table "public"."outreach_email_receipts" to "authenticated";

grant insert ("receipt_key_id") on table "public"."outreach_email_receipts" to "authenticated";

grant insert ("receipt_signature") on table "public"."outreach_email_receipts" to "authenticated";

grant insert ("receipt_version") on table "public"."outreach_email_receipts" to "authenticated";

grant insert ("semester_id") on table "public"."outreach_email_receipts" to "authenticated";

grant insert ("sent_at") on table "public"."outreach_email_receipts" to "authenticated";

grant insert ("snapshot_digest") on table "public"."outreach_email_receipts" to "authenticated";

grant select on table "public"."outreach_email_receipts" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_email_receipts" to "postgres";

grant update ("archived_at") on table "public"."outreach_email_templates" to "authenticated";

grant insert ("body_template"), update ("body_template") on table "public"."outreach_email_templates" to "authenticated";

grant insert ("name"), update ("name") on table "public"."outreach_email_templates" to "authenticated";

grant insert ("semester_id") on table "public"."outreach_email_templates" to "authenticated";

grant insert ("subject_template"), update ("subject_template") on table "public"."outreach_email_templates" to "authenticated";

grant select on table "public"."outreach_email_templates" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."outreach_email_templates" to "postgres";

alter table "public"."outreach_email_templates"
  add constraint "outreach_email_templates_created_by_fkey" foreign key (created_by) references public.profiles(id) on delete restrict;
