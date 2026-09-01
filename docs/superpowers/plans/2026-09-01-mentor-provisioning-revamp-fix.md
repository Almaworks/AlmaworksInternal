# Mentor Provisioning Revamp Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make admin-created mentor accounts use the canonical database-revamp API with a service-callable authorization contract and a deployable migration.

**Architecture:** Merge the canonical database-hardening cutover into `layth_rahman`, retain the enriched mentor onboarding inputs, and keep authorization in the database. The service-only `create_mentor_records` RPC will validate the supplied actor directly against canonical `platform_roles` and active semester-admin memberships because a service-role JWT has no human `auth.uid()`.

**Tech Stack:** Next.js, TypeScript, Supabase Auth, PostgREST RPC, PostgreSQL, RLS, pgTAP

**Spec:** `docs/architecture/identity-membership.md`

## Global Constraints

- Operate only on Supabase project `layjdjfvxkowxidwuvbs`.
- Do not bypass RLS from browser or authenticated-user code.
- Keep the privileged RPC executable only by `service_role` and `postgres`.
- Generate migrations with `supabase db diff`; never hand-edit migration SQL.
- Preserve unrelated changes on `layth_rahman`.
- Do not deploy remotely without explicit approval.

---

### Task 1: Integrate the canonical cutover

**Files:**
- Merge: `codex/database-hardening-cutover` into `layth_rahman`
- Modify: `app/api/admin/mentors/create/route.ts`
- Test: `tests/api/admin-mentor-create.test.mts`

**Interfaces:**
- Consumes: `requireSemesterAdmin`, `createMentorRecords`, and `provisionAuthBackedDatabaseMutation` from the canonical cutover.
- Produces: `POST /api/admin/mentors/create`, which passes the authenticated actor ID and enriched mentor fields to `create_mentor_records`.

- [ ] Commit the currently verified route regression test so the merge can preserve it.
- [ ] Merge `codex/database-hardening-cutover` without discarding participant-dashboard changes.
- [ ] Resolve the mentor route using the canonical server helpers while retaining `generalAvailability`, `preferredFormat`, and `openingTalk`.
- [ ] Run `node --experimental-strip-types --test tests/api/admin-mentor-create.test.mts` and confirm the service RPC receives the actor ID and all mentor fields.

### Task 2: Correct the service RPC authorization contract

**Files:**
- Modify: `supabase/schemas/zz_security.sql`
- Test: `supabase/tests/database/canonical_contract.test.sql`

**Interfaces:**
- Consumes: `p_actor_profile_id`, `p_semester_id`, `platform_roles`, and `semester_memberships`.
- Produces: a service-only `create_mentor_records(...) returns uuid` RPC that accepts a real super-admin or active semester admin and rejects unrelated actors.

- [ ] Add a failing pgTAP case that invokes `create_mentor_records` as `service_role` with no JWT `sub`, using an active canonical admin as `p_actor_profile_id`.
- [ ] Run the focused database test and confirm it fails with SQLSTATE `42501`.
- [ ] Replace the RPC's `private.can_manage_semester(...)` call with direct canonical actor checks inside the fixed-search-path `SECURITY DEFINER` function:

```sql
if not exists (
  select 1 from public.platform_roles
  where profile_id = p_actor_profile_id and role = 'super_admin'
) and not exists (
  select 1 from public.semester_memberships
  where semester_id = p_semester_id
    and profile_id = p_actor_profile_id
    and role = 'admin'
    and status = 'active'
) then
  raise exception 'Semester administrator access required' using errcode = '42501';
end if;
```

- [ ] Keep `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated`; retain grants only for `service_role` and `postgres`.
- [ ] Run the focused database test and confirm authorized provisioning passes and an unrelated actor remains rejected.

### Task 3: Generate and verify the deployable migration

**Files:**
- Create: `supabase/migrations/<generated>_fix_mentor_provisioning_authorization.sql`
- Regenerate: `src/db/types.ts`

**Interfaces:**
- Consumes: the corrected declarative schema.
- Produces: a clean forward-only migration and matching generated TypeScript types.

- [ ] Generate the migration with `supabase db diff -f fix_mentor_provisioning_authorization` against an isolated clean local stack.
- [ ] Review the migration to ensure it changes only `create_mentor_records` authorization and required grants.
- [ ] Reset the isolated stack from all migrations and regenerate `src/db/types.ts` from that schema.
- [ ] Run the focused pgTAP test, database advisors, `npm test`, `npx tsc --noEmit`, `npm run lint`, and `git diff --check`.
- [ ] Verify remotely, read-only, that project `layjdjfvxkowxidwuvbs` still lacks the new migration; do not deploy it without explicit approval.

