import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "../db/types.ts";
import type {
  OutreachEmailRecord,
  OutreachEmailStore,
  OutreachEmailStoreInput,
  ReserveOutreachEmailInput,
  SignedOutreachEmailReceipt,
} from "./server.ts";
import type { OutreachEmailCommand, OutreachEmailOpportunity, OutreachEmailTemplate } from "./types.ts";

type MessageRow = Database["public"]["Tables"]["outreach_email_messages"]["Row"];
type ReceiptRow = Database["public"]["Tables"]["outreach_email_receipts"]["Row"];

function fail(error: { code?: string; message: string } | null): never {
  throw error ?? new Error("Database operation failed.");
}

function timeZoneFrom(configuration: Json): string {
  if (typeof configuration === "object" && configuration !== null && !Array.isArray(configuration)) {
    const value = (configuration as Record<string, Json | undefined>).timezone;
    if (typeof value === "string" && value.trim()) return value;
  }
  return "America/New_York";
}

function receipt(row: ReceiptRow): SignedOutreachEmailReceipt {
  return {
    receipt: {
      checkedAt: row.checked_at,
      deliveredAt: row.delivered_at,
      lastError: row.last_error,
      messageId: row.message_id,
      messageStatus: row.message_status,
      providerId: row.provider_id,
      providerStatus: row.provider_status,
      semesterId: row.semester_id,
      sentAt: row.sent_at,
      snapshotDigest: row.snapshot_digest,
      version: 1,
    },
    signature: { digest: row.receipt_digest, keyId: row.receipt_key_id, signature: row.receipt_signature },
  };
}

function message(row: MessageRow, receipts: ReceiptRow[]): OutreachEmailRecord {
  return {
    clientIdempotencyKey: row.client_idempotency_key,
    receipts: receipts.filter((candidate) => candidate.message_id === row.id).map(receipt),
    requestDigest: row.request_digest,
    snapshot: {
      body: row.body,
      contactId: row.contact_id,
      createdAt: row.created_at,
      idempotencyExpiresAt: row.idempotency_expires_at,
      idempotencyKey: row.client_idempotency_key,
      messageId: row.id,
      opportunityId: row.opportunity_id,
      recipientEmail: row.recipient_email,
      recipientName: row.recipient_name,
      scheduledAt: row.scheduled_at,
      semesterId: row.semester_id,
      sender: row.sender,
      subject: row.subject,
      version: 1,
    },
    snapshotSignature: { digest: row.snapshot_digest, keyId: row.snapshot_key_id, signature: row.snapshot_signature },
    templateId: row.template_id,
  };
}

async function receiptsFor(client: SupabaseClient<Database>, semesterId: string, messageIds: string[]): Promise<ReceiptRow[]> {
  if (messageIds.length === 0) return [];
  const result = await client.from("outreach_email_receipts").select("*").eq("semester_id", semesterId).in("message_id", messageIds).order("sequence");
  if (result.error) fail(result.error);
  return result.data ?? [];
}

async function loadOpportunity(client: SupabaseClient<Database>, semesterId: string, opportunityId: string): Promise<(OutreachEmailOpportunity & { contactId: string }) | null> {
  const semester = await client.from("semesters").select("name").eq("id", semesterId).maybeSingle();
  if (semester.error) fail(semester.error);
  const opportunity = await client.from("outreach_opportunities")
    .select("id,contact_id,is_silenced,stage,archived_at")
    .eq("semester_id", semesterId).eq("id", opportunityId).maybeSingle();
  if (opportunity.error) fail(opportunity.error);
  if (!opportunity.data || opportunity.data.archived_at !== null || opportunity.data.is_silenced || ["declined", "closed"].includes(opportunity.data.stage)) return null;
  const contact = await client.from("outreach_contacts").select("id,full_name,email,archived_at").eq("id", opportunity.data.contact_id).maybeSingle();
  if (contact.error) fail(contact.error);
  if (!contact.data || contact.data.archived_at !== null || !contact.data.email) return null;
  const link = await client.from("outreach_contact_companies").select("company_id,title").eq("contact_id", contact.data.id).order("is_primary", { ascending: false }).order("id").limit(1).maybeSingle();
  if (link.error) fail(link.error);
  let companyName: string | null = null;
  if (link.data) {
    const company = await client.from("outreach_companies").select("name").eq("id", link.data.company_id).maybeSingle();
    if (company.error) fail(company.error);
    companyName = company.data?.name ?? null;
  }
  return {
    companyName,
    jobTitle: link.data?.title ?? null,
    contactId: contact.data.id,
    opportunityId: opportunity.data.id,
    recipientEmail: contact.data.email,
    recipientName: contact.data.full_name,
    semesterName: semester.data?.name ?? "Selected semester",
  };
}

function template(row: Database["public"]["Tables"]["outreach_email_templates"]["Row"]): OutreachEmailTemplate {
  return {
    archivedAt: row.archived_at,
    bodyTemplate: row.body_template,
    createdAt: row.created_at,
    name: row.name,
    source: "saved",
    subjectTemplate: row.subject_template,
    templateId: row.id,
    updatedAt: row.updated_at,
  };
}

export function createOutreachEmailStore(client: SupabaseClient<Database>): OutreachEmailStore {
  return {
    async load(semesterId, opportunityId): Promise<OutreachEmailStoreInput> {
      const semester = await client.from("semesters").select("id,name,configuration").eq("id", semesterId).maybeSingle();
      if (semester.error) fail(semester.error);
      if (!semester.data) throw Object.assign(new Error("Semester not found."), { code: "P0002" });
      const templatesResult = await client.from("outreach_email_templates").select("*").eq("semester_id", semesterId).is("archived_at", null).order("updated_at", { ascending: false }).order("id");
      if (templatesResult.error) fail(templatesResult.error);
      let messageQuery = client.from("outreach_email_messages").select("*").eq("semester_id", semesterId).order("created_at", { ascending: false }).order("id", { ascending: false });
      if (opportunityId) messageQuery = messageQuery.eq("opportunity_id", opportunityId);
      const messagesResult = await messageQuery;
      if (messagesResult.error) fail(messagesResult.error);
      const rows = messagesResult.data ?? [];
      const receiptRows = await receiptsFor(client, semesterId, rows.map((row) => row.id));
      return {
        messages: rows.map((row) => message(row, receiptRows)),
        opportunity: opportunityId ? await loadOpportunity(client, semesterId, opportunityId) : null,
        semesterId,
        semesterName: semester.data.name,
        templates: (templatesResult.data ?? []).map(template),
        timeZone: timeZoneFrom(semester.data.configuration),
      };
    },
    async findByIdempotency(semesterId, clientIdempotencyKey) {
      const result = await client.from("outreach_email_messages").select("*").eq("semester_id", semesterId).eq("client_idempotency_key", clientIdempotencyKey).maybeSingle();
      if (result.error) fail(result.error);
      if (!result.data) return null;
      return message(result.data, await receiptsFor(client, semesterId, [result.data.id]));
    },
    async reserve(input: ReserveOutreachEmailInput) {
      const snapshot = input.snapshot;
      const result = await client.rpc("reserve_outreach_email_message", {
        p_body: snapshot.body,
        p_client_idempotency_key: input.clientIdempotencyKey,
        p_contact_id: snapshot.contactId,
        p_created_at: snapshot.createdAt,
        p_id: snapshot.messageId,
        p_idempotency_expires_at: snapshot.idempotencyExpiresAt,
        p_opportunity_id: snapshot.opportunityId,
        p_recipient_email: snapshot.recipientEmail,
        p_recipient_name: snapshot.recipientName,
        p_request_digest: input.requestDigest,
        p_semester_id: snapshot.semesterId,
        p_sender: snapshot.sender,
        p_snapshot_digest: input.snapshotSignature.digest,
        p_snapshot_key_id: input.snapshotSignature.keyId,
        p_snapshot_signature: input.snapshotSignature.signature,
        p_snapshot_version: snapshot.version,
        p_subject: snapshot.subject,
        ...(snapshot.scheduledAt === null ? {} : { p_scheduled_at: snapshot.scheduledAt }),
        ...(input.templateId === null ? {} : { p_template_id: input.templateId }),
      });
      if (result.error) fail(result.error);
      const row = result.data?.[0];
      if (!row) throw new Error("Email reservation returned no record.");
      return message(row, await receiptsFor(client, snapshot.semesterId, [row.id]));
    },
    async appendReceipt(messageId, signed) {
      const receiptValue = signed.receipt;
      const result = await client.from("outreach_email_receipts").insert({
        checked_at: receiptValue.checkedAt,
        delivered_at: receiptValue.deliveredAt,
        last_error: receiptValue.lastError,
        message_id: messageId,
        message_status: receiptValue.messageStatus,
        provider_id: receiptValue.providerId,
        provider_status: receiptValue.providerStatus,
        receipt_digest: signed.signature.digest,
        receipt_key_id: signed.signature.keyId,
        receipt_signature: signed.signature.signature,
        receipt_version: receiptValue.version,
        semester_id: receiptValue.semesterId,
        sent_at: receiptValue.sentAt,
        snapshot_digest: receiptValue.snapshotDigest,
      });
      if (result.error) fail(result.error);
    },
    async saveTemplate(command: Extract<OutreachEmailCommand, { action: "save_template" }>) {
      if (!command.templateId) {
        const result = await client.from("outreach_email_templates").insert({ semester_id: command.semesterId, name: command.name, subject_template: command.subjectTemplate, body_template: command.bodyTemplate });
        if (result.error) fail(result.error);
        return;
      }
      let query = client.from("outreach_email_templates").update({ name: command.name, subject_template: command.subjectTemplate, body_template: command.bodyTemplate }).eq("semester_id", command.semesterId).eq("id", command.templateId).is("archived_at", null);
      if (command.expectedUpdatedAt) query = query.eq("updated_at", command.expectedUpdatedAt);
      const result = await query.select("id").maybeSingle();
      if (result.error) fail(result.error);
      if (!result.data) throw Object.assign(new Error("Template changed after it was loaded."), { code: "40001" });
    },
    async archiveTemplate(command: Extract<OutreachEmailCommand, { action: "archive_template" }>) {
      const result = await client.from("outreach_email_templates").update({ archived_at: new Date().toISOString() }).eq("semester_id", command.semesterId).eq("id", command.templateId).eq("updated_at", command.expectedUpdatedAt).is("archived_at", null).select("id").maybeSingle();
      if (result.error) fail(result.error);
      if (!result.data) throw Object.assign(new Error("Template changed after it was loaded."), { code: "40001" });
    },
  };
}
