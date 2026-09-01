import assert from "node:assert/strict";
import test from "node:test";

import {
  activationWorkspaceState,
  memberDeepLinkState,
} from "../../src/lifecycle/admin-membership-ui-state.ts";
import type { CohortMember } from "../../src/lifecycle/cohort-management.ts";

const members: CohortMember[] = [
  {
    membershipId: "current-ready",
    profileId: "current-profile",
    name: "Current Ready",
    email: "current@example.com",
    role: "mentor",
    status: "onboarding",
    readinessStatus: "ready",
    semesterId: "current-semester",
    semesterName: "Fall 2026",
  },
  {
    membershipId: "historical-ready",
    profileId: "historical-profile",
    name: "Historical Ready",
    email: "historical@example.com",
    role: "startup",
    status: "onboarding",
    readinessStatus: "ready",
    semesterId: "historical-semester",
    semesterName: "Spring 2026",
  },
];

test("activation workspace remains current-semester scoped across member cohort selections", () => {
  for (const selectedMemberScope of ["current-semester", "historical-semester", null]) {
    const selectedMembers = selectedMemberScope === null
      ? members
      : members.filter((member) => member.semesterId === selectedMemberScope);
    assert.ok(selectedMembers.length > 0);

    const workspace = activationWorkspaceState(members, "current-semester", 2);
    assert.deepEqual(workspace.readyMembers.map((member) => member.membershipId), ["current-ready"]);
    assert.equal(workspace.attentionCount, 3);
  }
});

test("member deep-link forces all visibility and clears an incompatible selection", () => {
  assert.deepEqual(memberDeepLinkState("alumni@example.com"), {
    search: "alumni@example.com",
    visibility: "all",
    selectedMembershipIds: [],
  });
  assert.equal(memberDeepLinkState(null), null);
});
