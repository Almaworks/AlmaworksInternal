# Database Hardening and Canonical Cutover Plan

**Status:** Implemented and deployed on 2026-09-01. Task 6 remains blocked because Supabase restricts leaked-password protection to Pro plans.

**Goal:** Finish the 20-table revamp by moving every application consumer to the canonical schema, removing compatibility objects, hardening database access, updating generated artifacts, and deploying only to Supabase project `layjdjfvxkowxidwuvbs`.

**Authority:** `docs/superpowers/specs/2026-08-31-database-revamp-design.md`

## Global constraints

- Preserve existing production data and behavior.
- Operate only on Supabase project `layjdjfvxkowxidwuvbs`.
- Verify that exact project reference before every remote operation.
- Generate migrations with `supabase db diff`; never hand-edit migration files.
- Keep all 20 public base tables protected by RLS.
- Use Semester, Meeting, and Session according to the approved vocabulary.
- Use failing tests before application or schema behavior changes.

## Task 1: Canonical application cutover

- Replace application reads and writes to `mentors`, `startups`, `session_dates`, `availability`, and legacy `outreach` with canonical tables and server-owned operations.
- Preserve role-aware page behavior, member semester tags, scheduling, onboarding, and outreach isolation.
- Add focused tests and visually verify affected desktop and narrow views.

## Task 2: Compatibility removal

- Prove no application consumer requires the four compatibility views.
- Remove `mentors`, `startups`, `session_dates`, and `availability` views and their write-trigger functions.
- Remove obsolete compatibility RPCs only when no caller remains.

## Task 3: Function and Data API privilege hardening

- Revoke anonymous and `PUBLIC` execution on privileged functions.
- Grant authenticated execution only to intentionally callable RPCs.
- Keep internal trigger and policy helpers inaccessible as direct public APIs where possible.
- Review direct table grants against actual client access.

## Task 4: RLS policy optimization

- Wrap stable authentication calls in scalar subqueries.
- Consolidate overlapping permissive policies without changing authorization behavior.
- Verify ownership and semester-boundary predicates for every mutation.

## Task 5: Foreign-key indexes

- Add indexes for foreign keys used in joins, RLS checks, or cascade operations.
- Avoid redundant indexes already covered by primary, unique, or leading composite indexes.

## Task 6: Password protection

- Enable Supabase Auth leaked-password protection for the approved project.
- Verify the setting through a read-back operation.

Deployment note: the approved project is not on a Pro plan. Supabase rejected the isolated setting change, and read-back remains disabled. No billing change was authorized or performed.

## Task 7: Generated artifacts, verification, and deployment

- Regenerate `src/db/types.ts` from the canonical schema.
- Replace stale `src/db/schema.sql`, `docs/database-map.md`, and `docs/database-explorer.html` content.
- Run database tests, all unit tests, TypeScript, lint, build, database advisors, and browser verification.
- Apply generated migrations only after local verification and re-verify the live schema and data.

Deployment note: the live project was upgraded with the reviewed Stage A and Stage B migrations only. The generated production baseline migration is explicitly local-replay-only and must never be deployed.
