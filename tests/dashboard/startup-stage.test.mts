import assert from "node:assert/strict";
import test from "node:test";

import { STARTUP_STAGES, isStartupStage, startupStageOrDefault } from "../../src/program/startup-stage.ts";

test("startup stages include pilot and fundraising while preserving existing values", () => {
  assert.deepEqual(STARTUP_STAGES.map((stage) => stage.value), ["idea", "mvp", "pilot", "growth", "fundraising"]);
  assert.deepEqual(STARTUP_STAGES.map((stage) => stage.label), ["Idea", "MVP", "Pilot", "Growth", "Fundraising"]);
  for (const stage of STARTUP_STAGES) {
    assert.equal(isStartupStage(stage.value), true);
    assert.equal(startupStageOrDefault(stage.value), stage.value);
  }
  assert.equal(isStartupStage("seed"), true);
  assert.equal(isStartupStage("series_a"), true);
  assert.equal(isStartupStage(null), false);
  assert.equal(startupStageOrDefault(null), "mvp");
});

test("custom stage is one short tag, preserving existing and custom values", () => {
  assert.equal(isStartupStage("Pivoting"), true);
  assert.equal(startupStageOrDefault("Building a pilot"), "building a pilot");
  for (const value of ["", "   ", "raising,building", "one\ntwo", "a".repeat(41), ["idea", "mvp"]]) {
    assert.equal(isStartupStage(value), false);
  }
});
