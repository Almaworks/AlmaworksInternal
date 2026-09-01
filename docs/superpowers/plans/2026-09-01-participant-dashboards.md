# Participant Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build production mentor and startup workspaces with activation-aware onboarding, active-semester directories, owned session history, derived notifications, and safe profile/account editing.

**Architecture:** A shared participant dashboard domain module converts canonical Supabase rows into a sanitized role-aware view model. Authenticated API routes use the caller's RLS client for reads and public-profile writes, while a shared client workspace renders the approved design and uses Supabase Auth directly for sign-in email changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, Supabase Auth/Postgres/RLS, CSS Modules, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-01-participant-dashboards-design.md`

## Global Constraints

- Do not change the database schema, migrations, RLS policies, or generated `src/db/types.ts`.
- Resolve role and scope from `semester_memberships`; never trust browser metadata or legacy `profiles.role`.
- Return only active-semester and participant-owned data.
- Never use the service role for participant operations.
- Keep fake accounts on the same invitation, membership, onboarding, and activation path as real accounts.
- Use no `any` types.

---

### Task 1: Participant domain and privacy boundary

**Files:**
- Modify: `src/dashboard/participant-dashboard.ts`
- Modify: `tests/dashboard/participant-dashboard.test.mts`

**Interfaces:**
- Produces: `selectParticipantContext`, `buildParticipantDashboard`, `buildProfileUpdate`, and the `ParticipantDashboardView` DTO used by the API and UI.

- [ ] **Step 1: Write failing domain tests** for active membership precedence, pending/no-membership states, role-owned sessions, cross-semester exclusion, opposite-role directories, derived notifications, and allowed profile update fields.
- [ ] **Step 2: Run `node --experimental-strip-types --test tests/dashboard/participant-dashboard.test.mts`** and confirm failures are caused by missing functions.
- [ ] **Step 3: Implement the minimal pure domain functions** with literal role/status unions and sanitized DTOs.
- [ ] **Step 4: Rerun the focused test** and confirm it passes.

### Task 2: RLS-backed participant API

**Files:**
- Create: `src/dashboard/participant-dashboard-server.ts`
- Create: `app/api/participant-dashboard/route.ts`
- Create: `tests/dashboard/participant-dashboard-server.test.mts`

**Interfaces:**
- Consumes: `buildParticipantDashboard` and `buildProfileUpdate` from Task 1.
- Produces: `loadParticipantDashboard(request)` and `updateParticipantProfile(request)` returning JSON-safe view models and mutation results.

- [ ] **Step 1: Write failing server tests** using a typed fake query port that records canonical table queries and returns complete row fixtures.
- [ ] **Step 2: Run the focused server test** and confirm failure from the missing server module.
- [ ] **Step 3: Implement authenticated GET/PATCH application functions** using `requireAuthenticatedUserWithRls`, canonical tables, explicit semester filters, and caller-token RLS only.
- [ ] **Step 4: Add the thin route handler** with validation and stable 401/403/422/500 error envelopes.
- [ ] **Step 5: Rerun dashboard tests** and confirm they pass.

### Task 3: Production participant workspace

**Files:**
- Create: `app/dashboard/participant/ParticipantDashboard.tsx`
- Create: `app/dashboard/participant/participant-dashboard.module.css`
- Modify: `app/dashboard/mentor/page.tsx`
- Modify: `app/dashboard/startup/page.tsx`
- Modify: `app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `ParticipantDashboardView` from Task 1 and `/api/participant-dashboard` from Task 2.
- Produces: shared Home, Network, Sessions, Notifications, and Profile experiences for both participant routes.

- [ ] **Step 1: Add a failing navigation/domain assertion** proving both personas receive the five persistent participant tabs without admin or prior-semester controls.
- [ ] **Step 2: Run the focused test** and confirm the assertion fails against the previous navigation contract.
- [ ] **Step 3: Adapt the approved preview into a production component** with loading/error/empty/pending states, API data, search, profile saving, and Auth email-change confirmation copy.
- [ ] **Step 4: Replace mentor/startup pages with thin role expectations** and update dashboard navigation to the five-tab routes/query state while preserving admin navigation.
- [ ] **Step 5: Rerun focused tests and `npx tsc --noEmit`** and resolve all failures without loosening types.

### Task 4: Onboarding handoff and readiness

**Files:**
- Modify: `app/dashboard/onboarding/onboarding-flow.tsx`
- Modify: `src/onboarding/checklist.ts` if present, otherwise keep readiness derivation in `src/dashboard/participant-dashboard.ts`
- Modify: `tests/onboarding/*.test.mts`

**Interfaces:**
- Consumes: canonical participant context and role profile fields.
- Produces: onboarding completion that saves only RLS-authorized fields and routes to a ready-for-admin-activation dashboard state.

- [ ] **Step 1: Write a failing test** proving onboarding never self-promotes `semester_memberships.status` and derives readiness from role-owned data.
- [ ] **Step 2: Run the focused test** and confirm the previous membership mutation violates the contract.
- [ ] **Step 3: Remove browser membership activation writes**, persist profile/semester/availability fields allowed by existing RLS, and update final-step copy to distinguish setup completion from admin activation.
- [ ] **Step 4: Rerun onboarding and dashboard tests** and confirm they pass.

### Task 5: Full verification and visual QA

**Files:**
- Modify only files needed to correct defects found by verification.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified production behavior and a clean local branch.

- [ ] **Step 1: Run `npm test`** and require zero failures.
- [ ] **Step 2: Run `npx tsc --noEmit`** and require exit code 0.
- [ ] **Step 3: Run `npm run lint`** and require zero errors.
- [ ] **Step 4: Run `npm run build`** and require exit code 0.
- [ ] **Step 5: Start the dev server and inspect mentor and startup dashboards** at desktop and narrow widths; check blank, loading, pending, active, directory, sessions, notifications, profile, and email-change states where authentication fixtures permit.
- [ ] **Step 6: Review `git diff` against the spec** and confirm no schema/migration/type edits and no unrelated changes.
