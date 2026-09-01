# Database hardening cutover verification

Date: 2026-09-01

## Production-aligned generation

The source catalog was read from the linked Supabase project only after verifying project ref `layjdjfvxkowxidwuvbs`. The schema-only fixture at `tests/database-revamp/production-baseline.sql` contains the 20 live Almaworks public tables and no visa or agent tables.

The committed migration was generated mechanically from that fixture to a clean converged target with:

```powershell
npm exec supabase -- db diff `
  --db-url postgresql://postgres:postgres@127.0.0.1:54322/almaworks_prod_target `
  --schema public,private `
  --use-pg-delta `
  -f database_hardening_cutover `
  --workdir .generated-diff
```

- File: `supabase/migrations/20260901171425_database_hardening_cutover.sql`
- SHA-256: `986387A815B5660E27FD1B81B399E2687958221217D63F07F1C6CD0AC29D3614`
- Size: 125,767 bytes
- The generated file was copied byte-for-byte; it was not edited.
- The prior unsafe generated cutover was deleted.
- The final migration contains no visa or agent drops.

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

The production-aligned pgTAP contract passes 40/40 assertions. Database lint reports no schema errors.

## Generated artifacts

- `src/db/schema.sql` from a local schema dump of the converged target
- `src/db/types.ts` from local Supabase type generation
- `docs/database-map.md` with the durable identity and dual-domain vocabulary
- `docs/database-explorer.html`, regenerated with 20 tables and 234 columns

## Pre-existing deployment-history limitation

Read-only `supabase migration list --linked` shows remote-only and local-only migration versions. A verified dry run of normal `supabase db push --linked --dry-run --skip-vault` aborts with `LegacyDbPushMissingLocalError` before applying anything because 24 remote versions are absent locally. `--include-all` is unsafe because it could replay stale local-only migrations. No remote history was repaired or squashed.

Consequently, normal `db push` must not be used for this cutover. The independently reviewed generated SQL is suitable for a single Supabase `apply_migration` management operation, which should append only this cutover after the operator re-verifies the exact project ref and migration hash.
