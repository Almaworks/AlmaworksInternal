import assert from "node:assert/strict";
import test from "node:test";

import {
  handleOutreachJson,
  parseActivityBody,
  parseCreateContactBody,
  parseImportCommitBody,
  parseImportPreviewBody,
  parseSilenceBody,
  parseStageBody,
  parseWorkspaceQuery,
  toOutreachResponse,
} from "../../src/outreach/server/http.ts";

const semesterId = "4403d7a5-1ff5-4be9-b96c-323893c9ac68";
const opportunityId = "f89fdf50-3d96-4993-8966-d16579d21652";
const updatedAt = "2027-02-14T09:00:00.000Z";

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

test("malformed and non-object JSON are rejected before authorization", async () => {
  for (const body of ["{", "null", "[]", '"text"']) {
    const events: string[] = [];
    const response = await handleOutreachJson(
      new Request("https://almaworks.example.test/api/admin/outreach/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
      parseCreateContactBody,
      async () => {
        events.push("authorize-or-write");
        return { unreachable: true };
      },
    );

    assert.equal(response.status, 400);
    assert.deepEqual(events, []);
    assert.deepEqual(await responseJson(response), {
      apiVersion: "2026-08-18",
      error: {
        code: "invalid_json",
        message: "Request body must be a valid JSON object.",
      },
    });
  }
});

test("missing semesterId is a field-specific validation error", async () => {
  const response = toOutreachResponse(() => parseCreateContactBody({
    contact: { fullName: "Ada Lovelace" },
    opportunity: {},
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await responseJson(response), {
    apiVersion: "2026-08-18",
    error: {
      code: "validation_error",
      field: "semesterId",
      message: "semesterId is required.",
    },
  });
});

test("workspace and mutation identifiers must be UUIDs", async () => {
  const workspaceResponse = toOutreachResponse(() => parseWorkspaceQuery(
    new URL("https://almaworks.example.test/api/admin/outreach/workspace?semesterId=not-a-uuid"),
  ));
  const activityResponse = toOutreachResponse(() => parseActivityBody({
    semesterId,
    opportunityId: "not-a-uuid",
    activityKind: "note",
    occurredAt: "2027-02-15T12:00:00.000Z",
    updatedAt,
  }));

  assert.equal(workspaceResponse.status, 400);
  assert.equal(activityResponse.status, 400);
  assert.equal(
    ((await responseJson(workspaceResponse)).error as { field: string }).field,
    "semesterId",
  );
  assert.equal(
    ((await responseJson(activityResponse)).error as { field: string }).field,
    "opportunityId",
  );
});

test("all-time workspace scope is accepted only for the People view", () => {
  assert.deepEqual(parseWorkspaceQuery(
    new URL("https://almaworks.example.test/api/admin/outreach/workspace?semesterId=all&view=people&pageSize=100"),
  ), {
    semesterId: "all",
    cursor: undefined,
    pageSize: 100,
    view: "people",
  });

  for (const view of ["mine", "team", "companies", "imports"]) {
    assert.throws(
      () => parseWorkspaceQuery(new URL(
        `https://almaworks.example.test/api/admin/outreach/workspace?semesterId=all&view=${view}`,
      )),
      /only available for the People view/i,
    );
  }
});

test("contact creation accepts cadence only from 1 through 365", async () => {
  for (const cadenceDays of [0, 366, 1.5, Number.NaN]) {
    const response = toOutreachResponse(() => parseCreateContactBody({
      semesterId,
      contact: { fullName: "Ada Lovelace" },
      opportunity: { cadenceDays },
    }));

    assert.equal(response.status, 400);
    assert.equal(
      ((await responseJson(response)).error as { field: string }).field,
      "opportunity.cadenceDays",
    );
  }

  assert.equal(parseCreateContactBody({
    semesterId,
    contact: { fullName: "Ada Lovelace" },
    opportunity: { cadenceDays: 365 },
  }).opportunity.cadenceDays, 365);
});

test("silencing requires a non-empty reason", async () => {
  const response = toOutreachResponse(() => parseSilenceBody({
    semesterId,
    opportunityId,
    silence: true,
    reason: "   ",
    updatedAt,
  }));

  assert.equal(response.status, 400);
  assert.equal(
    ((await responseJson(response)).error as { field: string }).field,
    "reason",
  );
});

test("stage updates require a supported stage and optimistic version", () => {
  assert.deepEqual(parseStageBody({
    semesterId,
    opportunityId,
    updatedAt,
    stage: "meeting",
  }), { semesterId, opportunityId, updatedAt, stage: "meeting" });
});

test("stage updates reject an unsupported stage", () => {
  assert.throws(
    () => parseStageBody({ semesterId, opportunityId, updatedAt, stage: "unknown" }),
    (error: unknown) => error instanceof Error && error.message.includes("stage"),
  );
});

test("activity parsing rejects unsupported channels", async () => {
  const response = toOutreachResponse(() => parseActivityBody({
    semesterId,
    opportunityId,
    activityKind: "call",
    channel: "sms",
    occurredAt: "2027-02-15T12:00:00.000Z",
    updatedAt,
  }));

  assert.equal(response.status, 400);
  assert.equal(
    ((await responseJson(response)).error as { field: string }).field,
    "channel",
  );
});

test("import preview rejects more than 250 rows before authorization", async () => {
  const events: string[] = [];
  const response = await handleOutreachJson(
    new Request("https://almaworks.example.test/api/admin/outreach/imports/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        semesterId,
        source: "csv",
        rows: Array.from({ length: 251 }, (_, index) => ({ name: `Contact ${index}` })),
      }),
    }),
    parseImportPreviewBody,
    async () => {
      events.push("authorize");
      return { unreachable: true };
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(events, []);
  assert.equal(
    ((await responseJson(response)).error as { field: string }).field,
    "rows",
  );
});

test("import commit requires a non-empty Idempotency-Key header", async () => {
  for (const headerValue of [null, "   "]) {
    const headers = new Headers({ "content-type": "application/json" });
    if (headerValue !== null) headers.set("idempotency-key", headerValue);
    const request = new Request("https://almaworks.example.test/imports/commit", {
      method: "POST",
      headers,
      body: JSON.stringify({ semesterId, importId: opportunityId }),
    });
    const response = await handleOutreachJson(
      request,
      (value) => parseImportCommitBody(value, request.headers),
      async () => ({ unreachable: true }),
    );

    assert.equal(response.status, 400);
    assert.equal(
      ((await responseJson(response)).error as { field: string }).field,
      "Idempotency-Key",
    );
  }
});

test("stale command conflicts map to a stable versioned 409 response", async () => {
  const response = toOutreachResponse(() => ({
    ok: false as const,
    error: {
      kind: "conflict" as const,
      code: "stale_updated_at" as const,
      message: "Outreach opportunity changed after it was loaded.",
    },
  }));

  assert.equal(response.status, 409);
  assert.deepEqual(await responseJson(response), {
    apiVersion: "2026-08-18",
    error: {
      code: "stale_updated_at",
      message: "Outreach opportunity changed after it was loaded.",
    },
  });
});

test("successful parsed actions return a versioned data envelope", async () => {
  const response = await handleOutreachJson(
    new Request("https://almaworks.example.test/api/admin/outreach/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        semesterId,
        contact: { fullName: "Ada Lovelace" },
        opportunity: {},
      }),
    }),
    parseCreateContactBody,
    async (body) => ({ semesterId: body.semesterId }),
    201,
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await responseJson(response), {
    apiVersion: "2026-08-18",
    data: { semesterId },
  });
});
