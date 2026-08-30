---
title: Outreach Data Migration Runbook
status: design
updated: 2026-08-17
related:
  - "[[specs/2026-08-17-outreach-crm-design]]"
---

# Outreach data migration

This runbook defines the operational safety gates for moving legacy outreach records into the unified CRM. Executable commands will be added with the generated migration and migration service.

## Gates

1. Export a point-in-time legacy row count and field-completeness report.
2. Generate a dry-run import job without mutating CRM records.
3. Resolve ambiguous contact, company, and owner matches.
4. Review exclusions and corrected staging values.
5. Commit the import idempotently using the reviewed job identifier.
6. Compare source and destination counts, sample records, activities, conversions, and owner assignments.
7. Keep legacy tables readable during the acceptance period.
8. Roll back by import provenance if acceptance fails.
9. Make legacy tables read-only only after sign-off.
10. Archive legacy tables in a separate migration after the rollback window.

Never combine migration commit, legacy deletion, and archival in one operation.

## Local Supabase baseline evidence

Baseline attempted 2026-08-17 (local only; no remote mutation). Docker Desktop 4.82.0 was started from the installed application. `docker version` reported client `29.6.1` and server engine `29.6.1`; `docker info --format '{{json .ServerVersion}}'` returned `"29.6.1"`.

The local Supabase CLI was `2.114.0`. `supabase/.temp/project-ref` was verified as `layjdjfvxkowxidwuvbs`, and the authorized read-only project lookup returned `layjdjfvxkowxidwuvbs` / `AlmaworksInternal` (`us-west-2`, `ACTIVE_HEALTHY`).

`npm.cmd exec supabase -- migration list` aligned all remote-applied timestamps, but found seven local-only historical migrations: `20260327000000`, `20260327000001`, `20260327000002`, `20260328000000`, `20260328000001`, `20260402000000`, and `20260407000000`. These files were preserved without modification.

`npm.cmd exec supabase -- start` began downloading the local Supabase image set but did not create any Supabase containers after the bounded verification window. Four images were available (`postgrest`, `gotrue`, `mailpit`, plus the pre-existing `postgres:17-alpine`), while the remaining pulls made no material progress. The stalled local-start process tree was stopped without stopping Docker Desktop or unrelated containers. Consequently, `npm.cmd exec supabase -- db reset` was not run; no migration replay result or local Studio/API URLs are available yet. Resume with `npm.cmd exec supabase -- start`, wait for all images/containers to become healthy, then run the reset before any schema work.

### Continuation: Docker content-store blocker and migration disposition

On 2026-08-17, one clean `npm.cmd exec supabase -- start` process was allowed to run for the full ten-minute command limit. It remained in image-pull subprocesses and did not create `supabase_db_AlmaworksInternal`. After stopping that exact process tree, `npm.cmd exec supabase -- status --output pretty` reported `failed to inspect container health: Error response from daemon: No such container: supabase_db_AlmaworksInternal`. Docker itself reported the concrete underlying error while listing images: `rpc error: code = Unknown desc = blob sha256:e9490aa503a5fb07d8e8c80da46e5c0c193894e583b59ed9077e74c4101ffae2 expected at /var/lib/desktop-containerd/daemon/io.containerd.content.v1.content/blobs/sha256/e9490aa503a5fb07d8e8c80da46e5c0c193894e583b59ed9077e74c4101ffae2: open ...: input/output error`. Docker engine version remained `29.6.1`; registry endpoint checks reached both Public ECR and GHCR. Repair the Docker Desktop content store through an approved Docker Desktop recovery workflow, then rerun the local start and reset. Do not purge Docker data without explicit approval.

The seven local-only migrations are true historical divergence, not pending local work: repository history shows they were added on other branches (`52258d1`, `cd227b2`, and `e51e687`), and each has a later remote-applied migration with the same named intent but different SQL. No migration was edited or repaired. After Docker recovery, run `npm.cmd exec supabase -- db reset` to obtain the actual local replay result; if it fails, use only an approved local Supabase CLI reconciliation after reviewing the failure. Remote `migration repair`, push, or apply remains out of scope.

### Continuation: one non-destructive Docker Desktop restart

One Docker Desktop-managed restart was attempted with `docker desktop restart`; it was allowed five minutes and returned no output before the command wrapper timed out. A following read-only `docker desktop status`, `docker version`, and `docker ps -a` health check also timed out after 64 seconds without output, so engine health did not return. No targeted pull was attempted, and no second `supabase start` was launched. The existing content-store blob I/O error cannot be confirmed cleared while the engine is unresponsive. The next recovery action likely to repair that store is Docker Desktop **Troubleshoot > Clean / Purge data**, which is destructive (images, containers, and other Docker data) and requires explicit user approval. Do not run it automatically.

### Continuation: approved WSL backend recovery

The approved non-destructive `wsl.exe --shutdown` completed successfully and Docker Desktop was relaunched. Docker engine health returned as `29.6.1`. The targeted recovery check, `docker pull public.ecr.aws/supabase/postgrest:v14.1`, succeeded and reported the formerly implicated digest `sha256:e9490aa503a5fb07d8e8c80da46e5c0c193894e583b59ed9077e74c4101ffae2` as up to date. One new long `npm.cmd exec supabase -- start` was then allowed its complete ten-minute limit. It progressed past image pulls but did not create a local database. Process inspection showed it was blocked on `docker create --name supabase_db_AlmaworksInternal ... public.ecr.aws/supabase/postgres:17.6.1.063`; Docker then returned `request returned 500 Internal Server Error for API route and version http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.55/version`. The exact start/create process tree was stopped. `db reset` was not run. No additional Docker recovery is authorized within this task; a user-approved Docker Desktop data repair is required before retrying.

### Continuation: approved Docker-local data purge handoff

The user approved Docker Desktop Clean/Purge local data, including the observed Dormplan local Docker environment. Best-effort inventory was attempted first with `docker version`, `docker ps -a`, and `docker volume ls`, but Docker immediately returned the same named-pipe `500 Internal Server Error`; therefore no reliable final inventory of containers or named volumes was available. The installed Docker Desktop CLI (`docker desktop --help`) exposes start, stop, restart, status, diagnostics, logs, engine, Kubernetes, and update commands, but no Clean/Purge command. The installed `DockerCli.exe -h` likewise exposes only shared-drive, shutdown, and engine-switch operations. The supported remaining operation is Docker Desktop UI: **Troubleshoot > Clean / Purge data**. Windows app automation was unavailable in this session before UI navigation (`EPERM: operation not permitted, lstat 'C:\Users\lkrah\AppData\Local\OpenAI\Codex'`), so the purge was not executed. It must be completed manually in the Docker Desktop UI; it irrecoverably removes all Docker-local containers, images, volumes, and caches, but does not delete repository files or WSL distributions. After confirmation, restart Docker Desktop, wait for engine health, then resume the one local Supabase start and reset sequence.

### Final continuation: fresh Docker recovery and local start result

Controller recovery stopped stale Docker Desktop processes, shut down WSL, and started a clean Docker Desktop instance. Docker Desktop reported `running` and client/server were both `29.6.1`. The attempted GUI cleanup did **not** remove the observed Dormplan data: `dormplan-postgres-1` and named volumes `dormplan-drp-46-local-mvp_postgres_data` and `dormplan_postgres_data` remain. No further purge was needed or performed.

Exactly one fresh `npm.cmd exec supabase -- start` then ran. It reached the database health check but failed with `LegacyHealthCheckTimeoutError`: `supabase_db_AlmaworksInternal container is not ready: unhealthy`. Supported CLI diagnostics identified the cause: `public.ecr.aws/supabase/postgres:17.6.1.063 could not be executed ("exec format error")`; container logs repeatedly reported `exec /usr/bin/sh: exec format error`. The CLI automatically stopped its Supabase containers. `npm.cmd exec supabase -- db reset` was not run because no usable local database exists. The CLI suggests deleting the cached Postgres image and retrying, but that image deletion and another start are outside this task's approved one-start, non-destructive scope. No migration was edited or reconciled.

### Final continuation: approved exact-image replacement

The user subsequently approved deletion of the invalid cached Supabase Postgres image. Before deletion, `public.ecr.aws/supabase/postgres:17.6.1.063` was verified as image ID/digest `sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426`, `linux/amd64`, with no container consumers. Dormplan remained separately scoped to `postgres:17-alpine` and its two existing volumes. Only that Supabase image was removed, then the same tag was re-pulled successfully; the upstream returned the same `linux/amd64` digest and image ID.

One fresh start after the replacement again failed after 134.9 seconds with the same `LegacyHealthCheckTimeoutError` and repeated `exec /usr/bin/sh: exec format error` from `supabase_db_AlmaworksInternal`. Read-only confirmation showed the Docker engine is `linux/amd64`/`x86_64` and the re-pulled image is also `linux/amd64`, so the reported failure is reproducible despite matching architecture and a fresh pull. The CLI automatically stopped its Supabase containers. No Supabase database container remained, `db reset` was not run, and the Dormplan container/volumes remained unchanged. No further image deletion, Docker purge, migration edit, or remote operation was performed.

### Diagnostic continuation: runtime versus image

An auto-removed, official runtime probe succeeded: `docker run --rm --platform linux/amd64 alpine:3.20 /bin/sh -c 'echo alpine-ok; uname -m'` reported `alpine-ok` and `x86_64`. Docker reports `linux/amd64` and `EngineArchitecture=x86_64`. This rules out a general Docker/WSL amd64 execution failure and no Windows reboot is indicated by this probe. Non-executing inspection of `public.ecr.aws/supabase/postgres:17.6.1.063` reports `linux/amd64`, entrypoint `docker-entrypoint.sh`, command `postgres -D /etc/postgresql`, and build history that uses `/bin/sh`; it does not explain the runtime's `/usr/bin/sh` exec-format failure. The narrow next diagnostic is one auto-removed direct shell probe of that exact image (`docker run --rm --platform linux/amd64 --entrypoint /usr/bin/sh public.ecr.aws/supabase/postgres:17.6.1.063 -c 'uname -m'`) to isolate the executable path from Supabase CLI setup. Do not retry Supabase start or reset until that probe is reviewed.

### Final diagnostic: direct image-shell failure

The direct auto-removed shell probe failed immediately with `exec /usr/bin/sh: exec format error`, proving the fault is reproducible independently of Supabase CLI setup. A stopped transient inspection container was used without starting it. `docker cp` revealed `/usr/bin/sh` is a symlink to `dash`; copying the symlink itself to Windows was blocked by the host's symlink privilege, but copying its `/usr/bin/dash` target succeeded with a zero-byte host file (`SHA256 E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`, empty header). Both transient inspection containers were removed. This is image-payload materialization failure, not general Docker/WSL execution.

Local metadata shows the project pins `supabase@2.114.0` (installed version 2.114.0) and `supabase/config.toml` declares `db.major_version = 17`; the current CLI selects `public.ecr.aws/supabase/postgres:17.6.1.063`. The supported narrow next path is an approved Supabase CLI/image release change that selects a different Postgres 17 image, followed by a local start/reset validation. Do not change migrations, alter the remote project, or retry the same known-bad image.

### Final continuation: Supabase CLI 2.115.0

The project-pinned CLI was upgraded with `npm.cmd install --save-dev supabase@2.115.0`; `npm.cmd exec supabase -- --version` and `npm.cmd ls` both report `2.115.0`. This changed only `package.json` and `package-lock.json` for the dependency update. A clean local start with CLI 2.115.0 pulled newer Realtime (`v2.129.0`), Studio (`2026.08.17-sha-0c1da8f`), and Postgres Meta (`v0.98.0`) images, but it still selected the same cached Postgres image `public.ecr.aws/supabase/postgres:17.6.1.063`. While starting the database, its bundled Bun runtime crashed with `panic(main thread): Failed to start HTTP Client thread: Unexpected` and the CLI reported a Bun crash. The database container left behind was restarting; its logs repeated `exec /usr/bin/sh: exec format error`. Only that transient `supabase_db_AlmaworksInternal` container was removed. Its `supabase_db_AlmaworksInternal` named volume was preserved; Dormplan's `dormplan-postgres-1` container and two named volumes remain unchanged. `db reset` was not run. The approved CLI release change therefore does not select a different Postgres image or unblock the local baseline; no migration or remote project state was changed.

### Final continuation: documented Postgres-version marker

The documented local marker `supabase/.temp/postgres-version` was added with exact value `17.6.1.134`. `npm.cmd exec supabase -- stop --all --no-backup` stopped the local Supabase setup and removed its transient volume; Dormplan's container and volumes were verified unchanged before and after. The marker-driven CLI 2.115.0 start pulled and selected `public.ecr.aws/supabase/postgres:17.6.1.134` (image ID `9faa7279bcf1`). Its database started, initialized schema, and replayed every repository migration through `20260417170859_add_mentorship_needs_to_startups.sql` without a migration error.

The full start still exited unsuccessfully because two auxiliary services were unhealthy: `public.ecr.aws/supabase/postgres-meta:v0.98.0` and `public.ecr.aws/supabase/studio:2026.08.17-sha-0c1da8f`. Both container logs report entrypoint `exec format error` (`/usr/local/bin/docker-entrypoint.sh`). The CLI stopped the entire Supabase stack, leaving no Supabase container, so the required explicit `npm.cmd exec supabase -- db reset` command could not run. No further image removal or startup retry was performed. The marker proves the Postgres database image and migration sequence are viable, but the local baseline remains incomplete until the auxiliary images can execute.

### Final completion: Supabase-only image refresh and local reset (2026-08-18)

`npm.cmd exec supabase -- stop --all --no-backup` again stopped only this local Supabase project. `supabase services --output json` supplied the exact service inventory. Sixteen Supabase-only image references were removed and re-pulled: Realtime (v2.129.0 and v2.124.4), Studio (2026.08.17-sha-0c1da8f and 2026.08.10-sha-5b68af1), Postgres Meta (v0.98.0 and v0.97.0), Logflare 1.50.2, GoTrue v2.195.0, Edge Runtime v1.74.3, Mailpit v1.30.2, Postgres 17.6.1.134 and 17.6.1.063, Vector 0.53.0-alpine, PostgREST v14.1, Kong 2.8.1, and Storage API v1.69.0. `postgres:17-alpine`, the diagnostic `alpine:3.20`, Dormplan's container, and Dormplan's two volumes were not removed.

The subsequent single `npm.cmd exec supabase -- start` completed successfully (after Public ECR rate-limit retries), re-pulled clean images, and returned the local API/Studio URLs. Post-start inspection reported `supabase_db_AlmaworksInternal` running and healthy on `public.ecr.aws/supabase/postgres:17.6.1.134`. `npm.cmd exec supabase -- db reset` then succeeded and replayed every repository migration through `20260417170859_add_mentorship_needs_to_startups.sql`; no migration failed, was edited, or was reconciled. Dormplan remained unchanged after reset.

Final local CLI status is running; Studio, PostgreSQL, Postgres Meta, Storage, Realtime, Inbucket, Auth, Kong, Analytics, and the database/API endpoints are healthy or running. Vector 0.53.0-alpine remains in a non-blocking restart loop because its Docker-log source receives `Connection refused`; this does not affect the successful database start or reset, but should be investigated separately if local analytics log collection is required.
