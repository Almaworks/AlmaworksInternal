# Database hardening cutover verification

Date: 2026-09-01

## Production-aligned generation

The source catalog was read from the linked Supabase project only after verifying project ref `layjdjfvxkowxidwuvbs`. The schema-only fixture at `tests/database-revamp/production-baseline.sql` contains the 20 live Almaworks public tables and no visa or agent tables.

The CLI's default `migra` engine omitted ACL changes. The schema-filtered pg-delta engine emitted ACLs but omitted the global PUBLIC function default revoke, and its single-file ordering placed table-wide revokes after column grants. The pgAdmin engine was tested against PostgreSQL 17 and a lightweight PostgreSQL 15 Supabase target and failed with `LegacyDbDiffPgAdminError`.

Correctness therefore required two ordered cutover migrations. Stage A contains structure, broad revokes, default revokes, and final table-level SELECT/DELETE grants. Stage B contains the final column and RPC grants and no table-wide revokes.

## Clean local replay baseline

The stale local migration chain could not replay the production-aligned cutover safely. It has been removed from the active `supabase/migrations` directory; Git history remains the archive. A new local-only baseline was generated mechanically from an empty, full-platform PostgreSQL 17 Supabase database to the verified production fixture:

```powershell
npm exec supabase -- db diff `
  --db-url "postgresql://postgres:postgres@127.0.0.1:56322/postgres?sslmode=disable" `
  --use-pg-delta `
  -f production_baseline_local_replay_only `
  --workdir .rebaseline
```

- Local replay only: `supabase/migrations/20260901183540_production_baseline_local_replay_only.sql`
  - SHA-256: `FC8D4B6EED385746AF7727A17C67501992924D650DE9B30C2931C6B42374A3DD`
  - Size: 142,675 bytes
- This baseline creates the verified production shape so local reset can then exercise Stage A and Stage B.
- It must never be submitted to Supabase production migration management.
- It contains no visa, agent, or Supabase platform-schema DDL.

Stage A was regenerated after this baseline with an actual `db diff` and was byte-identical to the previously reviewed CLI output. A newly generated Stage B included 26 redundant function replacements, so it was discarded. The previous minimal, genuine CLI-generated Stage B was resequenced byte-for-byte after Stage A and validated against both clean replay and the production-shaped upgrade fixture.

The exact generation commands were:

```powershell
npm exec supabase -- db diff `
  --db-url "postgresql://postgres:postgres@127.0.0.1:56322/postgres?sslmode=disable" `
  --use-pg-delta `
  -f database_hardening_cutover_stage_a `
  --workdir .rebaseline
```

- Stage A: `supabase/migrations/20260901183709_database_hardening_cutover_stage_a.sql`
  - SHA-256: `85FEBA7C58F1062310281A4DEF39804F359BBC9242A26C3483B75E3D87979763`
  - Size: 115,411 bytes
- Stage B: `supabase/migrations/20260901183741_database_hardening_cutover_stage_b.sql`
  - SHA-256: `A9DD84B7E50484272B79AFEDFB971DCDE153C5FB2A09A195C86F425B40BEF244`
  - Size: 21,171 bytes
- Both generated files were moved byte-for-byte and were not edited.
- The prior active historical chain was removed from local replay; it remains recoverable in Git history.
- Neither migration contains visa or agent drops.

## Identity preservation decision

`profiles.id` remains the durable program identity and does not reference `auth.users`. `profiles.auth_user_id` is nullable, unique, and references `auth.users(id)` with `ON DELETE SET NULL`. Managed Auth identities set both values in `handle_new_user`.

Seven live approved profiles currently rely only on the legacy role/cohort columns. Because a schema diff cannot generate a conditional production data backfill and migration files cannot be hand-edited, `profiles.role` and `profiles.semester_id` are retained temporarily as non-authoritative compatibility data. All authorization uses `platform_roles` and `semester_memberships`.

## Upgrade proof

`scripts/test-production-upgrade.ps1` creates an isolated local database, applies the verified production schema fixture, seeds seven representative legacy approved profiles, applies the exact Stage A and Stage B files in one transaction, and asserts:

- 20 public base tables
- zero public compatibility views
- RLS enabled on all 20 tables
- all seven legacy profiles preserved
- no `profiles.id` Auth foreign key
- the nullable `auth_user_id` Auth foreign key exists
- a service-only actor profile can use the private capability helper
- the auth-bound wrapper rejects the same direct service bypass
- anonymous roles retain no routine execution
- the exact authenticated/service table, column, and RPC allowlists match with no missing or extra privileges
- a function created after the cutover is not executable by PUBLIC or `anon`
- a historical durable profile with a different attached Auth UUID resolves through `private.current_profile_id`, passes the auth-bound admin helper, and remains visible through profile RLS

The production-aligned pgTAP contract passes 40/40 assertions. Database lint reports no schema errors.

A stopped/restarted local Supabase stack and a subsequent explicit `supabase db reset --local --yes` both replayed baseline -> Stage A -> Stage B successfully. `npm run db:migration-safety` rejects any active migration inventory other than one local-only baseline followed by the two deployable cutover stages.

Final local verification on 2026-09-01:

- `npm test`: 192/192 passed.
- `npm exec supabase -- test db`: 40/40 pgTAP assertions passed.
- `powershell -ExecutionPolicy Bypass -File scripts/test-production-upgrade.ps1`: production-shaped Stage A + Stage B upgrade passed with 20 tables, 0 views, 20 RLS tables, and 7 legacy profiles preserved.
- `npm exec tsc -- --noEmit`: passed.
- `npm run lint`: 0 errors; 2 pre-existing `next/no-img-element` warnings.
- `npm run build`: passed.
- `npm exec supabase -- db lint --local --level error`: no schema errors.
- `npm exec supabase -- db advisors --local --type all --level warn --fail-on error`: no issues.

## Generated artifacts

- `src/db/schema.sql` from a local schema dump of the converged target
- `src/db/types.ts` from local Supabase type generation
- `docs/database-map.md` with the durable identity and dual-domain vocabulary
- `docs/database-explorer.html`, regenerated with 20 tables and 234 columns

## Pre-existing deployment-history limitation

Read-only `supabase migration list --linked` shows remote-only and local-only migration versions. A verified dry run of normal `supabase db push --linked --dry-run --skip-vault` aborts with `LegacyDbPushMissingLocalError` before applying anything because 24 remote versions are absent locally. `--include-all` is unsafe because it could replay stale local-only migrations. No remote history was repaired or squashed.

Consequently, normal `db push` must not be used for this cutover. The local replay baseline must never be sent to production. The independently reviewed generated SQL is suitable for exactly two ordered Supabase `apply_migration` management operations (Stage A, then Stage B) after the operator re-verifies project ref `layjdjfvxkowxidwuvbs`, runs `npm run db:migration-safety`, and verifies both deployable hashes.
