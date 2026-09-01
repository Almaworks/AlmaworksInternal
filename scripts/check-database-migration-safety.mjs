import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultMigrationDirectory = resolve(repositoryRoot, "supabase", "migrations");

export function inspectMigrationDeploymentPlan(migrationDirectory = defaultMigrationDirectory) {
  const migrations = readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const localReplayOnly = migrations.filter((name) =>
    name.endsWith("_production_baseline_local_replay_only.sql"),
  );
  const deployable = migrations.filter((name) =>
    /_database_hardening_cutover_stage_[ab]\.sql$/u.test(name),
  );
  const known = new Set([...localReplayOnly, ...deployable]);

  return {
    localReplayOnly,
    deployable,
    unknown: migrations.filter((name) => !known.has(name)),
  };
}

export function assertSafeMigrationDeploymentPlan(plan = inspectMigrationDeploymentPlan()) {
  if (
    plan.localReplayOnly.length !== 1
    || plan.deployable.length !== 2
    || plan.unknown.length !== 0
    || !plan.deployable[0].endsWith("_database_hardening_cutover_stage_a.sql")
    || !plan.deployable[1].endsWith("_database_hardening_cutover_stage_b.sql")
    || !(plan.localReplayOnly[0] < plan.deployable[0])
    || !(plan.deployable[0] < plan.deployable[1])
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
