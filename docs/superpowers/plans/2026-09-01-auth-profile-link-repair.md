# Auth Profile Link Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore existing Supabase Auth-to-profile links and make every login route resolve the durable profile identity instead of assuming the Auth UUID is the profile UUID.

**Architecture:** Perform one guarded production data repair that links only exact legacy identity matches. Centralize Auth-user-to-profile resolution in a small, testable query helper, use its durable profile ID for canonical role and membership lookups, and distinguish an identity-link failure from a genuinely pending profile.

**Tech Stack:** Next.js, React, TypeScript, Supabase Auth/Postgres/RLS, Node test runner.

**Spec:** `docs/database-hardening-cutover-report.md`

## Global Constraints

- Operate only on Supabase project `layjdjfvxkowxidwuvbs`, verifying it before every remote operation.
- Preserve RLS and never use browser-controlled metadata for authorization.
- Never hand-edit `supabase/migrations`; this is a guarded production data correction, not schema DDL.
- Preserve unrelated worktree changes, especially the existing participant-onboarding edits in `proxy.ts`.
- Use strict TypeScript without `any`.

---

### Task 1: Guarded production identity backfill

**Files:**
- Modify: production `public.profiles` data only

**Interfaces:**
- Consumes: legacy invariant `profiles.id = auth.users.id` plus normalized email equality
- Produces: non-null `profiles.auth_user_id` for unambiguous legacy Auth-backed profiles

- [x] **Step 1: Re-verify the exact production project**

Read project metadata for `layjdjfvxkowxidwuvbs` and require the returned ID, ref, and name to match AlmaworksInternal.

- [x] **Step 2: Run a transactional guarded update**

Abort if any candidate has mismatched normalized emails. Update only rows where `profiles.id = auth.users.id`, `auth_user_id is null`, and normalized emails match.

- [x] **Step 3: Re-verify the project and validate the repair**

Assert zero matching Auth users remain unlinked, zero active admins remain unlinked, and the two recently used accounts resolve through `private.current_profile_id`.

### Task 2: Durable auth identity resolution

**Files:**
- Create: `src/auth/profile-access.ts`
- Create: `tests/auth/profile-access.test.mts`
- Modify: `src/program/canonical-access.ts`

**Interfaces:**
- Consumes: an authenticated Supabase client and Auth user UUID
- Produces: `loadProfileAccess(client, authUserId)` with durable `profileId`, status, activity, canonical role, and semester context

- [x] **Step 1: Write failing tests**

Cover a profile whose `id` differs from `auth_user_id`, a canonical admin membership, and an absent identity link returning `null` rather than pending access.

- [x] **Step 2: Run the focused test and confirm the expected failure**

Run `node --test --experimental-strip-types tests/auth/profile-access.test.mts` and require failure because the new resolver does not exist.

- [x] **Step 3: Implement the minimal resolver**

Query the profile by `auth_user_id`, retain its durable `id`, and use that ID for platform-role and semester-membership queries.

- [x] **Step 4: Run the focused test and confirm it passes**

Run the same focused test and require zero failures.

### Task 3: Correct callback, proxy, pending, and dashboard routing

**Files:**
- Modify: `proxy.ts`
- Modify: `app/auth/callback/route.ts`
- Modify: `app/pending/page.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/layout.tsx`
- Modify: `app/dashboard/admin/layout.tsx`
- Test: `tests/auth/profile-access.test.mts`
- Test: existing admin-route and dashboard tests

**Interfaces:**
- Consumes: the resolver from Task 2
- Produces: approved admins route to admin, genuine pending profiles route to pending, and missing identity links route to `/?error=identity_link_missing`

- [x] **Step 1: Add failing routing-decision tests**

Test literal outcomes for approved admin, pending profile, inactive profile, missing identity link, and lookup failure.

- [x] **Step 2: Run tests and confirm the new cases fail for the intended branch**

Use the focused Node test command and inspect each failure.

- [x] **Step 3: Implement a shared pure routing decision and adopt the durable profile ID**

Remove direct `profiles.id = auth user id` assumptions from the login path while retaining the existing server-side authoritative admin checks.

- [x] **Step 4: Run focused auth tests until green**

Run all `tests/auth/*.test.mts` and the relevant dashboard navigation tests.

### Task 4: Verification and live flow check

**Files:**
- Modify only if verification reveals a scoped defect

**Interfaces:**
- Consumes: completed repair and code changes
- Produces: evidence that regression tests, TypeScript, lint, build, and production identity resolution succeed

- [x] **Step 1: Run the complete test suite**

Run `npm test` and require zero failures.

- [x] **Step 2: Run static checks**

Run `npm exec tsc -- --noEmit`, `npm run lint`, and `npm run build`.

- [x] **Step 3: Verify production identity state read-only**

After re-verifying the project, confirm no exact legacy Auth matches or active admins remain unlinked.

- [ ] **Step 4: Inspect the live local login flow when browser access is available**

Confirm desktop and narrow views route an approved administrator directly to `/dashboard/admin`; if browser control remains unavailable, report that limitation and use route tests plus server/API logs as the substitute evidence.
