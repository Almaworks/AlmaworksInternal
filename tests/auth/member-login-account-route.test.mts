import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError } from "../../src/auth/server.ts";
import {
  MemberLoginAccountError,
  MemberLoginReconciliationError,
  type MemberLoginAccountClient,
} from "../../src/auth/member-login-account-server.ts";
import { createMemberLoginAccountHandlers } from "../../app/api/admin/members/[profileId]/login/route.ts";

const profileId = "10000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ profileId }) };

function request(method: string, body?: unknown): Request {
  return new Request(`https://almaworks.test/api/admin/members/${profileId}/login`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const unusedClient = {} as MemberLoginAccountClient;

test("route returns successful preview, removal, and manually shareable restoration responses", async () => {
  const handlers = createMemberLoginAccountHandlers({
    authorize: async () => unusedClient,
    preview: async () => ({
      alreadyPrepared: false,
      email: "member@example.test",
      fullName: "Member Example",
      hasLogin: true,
      profileActive: true,
      profileId,
      semesterCount: 2,
      sessionCount: 4,
      suspendMembershipIds: [],
    }),
    remove: async () => ({ profileActive: false, profileId, removed: true }),
    restore: async (_client, input) => {
      assert.equal(input.redirectTo, "https://almaworks.test/auth/callback");
      return {
        actionLink: "https://almaworks.test/auth/verify?token=test",
        mustSendLink: true as const,
        profileActive: true,
        profileId,
      };
    },
  });

  const preview = await handlers.GET(request("GET"), context);
  assert.equal(preview.status, 200);
  assert.equal(JSON.stringify(await preview.json()).includes("authUserId"), false);

  const removal = await handlers.DELETE(request("DELETE", {
    confirmation: "REMOVE",
    reason: "Duplicate account",
  }), context);
  assert.equal(removal.status, 200);

  const restoration = await handlers.POST(request("POST", { confirmation: "RESTORE" }), context);
  assert.equal(restoration.status, 200);
  assert.deepEqual(await restoration.json(), {
    data: {
      actionLink: "https://almaworks.test/auth/verify?token=test",
      mustSendLink: true,
      profileActive: true,
      profileId,
    },
  });
});

test("route rejects malformed JSON, invalid UUIDs, confirmation, and reasons with 400", async () => {
  const handlers = createMemberLoginAccountHandlers({ authorize: async () => unusedClient });
  const malformed = new Request(`https://almaworks.test/api/admin/members/${profileId}/login`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: "{",
  });

  for (const response of [
    await handlers.DELETE(malformed, context),
    await handlers.GET(request("GET"), { params: Promise.resolve({ profileId: "not-a-uuid" }) }),
    await handlers.DELETE(request("DELETE", { confirmation: "remove", reason: "Duplicate account" }), context),
    await handlers.DELETE(request("DELETE", { confirmation: "REMOVE", reason: "x" }), context),
  ]) {
    assert.equal(response.status, 400, JSON.stringify(await response.clone().json()));
  }
});

test("route maps authentication and operation failures to stable statuses", async () => {
  const cases: Array<{ error: Error; status: number }> = [
    { error: new AuthorizationError("Missing bearer token.", 401), status: 401 },
    { error: new MemberLoginAccountError("Platform super-administrator access required", "42501"), status: 403 },
    { error: new MemberLoginAccountError("Member profile not found", "P0002"), status: 404 },
    { error: new MemberLoginAccountError("Retained profile must be unlinked and disabled", "55000"), status: 409 },
    {
      error: new MemberLoginReconciliationError("Auth deletion failed", "disabled"),
      status: 502,
    },
  ];

  for (const { error, status } of cases) {
    const handlers = createMemberLoginAccountHandlers({
      authorize: async () => {
        throw error;
      },
    });
    const response = await handlers.GET(request("GET"), context);
    const payload = await response.json();
    assert.equal(response.status, status, JSON.stringify(payload));
    assert.equal(typeof payload.error.code, "string");
    assert.equal(typeof payload.error.message, "string");
    if (status === 502) {
      assert.equal(payload.error.reconciliationRequired, true);
      assert.equal(payload.error.databaseState, "disabled");
    }
  }
});
