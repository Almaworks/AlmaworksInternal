# Almaworks Outreach Database Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep reusable outreach identities globally while giving every semester a fresh, independently managed outreach list with bulk carry-forward and reset.

**Architecture:** Preserve the current contact/company CRM, simplify semester opportunities and activity history, consolidate import staging, and eliminate program-profile conversion links. Carry-forward creates new opportunities rather than duplicating contacts.

**Tech Stack:** PostgreSQL 17, Supabase RLS and RPCs, Next.js 16, React 19, strict TypeScript, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-31-database-revamp-design.md`

## Global Constraints

- Operate only on Supabase project `layjdjfvxkowxidwuvbs`.
- Outreach contacts have no managed login and no foreign key to program mentor/startup records.
- `outreach_opportunities.semester_id` is non-null and unique with `contact_id`.
- Carry-forward resets stage to `not_contacted` while preserving global identity and historical activity.
- Never hand-edit migration files; use `supabase db diff`.

---

### Task 1: Simplified outreach schema contracts

**Files:**
- Modify: `tests/outreach/schema-contract.test.mts`
- Modify: `supabase/schemas/outreach_crm.sql`
- Create: `tests/outreach/carry-forward.test.mts`

**Interfaces:**
- Produces: the six-table outreach schema, carry-forward/reset request contracts, and terminology without the outreach `meeting` stage.

- [ ] Write failing tests for reusable contacts, unique semester opportunities, relationship type arrays, no program conversion foreign keys, RLS, and consolidated imports.
- [ ] Update the declarative schema minimally until focused tests pass.

### Task 2: Carry-forward and reset commands

**Files:**
- Create: `src/outreach/carry-forward.ts`
- Create: API routes under `app/api/admin/outreach/`.
- Modify: `src/outreach/server/commands.ts`
- Modify: outreach command tests.

**Interfaces:**
- Produces: authorized bulk carry-forward and bulk reset RPC calls with explicit source and target semesters.

- [ ] Write failing tests for selected contact carry-forward, idempotency, status reset, retained history, and unauthorized access.
- [ ] Implement server-owned commands and restricted database RPCs.
- [ ] Verify activity rows record each reset without deleting prior history.

### Task 3: Outreach UI cutover

**Files:**
- Modify: outreach workspace components under `app/dashboard/admin/outreach/`.
- Modify: outreach workspace and HTTP tests.

**Interfaces:**
- Consumes: carry-forward/reset APIs.
- Produces: multi-select actions for “Add to [Semester] Outreach” and “Reset outreach status.”

- [ ] Write failing view-model tests for selection and confirmation copy.
- [ ] Add previous-semester selection and target-semester import controls.
- [ ] Add reset confirmation and success/error feedback.
- [ ] Verify desktop and narrow layouts in the browser.

### Task 4: Outreach migration and cleanup

**Files:**
- Generate: expansion/backfill and later contract migrations.
- Modify: outreach documentation and database map.

**Interfaces:**
- Produces: reconciled new CRM data and an approval-ready legacy cleanup migration.

- [ ] Reconcile the 75 legacy outreach rows against 75 contacts/opportunities.
- [ ] Preserve the three existing canonical activity rows and migrate any unmatched legacy activity.
- [ ] Run RLS tests, database advisors, unit tests, typecheck, lint, and build.
- [ ] Generate—but do not remotely apply—the contract migration removing legacy outreach tables and redundant label/import tables.

