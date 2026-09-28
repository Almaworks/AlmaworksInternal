import assert from "node:assert/strict";
import test from "node:test";

import { definitionsForScope, emailHistoryColumns, exportExclusions, outreachImportRowColumns, semesterExportCatalog } from "../../src/semester-export/catalog.ts";
import { createSemesterExportStore, type ExportPageRequest, type SemesterExportDataSource } from "../../src/semester-export/store.ts";
import { createOutreachEmailSigner, type OutreachEmailProviderReceipt, type OutreachEmailSnapshot } from "../../src/outreach-email/signing.ts";

const semesterId = "11111111-1111-4111-8111-111111111111";

test("semester exports omit the retired Friday availability relation", () => {
  assert.equal(definitionsForScope("semester").some(definition => definition.id === "meeting_availability"), false);
});

function rowFor(datasetId: string, id: string, overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  const definition = semesterExportCatalog.find((candidate) => candidate.id === datasetId);
  assert.ok(definition);
  const row: Record<string, unknown> = Object.fromEntries((definition.sourceColumns ?? definition.columns).map((column) => [column, null]));
  for (const column of definition.orderBy) row[column] = id;
  return { ...row, ...overrides };
}

function memorySource(tables: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>, calls: ExportPageRequest[] = []): SemesterExportDataSource {
  return {
    async fetchPage(request) {
      calls.push(request);
      let rows = [...(tables[request.table] ?? [])];
      for (const filter of request.filters) {
        rows = filter.kind === "eq"
          ? rows.filter((row) => row[filter.column] === filter.value)
          : rows.filter((row) => typeof row[filter.column] === "string" && filter.values.includes(row[filter.column] as string));
      }
      rows.sort((left, right) => {
        for (const column of request.orderBy) {
          const comparison = String(left[column] ?? "").localeCompare(String(right[column] ?? ""), "en");
          if (comparison !== 0) return comparison;
        }
        return 0;
      });
      if (request.after !== null) rows = rows.filter((row) => String(row[request.orderBy[0]!] ?? "") > request.after!);
      return rows.slice(request.offset, request.offset + request.limit);
    },
  };
}

function outreachTables(activityCount = 0): Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>> {
  return {
    semesters: [rowFor("semester", semesterId, { id: semesterId, name: "Fall 2026", configuration: { timezone: "America/New_York" } })],
    outreach_opportunities: [rowFor("outreach_opportunities", "opportunity-1", { id: "opportunity-1", semester_id: semesterId, contact_id: "contact-1", owner_profile_id: null })],
    outreach_contacts: [rowFor("outreach_contacts", "contact-1", { id: "contact-1" })],
    outreach_contact_companies: [],
    outreach_companies: [],
    outreach_activities: Array.from({ length: activityCount }, (_, index) => rowFor("outreach_activities", `activity-${String(index).padStart(5, "0")}`, { id: `activity-${String(index).padStart(5, "0")}`, semester_id: semesterId, actor_profile_id: null, previous_owner_profile_id: null, new_owner_profile_id: null })),
    outreach_imports: [],
    outreach_email_templates: [],
    outreach_email_messages: [],
    outreach_email_receipts: [],
  };
}

test("catalog uses fixed unique safe dataset identifiers and deterministic ordering", () => {
  const ids = semesterExportCatalog.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^[a-z0-9][a-z0-9_-]*$/u.test(id)));
  assert.ok(semesterExportCatalog.every(({ columns, orderBy }) => columns.length > 0 && orderBy.length > 0));
  assert.ok(semesterExportCatalog.every(({ columns, sourceColumns = columns, orderBy }) => orderBy.every((column) => sourceColumns.includes(column))));
  assert.deepEqual(
    semesterExportCatalog.filter(({ orderBy }) => orderBy.length > 1).map(({ id, orderBy }) => [id, orderBy]),
    [
      ["mentor_expertise_tags", ["mentor_profile_id", "expertise_tag_id"]],
      ["startup_mentor_need_tags", ["startup_semester_id", "expertise_tag_id"]],
    ],
    "only declared composite primary keys may use offset pagination",
  );
});

test("catalog excludes protected and raw payload columns", () => {
  const columns = [...semesterExportCatalog.flatMap(({ columns }) => columns), ...emailHistoryColumns, ...outreachImportRowColumns];
  for (const forbidden of [
    "auth_user_id", "idempotency_key", "client_idempotency_key", "request_digest", "snapshot_digest",
    "snapshot_key_id", "snapshot_signature", "receipt_digest", "receipt_key_id", "receipt_signature",
    "provider_id", "external_message_id", "last_error_message", "rows", "result", "source_context", "details", "onboarding_data", "durable_contact_data",
  ]) assert.equal(columns.includes(forbidden), false, `${forbidden} must not be exported`);
  assert.equal(semesterExportCatalog.some(({ table }) => table === ("outreach_email_receipts" as never)), false);
  assert.deepEqual(
    [...new Set(semesterExportCatalog.flatMap(({ sourceColumns = [], columns: output }) => sourceColumns.filter((column) => !output.includes(column))))].sort(),
    ["configuration", "details", "durable_contact_data", "onboarding_data", "result", "rows", "source_context"],
    "only known raw JSON containers may be read for safe projection",
  );
});

test("outreach scope contains only outreach datasets and shared verified history is added separately", () => {
  assert.deepEqual(definitionsForScope("outreach").map(({ id }) => id), [
    "profiles",
    "outreach_opportunities", "outreach_contacts", "outreach_contact_companies", "outreach_companies",
    "outreach_activities", "outreach_imports", "outreach_email_templates",
  ]);
  assert.ok(definitionsForScope("semester").length > definitionsForScope("outreach").length);
  assert.ok(emailHistoryColumns.includes("provider_status"));
  assert.equal(emailHistoryColumns.includes("provider_id" as never), false);
});

test("manifest exclusions disclose unimplemented modules, asset limits and raw private records", () => {
  const disclosure = exportExclusions.join(" ").toLowerCase();
  for (const phrase of ["q&a", "note", "newsletter", "binary photo", "authentication", "invite", "known onboarding", "signatures", "provider receipts", "4 mib"]) {
    assert.match(disclosure, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});

test("store fully keyset-paginates datasets beyond the Data API default limit", async () => {
  const calls: ExportPageRequest[] = [];
  const loaded = await createSemesterExportStore(memorySource(outreachTables(1_005), calls), null).load(semesterId, "outreach");
  assert.equal(loaded.datasets.find(({ id }) => id === "outreach_activities")?.rows.length, 1_005);
  const activityCalls = calls.filter(({ table }) => table === "outreach_activities");
  assert.equal(activityCalls.length, 3);
  assert.deepEqual(activityCalls.map(({ after }) => after), [null, "activity-00499", "activity-00999"]);
});

test("global rows are loaded only through semester-derived reference IDs", async () => {
  const calls: ExportPageRequest[] = [];
  const tables = {
    ...outreachTables(),
    outreach_contact_companies: [rowFor("outreach_contact_companies", "link-1", { id: "link-1", contact_id: "contact-1", company_id: "company-1" })],
    outreach_companies: [rowFor("outreach_companies", "company-1", { id: "company-1" })],
  };
  const loaded = await createSemesterExportStore(memorySource(tables, calls), null).load(semesterId, "outreach");
  assert.equal(loaded.datasets.find(({ id }) => id === "outreach_contacts")?.rows.length, 1);
  assert.equal(loaded.datasets.find(({ id }) => id === "outreach_companies")?.rows.length, 1);
  assert.deepEqual(calls.find(({ table }) => table === "outreach_contacts")?.filters, [{ column: "id", kind: "in", values: ["contact-1"] }]);
  assert.deepEqual(calls.find(({ table }) => table === "outreach_companies")?.filters, [{ column: "id", kind: "in", values: ["company-1"] }]);
  assert.equal(calls.some(({ table, filters }) => ["outreach_contacts", "outreach_companies", "profiles"].includes(table) && filters.length === 0), false);
});

test("optional RLS-hidden actor profiles are disclosed while cohort profiles remain required", async () => {
  const outreach = {
    ...outreachTables(1),
    outreach_activities: [rowFor("outreach_activities", "activity-1", { id: "activity-1", semester_id: semesterId, actor_profile_id: "hidden-actor", previous_owner_profile_id: null, new_owner_profile_id: null })],
    profiles: [],
  };
  const loaded = await createSemesterExportStore(memorySource(outreach), null).load(semesterId, "outreach");
  assert.deepEqual(loaded.datasets.find(({ id }) => id === "unresolved_profile_references")?.rows, [{ profile_id: "hidden-actor" }]);

  const complete = {
    ...outreachTables(),
    semester_memberships: [rowFor("semester_memberships", "membership-1", { id: "membership-1", semester_id: semesterId, profile_id: "missing-member-profile", role: "admin", onboarding_data: [] })],
    profiles: [],
  };
  await assert.rejects(() => createSemesterExportStore(memorySource(complete), null).load(semesterId, "semester"), /required cohort profile/u);
});

test("missing allowlisted columns and page failures abort the whole store load", async () => {
  const missing = { ...outreachTables(1), outreach_activities: [{ ...outreachTables(1).outreach_activities![0] }] };
  delete (missing.outreach_activities[0] as Record<string, unknown>).summary;
  await assert.rejects(() => createSemesterExportStore(memorySource(missing), null).load(semesterId, "outreach"), /missing allowlisted column summary/u);

  const base = memorySource(outreachTables(1_005));
  const failing: SemesterExportDataSource = {
    fetchPage: async (request) => {
      if (request.table === "outreach_activities" && request.after !== null) throw new Error("page failed");
      return await base.fetchPage(request);
    },
  };
  await assert.rejects(() => createSemesterExportStore(failing, null).load(semesterId, "outreach"), /page failed/u);
});

test("export projections never include protected source columns", async () => {
  const loaded = await createSemesterExportStore(memorySource(outreachTables()), null).load(semesterId, "outreach");
  const serialized = JSON.stringify(loaded.datasets);
  for (const secret of ["auth_user_id", "snapshot_signature", "receipt_signature", "provider_id", "idempotency_key", "external_message_id"]) {
    assert.doesNotMatch(serialized, new RegExp(secret, "u"));
  }
});

test("email history is application-verified and raw provider/signature fields never enter datasets", async () => {
  const signer = createOutreachEmailSigner({ currentKeyId: "v1", keys: { v1: "a secure export test signing key with more than thirty two bytes" } });
  const snapshot: OutreachEmailSnapshot = {
    body: "Hello", contactId: "contact-1", createdAt: "2026-09-09T01:00:00.000Z", idempotencyExpiresAt: "2026-09-10T01:00:00.000Z",
    idempotencyKey: "private-key", messageId: "message-1", opportunityId: "opportunity-1", recipientEmail: "mentor@example.test",
    recipientName: "Mentor", scheduledAt: null, semesterId, sender: "team@example.test", subject: "Invitation", version: 1,
  };
  const snapshotSignature = signer.signSnapshot(snapshot);
  const receipt: OutreachEmailProviderReceipt = {
    checkedAt: "2026-09-09T01:05:00.000Z", deliveredAt: "2026-09-09T01:05:00.000Z", lastError: null, messageId: snapshot.messageId,
    messageStatus: "delivered", providerId: "provider-secret-id", providerStatus: "delivered", semesterId, sentAt: "2026-09-09T01:03:00.000Z",
    snapshotDigest: snapshotSignature.digest, version: 1,
  };
  const receiptSignature = signer.signReceipt(receipt);
  const tables = {
    ...outreachTables(),
    outreach_email_messages: [{
      id: snapshot.messageId, semester_id: semesterId, opportunity_id: snapshot.opportunityId, contact_id: snapshot.contactId, template_id: null,
      recipient_email: snapshot.recipientEmail, recipient_name: snapshot.recipientName, sender: snapshot.sender, subject: snapshot.subject, body: snapshot.body,
      scheduled_at: null, client_idempotency_key: snapshot.idempotencyKey, request_digest: "request-digest", created_at: snapshot.createdAt,
      idempotency_expires_at: snapshot.idempotencyExpiresAt, snapshot_digest: snapshotSignature.digest, snapshot_key_id: snapshotSignature.keyId,
      snapshot_signature: snapshotSignature.signature,
    }],
    outreach_email_receipts: [{
      id: "receipt-1", semester_id: semesterId, message_id: snapshot.messageId, provider_id: receipt.providerId, provider_status: receipt.providerStatus,
      message_status: receipt.messageStatus, checked_at: receipt.checkedAt, sent_at: receipt.sentAt, delivered_at: receipt.deliveredAt,
      last_error: null, snapshot_digest: snapshotSignature.digest, receipt_digest: receiptSignature.digest, receipt_key_id: receiptSignature.keyId,
      receipt_signature: receiptSignature.signature, sequence: 1,
    }],
  };
  const loaded = await createSemesterExportStore(memorySource(tables), signer, () => new Date("2026-09-09T02:00:00Z")).load(semesterId, "outreach");
  const history = loaded.datasets.find(({ id }) => id === "outreach_email_history");
  assert.equal(history?.rows.length, 1);
  assert.equal(history?.rows[0]?.provider_status, "delivered");
  assert.equal(Object.hasOwn(history?.rows[0] ?? {}, "provider_id"), false);
  assert.doesNotMatch(JSON.stringify(history), /signature|private-key|provider-secret-id/u);

  const tampered = { ...tables, outreach_email_messages: [{ ...tables.outreach_email_messages[0], snapshot_signature: "00" }] };
  await assert.rejects(() => createSemesterExportStore(memorySource(tampered), signer).load(semesterId, "outreach"), /cannot be verified/u);
});

test("known business JSON is projected narrowly and unknown keys are counted without disclosure", async () => {
  const base = outreachTables(1);
  const tables = {
    ...base,
    semesters: [rowFor("semester", semesterId, {
      id: semesterId, name: "Fall 2026", configuration_template_version: 3,
      configuration: { timezone: "America/New_York", location: "New York", sessionCadence: "weekly", defaultFormat: "in-person", privateSetting: "omit-me" },
    })],
    semester_memberships: [rowFor("semester_memberships", "membership-1", {
      id: "membership-1", semester_id: semesterId, profile_id: "profile-1", role: "admin",
      onboarding_data: [
        { item_key: "identity", is_required: true, completed_at: "2026-09-01T00:00:00Z", futureMetadata: "omit-me", payload: { name: "Admin", email: "admin@example.test", role: "admin", secretAnswer: "omit-me" } },
        { item_key: "mentoring_hours_setup", is_required: false, completed_at: null, payload: { choice: "add-later" } },
        { item_key: "future_private_step", is_required: false, completed_at: null, payload: { privateValue: "omit-me" } },
      ],
    })],
    profiles: [rowFor("profiles", "profile-1", { id: "profile-1" })],
    startup_semesters: [rowFor("startup_semesters", "startup-term-1", { id: "startup-term-1", semester_id: semesterId, startup_organization_id: "startup-org-1" })],
    startup_organizations: [rowFor("startup_organizations", "startup-org-1", {
      id: "startup-org-1", durable_contact_data: { founder_name: "Legacy Founder", founders: [{ name: "Founder", email: "founder@example.test", privateNote: "omit-me" }], secret: "omit-me" },
    })],
    outreach_opportunities: [rowFor("outreach_opportunities", "opportunity-1", {
      id: "opportunity-1", semester_id: semesterId, contact_id: "contact-1", owner_profile_id: null,
      source_context: { import_id: "import-1", source_name: "CSV", carried_from_semester_id: null, carried_from_opportunity_id: null, rawRow: "omit-me" },
    })],
    outreach_activities: [rowFor("outreach_activities", "activity-1", {
      id: "activity-1", semester_id: semesterId, actor_profile_id: null, previous_owner_profile_id: null, new_owner_profile_id: null,
      details: { type: "stage_change", stage: "contacted", reason: null, is_silenced: false, mystery: "omit-me" },
    })],
    outreach_imports: [rowFor("outreach_imports", "import-1", {
      id: "import-1", semester_id: semesterId, created_by: null,
      rows: [{ raw: { arbitrary_upload_column: "omit-me" }, normalized: { rowNumber: 1, fullName: "Imported Person", email: "person@example.test", linkedinUrl: null, company: "Example", companyDomain: "example.test", stage: "not_contacted", relationshipLabels: ["mentor"], ownerName: null, ownerId: null }, decision: { issues: ["owner_unmatched"], disposition: "create", contactId: null, suggestedContactId: null, matchSource: null } }],
      result: { totalRows: 1, matchedRows: 0, createRows: 1, reviewRequiredRows: 0, invalidRows: 0, rowsWithIssues: 1, committedRows: 1, internalMetric: "omit-me" },
    })],
    program_audit_events: [rowFor("program_audit_events", "audit-1", {
      id: "audit-1", semester_id: semesterId, actor_profile_id: null,
      details: { override_types: ["capacity"], target_profile_id: "profile-1", profile_is_active: false, ranking_context: { privateScore: "omit-me" } },
    })],
  };
  const loaded = await createSemesterExportStore(memorySource(tables), null).load(semesterId, "semester");
  const dataset = (id: string) => loaded.datasets.find((candidate) => candidate.id === id)?.rows[0];
  assert.deepEqual(dataset("semester"), {
    id: semesterId, name: "Fall 2026", start_date: null, end_date: null, lifecycle_status: null, is_active: null, archived_at: null, closed_at: null,
    configuration_template_version: 3, time_zone: "America/New_York", location: "New York", session_cadence: "weekly", default_format: "in-person", configuration_unknown_key_count: 1, created_at: null, updated_at: null,
  });
  assert.equal(dataset("semester_memberships")?.onboarding_unknown_item_count, 1);
  assert.equal(dataset("semester_memberships")?.onboarding_unknown_payload_key_count, 2);
  assert.deepEqual(dataset("semester_memberships")?.onboarding_items, [
    { item_key: "identity", is_required: true, completed_at: "2026-09-01T00:00:00Z", payload: { name: "Admin", email: "admin@example.test", role: "admin" } },
    { item_key: "mentoring_hours_setup", is_required: false, completed_at: null, payload: { choice: "add-later" } },
  ]);
  assert.equal(dataset("startup_organizations")?.durable_contact_unknown_key_count, 2);
  assert.equal(dataset("outreach_opportunities")?.source_context_unknown_key_count, 1);
  assert.equal(dataset("outreach_activities")?.details_unknown_key_count, 1);
  assert.equal(dataset("outreach_activities")?.detail_stage, "contacted");
  assert.equal(dataset("outreach_imports")?.total_rows, 1);
  assert.equal(dataset("outreach_imports")?.result_unknown_key_count, 1);
  const importRows = loaded.datasets.find(({ id }) => id === "outreach_import_rows")?.rows;
  assert.equal(importRows?.length, 1);
  assert.equal(importRows?.[0]?.full_name, "Imported Person");
  assert.deepEqual(importRows?.[0]?.issues, ["owner_unmatched"]);
  assert.deepEqual(dataset("program_audit_events")?.detail_override_types, ["capacity"]);
  assert.equal(dataset("program_audit_events")?.detail_target_profile_id, "profile-1");
  assert.equal(dataset("program_audit_events")?.details_unknown_key_count, 1);
  assert.doesNotMatch(JSON.stringify(loaded.datasets), /omit-me|privateSetting|secretAnswer|future_private_step|privateValue|privateNote|rawRow|mystery/u);
});
