import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransitionOutreachStage,
  isOpenOutreachStage,
  transitionOutreachStage,
} from "../../src/outreach/stages.ts";

test("outreach stages allow the expected forward transitions", () => {
  assert.equal(canTransitionOutreachStage("not_contacted", "researching"), true);
  assert.equal(canTransitionOutreachStage("contacted", "replied"), true);
  assert.equal(canTransitionOutreachStage("replied", "conversation_scheduled"), true);
  assert.equal(canTransitionOutreachStage("conversation_scheduled", "ready"), true);
  assert.equal(canTransitionOutreachStage("closed", "contacted"), false);
});

test("outreach stages distinguish open work and reject terminal transitions", () => {
  assert.equal(isOpenOutreachStage("contacted"), true);
  assert.equal(isOpenOutreachStage("closed"), false);
  assert.throws(
    () => transitionOutreachStage("closed", "contacted"),
    /Cannot transition outreach/,
  );
});
