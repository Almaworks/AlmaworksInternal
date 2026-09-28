import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCohortOptions,
  filterCohortMembers,
  parseBulkLifecycleRequest,
  parseCohortScope,
  parseImportMembershipsRequest,
  type CohortMember,
} from "../../src/lifecycle/cohort-management.ts";

const semesters = [
  { id: "spring-2026", name: "Spring 2026", startsOn: "2026-01-20", isActive: true },
  { id: "fall-2025", name: "Fall 2025", startsOn: "2025-08-20", isActive: false },
  { id: "spring-2025", name: "Spring 2025", startsOn: "2025-01-20", isActive: false },
];

const members: CohortMember[] = [
  { membershipId: "membership-1", profileId: "profile-1", name: "Ada Founder", email: "ada@example.com", role: "startup", status: "active", readinessStatus: "ready", semesterId: "spring-2026", semesterName: "Spring 2026" },
  { membershipId: "membership-2", profileId: "profile-2", name: "Grace Mentor", email: "grace@example.com", role: "mentor", status: "alumni", readinessStatus: "ready", semesterId: "fall-2025", semesterName: "Fall 2025" },
];

test("cohort options identify current and immediately previous cohorts", () => {
  assert.deepEqual(buildCohortOptions(semesters), {
    current: semesters[0],
    previous: semesters[1],
    all: semesters,
  });
});

test("all-time scope requires explicit confirmation and remains mutation-disabled", () => {
  assert.deepEqual(parseCohortScope("all", false), {
    kind: "confirmation_required",
    warning: "All-time view loads every cohort and may take longer.",
  });
  assert.deepEqual(parseCohortScope("all", true), {
    kind: "all_time",
    semesterId: null,
    canMutate: false,
  });
  assert.deepEqual(parseCohortScope("spring-2026", false), {
    kind: "semester",
    semesterId: "spring-2026",
    canMutate: true,
  });
});

test("cohort member filtering keeps scope, search, role, and activity aligned", () => {
  assert.deepEqual(
    filterCohortMembers(members, {
      semesterId: "fall-2025",
      search: "grace",
      role: "mentor",
      activity: "inactive",
    }).map((member) => member.membershipId),
    ["membership-2"],
  );
});

test("bulk lifecycle parser rejects duplicates, empty selections, and all-time mutations", () => {
  assert.throws(
    () => parseBulkLifecycleRequest({ semesterId: null, membershipIds: ["one"], activity: "active" }),
    /specific semester/i,
  );
  assert.throws(
    () => parseBulkLifecycleRequest({ semesterId: "spring-2026", membershipIds: [], activity: "active" }),
    /between 1 and 200/i,
  );
  assert.deepEqual(
    parseBulkLifecycleRequest({ semesterId: "spring-2026", membershipIds: ["one", "one", "two"], activity: "inactive" }),
    { semesterId: "spring-2026", membershipIds: ["one", "two"], activity: "inactive" },
  );
});

test("prior-cohort import parser supports selected and filtered bulk imports", () => {
  assert.deepEqual(
    parseImportMembershipsRequest({ sourceSemesterId: "fall-2025", targetSemesterId: "spring-2026", membershipIds: ["one", "two", "one"] }),
    { sourceSemesterId: "fall-2025", targetSemesterId: "spring-2026", membershipIds: ["one", "two"] },
  );
  assert.deepEqual(
    parseImportMembershipsRequest({ sourceSemesterId: "fall-2025", targetSemesterId: "spring-2026", membershipIds: null }),
    { sourceSemesterId: "fall-2025", targetSemesterId: "spring-2026", membershipIds: null },
  );
  assert.throws(
    () => parseImportMembershipsRequest({ sourceSemesterId: "spring-2026", targetSemesterId: "spring-2026", membershipIds: null }),
    /must differ/i,
  );
});

test("import destination follows a newly active semester instead of Fall 2026 or latest dates", () => {
  const rows = [
    { id: "future", name: "Fall 2028", startsOn: "2028-09-01", isActive: false },
    { id: "active", name: "Spring 2027", startsOn: "2027-01-01", isActive: true },
    { id: "prior", name: "Fall 2026", startsOn: "2026-09-01", isActive: false },
  ];
  assert.equal(buildCohortOptions(rows).current?.id, "active");
});
