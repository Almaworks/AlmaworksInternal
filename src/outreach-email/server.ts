import { mentorOnboardingUrl } from "./onboarding-link.ts";
import { createHash, randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "../auth/server.ts";
import type { Database } from "../db/types.ts";
import {
  OutreachEmailRequestError,
  outreachEmailStarterTemplates,
  parseOutreachEmailCommand,
  parseOutreachEmailQuery,
  supportedOutreachEmailPlaceholders,
} from "./model.ts";
import { createResendProvider, type OutreachEmailProvider, type ProviderSubmissionResult } from "./resend-provider.ts";
import {
  createOutreachEmailSigner,
  type OutreachEmailProviderReceipt,
  type OutreachEmailSignature,
  type OutreachEmailSigner,
  type OutreachEmailSnapshot,
} from "./signing.ts";
import type {
  OutreachEmailApiResponse,
  OutreachEmailCommand,
  OutreachEmailConfiguration,
  OutreachEmailMessage,
  OutreachEmailMessageStatus,
  OutreachEmailMutationResponse,
  OutreachEmailOpportunity,
  OutreachEmailTemplate,
  OutreachEmailWorkspaceResponse,
} from "./types.ts";

export class OutreachEmailHttpError extends Error {
  readonly code: string;
  readonly field?: string;
  readonly status: number;
  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = "OutreachEmailHttpError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export interface SignedOutreachEmailReceipt {
  receipt: OutreachEmailProviderReceipt;
  signature: OutreachEmailSignature;
}

export interface OutreachEmailRecord {
  clientIdempotencyKey: string;
  receipts: SignedOutreachEmailReceipt[];
  requestDigest: string;
  snapshot: OutreachEmailSnapshot;
  snapshotSignature: OutreachEmailSignature;
  templateId: string | null;
}

export interface OutreachEmailStoreInput {
  messages: OutreachEmailRecord[];
  opportunity: (OutreachEmailOpportunity & { contactId: string }) | null;
  semesterId: string;
  semesterName: string;
  templates: OutreachEmailTemplate[];
  timeZone: string;
}

export interface ReserveOutreachEmailInput extends Omit<OutreachEmailRecord, "receipts"> {
  receipts?: never;
}

export interface OutreachEmailStore {
  appendReceipt(messageId: string, receipt: SignedOutreachEmailReceipt): Promise<void>;
  archiveTemplate(command: Extract<OutreachEmailCommand, { action: "archive_template" }>): Promise<void>;
  load(semesterId: string, opportunityId?: string): Promise<OutreachEmailStoreInput>;
  findByIdempotency(semesterId: string, clientIdempotencyKey: string): Promise<OutreachEmailRecord | null>;
  reserve(input: ReserveOutreachEmailInput): Promise<OutreachEmailRecord>;
  saveTemplate(command: Extract<OutreachEmailCommand, { action: "save_template" }>): Promise<void>;
}

export interface RuntimeConfiguration extends OutreachEmailConfiguration {
  apiKey: string | null;
}

type AuthorizeOutreachEmail = (request: Request, semesterId: string) => Promise<OutreachEmailStore>;

interface HandlerDependencies {
  authorize: AuthorizeOutreachEmail;
  configuration: RuntimeConfiguration;
  now: () => Date;
  provider: OutreachEmailProvider | null;
  signer: OutreachEmailSigner | null;
}

const IDEMPOTENCY_RETENTION_MILLISECONDS = 24 * 60 * 60 * 1000;
const SUBMISSION_CLAIM_LEASE_MILLISECONDS = 2 * 60 * 1000;

function publicConfiguration(configuration: RuntimeConfiguration, timeZone: string): OutreachEmailConfiguration {
  return { mentorOnboardingUrl: configuration.mentorOnboardingUrl ?? null, available: configuration.available, sender: configuration.sender, timeZone, unavailableReason: configuration.unavailableReason };
}

function verifiedRecord(record: OutreachEmailRecord, signer: OutreachEmailSigner): { digest: string; receipts: SignedOutreachEmailReceipt[] } | null {
  const snapshot = signer.verifySnapshot(record.snapshot, record.snapshotSignature);
  if (!snapshot.ok) return null;
  let providerId: string | null = null;
  const receipts = record.receipts.filter((signed) => {
    const receipt = signed.receipt;
    if (receipt.messageId !== record.snapshot.messageId || receipt.semesterId !== record.snapshot.semesterId || receipt.snapshotDigest !== snapshot.digest) return false;
    if (!signer.verifyReceipt(receipt, signed.signature)) return false;
    if (providerId !== null && receipt.providerId !== null && receipt.providerId !== providerId) return false;
    if (receipt.providerId !== null) providerId = receipt.providerId;
    return true;
  });
  return { digest: snapshot.digest, receipts };
}

function messageView(record: OutreachEmailRecord, signer: OutreachEmailSigner, now: Date): OutreachEmailMessage | null {
  const verified = verifiedRecord(record, signer);
  if (!verified) return null;
  const lastReceipt = verified.receipts.at(-1)?.receipt;
  const receipt = verified.receipts.filter((candidate) => candidate.receipt.messageStatus !== "submitting").at(-1)?.receipt;
  const staleClaim = lastReceipt?.messageStatus === "submitting" && now.getTime() - Date.parse(lastReceipt.checkedAt) >= SUBMISSION_CLAIM_LEASE_MILLISECONDS;
  const status = (staleClaim ? "submission_unknown" : receipt?.messageStatus ?? "prepared") as OutreachEmailMessageStatus;
  const firstAccepted = verified.receipts.find((candidate) => candidate.receipt.messageStatus === "accepted" || candidate.receipt.messageStatus === "scheduled")?.receipt.checkedAt ?? null;
  const snapshot = record.snapshot;
  return {
    acceptedAt: firstAccepted,
    activityId: null,
    body: snapshot.body,
    canCancel: status === "scheduled" && receipt?.providerId !== null && receipt?.providerId !== undefined,
    canRefresh: receipt?.providerId !== null && receipt?.providerId !== undefined && ["accepted", "scheduled", "sent", "cancel_unknown"].includes(status),
    canRetry: (lastReceipt?.messageStatus !== "submitting" || staleClaim) && status === "submission_unknown" && now.getTime() <= Date.parse(snapshot.idempotencyExpiresAt),
    cancelledAt: status === "cancelled" ? receipt?.checkedAt ?? null : null,
    createdAt: snapshot.createdAt,
    deliveredAt: receipt?.deliveredAt ?? null,
    idempotencyExpiresAt: snapshot.idempotencyExpiresAt,
    lastError: receipt?.lastError ?? null,
    messageId: snapshot.messageId,
    opportunityId: snapshot.opportunityId,
    providerCheckedAt: receipt?.checkedAt ?? null,
    providerId: receipt?.providerId ?? null,
    providerStatus: receipt?.providerStatus ?? null,
    recipientEmail: snapshot.recipientEmail,
    recipientName: snapshot.recipientName,
    scheduledAt: snapshot.scheduledAt,
    sender: snapshot.sender,
    sentAt: receipt?.sentAt ?? null,
    status,
    subject: snapshot.subject,
    templateId: record.templateId,
  };
}

export function projectVerifiedOutreachEmailHistory(
  records: readonly OutreachEmailRecord[],
  signer: OutreachEmailSigner | null,
  now: Date,
): OutreachEmailMessage[] {
  if (records.length > 0 && !signer) {
    throw new OutreachEmailHttpError(503, "history_integrity_unavailable", "Email history cannot be verified because signing-key configuration is unavailable.");
  }
  const projected = signer ? records.map((record) => messageView(record, signer, now)) : [];
  if (projected.some((message) => message === null)) {
    throw new OutreachEmailHttpError(409, "history_integrity_unavailable", "One or more email history records cannot be verified. Restore the signing key used for those records.");
  }
  return projected.filter((message): message is OutreachEmailMessage => message !== null);
}

function workspace(input: OutreachEmailStoreInput, dependencies: HandlerDependencies): OutreachEmailWorkspaceResponse {
  const messages = projectVerifiedOutreachEmailHistory(input.messages, dependencies.signer, dependencies.now());
  return {
    configuration: publicConfiguration(dependencies.configuration, input.timeZone),
    messages,
    opportunity: input.opportunity === null ? null : {
      companyName: input.opportunity.companyName,
      opportunityId: input.opportunity.opportunityId,
      recipientEmail: input.opportunity.recipientEmail,
      recipientName: input.opportunity.recipientName,
      semesterName: input.opportunity.semesterName,
    },
    semesterId: input.semesterId,
    starterTemplates: [...outreachEmailStarterTemplates],
    supportedPlaceholders: supportedOutreachEmailPlaceholders(),
    templates: input.templates,
  };
}

function requireDelivery(dependencies: HandlerDependencies): { provider: OutreachEmailProvider; signer: OutreachEmailSigner; sender: string } {
  if (!dependencies.configuration.available || !dependencies.provider || !dependencies.signer || !dependencies.configuration.sender) {
    throw new OutreachEmailHttpError(503, "email_unavailable", dependencies.configuration.unavailableReason ?? "Email delivery is not configured.");
  }
  return { provider: dependencies.provider, signer: dependencies.signer, sender: dependencies.configuration.sender };
}

function requestDigest(command: Extract<OutreachEmailCommand, { action: "submit_message" }>): string {
  return createHash("sha256").update(JSON.stringify([command.semesterId, command.opportunityId, command.templateId, command.subject, command.body, command.scheduledAt, command.idempotencyKey])).digest("hex");
}

function signedReceipt(signer: OutreachEmailSigner, receipt: OutreachEmailProviderReceipt): SignedOutreachEmailReceipt {
  return { receipt, signature: signer.signReceipt(receipt) };
}

async function recordSubmission(store: OutreachEmailStore, record: OutreachEmailRecord, result: ProviderSubmissionResult, signer: OutreachEmailSigner, now: Date, preserveUnknown: boolean): Promise<void> {
  const verified = signer.verifySnapshot(record.snapshot, record.snapshotSignature);
  if (!verified.ok) throw new OutreachEmailHttpError(409, "snapshot_invalid", "The saved email snapshot could not be verified.");
  const status: OutreachEmailMessageStatus = result.kind === "accepted"
    ? (record.snapshot.scheduledAt === null ? "accepted" : "scheduled")
    : result.kind === "rejected" && !preserveUnknown ? "failed" : "submission_unknown";
  const receipt: OutreachEmailProviderReceipt = {
    checkedAt: now.toISOString(), deliveredAt: null, lastError: result.kind === "accepted" ? null : result.message,
    messageId: record.snapshot.messageId, messageStatus: status, providerId: result.kind === "accepted" ? result.providerId : null,
    providerStatus: result.kind === "accepted" ? status : preserveUnknown && result.kind === "rejected" ? "retry_rejected_unknown" : result.kind, semesterId: record.snapshot.semesterId,
    sentAt: null, snapshotDigest: verified.digest, version: 1,
  };
  await store.appendReceipt(record.snapshot.messageId, signedReceipt(signer, receipt));
}

async function submitStored(store: OutreachEmailStore, record: OutreachEmailRecord, dependencies: HandlerDependencies, mode: "initial" | "recovery" | "retry"): Promise<void> {
  const { provider, signer } = requireDelivery(dependencies);
  const verified = verifiedRecord(record, signer);
  if (!verified) throw new OutreachEmailHttpError(409, "snapshot_invalid", "The saved email snapshot could not be verified.");
  const last = verified.receipts.at(-1)?.receipt;
  const latest = verified.receipts.filter((receipt) => receipt.receipt.messageStatus !== "submitting").at(-1)?.receipt;
  if (mode === "initial" && latest) return;
  if (mode === "retry" && latest?.messageStatus !== "submission_unknown") {
    throw new OutreachEmailHttpError(409, "email_not_retryable", "Only an email with an unknown submission result can be retried.");
  }
  if (mode === "recovery" && (last?.messageStatus !== "submitting" || dependencies.now().getTime() - Date.parse(last.checkedAt) < SUBMISSION_CLAIM_LEASE_MILLISECONDS)) {
    throw new OutreachEmailHttpError(409, "submission_in_progress", "This email submission is already in progress.");
  }
  if (dependencies.now().getTime() > Date.parse(record.snapshot.idempotencyExpiresAt)) {
    throw new OutreachEmailHttpError(409, "idempotency_expired", "The provider's 24-hour retry window has expired. Refresh or create a new email instead.");
  }
  const claim: OutreachEmailProviderReceipt = {
    checkedAt: dependencies.now().toISOString(), deliveredAt: null, lastError: null,
    messageId: record.snapshot.messageId, messageStatus: "submitting", providerId: null,
    providerStatus: "submitting", semesterId: record.snapshot.semesterId, sentAt: null,
    snapshotDigest: verified.digest, version: 1,
  };
  try {
    await store.appendReceipt(record.snapshot.messageId, signedReceipt(signer, claim));
  } catch (cause) {
    const code = typeof cause === "object" && cause !== null && "code" in cause ? String((cause as { code?: unknown }).code ?? "") : "";
    if (code === "23514" || code === "23505") throw new OutreachEmailHttpError(409, "submission_in_progress", "This email submission is already in progress.");
    throw cause;
  }
  const result = await provider.submit({
    body: record.snapshot.body,
    idempotencyKey: `outreach-email/${record.snapshot.messageId}`,
    recipientEmail: record.snapshot.recipientEmail,
    scheduledAt: record.snapshot.scheduledAt,
    sender: record.snapshot.sender,
    subject: record.snapshot.subject,
  });
  await recordSubmission(store, record, result, signer, dependencies.now(), mode !== "initial");
}

function mapProviderStatus(status: string, previous: OutreachEmailMessageStatus): OutreachEmailMessageStatus {
  let candidate: OutreachEmailMessageStatus;
  switch (status.toLowerCase()) {
    case "scheduled": candidate = "scheduled"; break;
    case "sent": candidate = "sent"; break;
    case "delivery_delayed": candidate = "sent"; break;
    case "delivered":
    case "opened":
    case "clicked": candidate = "delivered"; break;
    case "bounced": candidate = "bounced"; break;
    case "complained": candidate = "complained"; break;
    case "failed": candidate = "failed"; break;
    case "suppressed": candidate = "suppressed"; break;
    case "canceled":
    case "cancelled": candidate = "cancelled"; break;
    case "queued": candidate = "accepted"; break;
    default: return previous;
  }
  if (previous === "delivered" && !["bounced", "complained"].includes(candidate)) return previous;
  if (previous === "sent" && candidate === "cancelled") return previous;
  if (["bounced", "complained", "cancelled", "failed", "suppressed"].includes(previous)) return previous;
  if (["bounced", "complained", "cancelled", "failed", "suppressed"].includes(candidate)) return candidate;
  const rank = (value: OutreachEmailMessageStatus) => value === "delivered" ? 3 : value === "sent" ? 2 : value === "scheduled" || value === "accepted" ? 1 : 0;
  return rank(candidate) > rank(previous) ? candidate : previous;
}

async function refreshMessage(store: OutreachEmailStore, record: OutreachEmailRecord, dependencies: HandlerDependencies): Promise<void> {
  const { provider, signer } = requireDelivery(dependencies);
  const verified = verifiedRecord(record, signer);
  const previous = verified?.receipts.at(-1)?.receipt;
  if (!verified || !previous?.providerId) throw new OutreachEmailHttpError(409, "provider_id_unavailable", "This email does not have a verified provider identifier.");
  const result = await provider.retrieve(previous.providerId);
  if (result.kind !== "found") {
    throw new OutreachEmailHttpError(result.kind === "ambiguous" ? 502 : 409, "provider_refresh_failed", result.message);
  }
  if (result.providerId !== previous.providerId) throw new OutreachEmailHttpError(502, "provider_refresh_failed", "The provider returned a different email identifier.");
  const checkedAt = dependencies.now().toISOString();
  const status = mapProviderStatus(result.providerStatus, previous.messageStatus as OutreachEmailMessageStatus);
  const sent = ["sent", "delivered", "bounced", "complained"].includes(status);
  const receipt: OutreachEmailProviderReceipt = {
    checkedAt,
    deliveredAt: status === "delivered" ? checkedAt : previous.deliveredAt,
    lastError: null,
    messageId: record.snapshot.messageId,
    messageStatus: status,
    providerId: result.providerId,
    providerStatus: result.providerStatus,
    semesterId: record.snapshot.semesterId,
    sentAt: sent ? previous.sentAt ?? checkedAt : previous.sentAt,
    snapshotDigest: verified.digest,
    version: 1,
  };
  await store.appendReceipt(record.snapshot.messageId, signedReceipt(signer, receipt));
}

async function cancelMessage(store: OutreachEmailStore, record: OutreachEmailRecord, dependencies: HandlerDependencies): Promise<void> {
  const { provider, signer } = requireDelivery(dependencies);
  const verified = verifiedRecord(record, signer);
  const previous = verified?.receipts.at(-1)?.receipt;
  if (!verified || previous?.messageStatus !== "scheduled" || !previous.providerId) {
    throw new OutreachEmailHttpError(409, "email_not_cancellable", "Only a verified scheduled email can be cancelled.");
  }
  const result = await provider.cancel(previous.providerId);
  if (result.kind === "cancelled" && result.providerId !== previous.providerId) {
    throw new OutreachEmailHttpError(502, "provider_cancel_failed", "The provider returned a different email identifier.");
  }
  const receipt: OutreachEmailProviderReceipt = {
    checkedAt: dependencies.now().toISOString(), deliveredAt: previous.deliveredAt,
    lastError: result.kind === "cancelled" ? null : result.message,
    messageId: record.snapshot.messageId,
    messageStatus: result.kind === "cancelled" ? "cancelled" : "cancel_unknown",
    providerId: previous.providerId,
    providerStatus: result.kind === "cancelled" ? "cancelled" : result.kind,
    semesterId: record.snapshot.semesterId, sentAt: previous.sentAt,
    snapshotDigest: verified.digest, version: 1,
  };
  await store.appendReceipt(record.snapshot.messageId, signedReceipt(signer, receipt));
}

async function findMessage(store: OutreachEmailStore, semesterId: string, messageId: string): Promise<OutreachEmailRecord> {
  const loaded = await store.load(semesterId);
  const record = loaded.messages.find((message) => message.snapshot.messageId === messageId);
  if (!record) throw new OutreachEmailHttpError(404, "message_not_found", "Email history record not found.");
  return record;
}

function json<T>(body: OutreachEmailApiResponse<T>, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function failure(cause: unknown): Response {
  if (cause instanceof AuthorizationError) return json({ apiVersion: "2026-09-08", error: { code: "authorization_failed", message: cause.message } }, cause.status);
  if (cause instanceof OutreachEmailRequestError) return json({ apiVersion: "2026-09-08", error: { code: "invalid_request", field: cause.field, message: cause.message } }, 400);
  if (cause instanceof OutreachEmailHttpError) return json({ apiVersion: "2026-09-08", error: { code: cause.code, field: cause.field, message: cause.message } }, cause.status);
  if (cause instanceof SyntaxError) return json({ apiVersion: "2026-09-08", error: { code: "invalid_json", message: "Request body must be valid JSON." } }, 400);
  const databaseCode = typeof cause === "object" && cause !== null && "code" in cause ? String((cause as { code?: unknown }).code ?? "") : "";
  if (databaseCode === "23505" || databaseCode === "40001") return json({ apiVersion: "2026-09-08", error: { code: "conflict", message: "The email request conflicts with a saved change." } }, 409);
  if (databaseCode === "42501") return json({ apiVersion: "2026-09-08", error: { code: "authorization_failed", message: "Semester administrator access is required." } }, 403);
  return json({ apiVersion: "2026-09-08", error: { code: "email_failed", message: "The email request could not be completed. Please try again." } }, 500);
}

export function createOutreachEmailHandlers(dependencies: HandlerDependencies) {
  return {
    async GET(request: Request): Promise<Response> {
      try {
        const query = parseOutreachEmailQuery(request.url);
        const store = await dependencies.authorize(request, query.semesterId);
        const loaded = await store.load(query.semesterId, query.opportunityId);
        if (loaded.semesterId !== query.semesterId) throw new OutreachEmailHttpError(500, "scope_mismatch", "The email workspace returned a different semester.");
        return json({ apiVersion: "2026-09-08", data: workspace(loaded, dependencies) });
      } catch (cause) { return failure(cause); }
    },
    async POST(request: Request): Promise<Response> {
      try {
        const command = parseOutreachEmailCommand(await request.json(), dependencies.now());
        const store = await dependencies.authorize(request, command.semesterId);
        let opportunityId: string | undefined;
        let messageId: string | null = null;
        if (command.action === "save_template") await store.saveTemplate(command);
        else if (command.action === "archive_template") await store.archiveTemplate(command);
        else if (command.action === "submit_message") {
          const digest = requestDigest(command);
          const existing = await store.findByIdempotency(command.semesterId, command.idempotencyKey);
          if (existing) {
            if (existing.requestDigest !== digest) throw new OutreachEmailHttpError(409, "idempotency_conflict", "The idempotency key is already used for a different email.");
            messageId = existing.snapshot.messageId;
            opportunityId = existing.snapshot.opportunityId;
            if (dependencies.signer) {
              const verified = verifiedRecord(existing, dependencies.signer);
              const last = verified?.receipts.at(-1)?.receipt;
              const operational = verified?.receipts.filter((receipt) => receipt.receipt.messageStatus !== "submitting").at(-1)?.receipt;
              if (verified && !operational && !last) await submitStored(store, existing, dependencies, "initial");
              else if (verified && last?.messageStatus === "submitting" && dependencies.now().getTime() - Date.parse(last.checkedAt) >= SUBMISSION_CLAIM_LEASE_MILLISECONDS) {
                await submitStored(store, existing, dependencies, "recovery");
              }
            }
          } else {
          const { signer, sender } = requireDelivery(dependencies);
          const context = await store.load(command.semesterId, command.opportunityId);
          if (!context.opportunity || context.opportunity.opportunityId !== command.opportunityId) throw new OutreachEmailHttpError(404, "opportunity_not_found", "The outreach opportunity is not available.");
          opportunityId = command.opportunityId;
          const createdAt = dependencies.now().toISOString();
          const snapshot: OutreachEmailSnapshot = {
            body: command.body, contactId: context.opportunity.contactId, createdAt,
            idempotencyExpiresAt: new Date(Date.parse(createdAt) + IDEMPOTENCY_RETENTION_MILLISECONDS).toISOString(),
            idempotencyKey: command.idempotencyKey, messageId: randomUUID(), opportunityId: command.opportunityId,
            recipientEmail: context.opportunity.recipientEmail, recipientName: context.opportunity.recipientName,
            scheduledAt: command.scheduledAt, semesterId: command.semesterId, sender, subject: command.subject, version: 1,
          };
          const signed = signer.signSnapshot(snapshot);
          const record = await store.reserve({ clientIdempotencyKey: command.idempotencyKey, requestDigest: digest, snapshot, snapshotSignature: signed, templateId: command.templateId });
          messageId = record.snapshot.messageId;
          opportunityId = record.snapshot.opportunityId;
          await submitStored(store, record, dependencies, "initial");
          }
        } else {
          const record = await findMessage(store, command.semesterId, command.messageId);
          messageId = record.snapshot.messageId;
          opportunityId = record.snapshot.opportunityId;
          if (command.action === "retry_message") {
            const verified = dependencies.signer ? verifiedRecord(record, dependencies.signer) : null;
            const last = verified?.receipts.at(-1)?.receipt;
            const latest = verified?.receipts.filter((receipt) => receipt.receipt.messageStatus !== "submitting").at(-1)?.receipt;
            if (last?.messageStatus === "submitting" && dependencies.now().getTime() - Date.parse(last.checkedAt) >= SUBMISSION_CLAIM_LEASE_MILLISECONDS) await submitStored(store, record, dependencies, "recovery");
            else {
              if (latest?.messageStatus !== "submission_unknown") throw new OutreachEmailHttpError(409, "email_not_retryable", "Only an email with an unknown submission result can be retried.");
              await submitStored(store, record, dependencies, "retry");
            }
          } else if (command.action === "cancel_message") await cancelMessage(store, record, dependencies);
          else await refreshMessage(store, record, dependencies);
        }
        const loaded = await store.load(command.semesterId, opportunityId);
        return json<OutreachEmailMutationResponse>({ apiVersion: "2026-09-08", data: { messageId, workspace: workspace(loaded, dependencies) } });
      } catch (cause) { return failure(cause); }
    },
  };
}

export function readOutreachEmailConfiguration(environment: Readonly<Record<string, string | undefined>> = process.env): { configuration: RuntimeConfiguration; signer: OutreachEmailSigner | null } {
  const apiKey = environment.RESEND_API_KEY?.trim() || null;
  const sender = environment.OUTREACH_EMAIL_FROM_EMAIL?.trim() || environment.NOTIFY_FROM_EMAIL?.trim() || null;
  const currentKeyId = environment.OUTREACH_EMAIL_SIGNING_KEY_ID?.trim() || "";
  const currentKey = environment.OUTREACH_EMAIL_SIGNING_KEY?.trim() || "";
  let previous: Record<string, string> = {};
  let previousValid = true;
  try {
    const parsed: unknown = JSON.parse(environment.OUTREACH_EMAIL_PREVIOUS_SIGNING_KEYS || "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || Object.values(parsed).some((value) => typeof value !== "string")) previousValid = false;
    else previous = parsed as Record<string, string>;
  } catch { previousValid = false; }
  let signer: OutreachEmailSigner | null = null;
  try {
    signer = previousValid && currentKeyId && currentKey ? createOutreachEmailSigner({ currentKeyId, keys: { ...previous, [currentKeyId]: currentKey } }) : null;
  } catch { signer = null; }
  const available = Boolean(apiKey && sender && signer);
  return {
    configuration: { mentorOnboardingUrl: mentorOnboardingUrl(environment.OUTREACH_APP_ORIGIN), apiKey, available, sender, timeZone: "UTC", unavailableReason: available ? null : "Email delivery requires a Resend key, sender, and signing key configuration." },
    signer,
  };
}

async function authorizeOutreachEmail(request: Request, semesterId: string): Promise<OutreachEmailStore> {
  const auth = await requireAuthenticatedUserWithRls(request);
  const management = await auth.userClient.rpc("can_manage_semester", { target_semester_id: semesterId, candidate_id: auth.user.id });
  if (management.error) throw management.error;
  if (management.data !== true) throw new OutreachEmailHttpError(403, "authorization_failed", "Semester administrator access is required.");
  const { createOutreachEmailStore } = await import("./store.ts");
  return createOutreachEmailStore(auth.userClient as SupabaseClient<Database>);
}

export function createDefaultOutreachEmailHandlers() {
  const loaded = readOutreachEmailConfiguration();
  return createOutreachEmailHandlers({
    authorize: authorizeOutreachEmail,
    configuration: loaded.configuration,
    now: () => new Date(),
    provider: loaded.configuration.apiKey ? createResendProvider({ apiKey: loaded.configuration.apiKey }) : null,
    signer: loaded.signer,
  });
}
