# Mentor Assignment from the Weekly Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Keep the fixed Friday schedule while adding a persisted, ranked, searchable mentor assignment workflow from each schedule slot.

**Architecture:** Add a deterministic server-side candidate-ranking domain module and a semester-authorized assignment transaction. Extend the existing Overview Schedule UI so a slot opens an assignment picker; preserve the existing Friday grid and legacy history display while routing new assignment writes through the server transaction.

**Tech Stack:** Next.js App Router, React/TypeScript, Supabase Postgres/RLS, Node test runner, pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-27-mentor-assignment-schedule-design.md`

## Global Constraints

- Use only Supabase project `layjdjfvxkowxidwuvbs` for remote operations.
- Preserve Row Level Security; never use service-role credentials in browser code.
- Every assignment mutation must be semester-scoped, authorized, idempotent, and atomic.
- Deterministic ranking is authoritative; any future AI explanation is advisory only.
- Run `npm run lint`, `npx tsc --noEmit`, `npm test`, and production build before completion.

### Task 1: Candidate ranking domain and tests

**Files:**
- Create: `src/assignments/ranking.ts`
- Test: `tests/assignments/ranking.test.mts`

- [ ] Define typed mentor/startup/slot inputs and deterministic score output.
- [ ] Write failing tests for primary match, secondary match, availability, recent-meeting penalty, workload tie-break, format fit, and second-slot exclusion.
- [ ] Implement pure ranking with stable ID tie-breaks and explicit exclusion reasons.
- [ ] Run `node --experimental-strip-types --test tests/assignments/ranking.test.mts`.

### Task 2: Authorized assignment transaction

**Files:**
- Create: `supabase/schemas/zz_mentor_assignment.sql`
- Create: `supabase/migrations/<generated>_mentor_assignment.sql` via `supabase db diff`
- Create: `supabase/tests/database/mentor_assignment.test.sql`
- Modify: `src/db/types.ts` via type generation

- [ ] Add a semester-scoped assignment audit structure and a security-definer commit function with fixed search path.
- [ ] Validate active memberships, same-semester slot, duplicate mentor/startup slot conflicts, second-slot exclusion, and idempotency.
- [ ] Require override reasons for availability/capacity/expertise overrides and record ranking context.
- [ ] Ensure any failure rolls back session/request/audit writes.
- [ ] Add pgTAP coverage for authorization, conflicts, idempotent replay, override validation, and rollback.
- [ ] Apply locally with `supabase db reset --local`, run `supabase test db --local supabase/tests/database/mentor_assignment.test.sql`, and regenerate types.

### Task 3: Server routes and candidate context

**Files:**
- Create: `src/assignments/server.ts`
- Create: `app/api/admin/assignments/candidates/route.ts`
- Create: `app/api/admin/assignments/commit/route.ts`
- Test: `tests/assignments/http.test.mts`

- [ ] Add authenticated GET candidate context scoped to semester/startup/date/slot.
- [ ] Add authenticated POST commit using the transaction function and idempotency key.
- [ ] Return 401/403/400/409 errors with stable envelopes.
- [ ] Add route tests for authorization, malformed payloads, stale/conflicting slots, and successful commit.

### Task 4: Schedule slot picker UI

**Files:**
- Modify: `app/dashboard/admin/page.tsx`
- Create: `components/assignments/MentorAssignmentPicker.tsx`
- Create: `components/assignments/assignment-picker.module.css`

- [ ] Replace slot dropdown behavior with an accessible modal/drawer opened by clicking a schedule slot.
- [ ] Display startup Mentor Needs, context, selected Friday slot, and ranked scrollable candidates.
- [ ] Add expertise filter, mentor-name search, unavailable/conflict explanations, and team-startup substitute mode.
- [ ] Exclude the first-slot mentor when assigning the second slot unless an explicit override is selected.
- [ ] Commit with idempotency key, refresh schedule, and display audit/override feedback.

### Task 5: Integration, migration, and QA

**Files:**
- Modify: `app/dashboard/mentors/page.tsx` to link to the schedule assignment workflow.
- Modify: relevant docs/runbooks with assignment operations guidance.
- Test: `tests/assignments/*`, existing schedule tests.

- [ ] Preserve Overview → Schedule as the canonical weekly view.
- [ ] Add a Mentors-module entry point to the same schedule without duplicating scheduling state.
- [ ] Run full tests, lint, typecheck, and production build.
- [ ] Perform browser QA for empty slot, ranked candidates, filters, second-slot exclusion, unavailable mentor, substitute, override, and successful assignment states.
- [ ] Verify the generated migration against project `layjdjfvxkowxidwuvbs` before applying remotely.
