import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_FRIDAY_PROGRAM_HREF,
  adminMemberHref,
  adminDashboardHref,
  isDashboardNavigationActive,
  resolveAdminDashboardTab,
} from "../../src/assignments/schedule-navigation.ts";

test("participant booking navigation matches the selected URL tab", () => {
  for (const role of ["mentor", "startup"]) {
    const path = `/dashboard/${role}`;
    assert.equal(isDashboardNavigationActive(path, `${path}?tab=bookings`, "bookings"), true);
    assert.equal(isDashboardNavigationActive(path, path, "bookings"), false);
    assert.equal(isDashboardNavigationActive(path, `${path}?tab=bookings`, null), false);
    assert.equal(isDashboardNavigationActive(path, path, null), true);
  }
});

test("member management links use the canonical Members module and encode the email", () => {
  assert.equal(
    adminMemberHref("mentor+ops@example.com"),
    "/dashboard/admin/members?member=mentor%2Bops%40example.com",
  );
});

test("historical mentor and startup management links preserve their target semester", () => {
  assert.equal(
    adminMemberHref("mentor@example.com", "fall 2025"),
    "/dashboard/admin/members?member=mentor%40example.com&semester=fall%202025",
  );
  assert.equal(
    adminMemberHref("founder+ops@example.com", "spring-2024"),
    "/dashboard/admin/members?member=founder%2Bops%40example.com&semester=spring-2024",
  );
});

test("admin routes select dedicated modules while retired routes fall back to overview", () => {
  assert.equal(resolveAdminDashboardTab("/dashboard/admin/schedule"), "overview");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin/friday-program"), "friday-program");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin/access"), "access");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin/members"), "members");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin/startups"), "startups");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin"), "overview");
});

test("legacy overview query values retain their management destination", () => {
  assert.equal(resolveAdminDashboardTab("/dashboard/admin", "users"), "access");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin", "members"), "members");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin", "startups"), "startups");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin", "friday-program"), "friday-program");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin", "schedule"), "overview");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin", "unknown"), "overview");
});

test("every admin module has a canonical bookmarkable destination", () => {
  assert.equal(adminDashboardHref("overview"), "/dashboard/admin");
  assert.equal(adminDashboardHref("access"), "/dashboard/admin/access");
  assert.equal(adminDashboardHref("members"), "/dashboard/admin/members");
  assert.equal(adminDashboardHref("startups"), "/dashboard/admin/startups");
  assert.equal(adminDashboardHref("friday-program"), ADMIN_FRIDAY_PROGRAM_HREF);
});

test("admin sidebar active state distinguishes Overview from Friday Program", () => {
  assert.equal(isDashboardNavigationActive("/dashboard/admin/friday-program", ADMIN_FRIDAY_PROGRAM_HREF), true);
  assert.equal(isDashboardNavigationActive("/dashboard/admin/schedule", "/dashboard/admin"), false);
  assert.equal(isDashboardNavigationActive("/dashboard/admin", "/dashboard/admin"), true);
});
