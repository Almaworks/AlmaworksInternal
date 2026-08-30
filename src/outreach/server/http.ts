import { AuthorizationError, MembershipSuspensionError } from "../../auth/server.ts";
import type { Json } from "../../db/types.ts";
import type { OutreachChannel, OutreachStage } from "../types.ts";
import {
  OutreachCommandDatabaseError,
  OutreachCommandValidationError,
  type OutreachCommandResult,
} from "./commands.ts";

export const OUTREACH_API_VERSION = "2026-08-18";

// Accept all Postgres UUID values, including the legacy seeded semester ID
// (00000000-0000-0000-0000-000000000001), whose version nibble is 0.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CHANNELS = new Set<OutreachChannel>([
  "email",
  "linkedin",
  "warm_intro",
  "referral",
  "event",
  "other",
]);
const STAGES = new Set<OutreachStage>([
  "prospect",
  "researching",
  "ready",
  "contacted",
  "responded",
  "meeting",
  "nurture",
  "converted",
  "closed",
]);
const ACTIVITY_KINDS = new Set(["email", "call", "linkedin", "meeting", "reply", "note"]);

export class OutreachHttpError extends Error {
  readonly status: 400 | 404 | 409 | 501;
  readonly code: string;
  readonly field: string | undefined;

  constructor(
    status: 400 | 404 | 409 | 501,
    code: string,
    message: string,
    field?: string,
  ) {
    super(message);
    this.name = "OutreachHttpError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

type JsonObject = Record<string, unknown>;

export interface CreateContactBody {
  semesterId: string;
  contact: {
    fullName: string;
    email: string | null;
    linkedinUrl: string | null;
    phone: string | null;
    biography: string | null;
    expertiseTags: readonly string[];
    notes: string | null;
  };
  company: {
    name: string;
    domain: string | null;
    websiteUrl: string | null;
    description: string | null;
    sector: string | null;
    title: string | null;
  } | null;
  opportunity: {
    ownerProfileId: string | null;
    stage: OutreachStage;
    cadenceDays: number;
    nextFollowUpAt: string | null;
    sourceChannel: OutreachChannel | null;
    referredBy: string | null;
    priority: number;
    notes: string | null;
    relationshipLabelIds: readonly string[];
  };
}

export interface UpdateContactBody {
  semesterId: string;
  contactId: string;
  updatedAt: string;
  changes: {
    fullName?: string;
    email?: string | null;
    linkedinUrl?: string | null;
    phone?: string | null;
    biography?: string | null;
    expertiseTags?: readonly string[];
    notes?: string | null;
  };
}

export interface ActivityBody {
  semesterId: string;
  opportunityId: string;
  updatedAt: string;
  occurredAt: string;
  activityKind: "email" | "call" | "linkedin" | "meeting" | "reply" | "note";
  channel?: OutreachChannel;
  summary?: string;
  details?: Json;
  nextFollowUpAt?: string;
  stage?: OutreachStage;
}

export interface OwnerBody {
  semesterId: string;
  opportunityId: string;
  updatedAt: string;
  newOwnerProfileId: string | null;
  reason?: string;
}

export interface SnoozeBody {
  semesterId: string;
  opportunityId: string;
  updatedAt: string;
  snoozedUntil: string | null;
  reason?: string;
}

export interface StageBody {
  semesterId: string;
  opportunityId: string;
  updatedAt: string;
  stage: OutreachStage;
}

export type SilenceBody = {
  semesterId: string;
  opportunityId: string;
  updatedAt: string;
  silence: true;
  reason: string;
} | {
  semesterId: string;
  opportunityId: string;
  updatedAt: string;
  silence: false;
  reason?: string;
  nextFollowUpAt: string;
};

export interface ImportPreviewBody {
  semesterId: string;
  source: "csv" | "excel";
  sourceFilename?: string;
  rows: readonly JsonObject[];
}

export interface ImportCommitBody {
  semesterId: string;
  importId: string;
  idempotencyKey: string;
}

export interface LegacyMigrationBody {
  semesterId: string;
  idempotencyKey?: string;
}

export interface MembershipSuspensionBody {
  semesterId: string;
  profileId: string;
  reason: string;
  updatedAt: string;
}

function validation(field: string, message: string): never {
  throw new OutreachHttpError(400, "validation_error", message, field);
}

function object(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OutreachHttpError(
      400,
      "invalid_json",
      "Request body must be a valid JSON object.",
    );
  }
  return value as JsonObject;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return validation(field, `${field} is required.`);
  }
  return value.trim();
}

function nullableText(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return validation(field, `${field} must be a string or null.`);
  return value.trim() || null;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return validation(field, `${field} must be a string.`);
  return value.trim() || undefined;
}

function uuid(value: unknown, field: string): string {
  const parsed = requiredText(value, field);
  if (!UUID_PATTERN.test(parsed)) return validation(field, `${field} must be a valid UUID.`);
  return parsed;
}

function nullableUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return uuid(value, field);
}

function isoTimestamp(value: unknown, field: string): string {
  const parsed = requiredText(value, field);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/u.test(parsed) || Number.isNaN(Date.parse(parsed))) {
    return validation(field, `${field} must be a valid ISO timestamp with an explicit timezone.`);
  }
  return parsed;
}

function nullableTimestamp(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return isoTimestamp(value, field);
}

function integerInRange(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    return validation(field, `${field} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value as number;
}

function channel(value: unknown, field: string): OutreachChannel {
  if (typeof value !== "string" || !CHANNELS.has(value as OutreachChannel)) {
    return validation(field, `${field} is not a supported outreach channel.`);
  }
  return value as OutreachChannel;
}

function nullableChannel(value: unknown, field: string): OutreachChannel | null {
  if (value === undefined || value === null || value === "") return null;
  return channel(value, field);
}

function stage(value: unknown, field: string, defaultValue?: OutreachStage): OutreachStage {
  if (value === undefined && defaultValue !== undefined) return defaultValue;
  if (typeof value !== "string" || !STAGES.has(value as OutreachStage)) {
    return validation(field, `${field} is not a supported outreach stage.`);
  }
  return value as OutreachStage;
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) {
    return validation(field, `${field} must contain only non-empty strings.`);
  }
  return value.map((item) => (item as string).trim());
}

function uuidArray(value: unknown, field: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return validation(field, `${field} must be an array of UUIDs.`);
  return value.map((item, index) => uuid(item, `${field}[${index}]`));
}

function optionalJson(value: unknown, field: string): Json | undefined {
  if (value === undefined) return undefined;
  try {
    JSON.stringify(value);
  } catch {
    return validation(field, `${field} must be JSON serializable.`);
  }
  return value as Json;
}

export function parseWorkspaceQuery(url: URL) {
  const view = optionalText(url.searchParams.get("view") ?? undefined, "view") ?? "team";
  const requestedSemesterId = url.searchParams.get("semesterId");
  const semesterId = requestedSemesterId === "all"
    ? "all"
    : uuid(requestedSemesterId, "semesterId");
  if (semesterId === "all" && view !== "people") {
    return validation(
      "semesterId",
      "All-time outreach is only available for the People view.",
    );
  }
  return {
    semesterId,
    cursor: optionalText(url.searchParams.get("cursor") ?? undefined, "cursor"),
    pageSize: integerInRange(
      url.searchParams.has("pageSize") ? Number(url.searchParams.get("pageSize")) : undefined,
      "pageSize",
      1,
      100,
      50,
    ),
    view,
  };
}

export function parseContactDetailQuery(url: URL, contactId: unknown) {
  return {
    semesterId: uuid(url.searchParams.get("semesterId"), "semesterId"),
    contactId: uuid(contactId, "contactId"),
    activityCursor: optionalText(
      url.searchParams.get("activityCursor") ?? undefined,
      "activityCursor",
    ),
    activityPageSize: integerInRange(
      url.searchParams.has("activityPageSize")
        ? Number(url.searchParams.get("activityPageSize"))
        : undefined,
      "activityPageSize",
      1,
      100,
      50,
    ),
  };
}

export function parseCreateContactBody(value: unknown): CreateContactBody {
  const body = object(value);
  const contact = object(body.contact);
  const opportunity = object(body.opportunity);
  const company = body.company === undefined || body.company === null
    ? null
    : object(body.company);

  return {
    semesterId: uuid(body.semesterId, "semesterId"),
    contact: {
      fullName: requiredText(contact.fullName, "contact.fullName"),
      email: nullableText(contact.email, "contact.email")?.toLowerCase() ?? null,
      linkedinUrl: nullableText(contact.linkedinUrl, "contact.linkedinUrl"),
      phone: nullableText(contact.phone, "contact.phone"),
      biography: nullableText(contact.biography, "contact.biography"),
      expertiseTags: stringArray(contact.expertiseTags, "contact.expertiseTags"),
      notes: nullableText(contact.notes, "contact.notes"),
    },
    company: company === null ? null : {
      name: requiredText(company.name, "company.name"),
      domain: nullableText(company.domain, "company.domain")?.toLowerCase() ?? null,
      websiteUrl: nullableText(company.websiteUrl, "company.websiteUrl"),
      description: nullableText(company.description, "company.description"),
      sector: nullableText(company.sector, "company.sector"),
      title: nullableText(company.title, "company.title"),
    },
    opportunity: {
      ownerProfileId: nullableUuid(opportunity.ownerProfileId, "opportunity.ownerProfileId"),
      stage: stage(opportunity.stage, "opportunity.stage", "prospect"),
      cadenceDays: integerInRange(
        opportunity.cadenceDays,
        "opportunity.cadenceDays",
        1,
        365,
        7,
      ),
      nextFollowUpAt: nullableTimestamp(
        opportunity.nextFollowUpAt,
        "opportunity.nextFollowUpAt",
      ),
      sourceChannel: nullableChannel(opportunity.sourceChannel, "opportunity.sourceChannel"),
      referredBy: nullableText(opportunity.referredBy, "opportunity.referredBy"),
      priority: integerInRange(opportunity.priority, "opportunity.priority", 0, 100, 50),
      notes: nullableText(opportunity.notes, "opportunity.notes"),
      relationshipLabelIds: uuidArray(
        opportunity.relationshipLabelIds,
        "opportunity.relationshipLabelIds",
      ),
    },
  };
}

export function parseUpdateContactBody(value: unknown): UpdateContactBody {
  const body = object(value);
  const changes = object(body.changes);
  const parsedChanges: UpdateContactBody["changes"] = {};
  if ("fullName" in changes) parsedChanges.fullName = requiredText(changes.fullName, "changes.fullName");
  if ("email" in changes) parsedChanges.email = nullableText(changes.email, "changes.email")?.toLowerCase() ?? null;
  if ("linkedinUrl" in changes) parsedChanges.linkedinUrl = nullableText(changes.linkedinUrl, "changes.linkedinUrl");
  if ("phone" in changes) parsedChanges.phone = nullableText(changes.phone, "changes.phone");
  if ("biography" in changes) parsedChanges.biography = nullableText(changes.biography, "changes.biography");
  if ("expertiseTags" in changes) parsedChanges.expertiseTags = stringArray(changes.expertiseTags, "changes.expertiseTags");
  if ("notes" in changes) parsedChanges.notes = nullableText(changes.notes, "changes.notes");
  if (Object.keys(parsedChanges).length === 0) validation("changes", "At least one contact change is required.");
  return {
    semesterId: uuid(body.semesterId, "semesterId"),
    contactId: uuid(body.contactId, "contactId"),
    updatedAt: isoTimestamp(body.updatedAt, "updatedAt"),
    changes: parsedChanges,
  };
}

export function parseActivityBody(value: unknown): ActivityBody {
  const body = object(value);
  if (typeof body.activityKind !== "string" || !ACTIVITY_KINDS.has(body.activityKind)) {
    validation("activityKind", "activityKind is not supported.");
  }
  const activityKind = body.activityKind as ActivityBody["activityKind"];
  const parsedChannel = body.channel === undefined ? undefined : channel(body.channel, "channel");
  if ((activityKind === "email" || activityKind === "linkedin") && parsedChannel !== activityKind) {
    validation("channel", `${activityKind} activities must use the ${activityKind} channel.`);
  }
  if (activityKind === "call" && parsedChannel === undefined) {
    validation("channel", "call activities require a channel.");
  }
  if (activityKind === "note" && parsedChannel !== undefined) {
    validation("channel", "note activities do not use a channel.");
  }

  return {
    semesterId: uuid(body.semesterId, "semesterId"),
    opportunityId: uuid(body.opportunityId, "opportunityId"),
    updatedAt: isoTimestamp(body.updatedAt, "updatedAt"),
    occurredAt: isoTimestamp(body.occurredAt, "occurredAt"),
    activityKind,
    ...(parsedChannel === undefined ? {} : { channel: parsedChannel }),
    ...(optionalText(body.summary, "summary") === undefined
      ? {}
      : { summary: optionalText(body.summary, "summary") }),
    ...(optionalJson(body.details, "details") === undefined
      ? {}
      : { details: optionalJson(body.details, "details") }),
    ...(body.nextFollowUpAt === undefined
      ? {}
      : { nextFollowUpAt: isoTimestamp(body.nextFollowUpAt, "nextFollowUpAt") }),
    ...(body.stage === undefined ? {} : { stage: stage(body.stage, "stage") }),
  };
}

export function parseOwnerBody(value: unknown): OwnerBody {
  const body = object(value);
  return {
    semesterId: uuid(body.semesterId, "semesterId"),
    opportunityId: uuid(body.opportunityId, "opportunityId"),
    updatedAt: isoTimestamp(body.updatedAt, "updatedAt"),
    newOwnerProfileId: nullableUuid(body.newOwnerProfileId, "newOwnerProfileId"),
    ...(optionalText(body.reason, "reason") === undefined
      ? {}
      : { reason: optionalText(body.reason, "reason") }),
  };
}

export function parseSnoozeBody(value: unknown): SnoozeBody {
  const body = object(value);
  return {
    semesterId: uuid(body.semesterId, "semesterId"),
    opportunityId: uuid(body.opportunityId, "opportunityId"),
    updatedAt: isoTimestamp(body.updatedAt, "updatedAt"),
    snoozedUntil: nullableTimestamp(body.snoozedUntil, "snoozedUntil"),
    ...(optionalText(body.reason, "reason") === undefined
      ? {}
      : { reason: optionalText(body.reason, "reason") }),
  };
}

export function parseStageBody(value: unknown): StageBody {
  const body = object(value);
  return {
    semesterId: uuid(body.semesterId, "semesterId"),
    opportunityId: uuid(body.opportunityId, "opportunityId"),
    updatedAt: isoTimestamp(body.updatedAt, "updatedAt"),
    stage: stage(body.stage, "stage"),
  };
}

export function parseSilenceBody(value: unknown): SilenceBody {
  const body = object(value);
  const base = {
    semesterId: uuid(body.semesterId, "semesterId"),
    opportunityId: uuid(body.opportunityId, "opportunityId"),
    updatedAt: isoTimestamp(body.updatedAt, "updatedAt"),
  };
  if (body.silence === true) {
    return {
      ...base,
      silence: true,
      reason: requiredText(body.reason, "reason"),
    };
  }
  if (body.silence === false) {
    return {
      ...base,
      silence: false,
      ...(optionalText(body.reason, "reason") === undefined
        ? {}
        : { reason: optionalText(body.reason, "reason") }),
      nextFollowUpAt: isoTimestamp(body.nextFollowUpAt, "nextFollowUpAt"),
    };
  }
  return validation("silence", "silence must be a boolean.");
}

export function parseImportPreviewBody(value: unknown): ImportPreviewBody {
  const body = object(value);
  if (body.source !== "csv" && body.source !== "excel") {
    validation("source", "source must be csv or excel.");
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > 250) {
    validation("rows", "rows must contain between 1 and 250 objects.");
  }
  const rows = body.rows.map((row, index) => {
    try {
      return object(row);
    } catch {
      return validation(`rows[${index}]`, `rows[${index}] must be an object.`);
    }
  });
  return {
    semesterId: uuid(body.semesterId, "semesterId"),
    source: body.source,
    ...(optionalText(body.sourceFilename, "sourceFilename") === undefined
      ? {}
      : { sourceFilename: optionalText(body.sourceFilename, "sourceFilename") }),
    rows,
  };
}

export function parseImportCommitBody(value: unknown, headers: Headers): ImportCommitBody {
  const body = object(value);
  const idempotencyKey = headers.get("idempotency-key");
  if (idempotencyKey === null || idempotencyKey.trim().length === 0) {
    validation("Idempotency-Key", "Idempotency-Key header is required.");
  }
  return {
    semesterId: uuid(body.semesterId, "semesterId"),
    importId: uuid(body.importId, "importId"),
    idempotencyKey: idempotencyKey.trim(),
  };
}

export function parseLegacyMigrationBody(
  value: unknown,
  headers?: Headers,
): LegacyMigrationBody {
  const body = object(value);
  const idempotencyKey = headers?.get("idempotency-key")?.trim();
  if (headers !== undefined && !idempotencyKey) {
    validation("Idempotency-Key", "Idempotency-Key header is required.");
  }
  return {
    semesterId: uuid(body.semesterId, "semesterId"),
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };
}

export function parseMembershipSuspensionBody(value: unknown): MembershipSuspensionBody {
  const body = object(value);
  return {
    semesterId: uuid(body.semesterId, "semesterId"),
    profileId: uuid(body.profileId, "profileId"),
    reason: requiredText(body.reason, "reason"),
    updatedAt: isoTimestamp(body.updatedAt, "updatedAt"),
  };
}

function envelope(data: unknown, status = 200): Response {
  return Response.json({ apiVersion: OUTREACH_API_VERSION, data }, { status });
}

function errorEnvelope(
  status: number,
  code: string,
  message: string,
  field?: string,
): Response {
  return Response.json({
    apiVersion: OUTREACH_API_VERSION,
    error: {
      code,
      ...(field === undefined ? {} : { field }),
      message,
    },
  }, { status });
}

function isCommandResult(value: unknown): value is OutreachCommandResult<unknown> {
  return typeof value === "object" && value !== null && "ok" in value
    && typeof (value as { ok: unknown }).ok === "boolean";
}

function mappedResponse(value: unknown, successStatus = 200): Response {
  if (isCommandResult(value)) {
    if (!value.ok) {
      return errorEnvelope(409, value.error.code, value.error.message);
    }
    return envelope(value.value, successStatus);
  }
  return envelope(value, successStatus);
}

function caughtResponse(error: unknown): Response {
  if (error instanceof OutreachHttpError) {
    return errorEnvelope(error.status, error.code, error.message, error.field);
  }
  if (error instanceof AuthorizationError && (error.status === 401 || error.status === 403)) {
    return errorEnvelope(
      error.status,
      error.status === 401 ? "unauthenticated" : "forbidden",
      error.message,
    );
  }
  if (error instanceof OutreachCommandValidationError) {
    return errorEnvelope(400, "validation_error", error.message, error.field);
  }
  if (error instanceof MembershipSuspensionError && error.code === "validation_error") {
    return errorEnvelope(400, "validation_error", "Membership suspension request is invalid.");
  }
  if (
    (error instanceof OutreachCommandDatabaseError || error instanceof MembershipSuspensionError)
    && error.code === "P0002"
  ) {
    return errorEnvelope(404, "not_found", "The requested outreach record was not found.");
  }
  if (
    (error instanceof OutreachCommandDatabaseError || error instanceof MembershipSuspensionError)
    && error.code === "23505"
  ) {
    return errorEnvelope(409, "duplicate_record", "The outreach record already exists.");
  }
  return errorEnvelope(500, "internal_error", "An unexpected outreach error occurred.");
}

export function toOutreachResponse(operation: () => unknown, successStatus = 200): Response {
  try {
    return mappedResponse(operation(), successStatus);
  } catch (error) {
    return caughtResponse(error);
  }
}

export async function handleOutreachOperation(
  operation: () => Promise<unknown>,
  successStatus = 200,
): Promise<Response> {
  try {
    return mappedResponse(await operation(), successStatus);
  } catch (error) {
    return caughtResponse(error);
  }
}

export async function handleOutreachJson<T>(
  request: Request,
  parser: (value: unknown) => T,
  operation: (body: T) => Promise<unknown>,
  successStatus = 200,
): Promise<Response> {
  return await handleOutreachOperation(async () => {
    let value: unknown;
    try {
      value = await request.json();
    } catch {
      throw new OutreachHttpError(
        400,
        "invalid_json",
        "Request body must be a valid JSON object.",
      );
    }
    const body = parser(value);
    return await operation(body);
  }, successStatus);
}

export function notImplemented(capability: "import" | "legacy_migration"): never {
  throw new OutreachHttpError(
    501,
    "not_implemented",
    `${capability === "import" ? "Import" : "Legacy migration"} transactions are not implemented yet.`,
  );
}

export function notFound(message: string): never {
  throw new OutreachHttpError(404, "not_found", message);
}
