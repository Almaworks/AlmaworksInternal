# Admin Operational Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tabbed admin landing page with an operational Overview and sidebar-routable management modules.

**Architecture:** Extend the existing route-navigation helper with canonical admin module routes, then have the current client workspace select its content from the pathname. The existing access, members, and startups controls remain in their established component while Overview receives its own action-oriented content.

**Tech Stack:** Next.js App Router, React, TypeScript, Node test runner, Tailwind utility classes.

**Spec:** `docs/superpowers/specs/2026-09-11-admin-operational-overview-design.md`

## Global Constraints

- Preserve Supabase RLS and existing authorization behavior.
- No schema, migration, remote Supabase, or deployment work.
- Keep TypeScript strict; do not introduce `any`.
- Preserve existing management controls and their focused tests.

---

### Task 1: Canonical admin module navigation

**Files:**
- Modify: `src/assignments/schedule-navigation.ts`
- Modify: `tests/assignments/schedule-navigation.test.mts`

**Interfaces:**
- Produces: `AdminDashboardTab` with `overview`, `access`, `members`, `startups`, and `friday-program`; `adminDashboardHref(tab)` returns each module's canonical route.

- [ ] **Step 1: Write the failing route test**

```ts
assert.equal(adminDashboardHref("access"), "/dashboard/admin/access");
assert.equal(resolveAdminDashboardTab("/dashboard/admin"), "overview");
assert.equal(resolveAdminDashboardTab("/dashboard/admin/members"), "members");
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --experimental-strip-types --test tests/assignments/schedule-navigation.test.mts`

- [ ] **Step 3: Implement canonical route resolution and legacy query compatibility**

```ts
if (pathname === "/dashboard/admin/members") return "members";
if (pathname === "/dashboard/admin/startups") return "startups";
if (pathname === "/dashboard/admin/access") return "access";
return queryTab === "users" ? "access" : "overview";
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --experimental-strip-types --test tests/assignments/schedule-navigation.test.mts`

### Task 2: Sidebar module navigation

**Files:**
- Modify: `app/dashboard/layout.tsx`
- Modify: `tests/dashboard/dashboard-layout-view-as.test.mts`

**Interfaces:**
- Consumes: canonical module paths from `adminDashboardHref`.
- Produces: sidebar links labelled `Access`, `Members`, and `Startups` for admin workspaces.

- [ ] **Step 1: Write the failing static navigation test**

```ts
assert.match(source, /href: '\/dashboard\/admin\/access', label: 'Access'/u);
assert.match(source, /href: '\/dashboard\/admin\/members', label: 'Members'/u);
assert.match(source, /href: '\/dashboard\/admin\/startups', label: 'Startups'/u);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --experimental-strip-types --test tests/dashboard/dashboard-layout-view-as.test.mts`

- [ ] **Step 3: Add module links and matching icons**

```tsx
{ href: '/dashboard/admin/access', label: 'Access' },
{ href: '/dashboard/admin/members', label: 'Members' },
{ href: '/dashboard/admin/startups', label: 'Startups' },
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --experimental-strip-types --test tests/dashboard/dashboard-layout-view-as.test.mts`

### Task 3: Operational Overview and route-selected workspaces

**Files:**
- Modify: `app/dashboard/admin/page.tsx`
- Create: `app/dashboard/admin/access/page.tsx`
- Create: `app/dashboard/admin/members/page.tsx`
- Create: `app/dashboard/admin/startups/page.tsx`
- Create: `tests/dashboard/admin-operational-overview.test.mts`

**Interfaces:**
- Consumes: `resolveAdminDashboardTab(pathname, searchParams.get("tab"))`.
- Produces: overview-only signal cards and routes that render the appropriate established management section without a tab strip.

- [ ] **Step 1: Write failing source-level behavior tests**

```ts
assert.match(source, /tab === 'overview'/u);
assert.doesNotMatch(source, /Launch sequence/u);
assert.doesNotMatch(source, /Admin workspace[\s\S]*?\/\* Tabs \*\//u);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --experimental-strip-types --test tests/dashboard/admin-operational-overview.test.mts`

- [ ] **Step 3: Implement the overview and dedicated routes**

```tsx
{tab === 'overview' && <section aria-label="Operational signals">...</section>}
{tab === 'access' && <AccessWorkspace />}
```

Remove completed launch/onboarding progress from Overview; keep only action-required access signals for super admins.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --experimental-strip-types --test tests/dashboard/admin-operational-overview.test.mts`

### Task 4: Integrated verification

**Files:**
- Modify: `docs/memory/handoff.md`

- [ ] **Step 1: Run navigation and overview tests**

Run: `node --experimental-strip-types --test tests/assignments/schedule-navigation.test.mts tests/dashboard/dashboard-layout-view-as.test.mts tests/dashboard/admin-operational-overview.test.mts tests/dashboard/admin-members-table-layout.test.mts`

- [ ] **Step 2: Run lint on the changed app and navigation files**

Run: `npx eslint app/dashboard/layout.tsx app/dashboard/admin/page.tsx src/assignments/schedule-navigation.ts`

- [ ] **Step 3: Inspect desktop and narrow layouts in the running app**

Use the Browser surface on the local admin routes. Verify sidebar links, Overview action cards, and route-specific management pages.

- [ ] **Step 4: Record exact outcomes and any QA blocker in the task handoff section**
