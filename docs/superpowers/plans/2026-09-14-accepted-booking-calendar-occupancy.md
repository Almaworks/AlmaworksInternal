# Accepted Booking Calendar Occupancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make accepted mentor-startup sessions appear as temporary booked blocks for mentors and remove the occupied mentor from the corresponding startup booking slot.

**Architecture:** Persist a privacy-safe, RLS-protected accepted-occupancy projection synchronized transactionally from booking-request status. Add the sanitized projection to the booking workspace response, filter dated startup slots with it, and derive a current-week mentor overlay from the owning mentor’s private accepted requests.

**Tech Stack:** PostgreSQL/Supabase RLS and pgTAP, Next.js 16, React 19, strict TypeScript, Node test runner, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-14-accepted-booking-calendar-occupancy-design.md`

## Global Constraints

- Only operate on Supabase project `layjdjfvxkowxidwuvbs`; verify it before every remote operation.
- Do not perform any remote migration, deployment, booking mutation, email, or calendar action without separate authorization.
- Every new program-scoped relation has `semester_id uuid not null` and RLS; never bypass RLS.
- Edit declarative schema sources, generate migrations with `supabase db diff`, and regenerate `src/db/types.ts`; never hand-edit either generated artifact.
- Pending requests do not block; only accepted requests whose end is in the future block.
- The Friday 3–5 PM amber in-person reservation takes visual precedence over booked overlays.
- Preserve all unrelated dirty-worktree changes. Do not commit an untracked pre-existing implementation file unless its full contents have been reviewed as task-owned.

---

### Task 1: Privacy-safe accepted occupancy relation

**Files:**
- Modify: `supabase/schemas/mentor_booking_calendar.sql`
- Modify: `supabase/schemas/zzz_mentor_booking_calendar_security.sql`
- Modify: `supabase/tests/database/mentor_booking.test.sql`
- Generate: `supabase/migrations/<timestamp>_accepted_booking_occupancy.sql`
- Generate: `src/db/types.ts`

**Interfaces:**
- Produces table `public.mentor_booking_accepted_occupancy(request_id, semester_id, mentor_semester_id, starts_at, ends_at)`.
- Produces transactional synchronization from `mentor_booking_requests.status` and RLS-backed `SELECT` for active semester participants/admins.

- [ ] **Step 1: Add failing pgTAP assertions and lifecycle scenarios**

Add literal assertions that the relation has RLS, excludes private columns, rejects anonymous/cross-semester reads and fabricated writes, creates one exact row on acceptance, creates none for pending/declined requests, and deletes the row on cancellation. Extend existing fixtures to prove a different startup can see mentor/time occupancy but cannot read the private request.

- [ ] **Step 2: Run the database test and verify RED**

Run: `npx.cmd supabase test db --local --file supabase/tests/database/mentor_booking.test.sql`

Expected: FAIL because `mentor_booking_accepted_occupancy` does not exist.

- [ ] **Step 3: Add the declarative table, constraints, trigger, grants, and RLS**

Implement the exact columns from the spec, composite semester foreign keys, interval check, and semester/time indexes. Add an `AFTER INSERT OR UPDATE OF status` security-invoker trigger that inserts exact accepted request values and deletes occupancy when an accepted request becomes canceled. Insert/delete policies must validate the linked request, copied values, status, and current booking party; grant authenticated only `SELECT`, `INSERT`, and `DELETE` as required by those policies.

- [ ] **Step 4: Generate and review the migration**

Run: `npx.cmd supabase db diff -f accepted_booking_occupancy`

Verify the generated migration contains the table, backfill from existing accepted requests, RLS, narrow grants/policies, and trigger; verify it contains no unrelated destructive schema changes.

- [ ] **Step 5: Reset locally, regenerate types, and verify GREEN**

Run:

```powershell
npx.cmd supabase db reset --local
npx.cmd supabase gen types typescript --local | Set-Content -Encoding utf8 src/db/types.ts
npx.cmd supabase test db --local --file supabase/tests/database/mentor_booking.test.sql
npm.cmd run db:migration-safety
```

Expected: clean reset, pgTAP PASS, migration safety PASS.

- [ ] **Step 6: Commit only reviewed task-owned database files**

Run `git diff --check`, inspect the exact staged set, then commit with `feat: add accepted booking occupancy projection`. If unrelated or pre-existing untracked content cannot be isolated, leave the implementation uncommitted and record that constraint in handoff.

### Task 2: Booking workspace occupancy contract

**Files:**
- Modify: `src/mentor-booking/types.ts`
- Modify: `src/mentor-booking/model.ts`
- Modify: `src/mentor-booking/server.ts`
- Modify: `components/mentor-booking/presentation.ts`
- Modify: `tests/mentor-booking/model.test.mts`
- Modify: `tests/mentor-booking/server.test.mts`
- Modify: `tests/mentor-booking-ui/response-validation.test.mts`

**Interfaces:**
- Produces `MentorBookingAcceptedOccupancy = { mentorSemesterId: string; startsAt: string; endsAt: string }`.
- Adds `acceptedOccupancy: MentorBookingAcceptedOccupancy[]` to `MentorBookingWorkspaceResponse`.

- [ ] **Step 1: Write failing model, server, and response-validator tests**

Use hand-written fixtures proving sanitized output, invalid/cross-semester interval rejection, the exact Supabase query fields, and refreshed GET/POST workspaces containing `acceptedOccupancy` without request ID, startup name, or topic.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --experimental-strip-types --test tests/mentor-booking/model.test.mts tests/mentor-booking/server.test.mts tests/mentor-booking-ui/response-validation.test.mts`

Expected: FAIL because the response contract and occupancy loader are absent.

- [ ] **Step 3: Implement the minimal typed contract and loader**

Load `semester_id,mentor_semester_id,starts_at,ends_at` from the new relation in parallel with availability and private requests, scoped to the requested semester and future `ends_at`. Validate semester ownership and intervals before mapping to the sanitized public type. Extend the client response validator with strict string/timestamp checks.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command; expected PASS.

- [ ] **Step 5: Commit reviewed task-owned files**

Run scoped ESLint and `git diff --check`, then commit with `feat: expose privacy-safe booking occupancy`, subject to the dirty-worktree constraint.

### Task 3: Startup mentor-specific unavailability

**Files:**
- Modify: `src/mentor-booking/startup-availability.ts`
- Modify: `components/mentor-booking/StartupAvailabilityBrowser.tsx`
- Modify: `tests/mentor-booking/startup-availability.test.mts`
- Modify: `tests/mentor-booking/startup-calendar.test.mts`

**Interfaces:**
- Extends `StartupBookingSlotsInput` with `acceptedOccupancy`.
- Produces dated slots with any overlapping occupied mentor removed before `buildStartupCalendar` aggregates cells.

- [ ] **Step 1: Write failing startup projection tests**

Create literal fixtures with two mentors at the same time. Assert that accepted occupancy removes only the matching mentor, retains the other mentor and count, removes the entire cell when no mentor remains, ignores another time, and ignores ended occupancy using an explicit `now`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --experimental-strip-types --test tests/mentor-booking/startup-availability.test.mts tests/mentor-booking/startup-calendar.test.mts`

Expected: FAIL because occupancy is not consumed.

- [ ] **Step 3: Implement interval-overlap filtering**

Use `[startsAt, endsAt)` overlap semantics and match `mentorSemesterId`. Pass `data.acceptedOccupancy` from `StartupAvailabilityBrowser`; do not expose or render counterpart details.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command; expected PASS.

- [ ] **Step 5: Commit reviewed task-owned files**

Run scoped ESLint and `git diff --check`, then commit with `feat: hide occupied mentors from startup slots`, subject to the dirty-worktree constraint.

### Task 4: Current-week mentor booking overlay

**Files:**
- Create: `src/mentor-booking/mentor-calendar-occupancy.ts`
- Modify: `components/mentor-booking/MentorBookingWorkspace.tsx`
- Create: `tests/mentor-booking/mentor-calendar-occupancy.test.mts`
- Modify: `tests/mentor-booking-ui/calendar-interaction-contract.test.mts`

**Interfaces:**
- Produces `mentorBookedCells({ requests, now, timeZone }): Map<string, MentorBookedCell>` keyed by `weekday/time`.
- `MentorBookedCell` contains only `requestId`, `startupName`, `startsAt`, and `endsAt` needed by the owning mentor UI.

- [ ] **Step 1: Write failing occupancy-mapping tests**

Test accepted current-week sessions, Sunday/Saturday and timezone boundaries, an in-progress session, removal exactly at `endsAt`, and exclusion of pending/declined/canceled/next-week sessions. Assert a Friday reservation wins when cell presentation states are combined.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --experimental-strip-types --test tests/mentor-booking/mentor-calendar-occupancy.test.mts tests/mentor-booking-ui/calendar-interaction-contract.test.mts`

Expected: FAIL because the mapper and booked presentation are absent.

- [ ] **Step 3: Implement the pure mapper and minute clock**

Derive the current local Sunday–Saturday week using `Intl.DateTimeFormat` in the semester timezone. Expand accepted overlapping intervals into 15-minute cells while `endsAt > now`. In the workspace, update a `now` state every 60 seconds and clear the interval on unmount.

- [ ] **Step 4: Render violet disabled booked cells**

Pass booked cells into `PerDayCalendar`. Apply precedence `Friday reservation > accepted booking > selected availability > open`. Booked buttons are disabled, violet, and use `title`/`aria-label` text `Booked with <startup name>`; they do not alter the underlying recurring selected blocks.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Step 2 command; expected PASS.

- [ ] **Step 6: Commit reviewed task-owned files**

Run scoped ESLint and `git diff --check`, then commit with `feat: show accepted meetings on mentor calendar`, subject to the dirty-worktree constraint.

### Task 5: Integrated verification and handoff

**Files:**
- Modify: `docs/memory/decisions.md`
- Modify: `docs/memory/handoff.md`
- Create when browser QA is possible: `outputs/accepted-booking-calendar-occupancy-qa.md`

**Interfaces:**
- Consumes all prior tasks and records exact evidence without secrets or participant personal data.

- [ ] **Step 1: Run automated verification**

Run:

```powershell
node --experimental-strip-types --test tests/mentor-booking/*.test.mts tests/mentor-booking-ui/*.test.mts
npx.cmd eslint src/mentor-booking components/mentor-booking tests/mentor-booking tests/mentor-booking-ui
npx.cmd tsc --noEmit
npm.cmd run db:migration-safety
git diff --check
```

Report exact pass/fail counts. Separate pre-existing TypeScript failures from diagnostics in task files.

- [ ] **Step 2: Perform authenticated browser QA**

Follow `docs/runbooks/authenticated-qa.md`. With authorized fixtures, verify accept, mentor violet block, startup mentor removal, reload persistence, cancel, post-cancel restoration, after-end removal, error state, and permission boundary at desktop and narrow widths. Do not create/cancel a real participant booking without explicit fixture authorization.

- [ ] **Step 3: Update durable project memory**

Reread both memory files, add a distinct `2026-09-14-accepted-booking-calendar-occupancy` handoff section with exact validation and blockers, and record the accepted product decision without secrets or participant data.

- [ ] **Step 4: Final review and commit policy check**

Inspect `git status --short`, preserve unrelated changes, and do not make a blanket commit. If all implementation files are safely task-owned and lint passes, commit the final documentation with `docs: record booking occupancy verification`; otherwise hand off the uncommitted task paths explicitly.
