# Member Login Account Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a platform super-administrator permanently remove a mentor or startup Supabase Auth login while retaining contact information and complete program history, with a safe restoration path.

**Architecture:** Keep `public.profiles` as the durable identity and use its existing nullable `auth_user_id` link. Authenticated, super-admin-only database commands prepare removal and reconnect replacement Auth identities; a server orchestration layer coordinates those commands with Supabase Auth Admin calls and exposes recoverable partial outcomes to a focused Members-table component.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, Supabase Auth/Postgres/RLS, Node test runner, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-01-member-login-account-removal-design.md`

## Global Constraints

- Work directly on `layth_rahman`; preserve every unrelated modified or untracked file.
- Only operate against Supabase project `layjdjfvxkowxidwuvbs`; verify the project reference before every remote operation. This plan requires no remote deployment.
- The feature is named **Remove login account**, never **Delete member** or **Delete personal data**.
- Retain profile/contact data, mentor/startup data, semester history, availability, and sessions.
- Suspend `invited`, `onboarding`, and `active` memberships; leave Alumni unchanged.
- Only platform super-administrators may remove or restore login identities.
- Never expose the service role to the browser and never use browser-controlled metadata for authorization.
- Use the existing profile, membership, and audit tables; add no table, column, enum value, or replacement history model.
- Never hand-edit a file in `supabase/migrations/`; generate the migration with `supabase db diff` after checking `supabase db diff --help`.
- Regenerate `src/db/types.ts` from the local schema after database command changes.
- Implement with tests first and run `npm run lint` before each commit.

---

### Task 1: Account state, validation, and capability contract

**Files:**
- Create: `src/auth/member-login-account.ts`
- Create: `tests/auth/member-login-account.test.mts`
- Modify: `src/auth/admin-capability.ts`
- Modify: `app/api/auth/capabilities/route.ts`
- Modify: `tests/auth/admin-capability.test.mts`

**Interfaces:**
- Produces: `MemberLoginState`, `memberLoginPresentation(input)`, `parseRemoveMemberLoginBody(value)`, `parseRestoreMemberLoginBody(value)`, and `canRemoveMemberLogin` in the capability response.
- Consumes: existing `loadAdminRouteAuthority`/`platform_roles` authority lookup.

- [ ] **Step 1: Write failing domain tests**

Cover all account states and request validation:

```ts
assert.deepEqual(subject.memberLoginPresentation({ authUserId: "auth-1", latestRemovalAuditAction: null, profileActive: true }), {
  action: "remove",
  label: "Login enabled",
  state: "enabled",
  tone: "success",
});
assert.equal(subject.memberLoginPresentation({ authUserId: "auth-1", latestRemovalAuditAction: null, profileActive: false }).state, "disabled");
assert.equal(subject.memberLoginPresentation({ authUserId: "auth-1", latestRemovalAuditAction: "member.login_removal_prepared", profileActive: false }).state, "removal_incomplete");
assert.equal(subject.memberLoginPresentation({ authUserId: null, latestRemovalAuditAction: "member.login_removal_prepared", profileActive: false }).state, "removed");
assert.equal(subject.memberLoginPresentation({ authUserId: null, latestRemovalAuditAction: null, profileActive: true }).state, "not_configured");
assert.deepEqual(subject.parseRemoveMemberLoginBody({ confirmation: "REMOVE", reason: "Duplicate test account" }), {
  confirmation: "REMOVE",
  reason: "Duplicate test account",
});
assert.throws(() => subject.parseRemoveMemberLoginBody({ confirmation: "remove", reason: "x" }), /type REMOVE/u);
```

Extend capability tests so a super-admin receives both `canManageAdmin: true` and `canRemoveMemberLogin: true`, while a semester admin receives `canManageAdmin: true` and `canRemoveMemberLogin: false`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
node --experimental-strip-types --test tests/auth/member-login-account.test.mts tests/auth/admin-capability.test.mts
```

Expected: FAIL because the domain module and capability field do not exist.

- [ ] **Step 3: Implement the pure domain module**

Define exact public types:

```ts
export type MemberLoginState = "enabled" | "disabled" | "removal_incomplete" | "removed" | "not_configured";
export type MemberLoginAction = "remove" | "retry_removal" | "restore";
export type MemberLoginPresentation = {
  action: MemberLoginAction;
  label: string;
  state: MemberLoginState;
  tone: "success" | "warning" | "muted";
};
export type RemoveMemberLoginBody = { confirmation: "REMOVE"; reason: string };
export type RestoreMemberLoginBody = { confirmation: "RESTORE" };
```

Use `authUserId`, the existing `profiles.is_active` flag, and `latestRemovalAuditAction: "member.login_removal_prepared" | "member.login_restored" | null` to derive state. Never classify an ordinarily disabled account as removal-incomplete. Normalize whitespace in the reason; require at least three non-whitespace characters and a maximum of 500 characters. Require exact uppercase confirmation tokens.

- [ ] **Step 4: Extend the capability response without weakening existing admin access**

Change `resolveAdminCapability` to return:

```ts
Promise<{ canManageAdmin: boolean; canRemoveMemberLogin: boolean }>
```

Set `canRemoveMemberLogin` only from the platform-role lookup. Preserve fail-closed behavior when either lookup errors. Return the expanded object from `/api/auth/capabilities`.

- [ ] **Step 5: Run focused tests, TypeScript, and lint**

Run:

```powershell
node --experimental-strip-types --test tests/auth/member-login-account.test.mts tests/auth/admin-capability.test.mts
npx tsc --noEmit
npm run lint
```

Expected: all focused tests pass, TypeScript exits 0, lint has no errors.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- src/auth/member-login-account.ts tests/auth/member-login-account.test.mts src/auth/admin-capability.ts app/api/auth/capabilities/route.ts tests/auth/admin-capability.test.mts
git commit -m "feat: define member login account states"
```

---

### Task 2: RLS-authorized removal and restoration commands

**Files:**
- Modify: `supabase/schemas/canonical_schema.sql`
- Create (generated only): `supabase/migrations/*_member_login_account_commands.sql`
- Modify (generated only): `src/db/types.ts`
- Create: `supabase/tests/database/member_login_account_commands.test.sql`
- Create: `tests/database-revamp/member-login-account-schema.test.mts`

**Interfaces:**
- Produces: RPC `preview_member_login_removal(uuid)`, RPC `prepare_member_login_removal(uuid,text)`, and RPC `attach_replacement_auth_identity(uuid,uuid)`.
- Consumes: `private.current_profile_id()`, `private.is_super_admin(auth.uid())`, `public.profiles`, `public.platform_roles`, `public.semester_memberships`, mentor/startup/session relationships, and `public.program_audit_events`.

- [ ] **Step 1: Confirm the local migration baseline before editing**

Run:

```powershell
supabase --version
supabase status
supabase migration list --local
supabase db diff --help
git status --short -- supabase src/db/types.ts
```

Do not discard or rewrite the existing mentor-account-access migration or concurrent schema edits. If local migration history is not current, apply existing local migrations before generating this feature's diff. Never operate remotely in this task.

- [ ] **Step 2: Write failing schema-contract and pgTAP tests**

The Node schema contract must assert that all three function signatures exist, are revoked from `PUBLIC`/`anon`, and are executable only by `authenticated` and `postgres` as appropriate.

The database test must establish a super-admin actor, an ordinary retained profile, Alumni and Active memberships, profile/contact extensions, and session history. Assert:

```sql
select throws_ok(
  $$ select * from public.prepare_member_login_removal('<target>'::uuid, 'reason') $$,
  '42501',
  'Platform super-administrator access required'
);

-- Under the super-admin JWT:
select results_eq(
  $$ select profile_is_active from public.prepare_member_login_removal('<target>'::uuid, 'Duplicate test account') $$,
  array[false]
);
select is((select status::text from public.semester_memberships where id = '<active-membership>'), 'suspended');
select is((select status::text from public.semester_memberships where id = '<alumni-membership>'), 'alumni');
select is((select email from public.profiles where id = '<target>'), 'retained@example.com');
```

Also test self-removal rejection, platform-role target rejection, idempotent retry, one audit event per affected semester, placeholder safety checks, and attachment without membership activation.

- [ ] **Step 3: Run tests and verify failure**

Run:

```powershell
node --experimental-strip-types --test tests/database-revamp/member-login-account-schema.test.mts
supabase test db supabase/tests/database/member_login_account_commands.test.sql
```

Expected: FAIL because the RPCs do not exist.

- [ ] **Step 4: Add the database commands to the declarative schema**

Implement `preview_member_login_removal(p_profile_id uuid)` as a read-only, super-admin-authorized function returning one row containing:

```sql
profile_id uuid,
auth_user_id uuid,
full_name text,
email text,
profile_is_active boolean,
semester_count bigint,
session_count bigint,
suspend_membership_ids uuid[],
already_prepared boolean
```

Implement `prepare_member_login_removal(p_profile_id uuid, p_reason text)` to:

1. require `auth.uid()` and `private.is_super_admin(auth.uid())`;
2. reject the actor's own durable profile and any target in `public.platform_roles`;
3. lock the target profile with `FOR UPDATE`;
4. set `profiles.is_active = false` only when needed;
5. transition only `invited`, `onboarding`, and `active` memberships to `suspended`;
6. preserve contact/profile/session records and Alumni states;
7. insert `member.login_removal_prepared` audit events with the reason, prior statuses, target profile, and affected IDs;
8. return the retained profile ID, linked Auth ID, disabled state, and affected membership IDs;
9. produce no duplicate state changes or audit events on retry.

Implement `attach_replacement_auth_identity(p_profile_id uuid, p_auth_user_id uuid)` to:

1. repeat the super-admin/self/platform-role checks;
2. require the retained profile to have `auth_user_id IS NULL` and `is_active = false`;
3. lock both the retained profile and Auth-trigger-created placeholder;
4. require equal normalized emails;
5. reject a placeholder with memberships, roles, mentor/startup extensions, invitations, audit authorship, or other durable references;
6. delete only the verified empty placeholder;
7. connect the replacement Auth ID to the retained profile and set `is_active = true`;
8. insert `member.login_restored` audit events using retained membership semesters;
9. leave every membership status unchanged.

All functions must use explicit `public.`/`private.` qualification, a locked-down search path, and explicit `auth.uid()` checks. Apply these exact privilege shapes to each exact signature:

```sql
revoke all on function public.preview_member_login_removal(uuid) from public, anon;
revoke all on function public.prepare_member_login_removal(uuid, text) from public, anon;
revoke all on function public.attach_replacement_auth_identity(uuid, uuid) from public, anon;
grant execute on function public.preview_member_login_removal(uuid) to authenticated, postgres;
grant execute on function public.prepare_member_login_removal(uuid, text) to authenticated, postgres;
grant execute on function public.attach_replacement_auth_identity(uuid, uuid) to authenticated, postgres;
```

Do not grant them to `service_role` as an application-facing authorization path.

- [ ] **Step 5: Generate—never hand-write—the migration and types**

Use the exact flags confirmed by `supabase db diff --help`, with descriptive suffix `member_login_account_commands`. Review the resulting generated SQL and reject it if it contains unrelated schema changes. Then run:

```powershell
supabase gen types typescript --local > src/db/types.ts
supabase migration list --local
```

- [ ] **Step 6: Run database verification**

Run:

```powershell
node --experimental-strip-types --test tests/database-revamp/member-login-account-schema.test.mts
supabase test db supabase/tests/database/member_login_account_commands.test.sql
npm run db:migration-safety
npx tsc --noEmit
npm run lint
```

Expected: schema contract, pgTAP, migration safety, TypeScript, and lint pass.

- [ ] **Step 7: Commit Task 2 without unrelated schema files**

Stage only `canonical_schema.sql`, the newly generated migration, regenerated types, and the two tests. Inspect `git diff --cached --name-only` before committing.

```powershell
git commit -m "feat: add retained-history login account commands"
```

---

### Task 3: Recoverable Supabase Auth orchestration and API

**Files:**
- Create: `src/auth/member-login-account-server.ts`
- Create: `tests/auth/member-login-account-server.test.mts`
- Create: `app/api/admin/members/[profileId]/login/route.ts`
- Create: `tests/auth/member-login-account-route.test.mts`

**Interfaces:**
- Consumes: Task 1 parsers; Task 2 RPCs; `requireAuthenticatedUser`; Supabase Auth Admin `deleteUser`, `generateLink`, and cleanup `deleteUser`.
- Produces: `previewMemberLoginRemoval`, `removeMemberLogin`, `restoreMemberLogin`, `MemberLoginReconciliationError`, and GET/DELETE/POST route responses.

- [ ] **Step 1: Write failing orchestration tests**

Use injected dependencies and record call order. Required removal assertion:

```ts
assert.deepEqual(events, [
  { prepare: { p_profile_id: "profile-1", p_reason: "Duplicate test account" } },
  { deleteAuth: { shouldSoftDelete: false, userId: "auth-1" } },
  { verify: "profile-1" },
]);
```

Test these outcomes:

- preparation failure never calls Auth;
- Auth failure throws `MemberLoginReconciliationError` with `databaseState: "disabled"`;
- already-unlinked removal is idempotent;
- successful verification requires `auth_user_id === null`;
- restore generates an invite, attaches its Auth user to the retained profile, and returns the action link;
- attachment failure deletes the newly created Auth identity;
- failed/ambiguous cleanup throws reconciliation required;
- restore never invokes membership activation.

- [ ] **Step 2: Write failing route tests**

Exercise exported handlers with a promised dynamic `profileId`. Assert status mapping:

```ts
400 // malformed JSON, invalid UUID, confirmation, or reason
401 // unauthenticated
403 // not super-admin, self, or platform-role target
404 // target missing
409 // conflicting target/placeholder state
502 // cross-system reconciliation required
200 // preview/removal/restoration success
```

- [ ] **Step 3: Run tests and verify failure**

```powershell
node --experimental-strip-types --test tests/auth/member-login-account-server.test.mts tests/auth/member-login-account-route.test.mts
```

Expected: FAIL because the server and route modules do not exist.

- [ ] **Step 4: Implement the injected service**

Define a dependency boundary containing only the required methods:

```ts
export interface MemberLoginAccountClient {
  preview(profileId: string): Promise<RpcResult<MemberLoginRemovalPreviewRow[]>>;
  prepare(args: { p_profile_id: string; p_reason: string }): Promise<RpcResult<MemberLoginRemovalPreparedRow[]>>;
  deleteAuthUser(userId: string, shouldSoftDelete: false): Promise<AuthDeleteResult>;
  generateInvite(email: string, redirectTo: string): Promise<AuthInviteResult>;
  attach(args: { p_auth_user_id: string; p_profile_id: string }): Promise<RpcResult<MemberLoginRestoredRow[]>>;
  verifyProfile(profileId: string): Promise<ProfileLinkResult>;
}
```

The production adapter must authorize through `requireAuthenticatedUser(request)`, call the three RPCs with `context.userClient`, and use `context.adminClient.auth.admin` only for Auth administration. Do not perform profile or membership writes through `adminClient`.

- [ ] **Step 5: Implement the dynamic route**

At `app/api/admin/members/[profileId]/login/route.ts`:

- `GET` returns the preflight summary;
- `DELETE` parses `RemoveMemberLoginBody` and runs removal;
- `POST` parses `RestoreMemberLoginBody`, derives `${new URL(request.url).origin}/auth/callback`, and runs restoration.

Return structured JSON with `code`, `message`, `reconciliationRequired`, and `databaseState` where applicable. Never include the Auth user ID in a browser response. POST may return the manually shareable `actionLink` and must include `mustSendLink: true`.

- [ ] **Step 6: Run focused and broad checks**

```powershell
node --experimental-strip-types --test tests/auth/member-login-account-server.test.mts tests/auth/member-login-account-route.test.mts
npx tsc --noEmit
npm run lint
```

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- src/auth/member-login-account-server.ts tests/auth/member-login-account-server.test.mts 'app/api/admin/members/[profileId]/login/route.ts' tests/auth/member-login-account-route.test.mts
git commit -m "feat: orchestrate member login account removal"
```

---

### Task 4: Accessible account status and confirmation UI

**Files:**
- Create: `components/MemberLoginAccountControl.tsx`
- Create: `tests/auth/member-login-account-component.test.mts`

**Interfaces:**
- Consumes: `MemberLoginPresentation`, `MemberLoginRemovalPreview`, endpoint `/api/admin/members/{profileId}/login`.
- Produces: `MemberLoginAccountControl` with props `{ profileId, name, email, authUserId, profileActive, canRemoveMemberLogin, onChanged }`.

- [ ] **Step 1: Write a failing component contract test**

Follow the repository's existing static component-contract tests. Assert that the source contains:

- semantic dialog markup with `role="dialog"`, `aria-modal="true"`, and an accessible title;
- an Account status badge for all five Task 1 states;
- exact copy **Remove login account**, **Retry removal**, **Restore login**, and the retained-data warning;
- a required reason input and exact `REMOVE` typed confirmation;
- disabled destructive submit until confirmation is valid;
- Escape/cancel handling and focus return;
- pending state that prevents double submission;
- success copy **Login removed. Contact information and program history were retained.**;
- `mustSendLink` restoration copy telling the admin to send the generated link;
- no text claiming that the member/profile/contact data was deleted.

- [ ] **Step 2: Run the test and verify failure**

```powershell
node --experimental-strip-types --test tests/auth/member-login-account-component.test.mts
```

- [ ] **Step 3: Implement the focused component**

Use the existing visual language: compact pill status, neutral overflow/action button, white rounded dialog, navy primary actions, and red only for the final destructive control. On open, fetch GET preflight and show retained semester/session counts. Submit authenticated DELETE or POST requests using the current Supabase session token.

For a `502` removal response, keep the dialog open, show **Program access is blocked, but login deletion needs to be retried**, and change the action to **Retry removal**. For a successful mutation followed by `onChanged()` rejection, report **Login updated, but the Members list could not refresh** with **Retry refresh**; do not imply that Auth failed.

Do not put lifecycle restore into this component. After login restoration, state: **Sign-in is restored. Semester membership remains suspended until you restore it separately.**

- [ ] **Step 4: Run tests and static checks**

```powershell
node --experimental-strip-types --test tests/auth/member-login-account-component.test.mts tests/auth/member-login-account.test.mts
npx tsc --noEmit
npm run lint
```

- [ ] **Step 5: Commit Task 4**

```powershell
git add -- components/MemberLoginAccountControl.tsx tests/auth/member-login-account-component.test.mts
git commit -m "feat: add member login account controls"
```

---

### Task 5: Members workspace integration and end-to-end verification

**Files:**
- Modify: `app/dashboard/admin/page.tsx`
- Modify: `tests/lifecycle/admin-activation-workspace.test.mts`
- Create: `tests/auth/member-login-account-workspace.test.mts`

**Interfaces:**
- Consumes: Task 1 capability field and presentation data; Task 4 `MemberLoginAccountControl`.
- Produces: Account column/actions in the existing Members workspace and refreshed activation/directory read models.

- [ ] **Step 1: Write failing workspace tests**

Assert that the Members profile query selects `auth_user_id` and profile `is_active`, the capability request reads `canRemoveMemberLogin`, and each row renders `MemberLoginAccountControl` with the durable profile ID. Assert that account removal refreshes `loadAll`, `cohort.reload`, and `cohort.reloadCurrent` so Needs activation and directory projections lose suspended memberships.

Keep lifecycle and account concepts separate: the existing Status column remains the semester lifecycle status; the new Account column shows login state. Update edit-row `colSpan` from six to seven.

- [ ] **Step 2: Run workspace tests and verify failure**

```powershell
node --experimental-strip-types --test tests/auth/member-login-account-workspace.test.mts tests/lifecycle/admin-activation-workspace.test.mts
```

- [ ] **Step 3: Extend the Members read model**

Add `auth_user_id: string | null`, durable `profile_is_active: boolean`, and `latest_removal_audit_action` to the `Member` view type. Select `auth_user_id,is_active` from profiles and load the latest `member.login_removal_prepared`/`member.login_restored` audit action per visible durable profile in one batch, not one request per row. Avoid overwriting profile activity with membership activity; keep a separately named `membership_is_active` or use the existing presentation object for lifecycle filtering.

Load `/api/auth/capabilities` with the current bearer token and fail closed to `canRemoveMemberLogin = false`. Never infer this permission from the legacy profile role or the presence of the admin dashboard.

- [ ] **Step 4: Integrate the Account column and control**

Render the account badge/control for each row. Only the super-admin capability enables the destructive/restoration action. After mutation, use the existing truthful refresh helper pattern and preserve deep-link visibility, cohort scope, search text, and the All/Active-only switch.

Ensure `not_configured` unlinked profiles show **No login** rather than falsely claiming a prior removal. Restoration is permitted for both `not_configured` and `removed`, but the dialog copy differs accordingly.

- [ ] **Step 5: Run focused tests**

```powershell
node --experimental-strip-types --test tests/auth/member-login-account*.test.mts tests/lifecycle/admin-activation-workspace.test.mts tests/lifecycle/membership-presentation.test.mts tests/lifecycle/membership-mutation.test.mts
```

- [ ] **Step 6: Run full automated verification**

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run db:migration-safety
git diff --check
```

Expected: all tests pass; TypeScript, lint, migration safety, and diff checks exit 0.

- [ ] **Step 7: Perform authenticated visual and behavioral verification**

Using disposable mentor and startup accounts in the local environment:

1. Confirm ordinary semester admins cannot see or call removal.
2. Confirm a super-admin sees the Account column and correct badges.
3. Open the dialog at desktop and narrow mobile widths; verify focus, Escape, Tab order, scrolling, and disabled confirmation.
4. Remove a disposable login and confirm the person cannot sign in.
5. Confirm name, email/contact data, profile, semesters, sessions, and Alumni history remain visible to the admin.
6. Confirm active/onboarding memberships are Suspended and the person leaves Needs activation and active directories.
7. Restore the login, copy the generated link, and confirm the UI explicitly says the admin must send it.
8. Confirm restoration reuses the retained profile and does not activate memberships.
9. Inspect console/network output for errors and verify no secret key is delivered to the browser.

If authenticated browser automation is unavailable, record that limitation explicitly and provide this exact checklist to the user; never claim visual verification occurred.

- [ ] **Step 8: Commit Task 5**

```powershell
git add -- app/dashboard/admin/page.tsx tests/auth/member-login-account-workspace.test.mts tests/lifecycle/admin-activation-workspace.test.mts
git commit -m "feat: integrate member login account removal"
```

---

### Task 6: Final security review and branch handoff

**Files:**
- Review only: all files changed by Tasks 1–5

**Interfaces:**
- Consumes: complete feature.
- Produces: reviewed, locally verified commits on `layth_rahman`.

- [ ] **Step 1: Review the complete diff**

Use the spec as the checklist. Pay special attention to authorization source, service-role isolation, self/platform-admin protection, idempotency, cross-system failure reporting, retained data, placeholder safety, and accidental membership reactivation.

- [ ] **Step 2: Run the final verification suite from a fresh shell**

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run db:migration-safety
git diff --check
```

- [ ] **Step 3: Inspect branch/worktree state**

```powershell
git branch --show-current
git status --short
git log --oneline -12
```

Confirm the branch is `layth_rahman` and identify every remaining dirty file as either unrelated preserved work or an intentionally uncommitted artifact. Do not stage, revert, delete, merge, push, or deploy unrelated work.

- [ ] **Step 4: Report the outcome**

Report feature commits, exact test counts, TypeScript/lint/migration results, whether authenticated visual verification ran, any manual checklist remaining, and confirmation that no remote Supabase operation occurred.
