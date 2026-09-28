import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectRef = "layjdjfvxkowxidwuvbs";
const projectUrl = `https://${projectRef}.supabase.co`;
const jobName = "almaworks-calendar-worker-v1";
const schedule = "*/5 * * * *";
const quote = value => `'${value.replaceAll("'", "''")}'`;

/** Offline, credential-free deployment plan. No extensions, schemas or secrets are created.
 * @param {Readonly<Record<string, string | undefined>>} env
 */
export function calendarSchedulerPlan(env = process.env) {
  if (env.NEXT_PUBLIC_SUPABASE_URL !== projectUrl) throw new Error("Calendar scheduler project does not match the allowed Almaworks project.");
  if (env.CALENDAR_AVAILABILITY_ENABLED !== "true") throw new Error("Deploy and enable Calendar availability before scheduling.");
  if(env.CALENDAR_WORKER_TARGET && env.CALENDAR_WORKER_TARGET!=="supabase")throw new Error("Unsupported Calendar worker target.");
  const appOrigin=env.CALENDAR_WORKER_TARGET==="supabase"?projectUrl:env.CALENDAR_APP_ORIGIN;
  let origin;
  try { origin = new URL(appOrigin); } catch { throw new Error("A deployed Calendar application origin is required."); }
  if (origin.protocol !== "https:" || origin.origin !== appOrigin || origin.username || origin.password ||
      ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) throw new Error("Calendar scheduler requires a deployed HTTPS application origin.");

  // Read Vault at execution time, so rotation needs no cron command rewrite.
  // Pin the destination in the command: editing Vault cannot redirect its credential.
  const command = `do $calendar_worker$
declare app_origin text; worker_secret text; request_id bigint;
begin
  select decrypted_secret into strict app_origin from vault.decrypted_secrets
    where name = 'almaworks_calendar_app_origin';
  select decrypted_secret into strict worker_secret from vault.decrypted_secrets
    where name = 'almaworks_calendar_cron_secret';
  if app_origin is distinct from ${quote(origin.origin)} or worker_secret is null or length(worker_secret) < 32 then
    raise exception 'Calendar scheduler configuration is unavailable';
  end if;
  request_id := net.http_post(
    url := ${quote(`${origin.origin}${env.CALENDAR_WORKER_TARGET==="supabase"?"/functions/v1/calendar-worker":"/api/calendar/worker"}`)},
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || worker_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  );
  raise log 'Almaworks Calendar worker queued request %', request_id;
end
$calendar_worker$;`;
  return { projectRef, jobName, schedule, origin: origin.origin, command };
}

const prerequisites = `select
  exists(select 1 from pg_extension where extname = 'pg_cron')
  and exists(select 1 from pg_extension where extname = 'pg_net')
  and to_regclass('vault.decrypted_secrets') is not null
  and to_regclass('private.calendar_worker_identities') is not null
  and to_regprocedure('public.calendar_lease_sync_jobs(integer)') is not null
  and to_regprocedure('public.calendar_lease_hold_jobs(integer)') is not null
  and to_regprocedure('public.calendar_lease_disconnect_jobs(integer)') is not null
  as ready`;

/** Operator-only deployment helper. Default is offline; apply must be explicit.
 * @param {{env?: Readonly<Record<string, string | undefined>>, apply?: boolean, fetch?: typeof fetch}} options
 */
export async function installCalendarScheduler({ env = process.env, apply = false, fetch: fetcher = fetch } = {}) {
  const plan = calendarSchedulerPlan(env);
  if (!apply) return { ...plan, applied: false };
  if (!env.SUPABASE_ACCESS_TOKEN) throw new Error("A Supabase management credential is required for scheduler deployment.");

  const query = async (sql, parameters = [], readOnly = true) => {
    // Verify on every operation; never use CLI linkage or a caller-supplied API URL.
    if (env.NEXT_PUBLIC_SUPABASE_URL !== projectUrl) throw new Error("Calendar scheduler project mismatch.");
    try {
      const response = await fetcher(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: sql, parameters, read_only: readOnly }),
      });
      if (!response.ok) throw new Error("Management request failed");
      const result = await response.json();
      if (!Array.isArray(result)) throw new Error("Invalid management response");
      return result;
    } catch {
      // No automatic retries: a timed-out mutation may already have committed.
      throw new Error("Calendar scheduler request failed. Its outcome may be unknown; inspect the named job before retrying.");
    }
  };

  if ((await query(prerequisites))[0]?.ready !== true) throw new Error("Calendar scheduler database prerequisites are missing.");
  const ready = await query(`select
    (select count(*) = 1 from vault.decrypted_secrets where name = 'almaworks_calendar_app_origin' and decrypted_secret = $1)
    and (select count(*) = 1 from vault.decrypted_secrets where name = 'almaworks_calendar_cron_secret' and length(decrypted_secret) >= 32)
    and exists(select 1 from private.calendar_worker_identities where enabled)
    as ready`, [plan.origin], false);
  if (ready[0]?.ready !== true) throw new Error("Calendar scheduler Vault or worker prerequisites are missing.");

  // Same named job is idempotent, but refuse to overwrite an unrelated command.
  // This lock serializes this installer's concurrent runs through commit.
  const installed = await query(`with lock as materialized (
    select pg_advisory_xact_lock(hashtextextended($1, 0))
  )
  select cron.schedule($1, $2, $3) as job_id from lock
  where not exists(select 1 from cron.job where jobname = $1 and (username <> current_user or command <> $3))`,
  [jobName, schedule, plan.command], false);
  const jobId = installed[0]?.job_id;
  if (!Number.isSafeInteger(jobId) || jobId <= 0) throw new Error("Calendar scheduler installation did not return a job; check for a conflicting named job.");
  const verified = await query(`select jobid as job_id, active,
    (schedule = $2 and command = $3 and username = current_user) as matches
    from cron.job where jobname = $1 and jobid = $4`, [jobName, schedule, plan.command, jobId], false);
  if (verified.length !== 1 || verified[0].job_id !== jobId || verified[0].active !== true || verified[0].matches !== true) {
    throw new Error("Calendar scheduler verification failed; inspect the named job. Live execution is not proven.");
  }
  return { applied: true, projectRef, jobName, schedule, jobId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) {
    console.error("Usage: node scripts/calendar-scheduler.mjs [--apply]. Defaults to an offline plan.");
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(await installCalendarScheduler({ apply: args[0] === "--apply" }), null, 2)); }
    catch (error) { console.error(error instanceof Error ? error.message : "Calendar scheduler failed."); process.exitCode = 1; }
  }
}
