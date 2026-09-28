# Calendar-first mentor booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace date-specific mentor availability windows with recurring weekly calendar ranges and permit startups to request a selected valid appointment.

**Architecture:** Store calendar ranges in a program-scoped availability table and make the database validate selected request timestamps against those ranges in the semester timezone. The API exposes ranges and request history; the React workspace saves the mentor calendar and lists only real requests.

**Tech Stack:** Next.js, React, TypeScript, Supabase Postgres/RLS/pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-10-calendar-first-mentor-booking-design.md`

## Global Constraints

- All program tables have a non-null `semester_id` and RLS; no service-role bypass.
- Do not hand-edit migrations; generate with `supabase db diff`.
- Availability is weekly and calendar-only; request slots are actual 15-minute appointments.
- Preserve historical booking requests and their legacy window IDs.

---

### Task 1: Calendar booking domain contract

**Files:**
- Modify: `src/mentor-booking/types.ts`, `src/mentor-booking/model.ts`
- Test: `tests/mentor-booking/model.test.mts`

- [ ] Write tests that parse a complete weekly-availability replacement and a startup-selected request with explicit timestamps, and reject non-15-minute intervals.
- [ ] Run the focused model test and observe the missing-command failure.
- [ ] Replace window command/types with weekly availability ranges and request timestamps; project availability and private request history separately.
- [ ] Run `node --experimental-strip-types --test tests/mentor-booking/model.test.mts` and confirm it passes.

### Task 2: Secure persistent weekly availability

**Files:**
- Modify: `supabase/schemas/mentor_booking.sql`, `src/mentor-booking/server.ts`
- Test: `supabase/tests/database/mentor_booking.test.sql`, `tests/mentor-booking/server.test.mts`

- [ ] Add failing pgTAP/API tests for recurring range replacement, a request inside a range, and a rejected request outside a range.
- [ ] Run the focused tests and observe failures against the dated-window contract.
- [ ] Implement the RLS table, policies, request validation/function changes, server store projection, and RPC dispatch.
- [ ] Generate the schema migration with `supabase db diff`; regenerate generated TypeScript types.
- [ ] Re-run focused database and server tests and confirm they pass.

### Task 3: Calendar-only booking workspace

**Files:**
- Modify: `components/mentor-booking/MentorBookingWorkspace.tsx`, `components/mentor-booking/presentation.ts`
- Test: `tests/mentor-booking-ui/presentation.test.mts`, `tests/mentor-booking/calendar-planner.test.mts`

- [ ] Add failing UI-contract tests proving mentor availability windows are not listed and actual requests are still rendered.
- [ ] Run those tests and observe the old availability-list behavior fail the contract.
- [ ] Save mentor calendar ranges through the new API; remove dated batch controls/window list; add startup calendar appointment selection and request submission.
- [ ] Run the focused UI tests and confirm they pass.

### Task 4: End-to-end verification and handoff

**Files:**
- Modify: `docs/memory/handoff.md`
- Test: focused booking suites and project checks

- [ ] Run the booking model/server/UI tests, database pgTAP test, `npx tsc --noEmit`, and `npm run lint`.
- [ ] Attempt authenticated mentor/startup browser QA per `docs/runbooks/authenticated-qa.md`, recording PASS/FAIL/BLOCKED evidence.
- [ ] Update the distinct task handoff with exact results, migration state, and remaining release/QA blockers.
