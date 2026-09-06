import assert from "node:assert/strict";
import test from "node:test";

import { needsParticipantOnboarding } from "../../src/auth/participant-onboarding-gate.ts";

test("ready participants can enter the dashboard while awaiting administrator activation", () => {
  assert.equal(needsParticipantOnboarding("onboarding", "ready"), false);
});

test("participants without completed role setup remain in onboarding", () => {
  assert.equal(needsParticipantOnboarding("invited", "not_started"), true);
  assert.equal(needsParticipantOnboarding("onboarding", "in_progress"), true);
  assert.equal(needsParticipantOnboarding("onboarding", null), true);
});

test("activated and historical memberships do not re-enter onboarding", () => {
  assert.equal(needsParticipantOnboarding("active", null), false);
  assert.equal(needsParticipantOnboarding("alumni", null), false);
  assert.equal(needsParticipantOnboarding("suspended", null), false);
});
