import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_SCHEDULE_HREF,
  adminDashboardHref,
  isDashboardNavigationActive,
  mentorDirectoryScheduleEntry,
  resolveAdminDashboardTab,
} from "../../src/assignments/schedule-navigation.ts";

test("the first-class admin schedule route resolves the existing Schedule tab", () => {
  assert.equal(resolveAdminDashboardTab("/dashboard/admin/schedule"), "schedule");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin"), "users");
});

test("admin overview query values restore every non-schedule tab from the URL", () => {
  assert.equal(resolveAdminDashboardTab("/dashboard/admin", "users"), "users");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin", "members"), "members");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin", "startups"), "startups");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin", "schedule"), "users");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin", "unknown"), "users");
});

test("every admin tab has a canonical bookmarkable destination", () => {
  assert.equal(adminDashboardHref("users"), "/dashboard/admin?tab=users");
  assert.equal(adminDashboardHref("members"), "/dashboard/admin?tab=members");
  assert.equal(adminDashboardHref("startups"), "/dashboard/admin?tab=startups");
  assert.equal(adminDashboardHref("schedule"), "/dashboard/admin/schedule");
});

test("admin sidebar active state distinguishes Overview from Schedule", () => {
  assert.equal(isDashboardNavigationActive("/dashboard/admin/schedule", ADMIN_SCHEDULE_HREF), true);
  assert.equal(isDashboardNavigationActive("/dashboard/admin/schedule", "/dashboard/admin"), false);
  assert.equal(isDashboardNavigationActive("/dashboard/admin", "/dashboard/admin"), true);
  assert.equal(isDashboardNavigationActive("/dashboard/admin", ADMIN_SCHEDULE_HREF), false);
});

test("only authoritative admin capability receives a Mentor Directory assignment entry", () => {
  assert.deepEqual(mentorDirectoryScheduleEntry(true), {
    href: "/dashboard/admin/schedule",
    label: "Assign mentors",
  });
  assert.equal(mentorDirectoryScheduleEntry(false), null);
});
