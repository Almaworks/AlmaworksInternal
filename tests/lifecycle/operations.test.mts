import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOperationsSummary,
  filterRosterMembers,
  type OperationsMember,
} from "../../src/lifecycle/operations.ts";

const members: OperationsMember[] = [
  {
    id: "1",
    name: "Maya Chen",
    email: "maya@example.com",
    role: "startup",
    organization: "Lumen Health",
    membershipStatus: "active",
    invitationStatus: "accepted",
    onboardingPercent: 100,
  },
  {
    id: "2",
    name: "Owen Brooks",
    email: "owen@example.com",
    role: "mentor",
    organization: "Northstar Labs",
    membershipStatus: "onboarding",
    invitationStatus: "accepted",
    onboardingPercent: 75,
  },
  {
    id: "3",
    name: "Nia Patel",
    email: "nia@example.com",
    role: "mentor",
    organization: "Independent",
    membershipStatus: "invited",
    invitationStatus: "failed",
    onboardingPercent: 0,
  },
];

test("operations summary exposes actionable cohort counts", () => {
  assert.deepEqual(buildOperationsSummary(members), {
    total: 3,
    active: 1,
    onboarding: 1,
    invited: 1,
    alumni: 0,
    suspended: 0,
    readyPercent: 33,
    deliveryFailures: 1,
  });
});

test("roster filters combine search, role, and attention state", () => {
  assert.deepEqual(
    filterRosterMembers(members, { search: "north", role: "mentor", attentionOnly: false }).map(
      (member) => member.id,
    ),
    ["2"],
  );
  assert.deepEqual(
    filterRosterMembers(members, { search: "", role: "all", attentionOnly: true }).map(
      (member) => member.id,
    ),
    ["2", "3"],
  );
});
