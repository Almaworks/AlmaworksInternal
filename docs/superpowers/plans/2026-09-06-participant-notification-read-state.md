# Participant Notification Read State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make participant notification rows open related workspaces and make the sidebar badge show the live unread count.

**Architecture:** Existing activation and session notices stay derived. One semester-scoped receipt table records reads by profile and stable notification key; the dashboard decorates derived notices from it and an authenticated route writes receipts idempotently.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict mode, Supabase Postgres/RLS, pgTAP, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-06-participant-notification-read-state-design.md`

## Global Constraints

- Do not create a notification inbox or duplicate notification-content table.
- `participant_notification_reads.semester_id` is non-null and references `semesters`.
- RLS protects every receipt read/write; participant code uses an authenticated user client, never a browser service role.
- Update declarative schema files; generate migrations with `supabase db diff`; regenerate `src/db/types.ts`.
- Session keys include session status; activation keys include activation-step ID.

---

### Task 1: Add deterministic read state to derived notifications

**Files:** Modify `src/dashboard/participant-dashboard.ts`; test `tests/dashboard/participant-dashboard.test.mts`.

**Produces:** Notification `key`, `read`, and `destination` fields plus `unreadNotificationCount(view)`.

- [ ] **Step 1: Write the failing tests.** Add an assertion that `readNotificationKeys: ["session-session-1-confirmed"]` marks only that notification read, and that a later `session-session-1-completed` notification remains unread.
- [ ] **Step 2: Verify RED.** Run `node --experimental-strip-types --test tests/dashboard/participant-dashboard.test.mts`; expect missing `readNotificationKeys` and `unreadNotificationCount` failures.
- [ ] **Step 3: Implement the model.** Define `unreadNotificationCount(view) { return view.notifications.filter((notification) => !notification.read).length; }`. Use `session-${session.id}-${session.status}` keys, `activation-${step.id}` keys, and destinations `sessions`, `availability`, `mentor-needs`, or `profile`.
- [ ] **Step 4: Verify GREEN.** Rerun `node --experimental-strip-types --test tests/dashboard/participant-dashboard.test.mts`; expect PASS.
- [ ] **Step 5: Commit.** Run `git add src/dashboard/participant-dashboard.ts tests/dashboard/participant-dashboard.test.mts` then `git commit -m "feat: model participant notification read state"`.

### Task 2: Add the consolidated receipt schema and RLS

**Files:** Modify `supabase/schemas/canonical_schema.sql` and `supabase/schemas/zz_security.sql`; generate a migration with `npx.cmd supabase db diff -f participant_notification_reads`; regenerate `src/db/types.ts`; test `supabase/tests/database/participant_notification_reads.test.sql`.

**Produces:** One owner-only `participant_notification_reads` table with `SELECT` and `INSERT` access.

- [ ] **Step 1: Write failing pgTAP tests.** Under the owner JWT, insert `(owner_profile, semester, "session-example-confirmed")` and assert success; under another participant JWT, insert the same semester receipt for `owner_profile` and assert SQLSTATE `42501`.
- [ ] **Step 2: Verify RED.** Run `npx.cmd supabase test db --file supabase/tests/database/participant_notification_reads.test.sql`; expect table-not-found failure.
- [ ] **Step 3: Implement the declarative table.** Add `profile_id uuid not null references public.profiles(id) on delete cascade`, `semester_id uuid not null references public.semesters(id) on delete cascade`, `notification_key text not null check (length(btrim(notification_key)) > 0)`, `read_at timestamptz not null default now()`, and primary key `(profile_id, semester_id, notification_key)`.
- [ ] **Step 4: Implement security.** Enable RLS; revoke from `PUBLIC` and `anon`; grant only `SELECT, INSERT` to `authenticated`; create separate select/insert policies requiring the canonical current profile and an existing membership for `semester_id`.
- [ ] **Step 5: Generate and verify.** Run `npx.cmd supabase db diff -f participant_notification_reads`, `npx.cmd supabase gen types typescript --local > src/db/types.ts`, and the pgTAP test; expect PASS.
- [ ] **Step 6: Commit.** Stage only the declarative schema, generated migration, generated types, and pgTAP test; commit `feat: persist participant notification read receipts`.

### Task 3: Load and persist participant reads

**Files:** Modify `src/dashboard/participant-dashboard-server.ts` and `app/api/participant-dashboard/route.ts`; create `app/api/participant-notifications/read/route.ts`; test `tests/dashboard/participant-dashboard-server.test.mts` and `tests/api/participant-notification-read-route.test.mts`.

**Produces:** Dashboard responses decorated with receipts and an idempotent `POST /api/participant-notifications/read`.

- [ ] **Step 1: Write failing tests.** Assert that a snapshot with `readNotificationKeys: ["session-1-confirmed"]` yields a read notice; assert the route returns 200 for the caller's active-semester valid key and rejects missing/blank key or mismatched semester.
- [ ] **Step 2: Verify RED.** Run `node --experimental-strip-types --test tests/dashboard/participant-dashboard-server.test.mts tests/api/participant-notification-read-route.test.mts`; expect absent repository data and route failures.
- [ ] **Step 3: Load receipts through RLS.** Query `participant_notification_reads(notification_key)` by `profile_id` and active `semester_id`, include those keys in the dashboard snapshot, and pass them into the Task 1 builder.
- [ ] **Step 4: Implement route.** Use `requireAuthenticatedUserWithRls`; validate a nonblank key and the caller's active participant semester; upsert `{ profile_id, semester_id, notification_key }` with conflict target `profile_id,semester_id,notification_key` and `ignoreDuplicates: true`; respond with `{ data: { notificationKey } }`.
- [ ] **Step 5: Verify GREEN and commit.** Rerun both focused tests, then stage these route/server/test files and commit `feat: record participant notification reads`.

### Task 4: Make participant notifications reactive and clickable

**Files:** Modify `app/dashboard/participant/ParticipantDashboard.tsx` and its module CSS; create `tests/dashboard/participant-dashboard-ui.test.mts`.

**Produces:** Accessible notification buttons, immediate unread-count updates, relevant navigation, and error recovery.

- [ ] **Step 1: Write a failing UI contract test.** Require the component source to use `unreadNotificationCount(view)`, call `/api/participant-notifications/read`, and invoke `openNotification(notice)` from Home and Notifications rows.
- [ ] **Step 2: Verify RED.** Run `node --experimental-strip-types --test tests/dashboard/participant-dashboard-ui.test.mts`; expect failure because the page uses `view.notifications.length` and static notification rows.
- [ ] **Step 3: Implement open-and-read.** Make rows `<button type="button">`; optimistically mark the key read in local view state, call `open(notice.destination)`, post `{ semesterId: view.semester.id, notificationKey: notice.key }`, and on error reload the dashboard and display concise save-failure feedback.
- [ ] **Step 4: Update the badge and styles.** Render the sidebar badge only for a positive unread count; retain unread emphasis only for `!notice.read`; keep read rows visible and neutral.
- [ ] **Step 5: Verify GREEN and commit.** Run the UI test and `npm.cmd run lint`; stage only participant UI/CSS/test files and commit `feat: open and mark participant notifications read`.

### Task 5: Verify the complete feature

- [ ] **Step 1: Run checks.** Run `npm.cmd test`, `npm.cmd run db:migration-safety`, `npm.cmd run lint`, and `git diff --check`; expect no failures or new whitespace errors.
- [ ] **Step 2: Check schema security.** Run `npx.cmd supabase db advisors`; expect no advisory attributable to `participant_notification_reads`.
- [ ] **Step 3: Inspect UI.** At desktop and narrow widths, open one unread notification; verify immediate badge decrement, destination navigation, and persistence after refresh.
