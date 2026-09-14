import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultMigrationDirectory = resolve(repositoryRoot, "supabase", "migrations");
const reviewedPostCutoverMigrations = [
  "20260901205013_allow_mentor_profile_self_service_updates.sql",
  "20260901215752_archive_outreach_contacts.sql",
  "20260901220211_exclude_archived_outreach_carry_forward.sql",
  "20260901224356_mentor_account_access.sql",
  "20260902030551_session_rsvps.sql",
  "20260902034219_session_rsvp_participant_visibility.sql",
  "20260902034521_member_login_account_commands.sql",
  "20260902041550_secure_member_login_account_commands.sql",
  "20260902043712_discard_replacement_auth_placeholder.sql",
  "20260902055206_reject_zero_membership_login_commands.sql",
  "20260902140432_allow_authenticated_audit_read.sql",
  "20260903182031_startup_deletion.sql",
  "20260903183512_platform_super_admin_management.sql",
  "20260903210349_allow_mentor_company_self_service_update.sql",
  "20260903210745_allow_invited_mentor_onboarding_saves.sql",
  "20260903211233_allow_invited_mentor_semester_readiness_updates.sql",
  "20260905221051_onboarding_meeting_visibility.sql",
  "20260906160236_remove_preferred_expertise.sql",
  "20260906160526_restore_startup_rpc_compatibility.sql",
  "20260906221757_participant_notification_reads.sql",
  // Reviewed RLS replacement: drops and recreates four SELECT policies and
  // private.can_read_mentor_profile before installing the cohort-safe forms.
  "20260906223843_active_cohort_participant_network.sql",
  // Reviewed lifecycle hardening: limits draft creation, draft meeting
  // replacement, and semester activation to durable platform super admins.
  "20260906224257_restrict_semester_lifecycle_to_super_admin.sql",
  // Generated Friday program schema, RLS, immutable publication triggers,
  // and the separately generated function-permission correction.
  "20260909003419_friday_program.sql",
  "20260909003551_friday_program_permissions.sql",
  "20260909003833_friday_program_admin_roster.sql",
  // Generated independent booking extension, schema, guards, RLS, and grants.
  "20260909012650_mentor_booking_extension.sql",
  "20260909012850_independent_mentor_booking.sql",
  // Generated outreach email snapshots, provider receipts, RLS and invoker guards.
  "20260909025717_outreach_email.sql",
  // Generated profile photo column, path constraint, and narrow update grants.
  "20260909031829_profile_photos.sql",
  // Generated retirement of legacy Friday mentorship writes and timezone-safe
  // Friday rejection for independent mentor availability publication.
  "20260909235051_retire_friday_mentorship_scheduling.sql",
  // Generated retirement of the legacy Friday mentor-availability table and
  // its associated rows; Friday Program and independent bookings remain.
  "20260910040958_retire_legacy_friday_mentor_availability.sql",
  // Generated calendar-first booking migration; preserves historical requests
  // while replacing dated availability windows with weekly calendar ranges.
  "20260910204603_calendar_first_mentor_booking.sql",
  // Generated Friday-program replacement RPC plus narrow, admin-only RLS
  // privileges required to refresh a selected week's saved assignments.
  "20260911050456_friday_program_regeneration.sql",
  "20260911050723_friday_program_regeneration_access.sql",
  // Generated accepted-booking occupancy key and privacy-safe RLS relation;
  // the occupancy migration also includes the reviewed idempotent backfill.
  "20260914164349_accepted_booking_request_composite_key.sql",
  "20260914164611_accepted_booking_occupancy.sql",
];
const requiredOutreachArchiveMigrations = [
  "20260901215752_archive_outreach_contacts.sql",
  "20260901220211_exclude_archived_outreach_carry_forward.sql",
];

export function inspectMigrationDeploymentPlan(migrationDirectory = defaultMigrationDirectory) {
  const migrations = readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const localReplayOnly = migrations.filter((name) =>
    name.endsWith("_production_baseline_local_replay_only.sql"),
  );
  const preCutover = migrations.filter((name) =>
    /_(?:fix_mentor_provisioning_authorization|enforce_mentor_rpc_service_only|allow_existing_mentor_identity)\.sql$/u.test(name),
  );
  const deployable = migrations.filter((name) =>
    /_database_hardening_cutover_stage_[ab]\.sql$/u.test(name),
  );
  const postCutover = migrations.filter((name) =>
    reviewedPostCutoverMigrations.includes(name),
  );
  const known = new Set([...preCutover, ...localReplayOnly, ...deployable, ...postCutover]);

  return {
    preCutover,
    localReplayOnly,
    deployable,
    postCutover,
    unknown: migrations.filter((name) => !known.has(name)),
  };
}

export function assertSafeMigrationDeploymentPlan(plan = inspectMigrationDeploymentPlan()) {
  if (
    plan.preCutover.length !== 3
    || plan.localReplayOnly.length !== 1
    || plan.deployable.length !== 2
    || requiredOutreachArchiveMigrations.some((migration) => !plan.postCutover.includes(migration))
    || plan.unknown.length !== 0
    || !plan.deployable[0].endsWith("_database_hardening_cutover_stage_a.sql")
    || !plan.deployable[1].endsWith("_database_hardening_cutover_stage_b.sql")
    || !plan.preCutover.every((migration) => migration < plan.localReplayOnly[0])
    || !(plan.localReplayOnly[0] < plan.deployable[0])
    || !(plan.deployable[0] < plan.deployable[1])
    || !plan.postCutover.every((migration) => plan.deployable[1] < migration)
  ) {
    throw new Error(`Unsafe migration deployment plan: ${JSON.stringify(plan)}`);
  }
  return plan;
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const plan = assertSafeMigrationDeploymentPlan();
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}
