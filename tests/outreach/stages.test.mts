import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransitionOutreachStage,
  isOpenOutreachStage,
  transitionOutreachStage,
} from "../../src/outreach/stages.ts";

test("outreach stages allow the expected forward transitions", () => {
  assert.equal(canTransitionOutreachStage("prospect", "researching"), true);
  assert.equal(canTransitionOutreachStage("contacted", "responded"), true);
  assert.equal(canTransitionOutreachStage("responded", "meeting"), true);
  assert.equal(canTransitionOutreachStage("meeting", "converted"), true);
  assert.equal(canTransitionOutreachStage("converted", "contacted"), false);
});

test("outreach stages distinguish open work and reject terminal transitions", () => {
  assert.equal(isOpenOutreachStage("nurture"), true);
  assert.equal(isOpenOutreachStage("closed"), false);
  assert.throws(
    () => transitionOutreachStage("closed", "contacted"),
    /Cannot transition outreach/,
  );
});
