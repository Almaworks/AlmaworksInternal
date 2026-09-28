# Admin Module Latency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate eager all-workspace data loading when an admin opens a single module.

**Architecture:** Extract route-specific admin workspace components and loaders. Each route owns only the Supabase reads and client state it renders; Overview consumes compact operational summaries rather than full member, startup, mentor, and session directories.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase RLS, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-11-admin-operational-overview-design.md`

## Global Constraints

- Preserve existing RLS and authorization checks.
- No remote operation, schema change, or migration.
- Measure before and after using route request counts and browser timings when a browser is available.

### Task 1: Define and test module data boundaries

**Files:**
- Create: `src/dashboard/admin-module-loads.ts`
- Create: `tests/dashboard/admin-module-loads.test.mts`

- [ ] Write a failing test asserting Overview requires operational summaries, Members requires member/audit data, Startups requires startup/founder data, and Access requires pending/activation data.
- [ ] Run `node --experimental-strip-types --test tests/dashboard/admin-module-loads.test.mts` and verify failure.
- [ ] Implement a typed module-to-load specification with no `any`.
- [ ] Re-run the focused test and verify it passes.

### Task 2: Extract route-specific loaders and workspaces

**Files:**
- Modify: `app/dashboard/admin/page.tsx`
- Modify: `app/dashboard/admin/access/page.tsx`
- Modify: `app/dashboard/admin/members/page.tsx`
- Modify: `app/dashboard/admin/startups/page.tsx`
- Create: `app/dashboard/admin/components/*`

- [ ] Write failing route tests that reject the shared `loadAll()` call from dedicated module pages.
- [ ] Move Access, Members, and Startups controls into independently loaded components; preserve their mutations and deep links.
- [ ] Replace Overview directory reads with the smallest scoped summaries required by its cards.
- [ ] Run focused route and existing management tests.

### Task 3: Measure and verify

- [ ] Record network request counts and route-switch timings in a real authenticated browser session at desktop and narrow widths.
- [ ] Run scoped ESLint, relevant Node tests, and `git diff --check`.
- [ ] Update `docs/memory/handoff.md` with measured before/after evidence and blockers.
