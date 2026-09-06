# Admin Membership Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give administrators an accurate current-semester activation queue, exact lifecycle labels, and an accessible domino switch between all and active members.

**Architecture:** Preserve `semester_memberships.status` and role-specific `readiness_status` as the canonical data. Extend the existing cohort read model with readiness, derive presentation states in a pure lifecycle module, and make all admin screens consume that shared model. Keep all mutations behind the existing authorized membership-activity route; create no schema migration.

**Tech Stack:** Next.js 16, React 19, TypeScript strict mode, Supabase/Postgres with RLS, Node test runner, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-01-admin-membership-lifecycle-design.md`

## Global Constraints

- Do not add or alter database tables, columns, enums, policies, or migrations.
- Treat `semester_memberships.status` as authoritative for invited, onboarding, active, alumni, and suspended.
- Derive Ready for activation only from membership `onboarding` plus role-specific `readiness_status = 'ready'`.
- Keep lifecycle mutations on `/api/admin/lifecycle/memberships/activity`; never update lifecycle fields from the browser.
- Default the Members view to All for the active semester; all-time cohort views remain read-only.
- Replace “Deactivate”/“Inactive” language with exact lifecycle language and “Suspend.”
- Run `npm run lint` before every commit.

---

### Task 1: Membership Presentation Model and Readiness Read Model

**Files:**
- Create: `src/lifecycle/membership-presentation.ts`
- Modify: `src/lifecycle/cohort-management.ts`
- Modify: `src/lifecycle/cohort-repository.ts`
- Create: `tests/lifecycle/membership-presentation.test.mts`
- Modify: `tests/lifecycle/cohort-management.test.mts`
- Create: `tests/lifecycle/cohort-repository.test.mts`

**Interfaces:**
- Produces: `MembershipPresentationState`, `MembershipReadinessStatus`, `membershipPresentationState(input)`, `membershipPresentation(input)`, and `filterMembershipsByVisibility(members, visibility)`.
- Extends: `CohortMember` with `readinessStatus: MembershipReadinessStatus`.
- Consumes: existing `MembershipStatus`, `ProgramRole`, mentor semester readiness, and startup semester readiness.

- [ ] **Step 1: Write failing presentation-state tests**

Create table-driven tests asserting these exact mappings:

```ts
const cases = [
  [{ status: "invited", readinessStatus: null }, "invited"],
  [{ status: "onboarding", readinessStatus: "not_started" }, "onboarding"],
  [{ status: "onboarding", readinessStatus: "in_progress" }, "onboarding"],
  [{ status: "onboarding", readinessStatus: "ready" }, "ready_for_activation"],
  [{ status: "active", readinessStatus: "ready" }, "active"],
  [{ status: "alumni", readinessStatus: "ready" }, "alumni"],
  [{ status: "suspended", readinessStatus: "ready" }, "suspended"],
] as const;
```

Also assert exact labels and actions: Ready for activation can activate; Active can suspend; Suspended can restore; Invited, Onboarding, and Alumni expose no lifecycle mutation.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --experimental-strip-types --test tests/lifecycle/membership-presentation.test.mts`

Expected: FAIL because `membership-presentation.ts` does not exist.

- [ ] **Step 3: Implement the pure presentation model**

Define:

```ts
export type MembershipReadinessStatus = "not_started" | "in_progress" | "ready" | null;
export type MembershipPresentationState =
  | "invited"
  | "onboarding"
  | "ready_for_activation"
  | "active"
  | "alumni"
  | "suspended";
export type MembershipVisibility = "all" | "active";

export interface MembershipPresentation {
  state: MembershipPresentationState;
  label: "Invited" | "Onboarding" | "Ready for activation" | "Active" | "Alumni" | "Suspended";
  tone: "neutral" | "progress" | "attention" | "success" | "historical" | "danger";
  action: "activate" | "suspend" | "restore" | null;
}
```

`membershipPresentationState` must examine readiness only when status is `onboarding`. `filterMembershipsByVisibility` must retain every row for `all` and only canonical `active` rows for `active`.

- [ ] **Step 4: Write failing cohort readiness tests**

Extend `CohortMember` fixtures with `readinessStatus`. Add repository tests using a typed fake Supabase client which return:

- one mentor membership with `mentor_semesters.readiness_status = 'ready'`;
- one startup membership connected through `startup_team_memberships` to `startup_semesters.readiness_status = 'in_progress'`;
- one admin membership with no role-specific record.

Assert the resulting readiness values are `ready`, `in_progress`, and `null` respectively.

- [ ] **Step 5: Run cohort tests and verify failure**

Run: `node --experimental-strip-types --test tests/lifecycle/cohort-management.test.mts tests/lifecycle/cohort-repository.test.mts`

Expected: FAIL because `CohortMember` and `loadCohortMembers` do not yet expose readiness.

- [ ] **Step 6: Extend the cohort repository without schema changes**

After loading memberships, query only the selected semesters:

```ts
client.from("mentor_semesters")
  .select("semester_membership_id,readiness_status")
  .in("semester_id", semesterIds);

client.from("startup_team_memberships")
  .select("semester_membership_id,startup_semester:startup_semesters!inner(readiness_status)")
  .in("semester_id", semesterIds);
```

Build a readiness map keyed by `semester_membership_id`, use `null` when no role-specific record exists, and return it on each `CohortMember`. Throw `CohortRepositoryError` for either query error.

- [ ] **Step 7: Run focused lifecycle tests**

Run: `node --experimental-strip-types --test tests/lifecycle/membership-presentation.test.mts tests/lifecycle/cohort-management.test.mts tests/lifecycle/cohort-repository.test.mts`

Expected: PASS.

- [ ] **Step 8: Lint and commit**

Run: `npm run lint`

Commit:

```bash
git add src/lifecycle/membership-presentation.ts src/lifecycle/cohort-management.ts src/lifecycle/cohort-repository.ts tests/lifecycle/membership-presentation.test.mts tests/lifecycle/cohort-management.test.mts tests/lifecycle/cohort-repository.test.mts
git commit -m "feat: derive canonical membership presentation states"
```

---

### Task 2: Needs Activation Workspace

**Files:**
- Create: `src/lifecycle/admin-activation.ts`
- Modify: `app/dashboard/admin/page.tsx`
- Create: `tests/lifecycle/admin-activation-workspace.test.mts`

**Interfaces:**
- Consumes: `membershipPresentation(member)` and cohort `readinessStatus` from Task 1.
- Produces: the **Needs activation** tab, badge count, ready-member rows, and registration-request subsection.
- Keeps: the internal tab id `users` and existing approve/reject API for global registration requests, avoiding URL breakage.

- [ ] **Step 1: Write failing workspace-model tests**

Add pure exported helpers near the lifecycle presentation model or in a focused `src/lifecycle/admin-activation.ts` module:

```ts
export function membersReadyForActivation(members: readonly CohortMember[]): CohortMember[];
export function activationAttentionCount(
  members: readonly CohortMember[],
  registrationRequestCount: number,
): number;
```

Test that only current scoped `onboarding + ready` members enter the activation list, and that the badge adds registration requests without counting invited or in-progress memberships.

- [ ] **Step 2: Run the workspace tests and verify failure**

Run: `node --experimental-strip-types --test tests/lifecycle/admin-activation-workspace.test.mts`

Expected: FAIL because the activation helpers do not exist.

- [ ] **Step 3: Implement the activation helpers**

Implement the helpers using `membershipPresentationState`; do not duplicate status conditions in the page component.

- [ ] **Step 4: Update the tab and activation UI**

In `app/dashboard/admin/page.tsx`:

- change the visible label from `Pending Users` to `Needs activation`;
- compute ready members from the currently selected cohort;
- set the badge to ready members plus global pending profiles;
- render Ready for activation first, with name, email, role, semester, and Activate;
- call the existing `toggleMemberActive`/membership activity route for Activate;
- refresh both cohort data and local member data after success;
- show failures inline without optimistic status changes;
- retain global pending profiles under a secondary Registration requests heading;
- show “Everyone is up to date.” when both sections are empty.

Export `ACTIVATION_TAB_LABEL = "Needs activation"` from the activation module and use it in the tab definition so the workspace test can enforce the copy. Preserve the internal `users` tab id and `?tab=users` URL compatibility.

- [ ] **Step 5: Run focused tests**

Run: `node --experimental-strip-types --test tests/lifecycle/admin-activation-workspace.test.mts`

Expected: PASS.

- [ ] **Step 6: Lint and commit**

Run: `npm run lint`

Commit:

```bash
git add app/dashboard/admin/page.tsx src/lifecycle/admin-activation.ts tests/lifecycle/admin-activation-workspace.test.mts
git commit -m "feat: add current-semester activation workspace"
```

---

### Task 3: Domino Visibility Switch and Exact Member Actions

**Files:**
- Create: `components/MembershipVisibilitySwitch.tsx`
- Modify: `app/dashboard/admin/page.tsx`
- Modify: `components/CohortScreenControls.tsx`
- Modify: `tests/lifecycle/membership-presentation.test.mts`
- Create: `tests/lifecycle/membership-visibility-component.test.mts`

**Interfaces:**
- Consumes: `MembershipVisibility`, `membershipPresentation`, and `filterMembershipsByVisibility` from Task 1.
- Produces: `MembershipVisibilitySwitch({ value, onChange })` with values `all` and `active`.

- [ ] **Step 1: Write failing visibility and component-contract tests**

Assert:

```ts
assert.deepEqual(
  filterMembershipsByVisibility(rows, "all").map(row => row.status),
  ["invited", "onboarding", "active", "alumni", "suspended"],
);
assert.deepEqual(
  filterMembershipsByVisibility(rows, "active").map(row => row.status),
  ["active"],
);
```

Add a source-level component contract test that reads `MembershipVisibilitySwitch.tsx` and verifies the component contains two buttons, `aria-pressed`, the exact labels `All` and `Active only`, and visible focus-ring classes. This repository does not include a DOM test runner, so behavior remains covered by the pure filter test and visual verification.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --experimental-strip-types --test tests/lifecycle/membership-presentation.test.mts tests/lifecycle/membership-visibility-component.test.mts`

Expected: FAIL because the switch component does not exist.

- [ ] **Step 3: Build the domino-style switch**

Create a compact rounded two-cell control. Each half is a real `button type="button"`; the selected half has a filled circular pip and stronger contrast, while the unselected half has an outlined pip. Add a visible label beside each pip, `aria-pressed`, `aria-label="Show all members"` / `aria-label="Show active members only"`, and `focus-visible:ring-2` styling. Do not rely on color alone.

- [ ] **Step 4: Replace boolean member filtering with exact lifecycle filtering**

In `app/dashboard/admin/page.tsx`:

- replace `memberShowAll: boolean` with `memberVisibility: MembershipVisibility`, defaulting to `all`;
- filter using the selected cohort membership and `filterMembershipsByVisibility`;
- render the exact status label and tone from `membershipPresentation`;
- show Activate only for Ready for activation, Suspend only for Active, Restore only for Suspended, and no mutation for Invited, Onboarding, or Alumni;
- change confirmation/copy from Deactivate/Inactive to Suspend/Suspended;
- keep all-time and historical cohort views mutation-disabled.

In `components/CohortScreenControls.tsx`, relabel bulk `Set Inactive` as `Suspend selected` and the success message as suspended. Preserve the API input `activity: "inactive"` because it already maps to canonical `suspended` server-side.

- [ ] **Step 5: Run focused tests**

Run: `node --experimental-strip-types --test tests/lifecycle/membership-presentation.test.mts tests/lifecycle/membership-visibility-component.test.mts tests/lifecycle/cohort-commands.test.mts`

Expected: PASS.

- [ ] **Step 6: Lint and commit**

Run: `npm run lint`

Commit:

```bash
git add components/MembershipVisibilitySwitch.tsx components/CohortScreenControls.tsx app/dashboard/admin/page.tsx tests/lifecycle/membership-presentation.test.mts tests/lifecycle/membership-visibility-component.test.mts
git commit -m "feat: clarify member lifecycle controls"
```

---

### Task 4: Align Mentor and Startup Directories

**Files:**
- Modify: `src/program/canonical-repository.ts`
- Modify: `app/dashboard/admin/mentors/page.tsx`
- Modify: `app/dashboard/admin/page.tsx`
- Modify: `tests/program/canonical-repository.test.mts`
- Create: `tests/lifecycle/directory-lifecycle.test.mts`

**Interfaces:**
- Consumes: shared `membershipPresentation` from Task 1.
- Produces: directory rows containing canonical `membership_status`, `readiness_status`, and `adminMemberHref(email)` for lifecycle-management links.

- [ ] **Step 1: Write failing directory mapping tests**

Test mentor and startup directory rows for:

- onboarding + ready → Ready for activation;
- active → Active;
- alumni → Alumni;
- suspended → Suspended.

Assert directories do not expose a direct boolean toggle and generate a management URL shaped as:

```ts
`/dashboard/admin?tab=members&member=${encodeURIComponent(email)}`
```

Add `adminMemberHref(email: string): string` to `src/assignments/schedule-navigation.ts` and cover encoding plus the canonical Members tab path in `tests/assignments/schedule-navigation.test.mts`.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --experimental-strip-types --test tests/program/canonical-repository.test.mts tests/lifecycle/directory-lifecycle.test.mts`

Expected: FAIL because directory rows currently collapse lifecycle to `is_active`.

- [ ] **Step 3: Preserve canonical lifecycle data in directory reads**

Update directory row mappings to return `membership_status` and `readiness_status` alongside the compatibility `is_active` field where other callers still require it. Do not derive lifecycle from `profiles.is_active` and do not change database types.

- [ ] **Step 4: Replace directory toggles with lifecycle labels and management links**

On the Mentors page and the Startups section:

- render the same label/tone mapping as Members;
- remove the direct clickable Active/Inactive toggle;
- add a Manage lifecycle link targeting the Members tab and member email;
- initialize the Members search from the `member` query parameter so the linked row is immediately visible;
- retain profile-edit controls separately from lifecycle controls.

- [ ] **Step 5: Run focused tests**

Run: `node --experimental-strip-types --test tests/program/canonical-repository.test.mts tests/lifecycle/directory-lifecycle.test.mts tests/assignments/schedule-navigation.test.mts`

Expected: PASS.

- [ ] **Step 6: Lint and commit**

Run: `npm run lint`

Commit:

```bash
git add src/program/canonical-repository.ts app/dashboard/admin/mentors/page.tsx app/dashboard/admin/page.tsx tests/program/canonical-repository.test.mts tests/lifecycle/directory-lifecycle.test.mts tests/assignments/schedule-navigation.test.mts
git commit -m "feat: align directory lifecycle presentation"
```

---

### Task 5: End-to-End Verification and Visual QA

**Files:**
- Modify only if verification identifies a defect in files already listed above.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified onboarding-to-activation behavior with no schema changes.

- [ ] **Step 1: Run the complete automated test suite**

Run: `npm test`

Expected: all tests pass. If an unrelated existing failure remains, record its exact test name and confirm every new focused test passes independently.

- [ ] **Step 2: Run static verification**

Run:

```bash
npm run lint
npx tsc --noEmit
git status --short
git diff --check
```

Expected: no new lint errors, no TypeScript errors, no whitespace errors, and no migration or generated database type changes from this feature.

- [ ] **Step 3: Verify the admin workflow in the browser**

Using an admin session and a disposable onboarding mentor/startup:

1. Confirm the active semester is selected by default.
2. Confirm an onboarding-in-progress member shows Onboarding and no Activate action.
3. Complete onboarding and confirm Needs activation gains a badge and Ready for activation row.
4. Activate the member and confirm the row becomes Active and leaves Needs activation.
5. Toggle the domino control between All and Active only and confirm no state mutation occurs.
6. Confirm a prior-semester member appears as Alumni only in its historical cohort/all-time view.
7. Suspend an active disposable membership, confirm Suspended, then Restore it.
8. Confirm mentor/startup directory links open the filtered Members lifecycle row.

- [ ] **Step 4: Inspect responsive and accessibility behavior**

Check desktop and narrow/mobile widths. Verify keyboard navigation, visible focus, `aria-pressed` changes, readable status text without color, no horizontal overflow introduced by the switch, and loading/error feedback after lifecycle actions.

- [ ] **Step 5: Final lint and commit only verification fixes**

If verification required code changes, run `npm run lint`, stage only the files changed for those fixes, and commit:

```bash
git commit -m "fix: polish membership lifecycle workflow"
```

If no changes were required, do not create an empty commit.
