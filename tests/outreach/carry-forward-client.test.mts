import assert from "node:assert/strict";
import test from "node:test";
import { selectedVisibleContacts, submitCarryForward } from "../../src/outreach/carry-forward-client.ts";

test("selection excludes hidden and wrong-semester contacts and deduplicates people", () => {
  assert.deepEqual(selectedVisibleContacts(["a", "b", "hidden"], [
    { contactId: "a", semesterId: "past" },
    { contactId: "a", semesterId: "past" },
    { contactId: "b", semesterId: "current" },
  ], "past"), ["a"]);
});

test("carry-forward sends selected identities and validates the server result", async () => {
  const result = await submitCarryForward(async (url, init) => {
    assert.equal(url, "/api/admin/outreach/carry-forward");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { sourceSemesterId: "past", targetSemesterId: "current", contactIds: ["a", "b"] });
    return Response.json({ data: { addedCount: 1, skippedCount: 1, targetSemesterId: "current" } });
  }, { sourceSemesterId: "past", targetSemesterId: "current", contactIds: ["a", "b"] });
  assert.deepEqual(result, { addedCount: 1, skippedCount: 1, targetSemesterId: "current" });
});

test("failed or malformed responses never become success", async () => {
  const input = { sourceSemesterId: "past", targetSemesterId: "current", contactIds: ["a"] };
  for (const payload of [
    {}, { data: { addedCount: 1, skippedCount: 0, targetSemesterId: "wrong" } },
    { data: { addedCount: -1, skippedCount: 2, targetSemesterId: "current" } },
    { data: { addedCount: 0, skippedCount: 0, targetSemesterId: "current" } },
  ]) await assert.rejects(submitCarryForward(async () => Response.json(payload), input), /could not confirm/i);
  await assert.rejects(submitCarryForward(async () => Response.json({ error: { message: "Access denied" } }, { status: 403 }), input), /Access denied/);
  await assert.rejects(submitCarryForward(async () => new Response("<html>Error</html>", { status: 500 }), input), /could not confirm/i);
});
