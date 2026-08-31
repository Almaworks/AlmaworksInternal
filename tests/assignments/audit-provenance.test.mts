import assert from "node:assert/strict";
import test from "node:test";

test("audit provenance is loaded only for exact visible session IDs in sub-cap chunks", async () => {
  const subject = await import("../../src/assignments/audit-provenance.ts").catch(() => null);
  assert.ok(subject, "the bounded audit provenance loader must exist");

  const sessionIds = Array.from({ length: 1_005 }, (_, index) => `session-${index}`);
  const requestedChunks: string[][] = [];
  const auditedSessionIds = await subject.loadAuditedSessionIds(sessionIds, async (chunk) => {
    requestedChunks.push([...chunk]);
    const data = chunk
      .filter((sessionId) => Number(sessionId.slice("session-".length)) % 250 === 0)
      .map((session_id) => ({ session_id }));
    return { data, count: data.length, error: null };
  });

  assert.deepEqual(requestedChunks.map((chunk) => chunk.length), [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 5]);
  assert.deepEqual(requestedChunks.flat(), sessionIds);
  assert.deepEqual([...auditedSessionIds], ["session-0", "session-250", "session-500", "session-750", "session-1000"]);
});

test("audit provenance lookup fails closed on a chunk query error", async () => {
  const subject = await import("../../src/assignments/audit-provenance.ts").catch(() => null);
  assert.ok(subject, "the bounded audit provenance loader must exist");

  let calls = 0;
  await assert.rejects(
    subject.loadAuditedSessionIds(["session-1", "session-2"], async () => {
      calls += 1;
      return { data: null, count: null, error: { message: "sensitive database detail" } };
    }),
    (error: unknown) => error instanceof Error
      && error.message === "Unable to verify assignment audit protection. The schedule was not refreshed."
      && !error.message.includes("sensitive database detail"),
  );
  assert.equal(calls, 1);
});

test("audit provenance lookup fails closed when PostgREST returns an incomplete chunk", async () => {
  const subject = await import("../../src/assignments/audit-provenance.ts").catch(() => null);
  assert.ok(subject, "the bounded audit provenance loader must exist");

  await assert.rejects(
    subject.loadAuditedSessionIds(["session-1", "session-2"], async () => ({
      data: [{ session_id: "session-1" }],
      count: 2,
      error: null,
    })),
    /Unable to verify assignment audit protection\. The schedule was not refreshed\./,
  );
});
