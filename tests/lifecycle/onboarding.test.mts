import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOnboardingWrites,
  calculateOnboardingProgress,
  getOnboardingChecklist,
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
    expertise: "Sales, Growth",
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

test("administrators receive an operations-specific checklist", () => {
  const checklist = getOnboardingChecklist("admin");
  assert.deepEqual(
    checklist.filter((item) => item.required).map((item) => item.key),
    ["identity", "admin_scope"],
  );
});
