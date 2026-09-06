import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

test("authoritative grants drive admin capability even when the legacy role is stale", async () => {
  const subject = await import("../../src/auth/admin-capability.ts").catch(() => null);
  assert.ok(subject, "the authoritative admin capability helper must exist");

  assert.deepEqual(await subject.resolveAdminCapability({
    isSuperAdmin: async () => ({ data: false, error: null }),
    hasActiveSemesterAdminMembership: async () => ({ data: true, error: null }),
  }, "profile-1"), { canManageAdmin: true, canRemoveMemberLogin: false, isSuperAdmin: false });
  assert.equal(subject.resolveDashboardPersona("mentor", true, "admin"), "admin");
});

test("super-admin capability grants member login removal", async () => {
  const subject = await import("../../src/auth/admin-capability.ts").catch(() => null);
  assert.ok(subject, "the authoritative admin capability helper must exist");

  assert.deepEqual(await subject.resolveAdminCapability({
    isSuperAdmin: async () => ({ data: true, error: null }),
    hasActiveSemesterAdminMembership: async () => ({ data: false, error: null }),
  }, "profile-1"), { canManageAdmin: true, canRemoveMemberLogin: true, isSuperAdmin: true });
});

test("legacy admin role alone cannot grant admin navigation or assignment entry points", async () => {
  const subject = await import("../../src/auth/admin-capability.ts").catch(() => null);
  assert.ok(subject, "the authoritative admin capability helper must exist");

  assert.deepEqual(await subject.resolveAdminCapability({
    isSuperAdmin: async () => ({ data: false, error: null }),
    hasActiveSemesterAdminMembership: async () => ({ data: false, error: null }),
  }, "profile-1"), { canManageAdmin: false, canRemoveMemberLogin: false, isSuperAdmin: false });
  assert.equal(subject.resolveDashboardPersona("admin", false, "admin"), null);
});

test("admin capability fails closed when either authoritative lookup fails", async () => {
  const subject = await import("../../src/auth/admin-capability.ts").catch(() => null);
  assert.ok(subject, "the authoritative admin capability helper must exist");

  assert.deepEqual(await subject.resolveAdminCapability({
    isSuperAdmin: async () => ({ data: false, error: { message: "lookup failed" } }),
    hasActiveSemesterAdminMembership: async () => ({ data: true, error: null }),
  }, "profile-1"), { canManageAdmin: false, canRemoveMemberLogin: false, isSuperAdmin: false });

  assert.deepEqual(await subject.resolveAdminCapability({
    isSuperAdmin: async () => ({ data: false, error: null }),
    hasActiveSemesterAdminMembership: async () => ({ data: true, error: { message: "lookup failed" } }),
  }, "profile-1"), { canManageAdmin: false, canRemoveMemberLogin: false, isSuperAdmin: false });
});

test("admin route authority reads canonical grants without calling the removed super-admin RPC", async () => {
  const subject = await import("../../src/auth/admin-capability.ts");
  assert.equal(
    typeof subject.loadAdminRouteAuthority,
    "function",
    "the admin layout must use a canonical authority loader",
  );

  const paths: string[] = [];
  const client = createClient("https://example.supabase.co", "test-key", {
    global: {
      fetch: async (input) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
        );
        paths.push(url.pathname);
        if (url.pathname === "/rest/v1/platform_roles") {
          return Response.json({ role: "super_admin" });
        }
        return Response.json({ message: "unexpected request" }, { status: 404 });
      },
    },
  });

  assert.deepEqual(await subject.loadAdminRouteAuthority(client, "profile-1"), {
    isSuperAdmin: true,
    hasActiveSemesterAdminMembership: false,
    lookupFailed: false,
  });
  assert.deepEqual(paths, ["/rest/v1/platform_roles"]);
});
