# Local Dashboard Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce local dashboard transition latency without weakening Supabase/RLS authorization.

**Architecture:** Use Turbopack for the ordinary local development command, parallelize the independent authorization reads that gate each dashboard route, and keep participant shell data in component memory while lazily prefetching module APIs. No database schema, RLS policy, or public API contract changes are required.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase SSR/client SDK, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-10-local-dashboard-performance.md`

## Global Constraints

- All access control remains enforced through the existing Supabase RLS-backed server clients.
- Do not alter `supabase/migrations/` manually or add database changes.
- Preserve existing participant API response shapes and post-save refresh behavior.
- Do not overwrite unrelated worktree changes.

---

### Task 1: Turbopack default development command

**Files:**
- Modify: `package.json`
- Create: `tests/local-dev-performance.test.mts`

**Interfaces:**
- Consumes: the package `dev` script.
- Produces: a default script that invokes `next dev` and does not include `--webpack`.

- [ ] **Step 1: Write the failing test**

```ts
test("local dev uses Turbopack instead of forcing Webpack", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8")) as { scripts: { dev: string } };
  assert.equal(pkg.scripts.dev, "next dev");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/local-dev-performance.test.mts`

Expected: FAIL because `dev` is `next dev --webpack`.

- [ ] **Step 3: Write minimal implementation**

```json
"dev": "next dev"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/local-dev-performance.test.mts`

Expected: PASS.

### Task 2: Parallel canonical authorization reads

**Files:**
- Modify: `src/program/canonical-access.ts`
- Create: `tests/auth/canonical-access-performance.test.mts`

**Interfaces:**
- Consumes: `loadCanonicalAccess(client, authUserId)`.
- Produces: unchanged access object, with platform-role and membership requests initiated together after the profile ID is known.

- [ ] **Step 1: Write the failing test**

```ts
test("canonical access starts independent role and membership reads together", async () => {
  const calls: string[] = [];
  const client = fakeAccessClient(calls);
  const result = await loadCanonicalAccess(client, "auth-user");
  assert.deepEqual(calls.slice(1, 3), ["platform_roles", "semester_memberships"]);
  assert.equal(result?.role, "mentor");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/auth/canonical-access-performance.test.mts`

Expected: FAIL because the current implementation waits for `platform_roles` before starting `semester_memberships`.

- [ ] **Step 3: Write minimal implementation**

```ts
const [platformResult, membershipResult] = await Promise.all([
  client.from("platform_roles").select("role").eq("profile_id", profileId).eq("role", "super_admin"),
  client.from("semester_memberships").select("role,status,semester_id,semester:semesters!inner(name,is_active)")
    .eq("profile_id", profileId).in("status", ["invited", "onboarding", "active"])
    .order("is_active", { ascending: false, referencedTable: "semester" }),
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/auth/canonical-access-performance.test.mts`

Expected: PASS, with the existing access shape preserved.

### Task 3: Confirm participant-tab caching is unnecessary

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-local-dashboard-performance.md`

**Interfaces:**
- Consumes: the existing `ParticipantDashboard` `result` state and tab rendering branches.
- Produces: a documented decision not to add a duplicate cache or unactionable prefetch.

- [x] **Step 1: Trace tab lifecycle**

Confirm `load()` runs from the component's mount effect, the `result` snapshot remains in state through local tab changes, and Bookings/Friday Program mount only for their selected tab.

- [x] **Step 2: Preserve the existing lifecycle**

Do not introduce a second cache or prefetch requests whose responses cannot be supplied to the mounted module.

### Task 4: Integration verification and handoff

**Files:**
- Modify: `docs/memory/handoff.md`

- [ ] **Step 1: Run scoped quality checks**

Run: `npm.cmd run lint -- package.json src/program/canonical-access.ts src/dashboard/participant-dashboard-cache.ts app/dashboard/participant/ParticipantDashboard.tsx tests/local-dev-performance.test.mts tests/auth/canonical-access-performance.test.mts tests/dashboard/participant-dashboard-cache.test.mts`

Expected: zero lint errors in changed files.

- [ ] **Step 2: Run production compilation in an isolated output directory**

Run: `$env:ALMAWORKS_BUILD_DIR='.next-performance'; npm.cmd run build`

Expected: compilation succeeds or reports an existing, unrelated blocker with its exact file.

- [ ] **Step 3: Record outcome**

Update this task's `docs/memory/handoff.md` section with changed files, fresh test/build results, browser-QA blocker, and no remote Supabase operations.
