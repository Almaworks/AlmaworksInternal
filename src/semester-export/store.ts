import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";
import { projectVerifiedOutreachEmailHistory, type OutreachEmailRecord, type SignedOutreachEmailReceipt } from "../outreach-email/server.ts";
import type { OutreachEmailSigner } from "../outreach-email/signing.ts";
import { definitionsForScope, emailHistoryColumns, outreachImportRowColumns, unresolvedProfileReferenceColumns, type ExportDatasetDefinition, type ExportTableName } from "./catalog.ts";
import type { JsonValue, SemesterExportDataset, SemesterExportLoadedData, SemesterExportScope } from "./types.ts";

const PAGE_SIZE = 500;
const IN_FILTER_CHUNK_SIZE = 100;
const MAX_EXPORT_ROWS = 200_000;
const MAX_EXPORT_SOURCE_BYTES = 64 * 1024 * 1024;

type InternalTableName = ExportTableName | "outreach_email_messages" | "outreach_email_receipts";

export type ExportFilter =
  | { column: string; kind: "eq"; value: string }
  | { column: string; kind: "in"; values: readonly string[] };

export interface ExportPageRequest {
  after: string | null;
  columns: readonly string[];
  filters: readonly ExportFilter[];
  limit: number;
  offset: number;
  orderBy: readonly string[];
  table: InternalTableName;
}

export interface SemesterExportDataSource {
  fetchPage(request: ExportPageRequest): Promise<readonly Readonly<Record<string, unknown>>[]>;
}

export interface SemesterExportStore {
  load(semesterId: string, scope: SemesterExportScope): Promise<SemesterExportLoadedData>;
}

export class SemesterExportStoreError extends Error {
  readonly status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "SemesterExportStoreError";
    this.status = status;
  }
}

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

interface QueryChain extends PromiseLike<QueryResult> {
  eq(column: string, value: string): QueryChain;
  gt(column: string, value: string): QueryChain;
  in(column: string, values: readonly string[]): QueryChain;
  order(column: string, options?: { ascending?: boolean }): QueryChain;
  range(from: number, to: number): QueryChain;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonValue(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((entry, index) => jsonValue(entry, `${path}[${index}]`));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonValue(entry, `${path}.${key}`)]));
  throw new SemesterExportStoreError(`Dataset value ${path} is not JSON serializable.`);
}

function requiredString(row: Readonly<Record<string, unknown>>, column: string): string {
  const value = row[column];
  if (typeof value !== "string" || value.length === 0) throw new SemesterExportStoreError(`Database row is missing ${column}.`);
  return value;
}

function nullableString(row: Readonly<Record<string, unknown>>, column: string): string | null {
  const value = row[column];
  if (value === null) return null;
  if (typeof value !== "string") throw new SemesterExportStoreError(`Database row has an invalid ${column}.`);
  return value;
}

function allowlistedRow(row: Readonly<Record<string, unknown>>, columns: readonly string[]): Readonly<Record<string, JsonValue>> {
  return Object.fromEntries(columns.map((column) => {
    if (!Object.hasOwn(row, column)) throw new SemesterExportStoreError(`Database row is missing allowlisted column ${column}.`);
    return [column, jsonValue(row[column], column)];
  }));
}

function compareRows(columns: readonly string[]) {
  return (left: Readonly<Record<string, unknown>>, right: Readonly<Record<string, unknown>>): number => {
    for (const column of columns) {
      const comparison = String(left[column] ?? "").localeCompare(String(right[column] ?? ""), "en");
      if (comparison !== 0) return comparison;
    }
    return 0;
  };
}

export function createSupabaseSemesterExportDataSource(client: SupabaseClient<Database>): SemesterExportDataSource {
  return {
    async fetchPage(request) {
      let query = client.from(request.table).select(request.columns.join(",")) as unknown as QueryChain;
      for (const filter of request.filters) {
        query = filter.kind === "eq" ? query.eq(filter.column, filter.value) : query.in(filter.column, filter.values);
      }
      for (const column of request.orderBy) query = query.order(column, { ascending: true });
      if (request.after !== null) query = query.gt(request.orderBy[0]!, request.after);
      const result = await query.range(request.after === null ? request.offset : 0, (request.after === null ? request.offset : 0) + request.limit - 1);
      if (result.error) throw new SemesterExportStoreError(`Could not export ${request.table}: ${result.error.message}`);
      if (!Array.isArray(result.data) || !result.data.every(isRecord)) throw new SemesterExportStoreError(`Could not export ${request.table}: invalid database response.`);
      return result.data;
    },
  };
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))].sort();
}

function ids(rows: readonly Readonly<Record<string, unknown>>[], column: string): string[] {
  return uniqueStrings(rows.map((row) => typeof row[column] === "string" ? row[column] as string : null));
}

function valuesFrom(rows: readonly Readonly<Record<string, unknown>>[], columns: readonly string[]): string[] {
  return uniqueStrings(rows.flatMap((row) => columns.map((column) => typeof row[column] === "string" ? row[column] as string : null)));
}

function optionalString(value: unknown, path: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new SemesterExportStoreError(`${path} must be a string or null.`);
  return value;
}

function optionalBoolean(value: unknown, path: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw new SemesterExportStoreError(`${path} must be a boolean or null.`);
  return value;
}

function optionalNumber(value: unknown, path: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new SemesterExportStoreError(`${path} must be a finite number or null.`);
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) throw new SemesterExportStoreError(`${path} must be a string array.`);
  return value;
}

function safeConfiguration(value: unknown): Readonly<Record<string, JsonValue>> {
  if (value === null || value === undefined) return { time_zone: null, location: null, session_cadence: null, default_format: null, configuration_unknown_key_count: 0 };
  if (!isRecord(value)) throw new SemesterExportStoreError("semester.configuration must be an object.");
  const known = new Set(["timezone", "location", "sessionCadence", "defaultFormat"]);
  return {
    time_zone: optionalString(value.timezone, "semester.configuration.timezone"),
    location: optionalString(value.location, "semester.configuration.location"),
    session_cadence: optionalString(value.sessionCadence, "semester.configuration.sessionCadence"),
    default_format: optionalString(value.defaultFormat, "semester.configuration.defaultFormat"),
    configuration_unknown_key_count: Object.keys(value).filter((key) => !known.has(key)).length,
  };
}

const ONBOARDING_KEYS = new Set(["identity", "company_snapshot", "mentor_profile", "team_contacts", "expertise", "availability", "mentoring_hours_setup"]);
const ONBOARDING_PAYLOAD_KEYS: Readonly<Record<string, readonly string[]>> = {
  identity: ["name", "email", "role"], company_snapshot: ["organization", "description"], mentor_profile: ["organization", "description"],
  team_contacts: ["teamContact"], expertise: ["expertise"], availability: ["windows"], mentoring_hours_setup: ["choice"],
};

function onboardingProjection(value: unknown): Readonly<Record<string, JsonValue>> {
  if (value === null || value === undefined || (isRecord(value) && Object.keys(value).length === 0)) {
    return { onboarding_items: [], onboarding_unknown_item_count: 0, onboarding_unknown_payload_key_count: 0 };
  }
  if (!Array.isArray(value)) throw new SemesterExportStoreError("semester_memberships.onboarding_data must be an array.");
  const items: JsonValue[] = [];
  let unknownItems = 0;
  let unknownPayloadKeys = 0;
  value.forEach((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.item_key !== "string") throw new SemesterExportStoreError(`onboarding_data[${index}] is malformed.`);
    if (!ONBOARDING_KEYS.has(candidate.item_key)) { unknownItems += 1; return; }
    if (typeof candidate.is_required !== "boolean" || (candidate.completed_at !== null && typeof candidate.completed_at !== "string")) {
      throw new SemesterExportStoreError(`onboarding_data[${index}] has invalid completion metadata.`);
    }
    if (!isRecord(candidate.payload)) throw new SemesterExportStoreError(`onboarding_data[${index}].payload must be an object.`);
    const allowed = ONBOARDING_PAYLOAD_KEYS[candidate.item_key]!;
    unknownPayloadKeys += Object.keys(candidate).filter((key) => !["item_key", "is_required", "completed_at", "payload"].includes(key)).length;
    unknownPayloadKeys += Object.keys(candidate.payload).filter((key) => !allowed.includes(key)).length;
    const payload: Record<string, JsonValue> = {};
    for (const key of allowed) {
      if (!Object.hasOwn(candidate.payload, key)) throw new SemesterExportStoreError(`onboarding_data[${index}].payload.${key} is missing.`);
      const payloadValue = candidate.payload[key];
      if (key === "expertise" || key === "windows") {
        if (!Array.isArray(payloadValue) || !payloadValue.every((entry) => typeof entry === "string")) throw new SemesterExportStoreError(`onboarding_data[${index}].payload.${key} must be a string array.`);
        payload[key] = payloadValue;
      } else payload[key] = optionalString(payloadValue, `onboarding_data[${index}].payload.${key}`);
    }
    items.push({ item_key: candidate.item_key, is_required: candidate.is_required, completed_at: candidate.completed_at, payload });
  });
  return { onboarding_items: items, onboarding_unknown_item_count: unknownItems, onboarding_unknown_payload_key_count: unknownPayloadKeys };
}

function durableContactProjection(value: unknown): Readonly<Record<string, JsonValue>> {
  if (value === null || value === undefined) return { legacy_founder_name: null, legacy_founders: [], durable_contact_unknown_key_count: 0 };
  if (!isRecord(value)) throw new SemesterExportStoreError("startup_organizations.durable_contact_data must be an object.");
  const allowed = new Set(["founder_name", "founders"]);
  let unknown = Object.keys(value).filter((key) => !allowed.has(key)).length;
  const foundersValue = value.founders ?? [];
  if (!Array.isArray(foundersValue)) throw new SemesterExportStoreError("startup_organizations.durable_contact_data.founders must be an array.");
  const founders = foundersValue.map((founder, index): JsonValue => {
    if (!isRecord(founder)) throw new SemesterExportStoreError(`durable_contact_data.founders[${index}] must be an object.`);
    unknown += Object.keys(founder).filter((key) => key !== "name" && key !== "email").length;
    return { name: optionalString(founder.name, `founders[${index}].name`), email: optionalString(founder.email, `founders[${index}].email`) };
  });
  return { legacy_founder_name: optionalString(value.founder_name, "durable_contact_data.founder_name"), legacy_founders: founders, durable_contact_unknown_key_count: unknown };
}

function sourceContextProjection(value: unknown): Readonly<Record<string, JsonValue>> {
  if (value === null || value === undefined) value = {};
  if (!isRecord(value)) throw new SemesterExportStoreError("outreach_opportunities.source_context must be an object.");
  const mapping = { import_id: "source_import_id", source_name: "source_name", carried_from_semester_id: "carried_from_semester_id", carried_from_opportunity_id: "carried_from_opportunity_id" } as const;
  const output: Record<string, JsonValue> = {};
  for (const [source, target] of Object.entries(mapping)) output[target] = optionalString(value[source], `source_context.${source}`);
  output.source_context_unknown_key_count = Object.keys(value).filter((key) => !Object.hasOwn(mapping, key)).length;
  return output;
}

function activityDetailsProjection(value: unknown): Readonly<Record<string, JsonValue>> {
  if (value === null || value === undefined) value = {};
  if (!isRecord(value)) throw new SemesterExportStoreError("outreach_activities.details must be an object.");
  const mapping = {
    type: "detail_type", stage: "detail_stage", reason: "detail_reason", is_silenced: "detail_is_silenced",
    next_follow_up_at: "detail_next_follow_up_at", previous_snoozed_until: "detail_previous_snoozed_until", snoozed_until: "detail_snoozed_until",
    previous_owner_profile_id: "detail_previous_owner_profile_id", new_owner_profile_id: "detail_new_owner_profile_id", membership_id: "detail_membership_id",
  } as const;
  const output: Record<string, JsonValue> = {};
  for (const [source, target] of Object.entries(mapping)) {
    output[target] = source === "is_silenced" ? optionalBoolean(value[source], `details.${source}`) : optionalString(value[source], `details.${source}`);
  }
  output.details_unknown_key_count = Object.keys(value).filter((key) => !Object.hasOwn(mapping, key)).length;
  return output;
}

function auditDetailsProjection(value: unknown): Readonly<Record<string, JsonValue>> {
  const stringFields = ["next_semester_id", "previous_semester_id", "status", "source_semester_id", "role", "mentor_semester_id", "reason", "target_profile_id", "membership_status"] as const;
  const numberFields = ["alumni_count", "imported_count"] as const;
  const booleanFields = ["bulk", "profile_is_active"] as const;
  const arrayFields = ["override_types", "suspended_membership_ids", "affected_membership_ids"] as const;
  const known = new Set<string>([...stringFields, ...numberFields, ...booleanFields, ...arrayFields, "prior_statuses"]);
  const output: Record<string, JsonValue> = {};
  for (const field of stringFields) output[`detail_${field}`] = null;
  for (const field of numberFields) output[`detail_${field}`] = null;
  for (const field of booleanFields) output[`detail_${field}`] = null;
  for (const field of arrayFields) output[`detail_${field}`] = [];
  output.detail_prior_statuses = [];
  if (value === null || value === undefined) return { ...output, details_unknown_key_count: 0 };
  if (!isRecord(value)) throw new SemesterExportStoreError("program_audit_events.details must be an object.");
  let unknownKeyCount = Object.keys(value).filter((key) => !known.has(key)).length;
  for (const field of stringFields) output[`detail_${field}`] = optionalString(value[field], `program audit details.${field}`);
  for (const field of numberFields) output[`detail_${field}`] = optionalNumber(value[field], `program audit details.${field}`);
  for (const field of booleanFields) output[`detail_${field}`] = optionalBoolean(value[field], `program audit details.${field}`);
  for (const field of arrayFields) output[`detail_${field}`] = value[field] === undefined ? [] : stringArray(value[field], `program audit details.${field}`);
  if (value.prior_statuses !== undefined) {
    if (!Array.isArray(value.prior_statuses)) throw new SemesterExportStoreError("program audit details.prior_statuses must be an array.");
    output.detail_prior_statuses = value.prior_statuses.map((entry, index): JsonValue => {
      if (!isRecord(entry)) throw new SemesterExportStoreError(`program audit details.prior_statuses[${index}] must be an object.`);
      unknownKeyCount += Object.keys(entry).filter((key) => key !== "membership_id" && key !== "status").length;
      return { membership_id: optionalString(entry.membership_id, `prior_statuses[${index}].membership_id`), status: optionalString(entry.status, `prior_statuses[${index}].status`) };
    });
  }
  output.details_unknown_key_count = unknownKeyCount;
  return output;
}

const IMPORT_RESULT_FIELDS = {
  totalRows: "total_rows", matchedRows: "matched_rows", createRows: "create_rows", reviewRequiredRows: "review_required_rows",
  invalidRows: "invalid_rows", rowsWithIssues: "rows_with_issues", committedRows: "committed_rows", error: "result_error",
} as const;

function importResultProjection(value: unknown): Readonly<Record<string, JsonValue>> {
  if (value === null || value === undefined) value = {};
  if (!isRecord(value)) throw new SemesterExportStoreError("outreach_imports.result must be an object.");
  const output: Record<string, JsonValue> = {};
  for (const [source, target] of Object.entries(IMPORT_RESULT_FIELDS)) {
    output[target] = source === "error" ? optionalString(value[source], `outreach_imports.result.${source}`) : optionalNumber(value[source], `outreach_imports.result.${source}`);
  }
  output.result_unknown_key_count = Object.keys(value).filter((key) => !Object.hasOwn(IMPORT_RESULT_FIELDS, key)).length;
  return output;
}

function importRowsProjection(row: Readonly<Record<string, unknown>>): Readonly<Record<string, JsonValue>>[] {
  const importId = requiredString(row, "id");
  const value = row.rows;
  if (!Array.isArray(value)) throw new SemesterExportStoreError("outreach_imports.rows must be an array.");
  return value.map((stored, index) => {
    if (!isRecord(stored) || !isRecord(stored.normalized) || !isRecord(stored.decision)) throw new SemesterExportStoreError(`outreach_imports.rows[${index}] is malformed.`);
    const normalized = stored.normalized;
    const decision = stored.decision;
    const knownStored = new Set(["raw", "normalized", "decision"]);
    const knownNormalized = new Set(["rowNumber", "fullName", "email", "linkedinUrl", "company", "companyDomain", "stage", "relationshipLabels", "ownerName", "ownerId", "issues"]);
    const knownDecision = new Set(["disposition", "contactId", "suggestedContactId", "matchSource", "ownerId", "issues"]);
    const unknownKeyCount = Object.keys(stored).filter((key) => !knownStored.has(key)).length
      + Object.keys(normalized).filter((key) => !knownNormalized.has(key)).length
      + Object.keys(decision).filter((key) => !knownDecision.has(key)).length;
    const rowNumber = optionalNumber(normalized.rowNumber, `outreach_imports.rows[${index}].normalized.rowNumber`);
    if (rowNumber === null || !Number.isInteger(rowNumber) || rowNumber < 1) throw new SemesterExportStoreError(`outreach_imports.rows[${index}].normalized.rowNumber is invalid.`);
    return {
      import_id: importId,
      row_number: rowNumber,
      full_name: optionalString(normalized.fullName, `import row ${index}.fullName`),
      email: optionalString(normalized.email, `import row ${index}.email`),
      linkedin_url: optionalString(normalized.linkedinUrl, `import row ${index}.linkedinUrl`),
      company: optionalString(normalized.company, `import row ${index}.company`),
      company_domain: optionalString(normalized.companyDomain, `import row ${index}.companyDomain`),
      stage: optionalString(normalized.stage, `import row ${index}.stage`),
      relationship_labels: stringArray(normalized.relationshipLabels, `import row ${index}.relationshipLabels`),
      owner_name: optionalString(normalized.ownerName, `import row ${index}.ownerName`),
      owner_id: optionalString(normalized.ownerId, `import row ${index}.ownerId`),
      issues: stringArray(decision.issues, `import row ${index}.decision.issues`),
      preview_disposition: optionalString(decision.disposition, `import row ${index}.decision.disposition`),
      preview_contact_id: optionalString(decision.contactId, `import row ${index}.decision.contactId`),
      suggested_contact_id: optionalString(decision.suggestedContactId, `import row ${index}.decision.suggestedContactId`),
      match_source: optionalString(decision.matchSource, `import row ${index}.decision.matchSource`),
      structured_unknown_key_count: unknownKeyCount,
    };
  });
}

const INTERNAL_MESSAGE_COLUMNS = ["id", "semester_id", "opportunity_id", "contact_id", "template_id", "recipient_email", "recipient_name", "sender", "subject", "body", "scheduled_at", "client_idempotency_key", "request_digest", "created_at", "idempotency_expires_at", "snapshot_digest", "snapshot_key_id", "snapshot_signature"] as const;
const INTERNAL_RECEIPT_COLUMNS = ["id", "semester_id", "message_id", "provider_id", "provider_status", "message_status", "checked_at", "sent_at", "delivered_at", "last_error", "snapshot_digest", "receipt_digest", "receipt_key_id", "receipt_signature", "sequence"] as const;

function signedReceipt(row: Readonly<Record<string, unknown>>): SignedOutreachEmailReceipt {
  return {
    receipt: {
      checkedAt: requiredString(row, "checked_at"),
      deliveredAt: nullableString(row, "delivered_at"),
      lastError: nullableString(row, "last_error"),
      messageId: requiredString(row, "message_id"),
      messageStatus: requiredString(row, "message_status"),
      providerId: nullableString(row, "provider_id"),
      providerStatus: requiredString(row, "provider_status"),
      semesterId: requiredString(row, "semester_id"),
      sentAt: nullableString(row, "sent_at"),
      snapshotDigest: requiredString(row, "snapshot_digest"),
      version: 1,
    },
    signature: { digest: requiredString(row, "receipt_digest"), keyId: requiredString(row, "receipt_key_id"), signature: requiredString(row, "receipt_signature") },
  };
}

function emailRecord(row: Readonly<Record<string, unknown>>, receiptRows: readonly Readonly<Record<string, unknown>>[]): OutreachEmailRecord {
  const messageId = requiredString(row, "id");
  return {
    clientIdempotencyKey: requiredString(row, "client_idempotency_key"),
    receipts: receiptRows.filter((candidate) => candidate.message_id === messageId).sort((a, b) => Number(a.sequence) - Number(b.sequence)).map(signedReceipt),
    requestDigest: requiredString(row, "request_digest"),
    snapshot: {
      body: requiredString(row, "body"),
      contactId: requiredString(row, "contact_id"),
      createdAt: requiredString(row, "created_at"),
      idempotencyExpiresAt: requiredString(row, "idempotency_expires_at"),
      idempotencyKey: requiredString(row, "client_idempotency_key"),
      messageId,
      opportunityId: requiredString(row, "opportunity_id"),
      recipientEmail: requiredString(row, "recipient_email"),
      recipientName: requiredString(row, "recipient_name"),
      scheduledAt: nullableString(row, "scheduled_at"),
      semesterId: requiredString(row, "semester_id"),
      sender: requiredString(row, "sender"),
      subject: requiredString(row, "subject"),
      version: 1,
    },
    snapshotSignature: { digest: requiredString(row, "snapshot_digest"), keyId: requiredString(row, "snapshot_key_id"), signature: requiredString(row, "snapshot_signature") },
    templateId: nullableString(row, "template_id"),
  };
}

export function createSemesterExportStore(
  source: SemesterExportDataSource,
  signer: OutreachEmailSigner | null,
  now: () => Date = () => new Date(),
): SemesterExportStore {
  return {
    async load(semesterId, scope) {
      let rowCount = 0;
      let sourceBytes = 0;
      const track = (rows: readonly Readonly<Record<string, unknown>>[]): readonly Readonly<Record<string, unknown>>[] => {
        rowCount += rows.length;
        sourceBytes += Buffer.byteLength(JSON.stringify(rows), "utf8");
        if (rowCount > MAX_EXPORT_ROWS || sourceBytes > MAX_EXPORT_SOURCE_BYTES) throw new SemesterExportStoreError("Export exceeds the supported size limit.", 413);
        return rows;
      };
      const fetchPages = async (table: InternalTableName, columns: readonly string[], filters: readonly ExportFilter[], orderBy: readonly string[]): Promise<readonly Readonly<Record<string, unknown>>[]> => {
        const rows: Readonly<Record<string, unknown>>[] = [];
        const keyset = orderBy.length === 1;
        let after: string | null = null;
        let offset = 0;
        while (true) {
          const page = track(await source.fetchPage({ after: keyset ? after : null, columns, filters, limit: PAGE_SIZE, offset: keyset ? 0 : offset, orderBy, table }));
          if (page.length > PAGE_SIZE) throw new SemesterExportStoreError(`Pagination returned too many rows for ${table}.`);
          rows.push(...page);
          if (page.length < PAGE_SIZE) break;
          if (keyset) {
            const next = requiredString(page.at(-1)!, orderBy[0]!);
            if (next === after) throw new SemesterExportStoreError(`Pagination did not advance for ${table}.`);
            after = next;
          } else offset += PAGE_SIZE;
        }
        const seen = new Set<string>();
        const compare = compareRows(orderBy);
        for (const row of rows) {
          const key = orderBy.map((column) => requiredString(row, column)).join("\u0000");
          if (seen.has(key)) throw new SemesterExportStoreError(`Pagination returned a duplicate key for ${table}.`);
          seen.add(key);
        }
        for (let index = 1; index < rows.length; index += 1) {
          if (compare(rows[index - 1]!, rows[index]!) >= 0) throw new SemesterExportStoreError(`Pagination returned unstable ordering for ${table}.`);
        }
        return rows;
      };
      const fetchDefinition = async (definition: ExportDatasetDefinition, filters: readonly ExportFilter[]): Promise<readonly Readonly<Record<string, unknown>>[]> =>
        await fetchPages(definition.table, definition.sourceColumns ?? definition.columns, filters, definition.orderBy);
      const fetchReferenced = async (definition: ExportDatasetDefinition, column: string, references: readonly string[], requireEveryReference = true): Promise<readonly Readonly<Record<string, unknown>>[]> => {
        if (references.length === 0) return [];
        const results: Readonly<Record<string, unknown>>[] = [];
        const expected = uniqueStrings(references);
        for (const group of chunks(expected, IN_FILTER_CHUNK_SIZE)) results.push(...await fetchDefinition(definition, [{ column, kind: "in", values: group }]));
        if (requireEveryReference) {
          const returned = new Set(ids(results, column));
          const missing = expected.filter((reference) => !returned.has(reference));
          if (missing.length > 0) throw new SemesterExportStoreError(`Export could not resolve ${missing.length} referenced ${definition.id} record(s).`);
        }
        return results.sort(compareRows(definition.orderBy));
      };

      const definitions = definitionsForScope(scope);
      const byId = new Map(definitions.map((definition) => [definition.id, definition]));
      const raw = new Map<string, readonly Readonly<Record<string, unknown>>[]>();
      const directGlobal = new Set(["semester", "profiles", "mentor_profiles", "mentor_expertise_tags", "expertise_tags", "expertise_tag_aliases", "startup_organizations", "outreach_contacts", "outreach_contact_companies", "outreach_companies"]);
      await Promise.all(definitions.filter((definition) => !directGlobal.has(definition.id)).map(async (definition) => {
        raw.set(definition.id, await fetchDefinition(definition, [{ column: "semester_id", kind: "eq", value: semesterId }]));
      }));

      const projectedImportRows = (raw.get("outreach_imports") ?? []).flatMap(importRowsProjection);
      const requiredContactReferences = ids(raw.get("outreach_opportunities") ?? [], "contact_id");
      const contactReferences = uniqueStrings([
        ...requiredContactReferences,
        ...valuesFrom(projectedImportRows, ["preview_contact_id", "suggested_contact_id"]),
      ]);
      const contactRows = await fetchReferenced(byId.get("outreach_contacts")!, "id", contactReferences, false);
      const returnedContacts = new Set(ids(contactRows, "id"));
      const missingRequiredContacts = requiredContactReferences.filter((reference) => !returnedContacts.has(reference));
      if (missingRequiredContacts.length > 0) throw new SemesterExportStoreError(`Export could not resolve ${missingRequiredContacts.length} required Outreach contact record(s).`);
      raw.set("outreach_contacts", contactRows);
      raw.set("outreach_contact_companies", await fetchReferenced(byId.get("outreach_contact_companies")!, "contact_id", contactReferences, false));
      const companyReferences = ids(raw.get("outreach_contact_companies") ?? [], "company_id");
      raw.set("outreach_companies", await fetchReferenced(byId.get("outreach_companies")!, "id", companyReferences));

      const detailProfileReferences = uniqueStrings((raw.get("outreach_activities") ?? []).flatMap((row) => {
        const projected = activityDetailsProjection(row.details);
        return [projected.detail_previous_owner_profile_id, projected.detail_new_owner_profile_id].map((value) => typeof value === "string" ? value : null);
      }));
      let unresolvedProfileReferences: string[] = [];

      if (scope === "semester") {
        const semesterDefinition = byId.get("semester")!;
        raw.set("semester", await fetchDefinition(semesterDefinition, [{ column: "id", kind: "eq", value: semesterId }]));
        if (raw.get("semester")!.length !== 1) throw new SemesterExportStoreError("Semester not found.", 404);
        const membershipRows = raw.get("semester_memberships") ?? [];
        const mentorProfileReferences = ids(membershipRows.filter((row) => row.role === "mentor"), "profile_id");
        raw.set("mentor_profiles", await fetchReferenced(byId.get("mentor_profiles")!, "profile_id", mentorProfileReferences, false));
        raw.set("mentor_expertise_tags", await fetchReferenced(byId.get("mentor_expertise_tags")!, "mentor_profile_id", mentorProfileReferences, false));
        const tagReferences = uniqueStrings([
          ...ids(raw.get("mentor_expertise_tags") ?? [], "expertise_tag_id"),
          ...ids(raw.get("startup_mentor_need_tags") ?? [], "expertise_tag_id"),
        ]);
        raw.set("expertise_tags", await fetchReferenced(byId.get("expertise_tags")!, "id", tagReferences));
        raw.set("expertise_tag_aliases", await fetchReferenced(byId.get("expertise_tag_aliases")!, "expertise_tag_id", tagReferences, false));
        const requiredProfileReferences = uniqueStrings([
          ...ids(membershipRows, "profile_id"),
          ...ids(raw.get("invitations") ?? [], "matched_profile_id"),
        ]);
        const profileReferences = uniqueStrings([
          ...requiredProfileReferences,
          ...valuesFrom(raw.get("friday_programs") ?? [], ["generated_by_profile_id"]),
          ...valuesFrom(raw.get("mentor_booking_windows") ?? [], ["mentor_profile_id"]),
          ...valuesFrom(raw.get("mentor_booking_requests") ?? [], ["mentor_profile_id", "requested_by_profile_id"]),
          ...valuesFrom(raw.get("outreach_opportunities") ?? [], ["owner_profile_id", "silenced_by", "archived_by", "created_by"]),
          ...valuesFrom(raw.get("outreach_contacts") ?? [], ["archived_by", "created_by"]),
          ...valuesFrom(raw.get("outreach_companies") ?? [], ["created_by"]),
          ...valuesFrom(raw.get("outreach_activities") ?? [], ["actor_profile_id", "previous_owner_profile_id", "new_owner_profile_id"]),
          ...detailProfileReferences,
          ...valuesFrom(raw.get("outreach_imports") ?? [], ["created_by"]),
          ...valuesFrom(raw.get("outreach_email_templates") ?? [], ["created_by"]),
          ...valuesFrom(raw.get("expertise_tags") ?? [], ["created_by_profile_id"]),
          ...valuesFrom(raw.get("invitations") ?? [], ["invited_by"]),
          ...valuesFrom(raw.get("program_audit_events") ?? [], ["actor_profile_id"]),
          ...valuesFrom(projectedImportRows, ["owner_id"]),
        ]);
        const profileRows = await fetchReferenced(byId.get("profiles")!, "id", profileReferences, false);
        const returnedProfiles = new Set(ids(profileRows, "id"));
        const missingRequiredProfiles = requiredProfileReferences.filter((reference) => !returnedProfiles.has(reference));
        if (missingRequiredProfiles.length > 0) throw new SemesterExportStoreError(`Export could not resolve ${missingRequiredProfiles.length} required cohort profile record(s).`);
        unresolvedProfileReferences = profileReferences.filter((reference) => !returnedProfiles.has(reference));
        raw.set("profiles", profileRows);
        const organizationReferences = uniqueStrings([
          ...ids(raw.get("startup_semesters") ?? [], "startup_organization_id"),
          ...ids(raw.get("friday_program_assignments") ?? [], "startup_organization_id"),
          ...ids(raw.get("mentor_booking_requests") ?? [], "startup_organization_id"),
        ]);
        raw.set("startup_organizations", await fetchReferenced(byId.get("startup_organizations")!, "id", organizationReferences));
      }

      if (scope === "outreach") {
        const profileReferences = uniqueStrings([
          ...valuesFrom(raw.get("outreach_opportunities") ?? [], ["owner_profile_id", "silenced_by", "archived_by", "created_by"]),
          ...valuesFrom(raw.get("outreach_contacts") ?? [], ["archived_by", "created_by"]),
          ...valuesFrom(raw.get("outreach_companies") ?? [], ["created_by"]),
          ...valuesFrom(raw.get("outreach_activities") ?? [], ["actor_profile_id", "previous_owner_profile_id", "new_owner_profile_id"]),
          ...detailProfileReferences,
          ...valuesFrom(raw.get("outreach_imports") ?? [], ["created_by"]),
          ...valuesFrom(raw.get("outreach_email_templates") ?? [], ["created_by"]),
          ...valuesFrom(projectedImportRows, ["owner_id"]),
        ]);
        const profileRows = await fetchReferenced(byId.get("profiles")!, "id", profileReferences, false);
        const returnedProfiles = new Set(ids(profileRows, "id"));
        unresolvedProfileReferences = profileReferences.filter((reference) => !returnedProfiles.has(reference));
        raw.set("profiles", profileRows);
      }

      const messageRows = await fetchPages("outreach_email_messages", INTERNAL_MESSAGE_COLUMNS, [{ column: "semester_id", kind: "eq", value: semesterId }], ["id"]);
      const receiptRows = await fetchPages("outreach_email_receipts", INTERNAL_RECEIPT_COLUMNS, [{ column: "semester_id", kind: "eq", value: semesterId }], ["id"]);
      const receiptsByMessage = new Map<string, Readonly<Record<string, unknown>>[]>();
      for (const receiptRow of receiptRows) {
        const messageId = requiredString(receiptRow, "message_id");
        const group = receiptsByMessage.get(messageId) ?? [];
        group.push(receiptRow);
        receiptsByMessage.set(messageId, group);
      }
      for (const group of receiptsByMessage.values()) group.sort((left, right) => Number(left.sequence) - Number(right.sequence));
      const messages = projectVerifiedOutreachEmailHistory(messageRows.map((row) => emailRecord(row, receiptsByMessage.get(requiredString(row, "id")) ?? [])), signer, now());
      const emailHistory: SemesterExportDataset = {
        id: "outreach_email_history",
        columns: emailHistoryColumns,
        rows: messages.map((message) => ({
          message_id: message.messageId, opportunity_id: message.opportunityId, template_id: message.templateId, status: message.status,
          recipient_name: message.recipientName, recipient_email: message.recipientEmail, sender: message.sender, subject: message.subject, body: message.body,
          scheduled_at: message.scheduledAt, created_at: message.createdAt, accepted_at: message.acceptedAt, sent_at: message.sentAt,
          delivered_at: message.deliveredAt, cancelled_at: message.cancelledAt, provider_status: message.providerStatus,
          provider_checked_at: message.providerCheckedAt, last_error: message.lastError, activity_id: message.activityId,
        })),
      };

      const datasets = definitions.map((definition): SemesterExportDataset => {
        const rows = raw.get(definition.id) ?? [];
        return {
          id: definition.id,
          columns: definition.columns,
          rows: rows.map((row) => {
            let projected: Readonly<Record<string, unknown>> = row;
            if (definition.id === "semester") projected = { ...row, ...safeConfiguration(row.configuration) };
            else if (definition.id === "semester_memberships") projected = { ...row, ...onboardingProjection(row.onboarding_data) };
            else if (definition.id === "startup_organizations") projected = { ...row, ...durableContactProjection(row.durable_contact_data) };
            else if (definition.id === "outreach_opportunities") projected = { ...row, ...sourceContextProjection(row.source_context) };
            else if (definition.id === "outreach_activities") projected = { ...row, ...activityDetailsProjection(row.details) };
            else if (definition.id === "outreach_imports") projected = { ...row, ...importResultProjection(row.result) };
            else if (definition.id === "program_audit_events") projected = { ...row, ...auditDetailsProjection(row.details) };
            return allowlistedRow(projected, definition.columns);
          }),
        };
      });
      const importIndex = datasets.findIndex(({ id }) => id === "outreach_imports");
      datasets.splice(importIndex + 1, 0, { id: "outreach_import_rows", columns: outreachImportRowColumns, rows: projectedImportRows });
      const profilesIndex = datasets.findIndex(({ id }) => id === "profiles");
      datasets.splice(profilesIndex + 1, 0, {
        id: "unresolved_profile_references",
        columns: unresolvedProfileReferenceColumns,
        rows: unresolvedProfileReferences.map((profileId) => ({ profile_id: profileId })),
      });
      datasets.push(emailHistory);
      const semesterRows = scope === "semester" ? raw.get("semester") ?? [] : await fetchPages("semesters", ["id", "name"], [{ column: "id", kind: "eq", value: semesterId }], ["id"]);
      if (semesterRows.length !== 1) throw new SemesterExportStoreError("Semester not found.", 404);
      return { datasets, semesterId, semesterName: requiredString(semesterRows[0]!, "name") };
    },
  };
}
