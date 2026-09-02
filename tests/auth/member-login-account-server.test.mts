import assert from "node:assert/strict";
import test from "node:test";

import {
  MemberLoginAccountError,
  MemberLoginReconciliationError,
  previewMemberLoginRemoval,
  removeMemberLogin,
  restoreMemberLogin,
  type MemberLoginAccountClient,
} from "../../src/auth/member-login-account-server.ts";

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
    deleteAuthUser: async () => ({ error: null }),
    generateInvite: async () => ({
      data: {
        actionLink: "https://almaworks.test/auth/verify?token=test",
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

test("successful Auth deletion still requires an unlinked profile verification", async () => {
  await assert.rejects(
    removeMemberLogin(client({
      verifyProfile: async () => ({ data: { auth_user_id: "auth-1", is_active: false }, error: null }),
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
        data: { actionLink: "https://almaworks.test/auth/verify?token=test", userId: "replacement-auth-1" },
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
    { generateInvite: { email: "member@example.test", redirectTo: "https://almaworks.test/auth/callback" } },
    { attach: { p_auth_user_id: "replacement-auth-1", p_profile_id: "profile-1" } },
  ]);
  assert.deepEqual(result, {
    actionLink: "https://almaworks.test/auth/verify?token=test",
    mustSendLink: true,
    profileActive: true,
    profileId: "profile-1",
  });
  assert.equal("authUserId" in result, false);
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
  for (const discardResult of [
    { data: null, error: { code: "55000", message: "Placeholder changed" } },
    { data: [], error: null },
  ]) {
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
