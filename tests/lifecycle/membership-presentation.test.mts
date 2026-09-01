import assert from "node:assert/strict";
import test from "node:test";

import {
  filterMembershipsByVisibility,
  membershipPresentation,
  membershipPresentationState,
  resolveBulkMembershipAction,
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

test("membership visibility retains all canonical statuses or only active memberships", () => {
  const memberships = [
    { id: "invited", status: "invited" as const },
    { id: "onboarding", status: "onboarding" as const, readinessStatus: "in_progress" as const },
    { id: "active", status: "active" as const },
    { id: "alumni", status: "alumni" as const },
    { id: "suspended", status: "suspended" as const },
  ];

  assert.deepEqual(
    filterMembershipsByVisibility(memberships, "all").map((member) => member.status),
    ["invited", "onboarding", "active", "alumni", "suspended"],
  );
  assert.deepEqual(
    filterMembershipsByVisibility(memberships, "active").map((member) => member.status),
    ["active"],
  );
});

test("bulk membership action is available only for homogeneous actionable selections", () => {
  assert.equal(resolveBulkMembershipAction([
    { status: "onboarding", readinessStatus: "ready" },
    { status: "onboarding", readinessStatus: "ready" },
  ]), "activate");
  assert.equal(resolveBulkMembershipAction([
    { status: "active", readinessStatus: "ready" },
    { status: "active", readinessStatus: null },
  ]), "suspend");
  assert.equal(resolveBulkMembershipAction([
    { status: "suspended", readinessStatus: "ready" },
  ]), "restore");
  assert.equal(resolveBulkMembershipAction([
    { status: "onboarding", readinessStatus: "ready" },
    { status: "active", readinessStatus: "ready" },
  ]), null);
  assert.equal(resolveBulkMembershipAction([
    { status: "invited", readinessStatus: null },
  ]), null);
  assert.equal(resolveBulkMembershipAction([]), null);
});
