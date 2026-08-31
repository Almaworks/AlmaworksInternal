import assert from "node:assert/strict";
import test from "node:test";

import { resolveAdminRouteAccess } from "../../src/auth/admin-route.ts";

test("a platform super-admin grant allows access even when the legacy profile role is stale", () => {
  assert.equal(resolveAdminRouteAccess({
    authenticated: true,
    profile: { role: "mentor", status: "approved" },
    authority: {
      isSuperAdmin: true,
      hasActiveSemesterAdminMembership: false,
      lookupFailed: false,
    },
  }), null);
});

test("an active semester-admin grant allows access even when the legacy profile role is stale", () => {
  assert.equal(resolveAdminRouteAccess({
    authenticated: true,
    profile: { role: "startup", status: "approved" },
    authority: {
      isSuperAdmin: false,
      hasActiveSemesterAdminMembership: true,
      lookupFailed: false,
    },
  }), null);
});

test("an admin-looking legacy profile without an authoritative grant is denied", () => {
  assert.equal(resolveAdminRouteAccess({
    authenticated: true,
    profile: { role: "admin", status: "approved" },
    authority: {
      isSuperAdmin: false,
      hasActiveSemesterAdminMembership: false,
      lookupFailed: false,
    },
  }), "/pending");
});

test("a failed authoritative lookup denies access and uses legacy role only for redirect", () => {
  assert.equal(resolveAdminRouteAccess({
    authenticated: true,
    profile: { role: "admin", status: "approved" },
    authority: {
      isSuperAdmin: true,
      hasActiveSemesterAdminMembership: false,
      lookupFailed: true,
    },
  }), "/pending");
});

test("denied mentor and startup profiles are redirected to their own dashboards", () => {
  const authority = {
    isSuperAdmin: false,
    hasActiveSemesterAdminMembership: false,
    lookupFailed: false,
  };
  assert.equal(resolveAdminRouteAccess({
    authenticated: true,
    profile: { role: "mentor", status: "approved" },
    authority,
  }), "/dashboard/mentor");
  assert.equal(resolveAdminRouteAccess({
    authenticated: true,
    profile: { role: "startup", status: "approved" },
    authority,
  }), "/dashboard/startup");
});

test("unauthenticated and unapproved users cannot render admin routes", () => {
  const authority = {
    isSuperAdmin: false,
    hasActiveSemesterAdminMembership: false,
    lookupFailed: false,
  };
  assert.equal(resolveAdminRouteAccess({ authenticated: false, profile: null, authority }), "/");
  assert.equal(resolveAdminRouteAccess({
    authenticated: true,
    profile: { role: "admin", status: "pending" },
    authority: { ...authority, isSuperAdmin: true },
  }), "/pending");
  assert.equal(resolveAdminRouteAccess({ authenticated: true, profile: null, authority }), "/pending");
});
