import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeMigrationDeploymentPlan,
  inspectMigrationDeploymentPlan,
} from "../../scripts/check-database-migration-safety.mjs";

test("active migrations separate the local replay baseline, cutovers, and reviewed post-cutover repairs", () => {
  const plan = inspectMigrationDeploymentPlan();

  assert.equal(plan.preCutover.length, 3);
  assert.equal(plan.localReplayOnly.length, 1);
  assert.equal(plan.deployable.length, 2);
  assert.ok(plan.postCutover.includes("20260901215752_archive_outreach_contacts.sql"));
  assert.ok(plan.postCutover.includes("20260901220211_exclude_archived_outreach_carry_forward.sql"));
  assert.ok(plan.postCutover.includes("20260902034521_member_login_account_commands.sql"));
  assert.deepEqual(plan.unknown, []);
  assert.match(plan.localReplayOnly[0], /production_baseline_local_replay_only\.sql$/u);
  assert.ok(plan.preCutover.every((migration) => migration < plan.localReplayOnly[0]));
  assert.match(plan.deployable[0], /database_hardening_cutover_stage_a\.sql$/u);
  assert.match(plan.deployable[1], /database_hardening_cutover_stage_b\.sql$/u);
  assert.ok(plan.localReplayOnly[0] < plan.deployable[0]);
  assert.ok(plan.deployable[0] < plan.deployable[1]);
  assert.ok(plan.postCutover.every((migration) => plan.deployable[1] < migration));
  assert.deepEqual(assertSafeMigrationDeploymentPlan(plan), plan);
});

test("migration safety rejects unknown files and a reversed cutover order", () => {
  assert.throws(
    () => assertSafeMigrationDeploymentPlan({
      preCutover: [],
      localReplayOnly: ["20260901_production_baseline_local_replay_only.sql"],
      deployable: [
        "20260902_database_hardening_cutover_stage_b.sql",
        "20260903_database_hardening_cutover_stage_a.sql",
      ],
      postCutover: [],
      unknown: [],
    }),
    /Unsafe migration deployment plan/u,
  );
  assert.throws(
    () => assertSafeMigrationDeploymentPlan({
      preCutover: [],
      localReplayOnly: ["20260901_production_baseline_local_replay_only.sql"],
      deployable: [
        "20260902_database_hardening_cutover_stage_a.sql",
        "20260903_database_hardening_cutover_stage_b.sql",
      ],
      postCutover: [],
      unknown: ["20260904_accidental.sql"],
    }),
    /Unsafe migration deployment plan/u,
  );
});
