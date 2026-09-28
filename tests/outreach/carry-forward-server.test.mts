import assert from "node:assert/strict";
import test from "node:test";

import {
  createCarryForwardOutreachContacts,
  parseCarryForwardBody,
} from "../../src/outreach/server/carry-forward.ts";

const sourceSemesterId = "00000000-0000-4000-8000-000000000101";
const targetSemesterId = "00000000-0000-4000-8000-000000000102";
const firstContactId = "00000000-0000-4000-8000-000000000201";
const secondContactId = "00000000-0000-4000-8000-000000000202";

test("carry-forward request validation accepts 1-250 distinct UUID contact IDs", async () => {
  assert.deepEqual(parseCarryForwardBody({
    sourceSemesterId,
    targetSemesterId,
    contactIds: [firstContactId, secondContactId],
  }), {
    sourceSemesterId,
    targetSemesterId,
    contactIds: [firstContactId, secondContactId],
  });

  const maximumContactIds = Array.from(
    { length: 250 },
    (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  assert.equal(parseCarryForwardBody({
    sourceSemesterId,
    targetSemesterId,
    contactIds: maximumContactIds,
  }).contactIds.length, 250);
});

test("carry-forward request validation rejects malformed, empty, duplicate, oversized, and same-semester input", async () => {
  const invalidCases = [
    { value: null, field: undefined },
    { value: { sourceSemesterId: "past", targetSemesterId, contactIds: [firstContactId] }, field: "sourceSemesterId" },
    { value: { sourceSemesterId, targetSemesterId, contactIds: [] }, field: "contactIds" },
    { value: { sourceSemesterId, targetSemesterId, contactIds: [firstContactId, firstContactId] }, field: "contactIds[1]" },
    { value: { sourceSemesterId, targetSemesterId, contactIds: ["invalid"] }, field: "contactIds[0]" },
    {
      value: {
        sourceSemesterId,
        targetSemesterId,
        contactIds: Array.from(
          { length: 251 },
          (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        ),
      },
      field: "contactIds",
    },
    { value: { sourceSemesterId, targetSemesterId: sourceSemesterId, contactIds: [firstContactId] }, field: "targetSemesterId" },
  ];

  for (const invalidCase of invalidCases) {
    assert.throws(
      () => parseCarryForwardBody(invalidCase.value),
      (error: unknown) => typeof error === "object"
        && error !== null
        && "status" in error
        && error.status === 400
        && "field" in error
        && error.field === invalidCase.field,
    );
  }
});

test("carry-forward authorizes both semesters, requires the active target, and reports added and skipped counts", async () => {
  const events: string[] = [];
  const database = {
    loadSemester: async (semesterId: string) => {
      events.push(`load:${semesterId}`);
      return { data: { id: semesterId, is_active: true }, error: null };
    },
    carryForward: async (input: { p_source_semester_id: string; p_target_semester_id: string; p_contact_ids: readonly string[] }) => {
      events.push(`rpc:${input.p_source_semester_id}:${input.p_target_semester_id}:${input.p_contact_ids.join(",")}`);
      return { data: 1, error: null };
    },
  };
  const carryForward = createCarryForwardOutreachContacts(async (_request: Request, semesterId: string) => {
    events.push(`authorize:${semesterId}`);
    return database;
  });

  const result = await carryForward({
    request: new Request("https://almaworks.example.test/api/admin/outreach/carry-forward"),
    sourceSemesterId,
    targetSemesterId,
    contactIds: [firstContactId, secondContactId],
  });

  assert.deepEqual(result, { addedCount: 1, skippedCount: 1, targetSemesterId });
  assert.deepEqual(events, [
    `authorize:${sourceSemesterId}`,
    `authorize:${targetSemesterId}`,
    `load:${targetSemesterId}`,
    `rpc:${sourceSemesterId}:${targetSemesterId}:${firstContactId},${secondContactId}`,
  ]);
});

test("carry-forward rejects an inactive or missing target before mutation", async () => {
  for (const semester of [
    { data: { id: targetSemesterId, is_active: false }, error: null, status: 409 },
    { data: null, error: null, status: 404 },
  ]) {
    let mutated = false;
    const carryForward = createCarryForwardOutreachContacts(async () => ({
      loadSemester: async () => ({ data: semester.data, error: semester.error }),
      carryForward: async () => {
        mutated = true;
        return { data: 1, error: null };
      },
    }));

    await assert.rejects(
      carryForward({
        request: new Request("https://almaworks.example.test"),
        sourceSemesterId,
        targetSemesterId,
        contactIds: [firstContactId],
      }),
      (error: unknown) => typeof error === "object"
        && error !== null
        && "status" in error
        && error.status === semester.status,
    );
    assert.equal(mutated, false);
  }
});

test("carry-forward rejects database failures and impossible RPC counts", async () => {
  for (const rpcResult of [
    { data: null, error: { code: "XX000", message: "database unavailable" } },
    { data: -1, error: null },
    { data: 2, error: null },
    { data: 0.5, error: null },
  ]) {
    const carryForward = createCarryForwardOutreachContacts(async () => ({
      loadSemester: async () => ({ data: { id: targetSemesterId, is_active: true }, error: null }),
      carryForward: async () => rpcResult,
    }));

    await assert.rejects(carryForward({
      request: new Request("https://almaworks.example.test"),
      sourceSemesterId,
      targetSemesterId,
      contactIds: [firstContactId],
    }));
  }
});
