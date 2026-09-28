alter table public.outreach_email_templates enable row level security;
alter table public.outreach_email_messages enable row level security;
alter table public.outreach_email_receipts enable row level security;

drop policy if exists "semester admins read outreach email templates" on public.outreach_email_templates;
create policy "semester admins read outreach email templates"
on public.outreach_email_templates for select to authenticated
using (private.can_manage_semester(semester_id, (select auth.uid())));

drop policy if exists "semester admins create outreach email templates" on public.outreach_email_templates;
create policy "semester admins create outreach email templates"
on public.outreach_email_templates for insert to authenticated
with check (private.can_manage_semester(semester_id, (select auth.uid())));

drop policy if exists "semester admins update outreach email templates" on public.outreach_email_templates;
create policy "semester admins update outreach email templates"
on public.outreach_email_templates for update to authenticated
using (private.can_manage_semester(semester_id, (select auth.uid())))
with check (private.can_manage_semester(semester_id, (select auth.uid())));

drop policy if exists "semester admins read outreach email messages" on public.outreach_email_messages;
create policy "semester admins read outreach email messages"
on public.outreach_email_messages for select to authenticated
using (private.can_manage_semester(semester_id, (select auth.uid())));

drop policy if exists "semester admins reserve outreach email messages" on public.outreach_email_messages;
create policy "semester admins reserve outreach email messages"
on public.outreach_email_messages for insert to authenticated
with check (private.can_manage_semester(semester_id, (select auth.uid())));

drop policy if exists "semester admins read outreach email receipts" on public.outreach_email_receipts;
create policy "semester admins read outreach email receipts"
on public.outreach_email_receipts for select to authenticated
using (private.can_manage_semester(semester_id, (select auth.uid())));

drop policy if exists "semester admins record outreach email receipts" on public.outreach_email_receipts;
create policy "semester admins record outreach email receipts"
on public.outreach_email_receipts for insert to authenticated
with check (private.can_manage_semester(semester_id, (select auth.uid())));

revoke all on table public.outreach_email_templates from anon, authenticated;
revoke all on table public.outreach_email_messages from anon, authenticated;
revoke all on table public.outreach_email_receipts from anon, authenticated;

grant select on table public.outreach_email_templates to authenticated;
grant insert (semester_id, name, subject_template, body_template) on table public.outreach_email_templates to authenticated;
grant update (name, subject_template, body_template, archived_at) on table public.outreach_email_templates to authenticated;

grant select on table public.outreach_email_messages to authenticated;
grant insert (
  id, semester_id, opportunity_id, contact_id, template_id, recipient_name, recipient_email,
  sender, subject, body, scheduled_at, client_idempotency_key, request_digest,
  snapshot_version, snapshot_key_id, snapshot_digest, snapshot_signature,
  created_by, created_at, idempotency_expires_at
) on table public.outreach_email_messages to authenticated;

grant select on table public.outreach_email_receipts to authenticated;
grant insert (
  semester_id, message_id, snapshot_digest, provider_id, provider_status, message_status,
  checked_at, sent_at, delivered_at, last_error, receipt_version, receipt_key_id,
  receipt_digest, receipt_signature
) on table public.outreach_email_receipts to authenticated;

revoke all on function public.reserve_outreach_email_message(
  uuid, uuid, uuid, uuid, text, text, text, text, text,
  text, text, smallint, text, text, text, timestamptz, timestamptz, uuid, timestamptz
) from public, anon;
grant execute on function public.reserve_outreach_email_message(
  uuid, uuid, uuid, uuid, text, text, text, text, text,
  text, text, smallint, text, text, text, timestamptz, timestamptz, uuid, timestamptz
) to authenticated;

revoke all on function private.validate_outreach_email_template() from public, anon, authenticated;
revoke all on function private.validate_outreach_email_message() from public, anon, authenticated;
revoke all on function private.validate_outreach_email_receipt() from public, anon, authenticated;
revoke all on function private.prevent_outreach_email_history_mutation() from public, anon, authenticated;
