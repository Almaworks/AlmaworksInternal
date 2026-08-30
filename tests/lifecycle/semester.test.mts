import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransitionMembership,
  canTransitionSemester,
  transitionMembership,
  transitionSemester,
} from "../../src/lifecycle/semester.ts";

test("semester lifecycle only permits forward operational transitions", () => {
  assert.equal(canTransitionSemester("draft", "active"), true);
  assert.equal(canTransitionSemester("active", "closed"), true);
  assert.equal(canTransitionSemester("closed", "archived"), true);
  assert.equal(canTransitionSemester("active", "draft"), false);
  assert.equal(canTransitionSemester("archived", "active"), false);
});

test("invalid semester transitions fail with a useful domain error", () => {
  assert.throws(
    () => transitionSemester("closed", "active"),
    /Cannot transition semester from closed to active/,
  );
});

test("membership lifecycle supports onboarding and administrative suspension", () => {
  assert.equal(canTransitionMembership("invited", "onboarding"), true);
  assert.equal(canTransitionMembership("onboarding", "active"), true);
  assert.equal(canTransitionMembership("active", "alumni"), true);
  assert.equal(canTransitionMembership("active", "suspended"), true);
  assert.equal(canTransitionMembership("suspended", "active"), true);
  assert.equal(canTransitionMembership("alumni", "active"), false);
  assert.throws(
    () => transitionMembership("alumni", "active"),
    /Cannot transition membership from alumni to active/,
  );
});
