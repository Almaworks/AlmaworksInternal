# Participant Session Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the participant-facing legacy Sessions/RSVP experience with independent Availability/Bookings and Friday Program modules.

**Architecture:** The participant dashboard domain and API stop projecting legacy `sessions` data. `ParticipantDashboard` provides role-specific Availability/Bookings and a separate Friday Program tab, delegating data loading to the existing booking and Friday-program components. Historical session records and admin views remain untouched.

**Tech Stack:** Next.js 16, React 19, TypeScript strict mode, Supabase RLS client, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-10-participant-session-cutover-design.md`

## Global Constraints

- Retain Friday Program behavior and its existing `/api/friday-program` contract.
- Retain independent booking behavior and its existing `/api/mentor-booking` contract.
- Do not alter database tables, migrations, remote Supabase state, RLS, or administrator/history routes.
- Do not use `any`; retain TypeScript strict compatibility.
- Preserve unrelated dirty work in the shared current branch.

---

### Task 1: Retire legacy session projections from the participant dashboard contract

**Files:**
- Modify: `src/dashboard/participant-dashboard.ts`
- Modify: `src/dashboard/participant-dashboard-server.ts`
- Modify: `app/api/participant-dashboard/route.ts`
- Modify: `src/dashboard/participant-preview.ts`
- Modify: `tests/dashboard/participant-dashboard.test.mts`
- Modify: `tests/dashboard/participant-dashboard-server.test.mts`
- Modify: `tests/dashboard/participant-dashboard-notification-persistence.test.mts`
- Modify: `tests/dashboard/participant-notification-state.test.mts`

**Interfaces:**
- Consumes: existing active membership, network, profile, startup directory, and notification-read inputs.
- Produces: `ParticipantDashboardView` without `sessions`, session-derived notification kinds, or `sessions` destinations.

- [x] **Step 1: Write failing contract tests**

```ts
assert.equal("sessions" in dashboard, false);
assert.equal(dashboard.notifications.some((notice) => notice.kind === "session"), false);
```

- [x] **Step 2: Run the focused tests and verify they fail against the old contract**

Run: `node --experimental-strip-types --test tests/dashboard/participant-dashboard.test.mts tests/dashboard/participant-dashboard-server.test.mts tests/dashboard/participant-dashboard-notification-persistence.test.mts tests/dashboard/participant-notification-state.test.mts`

Expected: FAIL because the old model returns `sessions` and `session` notifications.

- [x] **Step 3: Remove session-specific types and projection logic**

```ts
export interface ParticipantDashboardView {
  // no sessions field
  notifications: Array<{
    kind: "activation";
    destination: "mentor-needs" | "profile";
  }>;
}
```

Remove session and meeting-slot queries, session attendee resolution, and assignment to `base.sessions` from the participant dashboard API loader. Keep the active-semester, membership, profile, startup, network, and notification-read queries.

- [x] **Step 4: Update preview and fixtures to use the session-free contract**

```ts
const dashboardSource = {
  notifications: [],
  network: [],
};
```

Remove legacy session fixtures and assertions; retain activation/read-notification assertions.

- [x] **Step 5: Run the focused tests and verify they pass**

Run: `node --experimental-strip-types --test tests/dashboard/participant-dashboard.test.mts tests/dashboard/participant-dashboard-server.test.mts tests/dashboard/participant-dashboard-notification-persistence.test.mts tests/dashboard/participant-notification-state.test.mts`

Expected: PASS.

### Task 2: Replace participant Sessions UI with Availability/Bookings and Friday Program destinations

**Files:**
- Modify: `app/dashboard/participant/ParticipantDashboard.tsx`
- Modify: `tests/dashboard/participant-bookings-entry.test.mts`
- Create: `tests/dashboard/participant-session-cutover-ui.test.mts`

**Interfaces:**
- Consumes: session-free `ParticipantDashboardView`, `MentorBookingWorkspace`, and `FridayProgramPanel`.
- Produces: mentor Availability and startup Bookings tabs, plus a role-independent Friday Program tab.

- [x] **Step 1: Write the failing UI source test**

```ts
assert.match(source, /id: "availability"[\s\S]*?label: "Availability"/u);
assert.match(source, /id: "bookings"[\s\S]*?label: "Bookings"/u);
assert.match(source, /id: "friday-program"[\s\S]*?label: "Friday Program"/u);
assert.doesNotMatch(source, /ParticipantSessionCard|respondToSession|session-rsvps/u);
```

- [x] **Step 2: Run the UI source test and verify it fails**

Run: `node --experimental-strip-types --test tests/dashboard/participant-session-cutover-ui.test.mts`

Expected: FAIL because the existing sidebar has `sessions` and imports the RSVP card.

- [x] **Step 3: Implement role-specific navigation and content**

```tsx
{tab === "availability" && isMentor && (
  <MentorBookingWorkspace semesterId={view.semester.id} heading="Your availability" />
)}
{tab === "bookings" && !isMentor && (
  <MentorBookingWorkspace semesterId={view.semester.id} heading="Mentor bookings" />
)}
{tab === "friday-program" && (
  <FridayProgramPanel semesterId={view.semester.id} startupSemesterId={view.startupSemesterId} />
)}
```

Replace home session cards with a role-appropriate action that opens Availability or Bookings. Remove RSVP imports, callback state, legacy Sessions tab state, and its session content. Keep existing network, profile, notification, and mentor-needs surfaces.

- [x] **Step 4: Update the old startup entry test and run UI tests**

Run: `node --experimental-strip-types --test tests/dashboard/participant-bookings-entry.test.mts tests/dashboard/participant-session-cutover-ui.test.mts tests/mentor-booking-ui/*.test.mts tests/friday-program-ui/*.test.mts`

Expected: PASS.

### Task 3: Validate the participant cutover and document handoff state

**Files:**
- Modify: `docs/memory/handoff.md`

- [x] **Step 1: Search the participant surface for legacy session/RVSP references**

Run: `rg -n "ParticipantSessionCard|respondToSession|session-rsvps|tab === \"sessions\"|base\.sessions|from\(\"sessions\"\)" app/dashboard/participant app/api/participant-dashboard src/dashboard tests/dashboard`

Expected: no production participant dashboard/API references; retained historical/admin tests and routes outside that scope are allowed.

- [x] **Step 2: Run focused checks**

Run: `node --experimental-strip-types --test tests/dashboard/*.test.mts tests/mentor-booking-ui/*.test.mts tests/friday-program-ui/*.test.mts`

Expected: PASS.

- [x] **Step 3: Run project checks**

Run: `npm run lint` then `npx tsc --noEmit`

Expected: report exact results; do not attribute unrelated existing failures to this cutover.

- [x] **Step 4: Update the active handoff section**

Record changed participant routes/contracts, exact validation outcomes, blocked browser QA, and the fact that no remote operation or database deletion occurred.

- [x] **Step 5: Inspect the scoped diff before handoff**

Run: `git diff --check -- app/dashboard/participant/ParticipantDashboard.tsx app/api/participant-dashboard/route.ts src/dashboard/participant-dashboard.ts src/dashboard/participant-dashboard-server.ts src/dashboard/participant-preview.ts tests/dashboard docs/memory/handoff.md`

Expected: no whitespace errors.
