import assert from "node:assert/strict";
import test from "node:test";

test("authoritative grants drive admin capability even when the legacy role is stale", async () => {
  const subject = await import("../../src/auth/admin-capability.ts").catch(() => null);
  assert.ok(subject, "the authoritative admin capability helper must exist");

  assert.deepEqual(await subject.resolveAdminCapability({
    isSuperAdmin: async () => ({ data: false, error: null }),
    hasActiveSemesterAdminMembership: async () => ({ data: true, error: null }),
  }, "profile-1"), { canManageAdmin: true, canRemoveMemberLogin: false });
  assert.equal(subject.resolveDashboardPersona("mentor", true, "admin"), "admin");
});

test("super-admin capability grants member login removal", async () => {
  const subject = await import("../../src/auth/admin-capability.ts").catch(() => null);
  assert.ok(subject, "the authoritative admin capability helper must exist");

  assert.deepEqual(await subject.resolveAdminCapability({
    isSuperAdmin: async () => ({ data: true, error: null }),
    hasActiveSemesterAdminMembership: async () => ({ data: false, error: null }),
  }, "profile-1"), { canManageAdmin: true, canRemoveMemberLogin: true });
});

test("legacy admin role alone cannot grant admin navigation or assignment entry points", async () => {
  const subject = await import("../../src/auth/admin-capability.ts").catch(() => null);
  assert.ok(subject, "the authoritative admin capability helper must exist");

  assert.deepEqual(await subject.resolveAdminCapability({
    isSuperAdmin: async () => ({ data: false, error: null }),
    hasActiveSemesterAdminMembership: async () => ({ data: false, error: null }),
  }, "profile-1"), { canManageAdmin: false, canRemoveMemberLogin: false });
  assert.equal(subject.resolveDashboardPersona("admin", false, "admin"), null);
});

test("admin capability fails closed when either authoritative lookup fails", async () => {
  const subject = await import("../../src/auth/admin-capability.ts").catch(() => null);
  assert.ok(subject, "the authoritative admin capability helper must exist");

  assert.deepEqual(await subject.resolveAdminCapability({
    isSuperAdmin: async () => ({ data: false, error: { message: "lookup failed" } }),
    hasActiveSemesterAdminMembership: async () => ({ data: true, error: null }),
  }, "profile-1"), { canManageAdmin: false, canRemoveMemberLogin: false });

  assert.deepEqual(await subject.resolveAdminCapability({
    isSuperAdmin: async () => ({ data: false, error: null }),
    hasActiveSemesterAdminMembership: async () => ({ data: true, error: { message: "lookup failed" } }),
  }, "profile-1"), { canManageAdmin: false, canRemoveMemberLogin: false });
});
