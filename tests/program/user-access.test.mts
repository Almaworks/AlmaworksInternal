import assert from "node:assert/strict";
import test from "node:test";

import {
  ReconciliationRequiredError,
  provisionSemesterMemberAccess,
  synchronizeAuthEmailAndSemesterAccess,
} from "../../src/program/server/user-access.ts";

function authAdmin(options: { rollbackFails?: boolean } = {}) {
  const calls: { email: string; userId: string }[] = [];
  return {
    calls,
    client: {
      getUserById: async () => ({ data: { user: { email: "old@example.com" } }, error: null }),
      updateUserById: async (userId: string, attributes: { email: string }) => {
        calls.push({ email: attributes.email, userId });
        const rollback = attributes.email === "old@example.com";
        return rollback && options.rollbackFails
          ? { data: { user: null }, error: { message: "rollback failed" } }
          : { data: { user: { email: attributes.email } }, error: null };
      },
    },
  };
}

test("database access failure restores the prior Auth email", async () => {
  const auth = authAdmin();
  await assert.rejects(() => synchronizeAuthEmailAndSemesterAccess({
    authAdmin: auth.client,
    input: {
      approve: false,
      email: "new@example.com",
      fullName: "New Name",
      profileId: "profile-1",
      role: "mentor",
      semesterId: "semester-1",
    },
    setAccess: async () => { throw new Error("database role change failed"); },
  }), /database role change failed/u);
  assert.deepEqual(auth.calls, [
    { email: "new@example.com", userId: "profile-1" },
    { email: "old@example.com", userId: "profile-1" },
  ]);
});

test("failed Auth email rollback reports explicit reconciliation", async () => {
  const auth = authAdmin({ rollbackFails: true });
  await assert.rejects(
    () => synchronizeAuthEmailAndSemesterAccess({
      authAdmin: auth.client,
      input: {
        approve: false,
        email: "new@example.com",
        fullName: "New Name",
        profileId: "profile-1",
        role: "mentor",
        semesterId: "semester-1",
      },
      setAccess: async () => { throw new Error("database role change failed"); },
    }),
    (error: unknown) => error instanceof ReconciliationRequiredError
      && error.reconciliationRequired
      && /database role change failed/u.test(error.message)
      && /rollback failed/u.test(error.message),
  );
});

test("missing prior Auth email reports reconciliation when the database commit fails", async () => {
  await assert.rejects(
    () => synchronizeAuthEmailAndSemesterAccess({
      authAdmin: {
        getUserById: async () => ({ data: { user: null }, error: null }),
        updateUserById: async (_userId: string, attributes: { email: string }) => ({ data: { user: { email: attributes.email } }, error: null }),
      },
      input: {
        approve: false,
        email: "new@example.com",
        fullName: "New Name",
        profileId: "profile-1",
        role: "mentor",
        semesterId: "semester-1",
      },
      setAccess: async () => { throw new Error("database role change failed"); },
    }),
    (error: unknown) => error instanceof ReconciliationRequiredError
      && /prior Auth email is unavailable/u.test(error.message),
  );
});

test("successful synchronization updates Auth before committing database identity and role", async () => {
  const events: string[] = [];
  const result = await synchronizeAuthEmailAndSemesterAccess({
    authAdmin: {
      getUserById: async () => ({ data: { user: { email: "old@example.com" } }, error: null }),
      updateUserById: async () => {
        events.push("auth");
        return { data: { user: { email: "new@example.com" } }, error: null };
      },
    },
    input: {
      approve: false,
      email: "new@example.com",
      fullName: "New Name",
      profileId: "profile-1",
      role: "startup",
      semesterId: "semester-1",
    },
    setAccess: async () => {
      events.push("database");
      return "membership-1";
    },
  });
  assert.equal(result, "membership-1");
  assert.deepEqual(events, ["auth", "database"]);
});

test("failed database provisioning removes the newly created Auth identity", async () => {
  const deleted: string[] = [];
  await assert.rejects(() => provisionSemesterMemberAccess({
    authAdmin: {
      deleteUser: async (userId: string) => {
        deleted.push(userId);
        return { data: { user: null }, error: null };
      },
    },
    input: {
      approve: true,
      email: "new@example.com",
      fullName: "New User",
      profileId: "profile-new",
      role: "mentor",
      semesterId: "semester-1",
    },
    setAccess: async () => { throw new Error("database provisioning failed"); },
  }), /database provisioning failed/u);
  assert.deepEqual(deleted, ["profile-new"]);
});

test("failed cleanup after provisioning reports explicit reconciliation", async () => {
  await assert.rejects(
    () => provisionSemesterMemberAccess({
      authAdmin: { deleteUser: async () => ({ data: { user: null }, error: { message: "delete failed" } }) },
      input: {
        approve: true,
        email: "new@example.com",
        fullName: "New User",
        profileId: "profile-new",
        role: "startup",
        semesterId: "semester-1",
      },
      setAccess: async () => { throw new Error("database provisioning failed"); },
    }),
    (error: unknown) => error instanceof ReconciliationRequiredError
      && /database provisioning failed/u.test(error.message)
      && /delete failed/u.test(error.message),
  );
});
