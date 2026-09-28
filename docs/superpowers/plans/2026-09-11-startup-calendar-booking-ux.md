# Startup Calendar Booking UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a weekly, time-first startup booking calendar with a ranked mentor modal and mentor-slot highlighting.

**Architecture:** A pure calendar module turns existing 15-minute availability slots into seven-day time cells. The existing authenticated booking workspace projects startup needs and mentor expertise; the client filters and ranks mentors only after a user selects a cell, then uses the existing `request_booking` action.

**Tech Stack:** Next.js, React, TypeScript, Node test runner, Supabase RLS client.

**Spec:** `docs/superpowers/specs/2026-09-11-startup-calendar-booking-ux.md`

## Global Constraints

- Reuse the existing `request_booking` command and database validation; no schema migration or direct LLM call.
- Derive matching from existing startup mentorship needs and mentor expertise tags.
- Calendar dates/times always use the semester timezone.
- Search highlights a mentor's cells without removing other mentors' availability.
- Keep historical booking requests and mentor availability editing unchanged.

---

### Task 1: Calendar and fit domain

**Files:**
- Create: `src/mentor-booking/startup-calendar.ts`
- Modify: `src/mentor-booking/types.ts`, `src/mentor-booking/startup-availability.ts`
- Test: `tests/mentor-booking/startup-calendar.test.mts`

**Interfaces:**
- Produces `buildStartupCalendar({ slots, now, timeZone }): StartupCalendar` and `rankAvailableMentors({ slot, startupNeeds }): RankedMentor[]`.

- [ ] Write failing tests for a seven-day cell containing two mentors, a name-highlight predicate that keeps both mentors visible, and expertise-overlap ranking with alphabetical ties.
- [ ] Run `node --experimental-strip-types --test tests/mentor-booking/startup-calendar.test.mts` and confirm the missing-module failure.
- [ ] Implement the pure calendar projection and ranking functions, then extend booking availability identities with expertise tags and the workspace viewer with startup needs.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: RLS-backed matching projection

**Files:**
- Modify: `src/mentor-booking/server.ts`, `src/mentor-booking/model.ts`
- Test: `tests/mentor-booking/server.test.mts`, `tests/mentor-booking/model.test.mts`

**Interfaces:**
- Consumes the extended `MentorWeeklyAvailability` and viewer fields from Task 1.
- Produces a valid booking workspace containing `viewer.startupNeeds` and every available mentor's `expertiseTags`.

- [ ] Write failing server/model assertions for mapping a mentor's expertise tags and the signed-in startup's mentorship needs into the workspace.
- [ ] Run `node --experimental-strip-types --test tests/mentor-booking/server.test.mts tests/mentor-booking/model.test.mts` and confirm the new assertions fail.
- [ ] Extend existing RLS-client selects and workspace mapping; retain existing semester filters and error mapping.
- [ ] Re-run the focused server/model tests and confirm they pass.

### Task 3: Startup calendar and picker dialog

**Files:**
- Replace: `components/mentor-booking/StartupAvailabilityBrowser.tsx`
- Modify: `components/mentor-booking/MentorBookingWorkspace.tsx`
- Test: `tests/mentor-booking-ui/startup-calendar-browser.test.mts`

**Interfaces:**
- Consumes `buildStartupCalendar`, `rankAvailableMentors`, and existing `onRequest(slot, topic)`.
- Produces an accessible calendar grid and dialog that call the existing booking mutation exactly once per enabled submit.

- [ ] Write a failing UI contract test for the calendar label, mentor search/highlight state, dialog semantics, ranked mentor list, topic input, and existing request callback.
- [ ] Run `node --experimental-strip-types --test tests/mentor-booking-ui/startup-calendar-browser.test.mts` and confirm the former slot-wall implementation fails it.
- [ ] Implement the responsive week grid and controlled dialog; use native buttons, `role="dialog"`, `aria-modal`, Escape close, close focus restoration, and visible error/empty states.
- [ ] Re-run the focused UI test and confirm it passes.

### Task 4: Verification and handoff

**Files:**
- Modify: `docs/memory/handoff.md`
- Test: focused booking suites and project lint/type checks

- [ ] Run all three focused test groups and `npm run lint`.
- [ ] Run `npx tsc --noEmit`; distinguish feature failures from recorded concurrent baseline failures.
- [ ] Run authenticated startup desktop and narrow-viewport QA per `docs/runbooks/authenticated-qa.md` when a Browser surface is available; otherwise record the exact blocker.
- [ ] Update the task handoff with changed files, exact commands/results, and QA status.
