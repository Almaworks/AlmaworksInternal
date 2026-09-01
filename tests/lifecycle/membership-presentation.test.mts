import assert from "node:assert/strict";
import test from "node:test";

import {
  filterMembershipsByVisibility,
  membershipPresentation,
  membershipPresentationState,
} from "../../src/lifecycle/membership-presentation.ts";

const cases = [
  [{ status: "invited", readinessStatus: null }, "invited"],
  [{ status: "onboarding", readinessStatus: "not_started" }, "onboarding"],
  [{ status: "onboarding", readinessStatus: "in_progress" }, "onboarding"],
  [{ status: "onboarding", readinessStatus: "ready" }, "ready_for_activation"],
  [{ status: "active", readinessStatus: "ready" }, "active"],
  [{ status: "alumni", readinessStatus: "ready" }, "alumni"],
  [{ status: "suspended", readinessStatus: "ready" }, "suspended"],
] as const;

test("membership presentation state derives activation readiness only during onboarding", () => {
  for (const [input, expected] of cases) {
    assert.equal(membershipPresentationState(input), expected);
  }
});

test("membership presentation supplies lifecycle labels and actions", () => {
  assert.deepEqual(membershipPresentation({ status: "invited", readinessStatus: null }), {
    state: "invited",
    label: "Invited",
    tone: "neutral",
    action: null,
  });
  assert.deepEqual(membershipPresentation({ status: "onboarding", readinessStatus: "in_progress" }), {
    state: "onboarding",
    label: "Onboarding",
    tone: "progress",
    action: null,
  });
  assert.deepEqual(membershipPresentation({ status: "onboarding", readinessStatus: "ready" }), {
    state: "ready_for_activation",
    label: "Ready for activation",
    tone: "attention",
    action: "activate",
  });
  assert.deepEqual(membershipPresentation({ status: "active", readinessStatus: "ready" }), {
    state: "active",
    label: "Active",
    tone: "success",
    action: "suspend",
  });
  assert.deepEqual(membershipPresentation({ status: "alumni", readinessStatus: "ready" }), {
    state: "alumni",
    label: "Alumni",
    tone: "historical",
    action: null,
  });
  assert.deepEqual(membershipPresentation({ status: "suspended", readinessStatus: "ready" }), {
    state: "suspended",
    label: "Suspended",
    tone: "danger",
    action: "restore",
  });
});

test("membership visibility retains only canonical active memberships in active view", () => {
  const memberships = [
    { id: "invited", status: "invited" as const },
    { id: "ready", status: "onboarding" as const, readinessStatus: "ready" as const },
    { id: "active", status: "active" as const },
    { id: "alumni", status: "alumni" as const },
  ];

  assert.deepEqual(filterMembershipsByVisibility(memberships, "all"), memberships);
  assert.deepEqual(filterMembershipsByVisibility(memberships, "active"), [memberships[2]]);
});
