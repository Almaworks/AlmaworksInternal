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
  assert.ok(plan.postCutover.includes("20260902030551_session_rsvps.sql"));
  assert.ok(plan.postCutover.includes("20260902034219_session_rsvp_participant_visibility.sql"));
  assert.ok(plan.postCutover.includes("20260902034521_member_login_account_commands.sql"));
  assert.ok(plan.postCutover.includes("20260902041550_secure_member_login_account_commands.sql"));
  assert.ok(plan.postCutover.includes("20260902043712_discard_replacement_auth_placeholder.sql"));
  assert.ok(plan.postCutover.includes("20260902055206_reject_zero_membership_login_commands.sql"));
  assert.ok(plan.postCutover.includes("20260902140432_allow_authenticated_audit_read.sql"));
  assert.ok(plan.postCutover.includes("20260903182031_startup_deletion.sql"));
  assert.ok(plan.postCutover.includes("20260903183512_platform_super_admin_management.sql"));
  assert.ok(plan.postCutover.includes("20260903210349_allow_mentor_company_self_service_update.sql"));
  assert.ok(plan.postCutover.includes("20260903210745_allow_invited_mentor_onboarding_saves.sql"));
  assert.ok(plan.postCutover.includes("20260903211233_allow_invited_mentor_semester_readiness_updates.sql"));
  assert.ok(plan.postCutover.includes("20260905221051_onboarding_meeting_visibility.sql"));
  assert.ok(plan.postCutover.includes("20260906160236_remove_preferred_expertise.sql"));
  assert.ok(plan.postCutover.includes("20260906160526_restore_startup_rpc_compatibility.sql"));
  assert.ok(plan.postCutover.includes("20260914164349_accepted_booking_request_composite_key.sql"));
  assert.ok(plan.postCutover.includes("20260914164611_accepted_booking_occupancy.sql"));
  assert.ok(plan.postCutover.includes("20260920195104_friday_speaker_removal.sql"));
  assert.ok(plan.postCutover.includes("20260926183855_registration_rejection.sql"));
  assert.ok(plan.postCutover.includes("20260926183935_startup_stage_pilot_fundraising.sql"));
  assert.ok(plan.postCutover.includes("20260926204636_friday_week_cancellation.sql"));
  assert.ok(plan.postCutover.includes("20260926204750_startup_profile_edit_access.sql"));
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
