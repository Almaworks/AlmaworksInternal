import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from 'node:fs';

import {
  resolveAdminRouteAccess,
  isAdminDashboardPath,
} from "../../src/auth/admin-route.ts";

test('inactive profiles cannot enter admin routes even with an authoritative grant', () => {
  assert.equal(resolveAdminRouteAccess({ authenticated: true,
    profile: { role: 'admin', status: 'approved', is_active: false },
    authority: { isSuperAdmin: true, hasActiveSemesterAdminMembership: false, lookupFailed: false },
  }), '/?error=account_inactive');
});

test('admin proxy routing defers before performing canonical access queries', () => {
  const source = readFileSync(new URL('../../proxy.ts', import.meta.url), 'utf8');
  const dashboard = source.slice(source.indexOf("if (pathname.startsWith('/dashboard'))"));
  assert.ok(dashboard.indexOf('if (isAdminDashboardPath(pathname)) {') >= 0);
  assert.ok(dashboard.indexOf('if (isAdminDashboardPath(pathname)) {') < dashboard.indexOf('profile = await getAccess()'));
  const gate = dashboard.slice(0, dashboard.indexOf('profile = await getAccess()'));
  assert.match(gate, /select\('status,is_active'\)/);
  assert.match(gate, /if \(!account.is_active\).*account_inactive/);
  assert.doesNotMatch(gate, /platform_roles|semester_memberships/);
  const layout = readFileSync(new URL('../../app/dashboard/admin/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /id, role, status, is_active/);
  assert.match(layout, /auth.getUser\(\)/);
  assert.match(layout, /loadAdminRouteAuthority/);
});

test('only exact admin route segments use the narrow navigation gate', () => {
  assert.equal(isAdminDashboardPath('/dashboard/admin'), true);
  assert.equal(isAdminDashboardPath('/dashboard/admin/members'), true);
  assert.equal(isAdminDashboardPath('/dashboard/admin-tools'), false);
  assert.equal(isAdminDashboardPath('/dashboard/mentor'), false);
});

test("a platform super-admin grant allows access even when the legacy profile role is stale", () => {
  assert.equal(resolveAdminRouteAccess({
    authenticated: true,
    profile: { role: "mentor", status: "approved", is_active: true },
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
    profile: { role: "startup", status: "approved", is_active: true },
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
    profile: { role: "admin", status: "approved", is_active: true },
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
    profile: { role: "admin", status: "approved", is_active: true },
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
    profile: { role: "mentor", status: "approved", is_active: true },
    authority,
  }), "/dashboard/mentor");
  assert.equal(resolveAdminRouteAccess({
    authenticated: true,
    profile: { role: "startup", status: "approved", is_active: true },
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
    profile: { role: "admin", status: "pending", is_active: true },
    authority: { ...authority, isSuperAdmin: true },
  }), "/pending");
  assert.equal(resolveAdminRouteAccess({ authenticated: true, profile: null, authority }), "/pending");
});
