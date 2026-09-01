import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeMigrationDeploymentPlan,
  inspectMigrationDeploymentPlan,
} from "../../scripts/check-database-migration-safety.mjs";

test("active migrations separate the local replay baseline from deployable cutovers", () => {
  const plan = inspectMigrationDeploymentPlan();

  assert.equal(plan.localReplayOnly.length, 1);
  assert.equal(plan.deployable.length, 2);
  assert.deepEqual(plan.unknown, []);
  assert.match(plan.localReplayOnly[0], /production_baseline_local_replay_only\.sql$/u);
  assert.match(plan.deployable[0], /database_hardening_cutover_stage_a\.sql$/u);
  assert.match(plan.deployable[1], /database_hardening_cutover_stage_b\.sql$/u);
  assert.ok(plan.localReplayOnly[0] < plan.deployable[0]);
  assert.ok(plan.deployable[0] < plan.deployable[1]);
  assert.deepEqual(assertSafeMigrationDeploymentPlan(plan), plan);
});

test("migration safety rejects unknown files and a reversed cutover order", () => {
  assert.throws(
    () => assertSafeMigrationDeploymentPlan({
      localReplayOnly: ["20260901_production_baseline_local_replay_only.sql"],
      deployable: [
        "20260902_database_hardening_cutover_stage_b.sql",
        "20260903_database_hardening_cutover_stage_a.sql",
      ],
      unknown: [],
    }),
    /Unsafe migration deployment plan/u,
  );
  assert.throws(
    () => assertSafeMigrationDeploymentPlan({
      localReplayOnly: ["20260901_production_baseline_local_replay_only.sql"],
      deployable: [
        "20260902_database_hardening_cutover_stage_a.sql",
        "20260903_database_hardening_cutover_stage_b.sql",
      ],
      unknown: ["20260904_accidental.sql"],
    }),
    /Unsafe migration deployment plan/u,
  );
});
