import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

import * as memberLoginServer from "../../src/auth/member-login-account-server.ts";
import {
  MemberLoginAccountError,
  MemberLoginReconciliationError,
  previewMemberLoginRemoval,
  removeMemberLogin,
  restoreMemberLogin,
  type MemberLoginAccountClient,
  type ReplacementPlaceholderDiscardedRow,
  type RpcResult,
} from "../../src/auth/member-login-account-server.ts";
import type { Database } from "../../src/db/types.ts";

const previewRow = {
  already_prepared: false,
  auth_user_id: "auth-1",
  email: "member@example.test",
  full_name: "Member Example",
  profile_id: "profile-1",
  profile_is_active: true,
  semester_count: 3,
  session_count: 8,
  suspend_membership_ids: ["membership-1"],
};

const preparedRow = {
  auth_user_id: "auth-1",
  profile_id: "profile-1",
  profile_is_active: false,
  suspended_membership_ids: ["membership-1"],
};

function client(overrides: Partial<MemberLoginAccountClient> = {}): MemberLoginAccountClient {
  return {
    preview: async () => ({ data: [previewRow], error: null }),
    prepare: async () => ({ data: [preparedRow], error: null }),
    getAuthUser: async () => ({ status: "not_found" }),
    createAuthUser: async ({ id }) => ({ data: { userId: id }, error: null }),
    deleteAuthUser: async () => ({ error: null }),
    generateInvite: async () => ({
      data: {
        tokenHash: "test-hash",
        userId: "replacement-auth-1",
      },
      error: null,
    }),
    attach: async () => ({
      data: [{ auth_user_id: "replacement-auth-1", profile_id: "profile-1", profile_is_active: true }],
      error: null,
    }),
    discardPlaceholder: async () => ({
      data: [{ auth_user_id: "replacement-auth-1", placeholder_discarded: true, profile_id: "profile-1" }],
      error: null,
    }),
    verifyProfile: async () => ({ data: { auth_user_id: null, is_active: false }, error: null }),
    ...overrides,
  };
}

test("previews retained impact without exposing the Auth identity", async () => {
  const result = await previewMemberLoginRemoval(client(), "profile-1");

  assert.deepEqual(result, {
    alreadyPrepared: false,
    email: "member@example.test",
    fullName: "Member Example",
    hasLogin: true,
    profileActive: true,
    profileId: "profile-1",
    semesterCount: 3,
    sessionCount: 8,
    suspendMembershipIds: ["membership-1"],
  });
  assert.equal("authUserId" in result, false);
});

test("removal prepares access, hard-deletes Auth, then verifies the durable profile link", async () => {
  const events: unknown[] = [];
  const result = await removeMemberLogin(client({
    prepare: async (args) => {
      events.push({ prepare: args });
      return { data: [preparedRow], error: null };
    },
    deleteAuthUser: async (userId, shouldSoftDelete) => {
      events.push({ deleteAuth: { shouldSoftDelete, userId } });
      return { error: null };
    },
    verifyProfile: async (profileId) => {
      events.push({ verify: profileId });
      return { data: { auth_user_id: null, is_active: false }, error: null };
    },
  }), { profileId: "profile-1", reason: "Duplicate test account" });

  assert.deepEqual(events, [
    { prepare: { p_profile_id: "profile-1", p_reason: "Duplicate test account" } },
    { deleteAuth: { shouldSoftDelete: false, userId: "auth-1" } },
    { verify: "profile-1" },
  ]);
  assert.deepEqual(result, { profileActive: false, profileId: "profile-1", removed: true });
});

test("preparation failure never calls Auth", async () => {
  let authCalled = false;
  await assert.rejects(
    removeMemberLogin(client({
      prepare: async () => ({ data: null, error: { code: "42501", message: "Platform super-administrator access required" } }),
      deleteAuthUser: async () => {
        authCalled = true;
        return { error: null };
      },
    }), { profileId: "profile-1", reason: "Duplicate test account" }),
    (error: unknown) => error instanceof MemberLoginAccountError && error.code === "42501",
  );
  assert.equal(authCalled, false);
});

test("Auth deletion failure leaves the prepared database state for reconciliation", async () => {
  await assert.rejects(
    removeMemberLogin(client({
      deleteAuthUser: async () => ({ error: { message: "Storage objects still owned" } }),
    }), { profileId: "profile-1", reason: "Duplicate test account" }),
    (error: unknown) => error instanceof MemberLoginReconciliationError
      && error.databaseState === "disabled"
      && error.reconciliationRequired,
  );
});

test("already-unlinked removal is idempotent and never calls Auth", async () => {
  const events: string[] = [];
  const result = await removeMemberLogin(client({
    prepare: async () => ({ data: [{ ...preparedRow, auth_user_id: null }], error: null }),
    deleteAuthUser: async () => {
      events.push("delete");
      return { error: null };
    },
    verifyProfile: async () => {
      events.push("verify");
      return { data: { auth_user_id: null, is_active: false }, error: null };
    },
  }), { profileId: "profile-1", reason: "Duplicate test account" });

  assert.deepEqual(events, ["verify"]);
  assert.equal(result.removed, true);
});

test("verification query error after successful Auth deletion remains an ordinary success", async () => {
  const result = await removeMemberLogin(client({
    verifyProfile: async () => ({ data: null, error: { code: "PGRST000", message: "Verification unavailable" } }),
  }), { profileId: "profile-1", reason: "Duplicate test account" });

  assert.deepEqual(result, { profileActive: false, profileId: "profile-1", removed: true });
});

test("null verification result after successful Auth deletion remains an ordinary success", async () => {
  const result = await removeMemberLogin(client({
    verifyProfile: async () => ({ data: null, error: null }),
  }), { profileId: "profile-1", reason: "Duplicate test account" });

  assert.deepEqual(result, { profileActive: false, profileId: "profile-1", removed: true });
});

test("malformed verification result after successful Auth deletion remains an ordinary success", async () => {
  const result = await removeMemberLogin(client({
    verifyProfile: async () => ({
      data: { auth_user_id: undefined, is_active: "true" } as unknown as { auth_user_id: string | null; is_active: boolean },
      error: null,
    }),
  }), { profileId: "profile-1", reason: "Duplicate test account" });

  assert.deepEqual(result, { profileActive: false, profileId: "profile-1", removed: true });
});

test("verified still-linked profile after successful Auth deletion requires reconciliation", async () => {
  await assert.rejects(
    removeMemberLogin(client({
      verifyProfile: async () => ({ data: { auth_user_id: "auth-1", is_active: false }, error: null }),
    }), { profileId: "profile-1", reason: "Duplicate test account" }),
    (error: unknown) => error instanceof MemberLoginReconciliationError
      && error.databaseState === "disabled",
  );
});

test("verified active profile after successful Auth deletion requires reconciliation", async () => {
  await assert.rejects(
    removeMemberLogin(client({
      verifyProfile: async () => ({ data: { auth_user_id: null, is_active: true }, error: null }),
    }), { profileId: "profile-1", reason: "Duplicate test account" }),
    (error: unknown) => error instanceof MemberLoginReconciliationError
      && error.databaseState === "disabled",
  );
});

test("restoration generates an invite, attaches the replacement, and returns only the shareable link", async () => {
  const events: unknown[] = [];
  const result = await restoreMemberLogin(client({
    preview: async (profileId) => {
      events.push({ preview: profileId });
      return { data: [{ ...previewRow, auth_user_id: null, profile_is_active: false }], error: null };
    },
    generateInvite: async (email, redirectTo) => {
      events.push({ generateInvite: { email, redirectTo } });
      return {
        data: { tokenHash: "replacement-hash", userId: "replacement-auth-1" },
        error: null,
      };
    },
    attach: async (args) => {
      events.push({ attach: args });
      return {
        data: [{ auth_user_id: "replacement-auth-1", profile_id: "profile-1", profile_is_active: true }],
        error: null,
      };
    },
  }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" });

  assert.deepEqual(events, [
    { preview: "profile-1" },
    {
      generateInvite: {
        email: "member@example.test",
        redirectTo: "https://almaworks.test/auth/callback?next=%2Faccount%2Fpassword%3Freset%3D1",
      },
    },
    { attach: { p_auth_user_id: "replacement-auth-1", p_profile_id: "profile-1" } },
  ]);
  assert.deepEqual(result, {
    actionLink: "https://almaworks.test/auth/callback?token_hash=replacement-hash&type=invite&next=%2Faccount%2Fpassword%3Freset%3D1",
    mustSendLink: true,
    profileActive: true,
    profileId: "profile-1",
  });
  assert.equal("authUserId" in result, false);
});

test("active unlinked restoration provisions the retained profile ID before generating its invite", async () => {
  const events: unknown[] = [];
  const result = await restoreMemberLogin(client({
    preview: async (profileId) => {
      events.push({ preview: profileId });
      return { data: [{ ...previewRow, auth_user_id: null, profile_is_active: true }], error: null };
    },
    getAuthUser: async (userId) => {
      events.push({ getAuthUser: userId });
      return { status: "not_found" };
    },
    createAuthUser: async (input) => {
      events.push({ createAuthUser: input });
      return { data: { userId: "profile-1" }, error: null };
    },
    verifyProfile: async (profileId) => {
      events.push({ verifyProfile: profileId });
      return { data: { auth_user_id: "profile-1", is_active: true }, error: null };
    },
    generateInvite: async (email, redirectTo) => {
      events.push({ generateInvite: { email, redirectTo } });
      return {
        data: { tokenHash: "restored-hash", userId: "profile-1" },
        error: null,
      };
    },
    attach: async () => {
      assert.fail("same-ID provisioning must not attach a replacement profile");
    },
  }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" });

  assert.deepEqual(events, [
    { preview: "profile-1" },
    { getAuthUser: "profile-1" },
    { createAuthUser: { email: "member@example.test", id: "profile-1" } },
    { verifyProfile: "profile-1" },
    {
      generateInvite: {
        email: "member@example.test",
        redirectTo: "https://almaworks.test/auth/callback?next=%2Faccount%2Fpassword%3Freset%3D1",
      },
    },
  ]);
  assert.deepEqual(result, {
    actionLink: "https://almaworks.test/auth/callback?token_hash=restored-hash&type=invite&next=%2Faccount%2Fpassword%3Freset%3D1",
    mustSendLink: true,
    profileActive: true,
    profileId: "profile-1",
  });
});

test("active unlinked restoration rejects an existing Auth ID without creating or changing it", async () => {
  const events: string[] = [];
  await assert.rejects(
    restoreMemberLogin(client({
      preview: async () => ({ data: [{ ...previewRow, auth_user_id: null, profile_is_active: true }], error: null }),
      getAuthUser: async () => {
        events.push("lookup");
        return { status: "found", userId: "profile-1" };
      },
      createAuthUser: async () => {
        events.push("create");
        return { data: null, error: null };
      },
      generateInvite: async () => {
        events.push("invite");
        return { data: null, error: null };
      },
    }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
    (error: unknown) => error instanceof MemberLoginAccountError
      && !(error instanceof MemberLoginReconciliationError)
      && error.code === "55000",
  );
  assert.deepEqual(events, ["lookup"]);
});

test("active unlinked restoration treats an inconclusive Auth lookup as occupied", async () => {
  let createCalled = false;
  await assert.rejects(
    restoreMemberLogin(client({
      preview: async () => ({ data: [{ ...previewRow, auth_user_id: null, profile_is_active: true }], error: null }),
      getAuthUser: async () => ({
        error: { message: "Auth lookup failed", status: 503 },
        status: "error",
      }),
      createAuthUser: async () => {
        createCalled = true;
        return { data: null, error: null };
      },
    }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
    (error: unknown) => error instanceof MemberLoginAccountError
      && error.code === "auth_lookup_failed",
  );
  assert.equal(createCalled, false);
});

test("known duplicate-email creation rejection leaves the active retained profile unchanged", async () => {
  let inviteCalled = false;
  await assert.rejects(
    restoreMemberLogin(client({
      preview: async () => ({ data: [{ ...previewRow, auth_user_id: null, profile_is_active: true }], error: null }),
      getAuthUser: async () => ({ status: "not_found" }),
      createAuthUser: async () => ({
        data: null,
        error: { code: "email_exists", message: "A user with this email already exists", status: 422 },
      }),
      generateInvite: async () => {
        inviteCalled = true;
        return { data: null, error: null };
      },
    }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
    (error: unknown) => error instanceof MemberLoginAccountError
      && !(error instanceof MemberLoginReconciliationError)
      && error.code === "email_exists",
  );
  assert.equal(inviteCalled, false);
});

test("uncertain Auth creation failure preserves durable data and requires reconciliation", async () => {
  const cleanupEvents: string[] = [];
  await assert.rejects(
    restoreMemberLogin(client({
      preview: async () => ({ data: [{ ...previewRow, auth_user_id: null, profile_is_active: true }], error: null }),
      getAuthUser: async () => ({ status: "not_found" }),
      createAuthUser: async () => ({
        data: null,
        error: { message: "Auth request timed out", status: 503 },
      }),
      deleteAuthUser: async () => {
        cleanupEvents.push("delete");
        return { error: null };
      },
      discardPlaceholder: async () => {
        cleanupEvents.push("discard");
        return { data: null, error: null };
      },
    }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
    (error: unknown) => error instanceof MemberLoginReconciliationError
      && error.databaseState === "unknown",
  );
  assert.deepEqual(cleanupEvents, []);
});

test("thrown Auth creation failure preserves durable data and requires reconciliation", async () => {
  await assert.rejects(
    restoreMemberLogin(client({
      preview: async () => ({ data: [{ ...previewRow, auth_user_id: null, profile_is_active: true }], error: null }),
      getAuthUser: async () => ({ status: "not_found" }),
      createAuthUser: async () => {
        throw new Error("network connection closed");
      },
    }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
    (error: unknown) => error instanceof MemberLoginReconciliationError
      && error.databaseState === "unknown",
  );
});

test("failed same-ID profile-link verification preserves the new Auth identity for reconciliation", async () => {
  const events: string[] = [];
  await assert.rejects(
    restoreMemberLogin(client({
      preview: async () => ({ data: [{ ...previewRow, auth_user_id: null, profile_is_active: true }], error: null }),
      getAuthUser: async () => ({ status: "not_found" }),
      createAuthUser: async () => {
        events.push("create");
        return { data: { userId: "profile-1" }, error: null };
      },
      verifyProfile: async () => {
        events.push("verify");
        return { data: { auth_user_id: null, is_active: true }, error: null };
      },
      generateInvite: async () => {
        events.push("invite");
        return { data: null, error: null };
      },
      deleteAuthUser: async () => {
        events.push("delete");
        return { error: null };
      },
    }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
    (error: unknown) => error instanceof MemberLoginReconciliationError
      && error.databaseState === "unknown",
  );
  assert.deepEqual(events, ["create", "verify"]);
});

test("thrown profile verification failure preserves the new Auth identity for reconciliation", async () => {
  await assert.rejects(
    restoreMemberLogin(client({
      preview: async () => ({ data: [{ ...previewRow, auth_user_id: null, profile_is_active: true }], error: null }),
      getAuthUser: async () => ({ status: "not_found" }),
      createAuthUser: async () => ({ data: { userId: "profile-1" }, error: null }),
      verifyProfile: async () => {
        throw new Error("database connection closed");
      },
    }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
    (error: unknown) => error instanceof MemberLoginReconciliationError
      && error.databaseState === "unknown",
  );
});

test("invite generation failure after same-ID provisioning reports the verified active state", async () => {
  const events: string[] = [];
  await assert.rejects(
    restoreMemberLogin(client({
      preview: async () => ({ data: [{ ...previewRow, auth_user_id: null, profile_is_active: true }], error: null }),
      getAuthUser: async () => ({ status: "not_found" }),
      createAuthUser: async () => ({ data: { userId: "profile-1" }, error: null }),
      verifyProfile: async () => ({ data: { auth_user_id: "profile-1", is_active: true }, error: null }),
      generateInvite: async () => {
        events.push("invite");
        return { data: null, error: { message: "Invite provider unavailable", status: 503 } };
      },
      deleteAuthUser: async () => {
        events.push("delete");
        return { error: null };
      },
    }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
    (error: unknown) => error instanceof MemberLoginReconciliationError
      && error.databaseState === "active",
  );
  assert.deepEqual(events, ["invite"]);
});

test("thrown invite generation failure after same-ID provisioning reports the verified active state", async () => {
  await assert.rejects(
    restoreMemberLogin(client({
      preview: async () => ({ data: [{ ...previewRow, auth_user_id: null, profile_is_active: true }], error: null }),
      getAuthUser: async () => ({ status: "not_found" }),
      createAuthUser: async () => ({ data: { userId: "profile-1" }, error: null }),
      verifyProfile: async () => ({ data: { auth_user_id: "profile-1", is_active: true }, error: null }),
      generateInvite: async () => {
        throw new Error("auth service connection closed");
      },
    }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
    (error: unknown) => error instanceof MemberLoginReconciliationError
      && error.databaseState === "active",
  );
});

test("active unlinked restoration authorizes with preview before any Auth operation", async () => {
  const events: string[] = [];
  await assert.rejects(
    restoreMemberLogin(client({
      preview: async () => {
        events.push("preview");
        return { data: null, error: { code: "42501", message: "Platform super-administrator access required" } };
      },
      getAuthUser: async () => {
        events.push("lookup");
        return { status: "not_found" };
      },
      createAuthUser: async () => {
        events.push("create");
        return { data: null, error: null };
      },
    }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
    (error: unknown) => error instanceof MemberLoginAccountError && error.code === "42501",
  );
  assert.deepEqual(events, ["preview"]);
});

test("attachment failure discards the verified placeholder before hard-deleting replacement Auth", async () => {
  const events: unknown[] = [];
  await assert.rejects(
    restoreMemberLogin(client({
      preview: async () => ({ data: [{ ...previewRow, auth_user_id: null, profile_is_active: false }], error: null }),
      attach: async () => {
        events.push("attach");
        return { data: null, error: { code: "55000", message: "Replacement profile contains durable references" } };
      },
      discardPlaceholder: async (args) => {
        events.push({ discard: args });
        return {
          data: [{ auth_user_id: "replacement-auth-1", placeholder_discarded: true, profile_id: "profile-1" }],
          error: null,
        };
      },
      deleteAuthUser: async (userId, shouldSoftDelete) => {
        events.push({ deleteAuth: { shouldSoftDelete, userId } });
        return { error: null };
      },
    }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
    (error: unknown) => error instanceof MemberLoginAccountError && !(error instanceof MemberLoginReconciliationError),
  );

  assert.deepEqual(events, [
    "attach",
    { discard: { p_auth_user_id: "replacement-auth-1", p_profile_id: "profile-1" } },
    { deleteAuth: { shouldSoftDelete: false, userId: "replacement-auth-1" } },
  ]);
});

test("safe already-absent placeholder cleanup still permits replacement Auth deletion", async () => {
  let deleted = false;
  await assert.rejects(
    restoreMemberLogin(client({
      preview: async () => ({ data: [{ ...previewRow, auth_user_id: null, profile_is_active: false }], error: null }),
      attach: async () => ({ data: null, error: { code: "55000", message: "Attach failed" } }),
      discardPlaceholder: async () => ({
        data: [{ auth_user_id: "replacement-auth-1", placeholder_discarded: false, profile_id: "profile-1" }],
        error: null,
      }),
      deleteAuthUser: async () => {
        deleted = true;
        return { error: null };
      },
    }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
    MemberLoginAccountError,
  );
  assert.equal(deleted, true);
});

test("failed or ambiguous placeholder discard requires reconciliation and preserves replacement Auth", async () => {
  const malformedRows: unknown[] = [
    {},
    [],
    [null],
    [
      { auth_user_id: "replacement-auth-1", placeholder_discarded: true, profile_id: "profile-1" },
      { auth_user_id: "replacement-auth-1", placeholder_discarded: true, profile_id: "profile-1" },
    ],
    [{ auth_user_id: "wrong-auth", placeholder_discarded: true, profile_id: "profile-1" }],
    [{ auth_user_id: "replacement-auth-1", placeholder_discarded: true, profile_id: "wrong-profile" }],
    [{ auth_user_id: "replacement-auth-1", profile_id: "profile-1" }],
    [{ auth_user_id: "replacement-auth-1", placeholder_discarded: null, profile_id: "profile-1" }],
    [{ auth_user_id: "replacement-auth-1", placeholder_discarded: "true", profile_id: "profile-1" }],
  ];
  const discardResults: Array<RpcResult<ReplacementPlaceholderDiscardedRow[]>> = [
    { data: null, error: { code: "55000", message: "Placeholder changed" } },
    ...malformedRows.map((data) => ({
      data: data as ReplacementPlaceholderDiscardedRow[],
      error: null,
    })),
  ];
  for (const discardResult of discardResults) {
    let deleted = false;
    await assert.rejects(
      restoreMemberLogin(client({
        preview: async () => ({ data: [{ ...previewRow, auth_user_id: null, profile_is_active: false }], error: null }),
        attach: async () => ({ data: null, error: { code: "55000", message: "Attach failed" } }),
        discardPlaceholder: async () => discardResult,
        deleteAuthUser: async () => {
          deleted = true;
          return { error: null };
        },
      }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
      (error: unknown) => error instanceof MemberLoginReconciliationError,
    );
    assert.equal(deleted, false);
  }
});

test("empty, multiple, or malformed successful attachment results are ambiguous and never trigger cleanup", async () => {
  const malformedRows: unknown[] = [
    {},
    [],
    [null],
    [
      { auth_user_id: "replacement-auth-1", profile_id: "profile-1", profile_is_active: true },
      { auth_user_id: "replacement-auth-1", profile_id: "profile-1", profile_is_active: true },
    ],
    [{ auth_user_id: "wrong-auth", profile_id: "profile-1", profile_is_active: true }],
    [{ auth_user_id: "replacement-auth-1", profile_id: "wrong-profile", profile_is_active: true }],
    [{ auth_user_id: "replacement-auth-1", profile_id: "profile-1" }],
    [{ auth_user_id: "replacement-auth-1", profile_id: "profile-1", profile_is_active: null }],
    [{ auth_user_id: "replacement-auth-1", profile_id: "profile-1", profile_is_active: "true" }],
    [{ auth_user_id: "replacement-auth-1", profile_id: "profile-1", profile_is_active: false }],
  ];

  for (const data of malformedRows) {
    const cleanupEvents: string[] = [];
    await assert.rejects(
      restoreMemberLogin(client({
        preview: async () => ({ data: [{ ...previewRow, auth_user_id: null, profile_is_active: false }], error: null }),
        attach: async () => ({
          data: data as Awaited<ReturnType<MemberLoginAccountClient["attach"]>>["data"],
          error: null,
        }),
        discardPlaceholder: async () => {
          cleanupEvents.push("discard");
          return { data: null, error: null };
        },
        deleteAuthUser: async () => {
          cleanupEvents.push("delete");
          return { error: null };
        },
      }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
      (error: unknown) => error instanceof MemberLoginReconciliationError
        && error.databaseState === "unknown",
    );
    assert.deepEqual(cleanupEvents, []);
  }
});

test("replacement Auth cleanup failure is reconciliation-required", async () => {
  await assert.rejects(
    restoreMemberLogin(client({
      preview: async () => ({ data: [{ ...previewRow, auth_user_id: null, profile_is_active: false }], error: null }),
      attach: async () => ({ data: null, error: { code: "55000", message: "Attach failed" } }),
      deleteAuthUser: async () => ({ error: { message: "Auth cleanup failed" } }),
    }), { profileId: "profile-1", redirectTo: "https://almaworks.test/auth/callback" }),
    (error: unknown) => error instanceof MemberLoginReconciliationError,
  );
});

test("production adapter keeps database access on userClient and Auth Admin operations on adminClient", async () => {
  const factory = memberLoginServer.createMemberLoginAccountProductionClient;
  assert.equal(typeof factory, "function", "the production adapter factory must be directly testable");

  const requests: Array<{ authorization: string | null; body: unknown; host: string; method: string; pathname: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const text = request.method === "GET" || request.method === "HEAD" ? "" : await request.clone().text();
    requests.push({
      authorization: request.headers.get("authorization"),
      body: text ? JSON.parse(text) : null,
      host: url.host,
      method: request.method,
      pathname: url.pathname,
    });

    if (url.pathname.endsWith("/rpc/preview_member_login_removal")) {
      return Response.json([{ ...previewRow, auth_user_id: null }]);
    }
    if (url.pathname.endsWith("/rpc/prepare_member_login_removal")) {
      return Response.json([{ ...preparedRow, auth_user_id: null }]);
    }
    if (url.pathname.endsWith("/rpc/attach_replacement_auth_identity")) {
      return Response.json([{ auth_user_id: "20000000-0000-4000-8000-000000000001", profile_id: "profile-1", profile_is_active: true }]);
    }
    if (url.pathname.endsWith("/rpc/discard_replacement_auth_placeholder")) {
      return Response.json([{ auth_user_id: "20000000-0000-4000-8000-000000000001", placeholder_discarded: true, profile_id: "profile-1" }]);
    }
    if (url.pathname.endsWith("/profiles")) {
      return Response.json({ auth_user_id: null, is_active: false });
    }
    if (url.pathname.endsWith("/admin/users/20000000-0000-4000-8000-000000000002") && request.method === "GET") {
      return Response.json({ code: "user_not_found", message: "User not found" }, { status: 404 });
    }
    if (url.pathname.endsWith("/admin/users") && request.method === "POST") {
      return Response.json({
        id: "20000000-0000-4000-8000-000000000002",
        aud: "authenticated",
        role: "authenticated",
        email: "member@example.test",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-09-02T12:00:00Z",
      });
    }
    if (url.pathname.endsWith("/admin/generate_link")) {
      return Response.json({
        action_link: "https://almaworks.test/auth/verify?token=test",
        email_otp: "123456",
        hashed_token: "hash",
        redirect_to: "https://almaworks.test/auth/callback",
        verification_type: "invite",
        id: "20000000-0000-4000-8000-000000000001",
        aud: "authenticated",
        role: "authenticated",
        email: "member@example.test",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-09-02T12:00:00Z",
      });
    }
    if (url.pathname.endsWith("/admin/users/20000000-0000-4000-8000-000000000001")) {
      return Response.json({
        id: "20000000-0000-4000-8000-000000000001",
        aud: "authenticated",
        role: "authenticated",
        email: "member@example.test",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-09-02T12:00:00Z",
      });
    }
    return Response.json({ message: `Unexpected ${request.method} ${request.url}` }, { status: 500 });
  };

  const options = { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: fetcher } };
  const userClient = createClient<Database>("https://user-client.test", "user-key", options);
  const adminClient = createClient<Database>("https://admin-client.test", "admin-key", options);
  const adapter = factory!(userClient, adminClient);

  await adapter.preview("profile-1");
  await adapter.prepare({ p_profile_id: "profile-1", p_reason: "Duplicate account" });
  await adapter.attach({ p_auth_user_id: "20000000-0000-4000-8000-000000000001", p_profile_id: "profile-1" });
  await adapter.discardPlaceholder({ p_auth_user_id: "20000000-0000-4000-8000-000000000001", p_profile_id: "profile-1" });
  await adapter.verifyProfile("profile-1");
  assert.deepEqual(
    await adapter.getAuthUser("20000000-0000-4000-8000-000000000002"),
    { status: "not_found" },
  );
  assert.deepEqual(
    await adapter.createAuthUser({ email: "member@example.test", id: "20000000-0000-4000-8000-000000000002" }),
    { data: { userId: "20000000-0000-4000-8000-000000000002" }, error: null },
  );
  assert.deepEqual(
    await adapter.generateInvite("member@example.test", "https://almaworks.test/auth/callback?next=%2Faccount%2Fpassword%3Freset%3D1"),
    { data: { tokenHash: "hash", userId: "20000000-0000-4000-8000-000000000001" }, error: null },
  );
  await adapter.deleteAuthUser("20000000-0000-4000-8000-000000000001", false);

  const databaseRequests = requests.filter(({ pathname }) => pathname.startsWith("/rest/v1/"));
  assert.equal(databaseRequests.length, 5);
  assert.equal(databaseRequests.every(({ authorization, host }) => authorization === "Bearer user-key" && host === "user-client.test"), true);
  const authRequests = requests.filter(({ pathname }) => pathname.startsWith("/auth/v1/admin/"));
  assert.equal(authRequests.length, 4);
  assert.equal(authRequests.every(({ authorization, host }) => authorization === "Bearer admin-key" && host === "admin-client.test"), true);
  assert.deepEqual(
    authRequests.find(({ method, pathname }) => method === "POST" && pathname.endsWith("/admin/users"))?.body,
    {
      email: "member@example.test",
      email_confirm: false,
      id: "20000000-0000-4000-8000-000000000002",
    },
  );
  assert.deepEqual(
    authRequests.find(({ method, pathname }) => method === "DELETE" && pathname.includes("/admin/users/"))?.body,
    { should_soft_delete: false },
  );
});
