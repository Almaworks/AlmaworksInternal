# Almaworks Program Database Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the program-management schema over to durable identities, semester memberships, Friday meetings, two-slot availability, and canonical mentorship sessions without losing production data.

**Architecture:** Use an expand/backfill/cutover/contract migration. Declarative schema files define the desired database; `supabase db diff` generates migration files. Application adapters move one workflow at a time while compatibility remains available.

**Tech Stack:** PostgreSQL 17, Supabase RLS and RPCs, Supabase CLI 2.115+, Next.js 16, React 19, strict TypeScript, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-31-database-revamp-design.md`

## Global Constraints

- Operate only on Supabase project `layjdjfvxkowxidwuvbs`.
- Every program-scoped table has a non-null `semester_id` foreign key.
- Every exposed table has RLS enabled and least-privilege policies.
- Never hand-edit `supabase/migrations`; generate schema migrations with `supabase db diff`.
- Preserve the existing 101 mentors, 7 startups, 10 Friday dates, 80 sessions, 104 profiles, and 91 memberships until reconciliation succeeds.
- Do not remove legacy tables during expansion or cutover.
- Use Semester, Meeting, and Session according to the approved vocabulary.

---

### Task 1: Canonical schema contracts

**Files:**
- Create: `tests/database-revamp/program-schema-contract.test.mts`
- Modify: `supabase/schemas/lifecycle.sql`
- Modify: `supabase/schemas/zz_mentor_assignment.sql`

**Interfaces:**
- Consumes: approved target table list and terminology.
- Produces: declarative definitions for `meetings`, `meeting_availability`, canonical `sessions`, onboarding membership fields, and `program_audit_events`.

- [ ] Write a failing schema contract that requires Friday meetings, slot values 1/2, same-semester composite foreign keys, slot-conflict unique constraints, RLS, and the absence of competing session confirmation fields.
- [ ] Run `node --experimental-strip-types --test tests/database-revamp/program-schema-contract.test.mts` and confirm it fails because canonical tables are missing.
- [ ] Update declarative schema files with the minimal canonical definitions and policies.
- [ ] Rerun the focused test and confirm it passes.

### Task 2: Generate and validate the expansion migration

**Files:**
- Generate: `supabase/migrations/<timestamp>_database_revamp_expand.sql`
- Regenerate: `src/db/types.ts`

**Interfaces:**
- Consumes: Task 1 declarative schema.
- Produces: a generated, reviewable expansion migration and matching TypeScript database types.

- [ ] Reset/start local Supabase from migration history and record any pre-existing drift.
- [ ] Apply the declarative target to the local database using read/write SQL iteration outside migration history.
- [ ] Run `supabase db diff -f database_revamp_expand` to generate the migration.
- [ ] Reset the local database and apply all migrations from scratch.
- [ ] Generate types with `supabase gen types typescript --local > src/db/types.ts`.
- [ ] Run schema-contract tests and `npx tsc --noEmit`.

### Task 3: Data backfill and reconciliation

**Files:**
- Create: `supabase/schemas/database_revamp_backfill.sql`
- Create: `tests/database-revamp/backfill-contract.test.mts`
- Generate: `supabase/migrations/<timestamp>_database_revamp_backfill_support.sql`

**Interfaces:**
- Consumes: legacy `mentors`, `startups`, `session_dates`, `availability`, and `sessions`.
- Produces: idempotent backfill RPC plus a reconciliation result containing source, target, skipped, and conflict counts.

- [ ] Write failing tests for idempotency, deterministic identity matching, preserved IDs where possible, duplicate startup-slot reporting, and rollback on inconsistent semester links.
- [ ] Implement a restricted backfill RPC with a fixed search path and explicit admin authorization.
- [ ] Backfill mentor identities and semester participation.
- [ ] Backfill startup organizations, semester participation, and team memberships.
- [ ] Backfill meetings, availability, and sessions while reporting the two existing duplicate startup-slot groups.
- [ ] Generate the migration with `supabase db diff`, reset locally, seed a legacy fixture, and verify reconciliation counts.

### Task 4: Members page semester history

**Files:**
- Modify: `src/lifecycle/cohort-repository.ts`
- Modify: `src/lifecycle/cohort-management.ts`
- Modify: `components/CohortScreenControls.tsx`
- Modify: `app/dashboard/admin/page.tsx`
- Modify: `tests/lifecycle/cohort-management.test.mts`
- Modify: `tests/lifecycle/cohort-screen.test.mts`

**Interfaces:**
- Consumes: `semester_memberships -> semesters` history.
- Produces: one Members row per profile with distinct semester tags.

- [ ] Write a failing test proving two sessions in one semester produce one semester tag and memberships across two semesters produce two tags.
- [ ] Extend the cohort response with profile membership history.
- [ ] Replace the Members `Sessions` column and session-derived badges with a `Semesters` column.
- [ ] Remove session editing from the Members expansion; retain session editing in Schedule.
- [ ] Run focused tests, typecheck, and visual verification at desktop and narrow widths.

### Task 5: Meeting and session backend cutover

**Files:**
- Modify: `src/lifecycle/semester-transition.ts`
- Modify: `src/assignments/server.ts`
- Modify: `app/api/admin/lifecycle/semesters/session-dates/route.ts`
- Modify: `app/dashboard/admin/page.tsx`
- Modify: mentor and startup schedule pages under `app/dashboard/`
- Modify: assignment and semester-transition tests.

**Interfaces:**
- Consumes: canonical meeting, availability, mentor-semester, startup-semester, and session records.
- Produces: typed server-owned schedule writes using slot 1/2.

- [ ] Write failing tests for Friday-only meetings, two slots, same-semester participants, and double-booking rejection.
- [ ] Rename application APIs and copy from session-date terminology to meeting terminology.
- [ ] Repair assignment queries to use `mentor_semesters` and `startup_semesters` rather than mixed legacy columns.
- [ ] Route all session mutations through an authorized transaction.
- [ ] Run focused tests, typecheck, lint, and schedule-page visual verification.

### Task 6: Onboarding and semester creation cutover

**Files:**
- Modify: `app/dashboard/onboarding/onboarding-flow.tsx`
- Modify: lifecycle semester API routes.
- Modify: `src/lifecycle/onboarding.ts`
- Modify: onboarding and semester lifecycle tests.

**Interfaces:**
- Consumes: membership onboarding JSON and role-specific semester records.
- Produces: resumable onboarding and an atomic semester creation/activation workflow.

- [ ] Write failing tests for onboarding resume/completion and semester activation prerequisites.
- [ ] Persist common onboarding state on `semester_memberships` and role-specific answers in mentor/startup semester tables.
- [ ] Create meetings during draft semester setup and validate every selected date is Friday.
- [ ] Carry selected prior memberships forward as invited records.
- [ ] Run focused tests and browser verification for mentor, startup, and admin flows.

### Task 7: Program cutover verification and contract cleanup

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/architecture/identity-membership.md`
- Modify: `docs/database-map.md`
- Generate later: contract migration removing program legacy tables.

**Interfaces:**
- Consumes: fully cut-over application and reconciled canonical data.
- Produces: an approval-ready contract migration; it is not applied until reconciliation is signed off.

- [ ] Verify every program query uses the canonical tables.
- [ ] Compare source/target row counts and sample schedules.
- [ ] Run database advisors, RLS tests, all unit tests, typecheck, lint, and production build.
- [ ] Update documentation with the canonical vocabulary and 20-table target.
- [ ] Generate—but do not remotely apply—the contract migration that removes superseded program tables.

