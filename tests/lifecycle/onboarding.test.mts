import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOnboardingWrites,
  calculateOnboardingProgress,
  getOnboardingChecklist,
  isRoleSetupSaveConfirmed,
  onboardingPreparationError,
  selectActiveOnboardingMembership,
  startupAssignmentPreparationError,
} from "../../src/lifecycle/onboarding.ts";

test("startup essentials are short, ordered, and readiness-gated", () => {
  const checklist = getOnboardingChecklist("startup");

  assert.deepEqual(
    checklist.filter((item) => item.required).map((item) => item.key),
    ["identity", "company_snapshot", "team_contacts", "availability"],
  );
  assert.equal(checklist.some((item) => item.key === "company_links" && !item.required), true);

  const progress = calculateOnboardingProgress(
    "startup",
    new Set(["identity", "company_snapshot", "team_contacts"]),
  );
  assert.equal(progress.ready, false);
  assert.equal(progress.required.completed, 3);
  assert.equal(progress.required.total, 4);
  assert.equal(progress.next?.key, "availability");
});

test("participant onboarding produces only RLS-owned profile writes", () => {
  assert.deepEqual(buildOnboardingWrites({
    role: "mentor",
    name: " Maya Chen ",
    organization: " Helio ",
    description: " Revenue mentor ",
    expertise: ["Sales", "Growth"],
    teamContact: "",
    finalize: true,
  }), {
    profile: { full_name: "Maya Chen" },
    mentorProfile: { company: "Helio", biography: "Revenue mentor", expertise_tags: ["Sales", "Growth"] },
    mentorSemester: { readiness_status: "ready" },
  });
});

test("mentor readiness ignores optional enrichment", () => {
  const progress = calculateOnboardingProgress(
    "mentor",
    new Set(["identity", "mentor_profile", "expertise", "availability"]),
  );

  assert.equal(progress.ready, true);
  assert.equal(progress.percent, 80);
  assert.equal(progress.next?.key, "profile_links");
});

test("final onboarding saves require a returned ready role record", () => {
  assert.equal(isRoleSetupSaveConfirmed({ readiness_status: "ready" }, true), true);
  assert.equal(isRoleSetupSaveConfirmed({ readiness_status: "in_progress" }, true), false);
  assert.equal(isRoleSetupSaveConfirmed(null, true), false);
  assert.equal(isRoleSetupSaveConfirmed({ readiness_status: "in_progress" }, false), true);
});

test("onboarding explains whether sign-in or cohort setup is missing", () => {
  assert.equal(onboardingPreparationError(false), "Your sign-in session has expired. Please sign in again.");
  assert.match(onboardingPreparationError(true), /connect your sign-in account to your current-cohort invitation/u);
  assert.match(startupAssignmentPreparationError(), /not yet been assigned to a startup/u);
});

test("onboarding selects the invited mentor membership for the active cohort", () => {
  const membership = selectActiveOnboardingMembership([
    { id: "older-startup", semesterId: "spring-2027", status: "invited", role: "startup" },
    { id: "fall-mentor", semesterId: "fall-2026", status: "invited", role: "mentor" },
  ], "fall-2026");

  assert.deepEqual(membership, {
    id: "fall-mentor",
    semesterId: "fall-2026",
    status: "invited",
    role: "mentor",
  });
});

test("administrators receive an operations-specific checklist", () => {
  const checklist = getOnboardingChecklist("admin");
  assert.deepEqual(
    checklist.filter((item) => item.required).map((item) => item.key),
    ["identity", "admin_scope"],
  );
});
