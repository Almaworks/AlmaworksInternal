import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError } from "../../src/auth/server.ts";
import { MemberDeletionError } from "../../src/auth/member-deletion-server.ts";
import { createMemberDeletionHandlers } from "../../app/api/admin/members/[profileId]/deletion/route.ts";

const profileId = "b2000000-0000-4000-8000-000000000003";
const context = { params: Promise.resolve({ profileId }) };
const url = `https://almaworks.test/api/admin/members/${profileId}/deletion`;
const preview = { profileId, fullName: "Example", email: "mentor@example.test", version: "revision", status: "ready" as const, counts: { semesters: 2 }, blockers: [], impact: { semesters: ["Fall 2025"], sharedStartups: [], upcomingMentorMeetings: [] } };

test("preview is private and requires authenticated authorization", async () => {
  const handlers = createMemberDeletionHandlers({
    authorize: async () => { throw new AuthorizationError("Unauthorized", 401); },
  });
  const response = await handlers.GET(new Request(url), context);
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await response.json(), { error: { code: "unauthenticated", message: "Unauthorized" } });
});

test("GET returns approved impact contract privately", async () => {
  const response = await createMemberDeletionHandlers({ authorize: async () => ({} as never), preview: async () => preview })
    .GET(new Request(url), context);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: preview });
  assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
});

test("missing deletion RPC produces a private maintenance response", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const response = await createMemberDeletionHandlers({
      authorize: async () => ({} as never),
      preview: async () => { throw new MemberDeletionError("Missing function with schema details", code); },
    }).GET(new Request(url), context);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: {
      code: "database_update_required",
      message: "Permanent deletion is not available until the database update is installed.",
    } });
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  }
});

test("DELETE validates before invoking authorization and returns completed result", async () => {
  let authorized = false;
  const handlers = createMemberDeletionHandlers({
    authorize: async () => { authorized = true; return {} as never; },
    remove: async (_client, input) => {
      assert.deepEqual(input, { profileId, confirmationEmail: "mentor@example.test", reason: "Member request", version: "revision" });
      return { profileId, status: "completed" };
    },
  });
  const bad = await handlers.DELETE(new Request(url, { method: "DELETE", body: JSON.stringify({ confirmation: "delete" }) }), context);
  assert.equal(bad.status, 400);
  assert.equal(authorized, false);
  const ok = await handlers.DELETE(new Request(url, { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE", confirmationEmail: "mentor@example.test", reason: "Member request", version: "revision" }) }), context);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { data: { profileId, status: "completed" } });
  assert.match(ok.headers.get("cache-control") ?? "", /no-store/);
});

test("stale version and incomplete cleanup are distinct private errors", async () => {
  for (const [error, status, code] of [
    [new MemberDeletionError("Preview changed", "PT409"), 409, "conflict"],
    [new MemberDeletionError("Cleanup incomplete", "auth_cleanup_failed", true), 502, "auth_cleanup_failed"],
  ] as const) {
    const response = await createMemberDeletionHandlers({
      authorize: async () => ({} as never),
      remove: async () => { throw error; },
    }).DELETE(new Request(url, { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE", confirmationEmail: "mentor@example.test", reason: "Member request", version: "revision" }) }), context);
    assert.equal(response.status, status);
    const body = await response.json() as { error: { code: string; reconciliationRequired?: boolean } };
    assert.equal(body.error.code, code);
    assert.equal(body.error.reconciliationRequired === true, error.reconciliationRequired);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  }
});

