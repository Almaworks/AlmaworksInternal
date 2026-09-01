# Database hardening cutover verification

Date: 2026-09-01

## Production-aligned generation

The source catalog was read from the linked Supabase project only after verifying project ref `layjdjfvxkowxidwuvbs`. The schema-only fixture at `tests/database-revamp/production-baseline.sql` contains the 20 live Almaworks public tables and no visa or agent tables.

The CLI's default `migra` engine omitted ACL changes. The schema-filtered pg-delta engine emitted ACLs but omitted the global PUBLIC function default revoke, and its single-file ordering placed table-wide revokes after column grants. The pgAdmin engine was tested against PostgreSQL 17 and a lightweight PostgreSQL 15 Supabase target and failed with `LegacyDbDiffPgAdminError`.

Correctness therefore required two ordered migrations. Both were mechanically generated against a full-platform PostgreSQL 15 Supabase target so an unfiltered pg-delta diff could include the global default ACL without emitting unrelated platform changes. Stage A contains structure, broad revokes, default revokes, and final table-level SELECT/DELETE grants. Stage B contains the final column and RPC grants and no table-wide revokes.

The exact generation commands were:

```powershell
npm exec supabase -- db diff `
  --db-url "postgresql://postgres:postgres@127.0.0.1:55322/postgres?sslmode=disable" `
  --use-pg-delta `
  -f database_hardening_cutover_stage_a `
  --workdir .generated-diff

npm exec supabase -- db diff `
  --db-url "postgresql://postgres:postgres@127.0.0.1:55322/postgres?sslmode=disable" `
  --use-pg-delta `
  -f database_hardening_cutover_stage_b `
  --workdir .generated-diff
```

- Stage A: `supabase/migrations/20260901181336_database_hardening_cutover_stage_a.sql`
  - SHA-256: `85FEBA7C58F1062310281A4DEF39804F359BBC9242A26C3483B75E3D87979763`
  - Size: 115,411 bytes
- Stage B: `supabase/migrations/20260901181809_database_hardening_cutover_stage_b.sql`
  - SHA-256: `A9DD84B7E50484272B79AFEDFB971DCDE153C5FB2A09A195C86F425B40BEF244`
  - Size: 21,171 bytes
- Both generated files were moved byte-for-byte and were not edited.
- The prior unsafe generated cutover was deleted.
- Neither migration contains visa or agent drops.

## Identity preservation decision

`profiles.id` remains the durable program identity and does not reference `auth.users`. `profiles.auth_user_id` is nullable, unique, and references `auth.users(id)` with `ON DELETE SET NULL`. Managed Auth identities set both values in `handle_new_user`.

Seven live approved profiles currently rely only on the legacy role/cohort columns. Because a schema diff cannot generate a conditional production data backfill and migration files cannot be hand-edited, `profiles.role` and `profiles.semester_id` are retained temporarily as non-authoritative compatibility data. All authorization uses `platform_roles` and `semester_memberships`.

## Upgrade proof

`scripts/test-production-upgrade.ps1` creates an isolated local database, applies the verified production schema fixture, seeds seven representative legacy approved profiles, applies the exact generated migration in one transaction, and asserts:

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

## Generated artifacts

- `src/db/schema.sql` from a local schema dump of the converged target
- `src/db/types.ts` from local Supabase type generation
- `docs/database-map.md` with the durable identity and dual-domain vocabulary
- `docs/database-explorer.html`, regenerated with 20 tables and 234 columns

## Pre-existing deployment-history limitation

Read-only `supabase migration list --linked` shows remote-only and local-only migration versions. A verified dry run of normal `supabase db push --linked --dry-run --skip-vault` aborts with `LegacyDbPushMissingLocalError` before applying anything because 24 remote versions are absent locally. `--include-all` is unsafe because it could replay stale local-only migrations. No remote history was repaired or squashed.

Consequently, normal `db push` must not be used for this cutover. The independently reviewed generated SQL is suitable for two ordered Supabase `apply_migration` management operations (Stage A, then Stage B), which should append only these cutovers after the operator re-verifies the exact project ref and both migration hashes.
