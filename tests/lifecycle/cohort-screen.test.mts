import assert from "node:assert/strict";
import test from "node:test";

import {
  filterRecordsForCohort,
  membershipsForRecord,
  membershipIdsForRecords,
  roleForProfileInSemester,
  type CohortRecordReference,
} from "../../src/lifecycle/cohort-screen.ts";
import type { CohortMember } from "../../src/lifecycle/cohort-management.ts";

const memberships: CohortMember[] = [
  { membershipId: "current-mentor", profileId: "profile-1", name: "Ada", email: "ADA@example.com", role: "mentor", status: "active", readinessStatus: "ready", semesterId: "spring-2026", semesterName: "Spring 2026" },
  { membershipId: "prior-mentor", profileId: "profile-1", name: "Ada", email: "ada@example.com", role: "mentor", status: "alumni", readinessStatus: "ready", semesterId: "fall-2025", semesterName: "Fall 2025" },
  { membershipId: "current-startup", profileId: "profile-2", name: "Beta", email: "beta@example.com", role: "startup", status: "active", readinessStatus: "ready", semesterId: "spring-2026", semesterName: "Spring 2026" },
];

const records: CohortRecordReference[] = [
  { recordId: "mentor-current", email: "ada@example.com", semesterId: "spring-2026" },
  { recordId: "mentor-prior", email: "ADA@EXAMPLE.COM", semesterId: "fall-2025" },
  { recordId: "startup-current", profileId: "profile-2", email: null, semesterId: "spring-2026" },
  { recordId: "unlinked", email: "prospect@example.com", semesterId: "spring-2026" },
];

test("screen records follow the selected cohort and role and exclude unlinked records", () => {
  assert.deepEqual(
    filterRecordsForCohort(records, memberships, { semesterId: "fall-2025", role: "mentor" }).map((record) => record.recordId),
    ["mentor-prior"],
  );
  assert.deepEqual(
    filterRecordsForCohort(records, memberships, { semesterId: null, role: "mentor" }).map((record) => record.recordId),
    ["mentor-current", "mentor-prior"],
  );
});

test("filtered multi-select resolves only memberships represented by visible records", () => {
  assert.deepEqual(
    membershipIdsForRecords([records[0], records[3]], memberships, { semesterId: "spring-2026", role: "mentor" }),
    ["current-mentor"],
  );
  assert.deepEqual(
    membershipIdsForRecords([records[1], records[0]], memberships, { semesterId: "fall-2025", role: "mentor" }),
    ["prior-mentor"],
  );
});

test("a screen row resolves the membership status for its exact cohort", () => {
  assert.deepEqual(
    membershipsForRecord(records[1], memberships, { semesterId: "fall-2025", role: "mentor" }).map((member) => member.status),
    ["alumni"],
  );
});

test("member editing resolves the role from the selected semester instead of another active history row", () => {
  const roleHistory: CohortMember[] = [
    ...memberships,
    { membershipId: "prior-admin", profileId: "profile-2", name: "Beta", email: "beta@example.com", role: "admin", status: "active", readinessStatus: null, semesterId: "fall-2025", semesterName: "Fall 2025" },
  ];
  assert.equal(roleForProfileInSemester(roleHistory, "profile-2", "spring-2026"), "startup");
  assert.equal(roleForProfileInSemester(roleHistory, "profile-2", "fall-2025"), "admin");
  assert.equal(roleForProfileInSemester(roleHistory, "profile-2", null), null);
});
