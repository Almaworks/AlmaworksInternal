# Startup Mentor Needs and Session RSVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give startup participants an always-available Mentor Needs workflow, show their full session history, and let eligible mentors and startup team members record a per-person RSVP until each session begins while administrators can inspect attendance counts and details.

**Architecture:** Keep Mentor Needs on the existing startup-semester record and reuse the existing authenticated endpoint/form. Add a semester-scoped `session_rsvps` table protected by RLS and expose RSVP writes through an authenticated route that resolves eligibility from canonical memberships. Extend the participant dashboard projection with attendee rows, the caller's response, and a server-computed write deadline. Extend the existing admin schedule query with RSVP details and render a focused attendance disclosure for each scheduled session. Preview mode uses fictional in-memory data only.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, Supabase Postgres/RLS, Node test runner, pgTAP, CSS modules/Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-01-startup-needs-session-rsvp-design.md`

## Global Constraints

- Operate only against Supabase project `layjdjfvxkowxidwuvbs`; verify the project reference before any remote command.
- `session_rsvps.semester_id` is non-null and references `semesters(id)`.
- Never use a service-role/admin client to implement participant RSVP reads or writes. Participant access must remain RLS-protected.
- Treat the existing `sessions.startup_absent` field as a separate post-session administrative fact; do not derive or overwrite it from RSVP responses.
- A missing RSVP row means `no_response`; stored values are only `attending` and `not_attending`.
- Participants can write only their own response and only before the session's start time. Admins are read-only for RSVP in this scope.
- Preserve unrelated dirty-worktree changes, especially the admin membership and VIEW AS work.
- Use declarative schema files as the source of truth, generate the migration with `supabase db diff`, and never hand-edit the generated migration.
- Regenerate `src/db/types.ts` after the schema change.

---

## Task 1: Define the RSVP domain contract and time boundary

**Files:**
- Create: `src/sessions/rsvp.ts`
- Create: `tests/sessions/rsvp.test.mts`

**Interfaces:**

```ts
export type SessionRsvpResponse = "attending" | "not_attending";
export type SessionRsvpState = SessionRsvpResponse | "no_response";

export interface SessionAttendeeRsvp {
  semesterMembershipId: string;
  profileId: string;
  fullName: string;
  role: "mentor" | "startup";
  response: SessionRsvpState;
  respondedAt: string | null;
  updatedAt: string | null;
}

export function sessionStartIso(input: {
  meetingDate: string;
  startsAt: string;
  timezone?: string | null;
}): string;

export function canChangeSessionRsvp(input: {
  now: string;
  sessionStartsAt: string;
  status: string;
}): boolean;

export function summarizeSessionRsvps(attendees: SessionAttendeeRsvp[]): {
  attending: number;
  notAttending: number;
  noResponse: number;
};
```

- [ ] Write tests proving missing rows project to `no_response`, each count is correct, cancelled sessions are locked, and equality with the start instant is locked.
- [ ] Add timezone tests for `America/New_York` including standard and daylight-saving offsets.
- [ ] Run `node --experimental-strip-types --test tests/sessions/rsvp.test.mts` and confirm the tests fail because the module does not exist.
- [ ] Implement the smallest domain helpers using `Intl.DateTimeFormat` offset calculation with a fallback timezone of `America/New_York`; reject invalid dates/times instead of silently treating them as writable.
- [ ] Re-run the focused test and confirm it passes.
- [ ] Commit only the two task files with message `feat: define session RSVP domain` after running lint.

## Task 2: Add the semester-scoped RSVP table, grants, RLS, and database tests

**Files:**
- Modify: `supabase/schemas/canonical_schema.sql`
- Modify: `supabase/schemas/zz_security.sql`
- Create: `supabase/tests/database/session_rsvps.test.sql`
- Generate: `supabase/migrations/<timestamp>_session_rsvps.sql`
- Regenerate: `src/db/types.ts`
- Modify: `tests/database-revamp/canonical-schema.test.mts`
- Modify: `docs/database-map.md`

**Schema:**

```sql
create table public.session_rsvps (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  semester_membership_id uuid not null references public.semester_memberships(id) on delete cascade,
  response text not null check (response in ('attending', 'not_attending')),
  responded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, semester_membership_id)
);
```

- [ ] Add a schema-contract test asserting the table, non-null semester FK, unique key, response check, RLS enablement, and indexes exist.
- [ ] Add pgTAP fixtures for one assigned mentor, two members of the assigned startup, an unrelated mentor/startup participant, and a semester admin.
- [ ] Add pgTAP assertions that assigned participants can see all eligible attendee rows for their session, unrelated participants see none, admins see all semester rows, and anonymous users have no privileges.
- [ ] Add pgTAP assertions that participants cannot insert/update another membership, cannot move an RSVP to another semester/session, and cannot delete RSVP history.
- [ ] In `canonical_schema.sql`, add the table, constraints, an index on `(semester_id, session_id)`, and the existing updated-at trigger convention.
- [ ] In `zz_security.sql`, enable RLS, explicitly revoke all from `anon` and `authenticated`, grant only `select, insert, update` to `authenticated`, and create separate select/insert/update policies. Eligibility must join `semester_memberships`, `mentor_semesters`, and `startup_team_memberships`; write policies must require `semester_membership_id` to belong to `auth.uid()` and the RSVP semester to equal the session/membership semester.
- [ ] Enforce the deadline in both insert/update RLS policies by deriving the meeting date plus numeric-slot start in `coalesce(semesters.configuration->>'timezone', 'America/New_York')`. Keep the same check in the authenticated server service so ordinary clients receive a clear deterministic 409 response instead of a generic policy error.
- [ ] Run the canonical schema test and `npx supabase test db supabase/tests/database/session_rsvps.test.sql`; confirm red before applying the schema.
- [ ] Generate the migration with `npx supabase db diff -f session_rsvps`, review that it contains only the intended table/constraints/index/grants/policies/trigger changes, and do not edit it.
- [ ] Run `npx supabase db reset`, regenerate types with `npx supabase gen types typescript --local | Set-Content -Encoding utf8 src/db/types.ts`, and run `npx supabase test db`.
- [ ] Update `docs/database-map.md` with ownership, semester scope, RLS visibility, and the distinction from `sessions.startup_absent`.
- [ ] Run `npm run db:migration-safety` and the canonical-schema test.
- [ ] Commit schema, generated migration, generated types, pgTAP test, schema test, and database map together with message `feat: store participant session RSVPs` after running lint.

## Task 3: Implement authenticated RSVP projection and mutation services

**Files:**
- Create: `src/sessions/rsvp-server.ts`
- Create: `tests/sessions/rsvp-server.test.mts`
- Create: `app/api/session-rsvps/route.ts`
- Create: `tests/sessions/rsvp-http.test.mts`

**Service contract:**

```ts
export interface SessionRsvpRepository {
  loadEligibleSession(sessionId: string, profileId: string): Promise<EligibleSessionRsvp | null>;
  upsertOwnResponse(input: {
    semesterId: string;
    sessionId: string;
    semesterMembershipId: string;
    response: SessionRsvpResponse;
    now: string;
  }): Promise<void>;
}

export function createSessionRsvpService(
  repository: SessionRsvpRepository,
  now?: () => string,
): {
  respond(profileId: string, input: { sessionId: string; response: SessionRsvpResponse }): Promise<void>;
};
```

- [ ] Write service tests for attending/not-attending upserts, invalid response, missing assignment, cancelled session, exact-start lock, and attempted response on behalf of another member.
- [ ] Write HTTP seam tests for 401, 422, 403/404-safe eligibility failure, 409 locked session, and 200 idempotent update.
- [ ] Run both new test files and confirm red.
- [ ] Implement the service so it derives `semesterId` and `semesterMembershipId` from the authenticated profile and eligible session; the client supplies only `sessionId` and `response`.
- [ ] Implement `PUT /api/session-rsvps` using `requireAuthenticatedUserWithRls`; query and mutate with `userClient`, never `adminClient`.
- [ ] On upsert, set `responded_at` and `updated_at` to the current server instant. Preserve `created_at` on updates.
- [ ] Return `{ data: { saved: true } }`; map validation to 422, eligibility to 404, start/cancel lock to 409, and auth failure to its existing status.
- [ ] Run the focused tests and confirm green.
- [ ] Commit the four task files with message `feat: add participant RSVP endpoint` after running lint.

## Task 4: Extend participant dashboard data with attendees and Mentor Needs summary

**Files:**
- Modify: `src/dashboard/participant-dashboard.ts`
- Modify: `src/dashboard/participant-dashboard-server.ts`
- Modify: `app/api/participant-dashboard/route.ts`
- Modify: `tests/dashboard/participant-dashboard.test.mts`
- Modify: `tests/dashboard/participant-dashboard-server.test.mts`

**Projection additions:**

```ts
export interface ParticipantMentorNeedsSummary {
  needs: string[];
  context: string | null;
  noPreference: boolean;
}

export interface ParticipantSessionInput {
  // existing fields
  sessionStartsAt: string;
  rsvpOpen: boolean;
  ownRsvp: SessionRsvpState;
  attendees: SessionAttendeeRsvp[];
}

export interface ParticipantDashboardView {
  // existing fields
  mentorNeeds: ParticipantMentorNeedsSummary | null;
}
```

- [ ] Add dashboard tests proving all upcoming and past assigned sessions remain present and sorted, RSVP writeability changes at the exact start instant, and role-visible attendee rows are attached only to owned sessions.
- [ ] Add tests proving startup views receive their current semester Mentor Needs summary while mentor views receive `null`.
- [ ] Run the two focused dashboard tests and confirm red.
- [ ] Extend the participant snapshot loader to fetch the current user's eligible membership, startup teammates, assigned mentor membership, and visible `session_rsvps` rows in bounded semester-scoped queries.
- [ ] Build each session's complete attendee list by left-projecting RSVP rows onto eligible memberships so missing rows become `no_response`.
- [ ] Compute `sessionStartsAt` and `rsvpOpen` server-side using the active semester timezone when available, otherwise `America/New_York`.
- [ ] Preserve all existing RLS-scoped session filtering and profile behavior.
- [ ] Run the focused tests and confirm green.
- [ ] Commit the five task files with message `feat: project participant session attendance` after running lint.

## Task 5: Add the startup Mentor Needs module and compact Home summary

**Files:**
- Modify: `components/mentor-needs/MentorNeedsForm.tsx`
- Create: `components/mentor-needs/MentorNeedsSummaryCard.tsx`
- Modify: `app/dashboard/participant/ParticipantDashboard.tsx`
- Modify: `app/design-preview/participant-dashboard/participant-dashboard.module.css`
- Create: `tests/mentor-needs/participant-mentor-needs.test.mts`
- Modify: `src/dashboard/participant-preview.ts`
- Modify: `tests/dashboard/participant-preview.test.mts`

- [ ] Add a component contract test asserting the startup navigation includes `Mentor Needs`, mentor navigation does not, and the Home card reflects primary/secondary/no-preference/incomplete states.
- [ ] Add preview fixture tests proving startup preview includes fictional Mentor Needs values and never calls the API when editing.
- [ ] Run the focused tests and confirm red.
- [ ] Refactor `MentorNeedsForm` to accept optional `initialRecord`, `preview`, and `onSaved` props. In preview mode, save only component state and report `Demo changes saved for this preview only`.
- [ ] Add `MentorNeedsSummaryCard` with primary and secondary chips, one-line context, setup status, and an `Edit mentor needs` action.
- [ ] Add a startup-only `mentor-needs` tab to desktop and mobile navigation; mount the full existing form there.
- [ ] Add the compact summary card to the startup Home page and wire both it and the activation step to the in-dashboard Mentor Needs tab instead of onboarding.
- [ ] Remove the duplicate startup Mentor Needs fields from the generic Profile form while preserving company snapshot and identity fields.
- [ ] Add responsive CSS for the summary card/form container and visible focus/disabled states.
- [ ] Run focused tests and confirm green.
- [ ] Commit the task files with message `feat: add startup Mentor Needs workspace` after running lint.

## Task 6: Add per-session RSVP controls and participant attendance visibility

**Files:**
- Create: `components/sessions/ParticipantSessionCard.tsx`
- Modify: `app/dashboard/participant/ParticipantDashboard.tsx`
- Modify: `app/design-preview/participant-dashboard/participant-dashboard.module.css`
- Create: `tests/sessions/participant-session-card.test.mts`
- Modify: `src/dashboard/participant-preview.ts`
- Modify: `tests/dashboard/participant-preview.test.mts`

- [ ] Add component contract tests for the three visible states, own-response buttons, startup teammate plus assigned mentor visibility, mentor startup-roster visibility, read-only past/cancelled sessions, loading state, error recovery, and preview-only mutation.
- [ ] Run focused tests and confirm red.
- [ ] Extract a reusable session card that shows date/time/partner/topic/format, `Attending` and `Not attending` controls, the caller's current response, and the visible attendee roster.
- [ ] On a real dashboard, call `PUT /api/session-rsvps`, optimistically disable the buttons, reload the participant dashboard after success, and keep the previous response plus an inline retry message on failure.
- [ ] On preview dashboards, update fictional local state only and never issue an authenticated request.
- [ ] Replace the Home page's single-session treatment with the next session plus a compact list of the next two additional upcoming sessions and an `All sessions` action.
- [ ] Render every upcoming and past session in the Sessions tab using the reusable card. Past and started sessions show responses read-only.
- [ ] Add accessible `aria-pressed`, status announcements, keyboard focus, mobile stacking, and no horizontal overflow.
- [ ] Run focused tests and confirm green.
- [ ] Commit the task files with message `feat: add participant session RSVPs` after running lint.

## Task 7: Show RSVP counts and details in the admin schedule

**Files:**
- Create: `src/sessions/admin-attendance.ts`
- Create: `tests/sessions/admin-attendance.test.mts`
- Modify: `app/dashboard/admin/page.tsx`
- Modify: `tests/program/canonical-admin.test.mts`

**Admin projection:**

```ts
export interface AdminSessionAttendance {
  attendees: SessionAttendeeRsvp[];
  counts: { attending: number; notAttending: number; noResponse: number };
}

export function buildAdminSessionAttendance(input: {
  eligibleMemberships: EligibleSessionMember[];
  rsvps: StoredSessionRsvp[];
}): AdminSessionAttendance;
```

- [ ] Add domain tests proving absent rows count as no response and timestamps remain attached to explicit responses.
- [ ] Add admin page contract tests for the attendance count affordance and member-detail labels.
- [ ] Run focused tests and confirm red.
- [ ] Extend the existing active-semester admin load with `session_rsvps` and eligible mentor/startup memberships. Keep the query semester-scoped and admin-authorized through existing RLS/capability checks.
- [ ] Add compact counts to populated schedule cells: attending, not attending, and awaiting response.
- [ ] Add a read-only RSVP section to the existing Edit Session modal showing each person's name, role, response, and last update time; do not add admin override controls.
- [ ] Keep `startup_absent` as its existing independent administrative control.
- [ ] Run focused tests and confirm green.
- [ ] Commit the task files with message `feat: show RSVP details to admins` after running lint.

## Task 8: Full verification and visual QA

**Files:**
- Modify only if verification exposes an in-scope defect.

- [ ] Verify `git diff --check` and inspect `git status --short` so unrelated pre-existing changes are not staged or overwritten.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run db:migration-safety`.
- [ ] Run `npx supabase db reset` and `npx supabase test db`.
- [ ] Run `npx supabase db lint --local --fail-on error`.
- [ ] Start the app and visually inspect real startup, real mentor, admin schedule, startup preview, and mentor preview at desktop and narrow mobile widths.
- [ ] Confirm all view transitions retain the safe loading sidebar behavior and that preview changes never persist.
- [ ] Confirm a startup member cannot see unrelated team/session data and cannot change a response once the session begins.
- [ ] Review the final diff for placeholders (`TODO`, `FIXME`, ellipses used as omissions), accidental `any`, generated-file hand edits, and unrelated files.
- [ ] Commit only any verification fixes after rerunning lint; otherwise leave the verified task commits unchanged.

## Definition of Done

- Startup Home contains a compact, accurate Mentor Needs summary and the sidebar contains a startup-only full Mentor Needs module.
- Startup and mentor participants see all their active-semester upcoming and past sessions.
- Every eligible participant has a three-state RSVP projection and may update only their own response before session start.
- Startup teammates and assigned mentors have the approved mutual visibility; unrelated participants receive no rows.
- Admin schedule shows counts, names, responses, and update timestamps without conflating RSVP with `startup_absent`.
- Preview mode is fictional and local-only.
- Generated migration, generated database types, RLS tests, application tests, lint, typecheck, database reset, and database lint pass.
