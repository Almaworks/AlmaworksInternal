import assert from "node:assert/strict";
import test from "node:test";

import { resolveAdminRouteAccess } from "../../src/auth/admin-route.ts";

test("an approved admin may render admin routes", () => {
  assert.equal(resolveAdminRouteAccess({
    authenticated: true,
    profile: { role: "admin", status: "approved" },
  }), null);
});

test("mentor and startup profiles are redirected to their own dashboards", () => {
  assert.equal(resolveAdminRouteAccess({
    authenticated: true,
    profile: { role: "mentor", status: "approved" },
  }), "/dashboard/mentor");
  assert.equal(resolveAdminRouteAccess({
    authenticated: true,
    profile: { role: "startup", status: "approved" },
  }), "/dashboard/startup");
});

test("unauthenticated and unapproved users cannot render admin routes", () => {
  assert.equal(resolveAdminRouteAccess({ authenticated: false, profile: null }), "/");
  assert.equal(resolveAdminRouteAccess({
    authenticated: true,
    profile: { role: "admin", status: "pending" },
  }), "/pending");
  assert.equal(resolveAdminRouteAccess({ authenticated: true, profile: null }), "/pending");
});
