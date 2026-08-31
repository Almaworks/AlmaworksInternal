import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_SCHEDULE_HREF,
  isDashboardNavigationActive,
  mentorDirectoryScheduleEntry,
  resolveAdminDashboardTab,
} from "../../src/assignments/schedule-navigation.ts";

test("the first-class admin schedule route resolves the existing Schedule tab", () => {
  assert.equal(resolveAdminDashboardTab("/dashboard/admin/schedule"), "schedule");
  assert.equal(resolveAdminDashboardTab("/dashboard/admin"), "users");
});

test("admin sidebar active state distinguishes Overview from Schedule", () => {
  assert.equal(isDashboardNavigationActive("/dashboard/admin/schedule", ADMIN_SCHEDULE_HREF), true);
  assert.equal(isDashboardNavigationActive("/dashboard/admin/schedule", "/dashboard/admin"), false);
  assert.equal(isDashboardNavigationActive("/dashboard/admin", "/dashboard/admin"), true);
  assert.equal(isDashboardNavigationActive("/dashboard/admin", ADMIN_SCHEDULE_HREF), false);
});

test("only admins receive a Mentor Directory entry into assignment scheduling", () => {
  assert.deepEqual(mentorDirectoryScheduleEntry("admin"), {
    href: "/dashboard/admin/schedule",
    label: "Assign mentors",
  });
  assert.equal(mentorDirectoryScheduleEntry("startup"), null);
  assert.equal(mentorDirectoryScheduleEntry("mentor"), null);
  assert.equal(mentorDirectoryScheduleEntry(null), null);
});
