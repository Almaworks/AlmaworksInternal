import assert from "node:assert/strict";
import test from "node:test";

import { needsParticipantOnboarding } from "../../src/auth/participant-onboarding-gate.ts";

test("a new teammate must onboard even when their shared startup is ready", () => {
  assert.equal(needsParticipantOnboarding("onboarding", null), true);
  assert.equal(needsParticipantOnboarding("invited", null), true);
});

test("shared readiness and partial drafts cannot establish member completion", () => {
  assert.equal(needsParticipantOnboarding("invited", "ready"), true);
  assert.equal(needsParticipantOnboarding("onboarding", "ready"), true);
  assert.equal(needsParticipantOnboarding("onboarding", ""), true);
  assert.equal(needsParticipantOnboarding("onboarding", null), true);
});

test("members who individually completed onboarding can reach their dashboard", () => {
  assert.equal(needsParticipantOnboarding("onboarding", "2026-10-09T04:53:36Z"), false);
});

test("activated and historical memberships do not re-enter onboarding", () => {
  assert.equal(needsParticipantOnboarding("active", null), false);
  assert.equal(needsParticipantOnboarding("alumni", null), false);
  assert.equal(needsParticipantOnboarding("suspended", null), false);
});
