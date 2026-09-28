import assert from "node:assert/strict";
import test from "node:test";

import { createSemesterExportHandlers, SemesterExportHttpError, type AuthorizeSemesterExport } from "../../src/semester-export/server.ts";
import type { SemesterExportStore } from "../../src/semester-export/store.ts";

const semesterId = "11111111-1111-4111-8111-111111111111";

function store(overrides: Partial<SemesterExportStore> = {}): SemesterExportStore {
  return {
    load: async (requestedId, scope) => ({
      semesterId: requestedId,
      semesterName: "Fall 2026",
      datasets: [{ id: scope === "semester" ? "semester" : "outreach_contacts", columns: ["id"], rows: [{ id: "row-1" }] }],
    }),
    ...overrides,
  };
}

function request(parameters: string): Request {
  return new Request(`http://localhost/api/admin/semester-export?${parameters}`, { headers: { Authorization: "Bearer test" } });
}

test("manifest preview authorizes the exact semester and returns the public contract", async () => {
  const calls: unknown[] = [];
  const authorize: AuthorizeSemesterExport = async (_request, requestedId) => {
    calls.push(requestedId);
    return store({ load: async (id, scope) => {
      calls.push([id, scope]);
      return { semesterId: id, semesterName: "Fall 2026", datasets: [{ id: "semester", columns: ["id"], rows: [{ id }] }] };
    } });
  };
  const handlers = createSemesterExportHandlers({ authorize, now: () => new Date("2026-09-09T03:00:00.000Z") });
  const response = await handlers.GET(request(`semesterId=${semesterId}&scope=semester&format=manifest`));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [semesterId, [semesterId, "semester"]]);
  const body = await response.json();
  assert.equal(body.data.scope, "semester");
  assert.deepEqual(body.data.semester, { id: semesterId, name: "Fall 2026" });
  assert.equal(body.data.datasets[0].rowCount, 1);
  assert.ok(body.data.exclusions.some((entry: string) => entry.includes("sessions.notes")));
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
});

test("manifest is the default format and outreach stays outreach scoped", async () => {
  const handlers = createSemesterExportHandlers({ authorize: async () => store(), now: () => new Date("2026-09-09T03:00:00Z") });
  const response = await handlers.GET(request(`semesterId=${semesterId}&scope=outreach`));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.scope, "outreach");
});

test("zip response delegates fixed input and sets private attachment headers", async () => {
  let captured: unknown;
  const handlers = createSemesterExportHandlers({
    authorize: async () => store(),
    createArchive: async (input) => {
      captured = input;
      return { archive: Buffer.from("zip-data"), fileName: `semester-export-${semesterId}-semester.zip` };
    },
    now: () => new Date("2026-09-09T03:00:00Z"),
  });
  const response = await handlers.GET(request(`semesterId=${semesterId}&scope=semester&format=zip`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/zip");
  assert.match(response.headers.get("content-disposition") ?? "", /^attachment; filename="semester-export-[a-z0-9-]+-semester\.zip"$/u);
  assert.equal(await response.text(), "zip-data");
  assert.equal((captured as { metadata: { semesterId: string } }).metadata.semesterId, semesterId);
});

test("unsupported, duplicate and malformed query parameters are rejected before authorization", async () => {
  let calls = 0;
  const handlers = createSemesterExportHandlers({ authorize: async () => { calls += 1; return store(); } });
  const cases = [
    "", `semesterId=bad&scope=semester`, `semesterId=${semesterId}&scope=all`,
    `semesterId=${semesterId}&scope=semester&format=csv`, `semesterId=${semesterId}&scope=semester&extra=true`,
    `semesterId=${semesterId}&semesterId=${semesterId}&scope=semester`,
  ];
  for (const parameters of cases) assert.equal((await handlers.GET(request(parameters))).status, 400);
  assert.equal(calls, 0);
});

test("cross-semester denial cannot reach the data store", async () => {
  const handlers = createSemesterExportHandlers({ authorize: async () => { throw new SemesterExportHttpError(403, "Semester administrator access is required."); } });
  const response = await handlers.GET(request(`semesterId=${semesterId}&scope=semester`));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: { message: "Semester administrator access is required." } });
});

test("a dataset fetch failure fails the whole response without a partial manifest or archive", async () => {
  for (const format of ["manifest", "zip"] as const) {
    const handlers = createSemesterExportHandlers({ authorize: async () => store({ load: async () => { throw new Error("private database detail"); } }) });
    const response = await handlers.GET(request(`semesterId=${semesterId}&scope=semester&format=${format}`));
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.deepEqual(body, { error: { message: "Semester export could not be generated." } });
    assert.doesNotMatch(JSON.stringify(body), /private database detail/u);
  }
});

test("store cannot return a different semester than the authorized request", async () => {
  const handlers = createSemesterExportHandlers({ authorize: async () => store({ load: async () => ({ semesterId: "22222222-2222-4222-8222-222222222222", semesterName: "Wrong", datasets: [] }) }) });
  assert.equal((await handlers.GET(request(`semesterId=${semesterId}&scope=semester`))).status, 500);
});

test("direct downloads above the deployed response ceiling fail with an actionable 413", async () => {
  const handlers = createSemesterExportHandlers({
    authorize: async () => store(),
    createArchive: async () => ({ archive: Buffer.alloc(4 * 1024 * 1024 + 1), fileName: `semester-export-${semesterId}-semester.zip` }),
  });
  const response = await handlers.GET(request(`semesterId=${semesterId}&scope=semester&format=zip`));
  assert.equal(response.status, 413);
  assert.match((await response.json()).error.message, /size limit/u);
});
