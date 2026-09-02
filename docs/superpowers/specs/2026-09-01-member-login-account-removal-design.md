# Member login account removal

**Status:** Approved for implementation  
**Date:** 2026-09-01

## Purpose

Allow a platform super-administrator to remove a mentor or startup member's ability to sign in without deleting the durable Almaworks record. The member's name, email, phone, company, profile content, semester participation, availability history, and mentorship-session history remain available to authorized administrators.

This is an account-access operation, not personal-data erasure. The interface must call it **Remove login account**, never **Delete member** or **Delete personal data**.

## Existing model

Almaworks already separates authentication from durable identity:

- `auth.users` owns the login identity.
- `public.profiles` owns durable identity and contact information.
- `public.profiles.auth_user_id` is nullable and references `auth.users(id) ON DELETE SET NULL`.
- Semester memberships, mentor/startup records, availability, and sessions reference the durable profile or its semester-scoped records.
- `public.program_audit_events` records semester-scoped administrative changes.

Deleting an Auth user therefore detaches login access without cascading through the Almaworks profile or program history. No replacement history table or new lifecycle column is required.

## Alternatives considered

### 1. Delete only the Auth identity — selected

Retain the profile and program records, suspend current access, then permanently delete the linked Auth user. This matches the existing identity architecture and is recoverable through a deliberate re-invitation flow.

### 2. Ban the Auth user

A ban is reversible, but it does not remove the Auth account and is not a substitute for deletion. It also does not provide the requested semantic distinction between a retained historical member and an existing login.

### 3. Delete the profile after copying history into snapshots

This would require pervasive schema changes and would weaken the canonical identity relationships. It is unnecessary because the existing nullable Auth link already supports retained history.

## Authorization and safeguards

Only a profile holding `platform_roles.role = 'super_admin'` may remove or restore login accounts.

The server must reject:

- unauthenticated callers;
- semester administrators without the platform role;
- attempts to remove the caller's own account;
- targets holding any platform role;
- targets without a durable profile;
- confirmation text that does not exactly match `REMOVE`;
- blank removal reasons.

The browser never receives a Supabase secret or service-role key. The authenticated user's RLS-scoped client invokes database commands. A server-only Supabase client performs the Auth Admin operation after authorization succeeds.

## Admin experience

### Members table

Add a separate **Account** presentation alongside the semester membership lifecycle:

- **Login enabled** — `profiles.auth_user_id` is present and the profile is enabled.
- **Removal incomplete** — program access has been suspended but the Auth deletion did not finish; the action is **Retry removal**.
- **Login removed** — `profiles.auth_user_id` is null and the preserved profile remains.

Membership labels such as Active, Alumni, and Suspended remain independent. Historical records must not imply that the profile itself was deleted.

The row action menu shows:

- **Remove login account** for an eligible linked profile;
- **Retry removal** after a recoverable partial failure;
- **Restore login** for an unlinked retained profile.

These actions are visible only to platform super-administrators. Existing lifecycle actions remain the place to activate, suspend, or restore semester membership.

### Confirmation dialog

The destructive dialog shows the member's name and email and states:

> This removes sign-in access and suspends current program access. Contact information, profile details, semester history, and mentorship sessions will remain available to authorized Almaworks administrators.

It also displays an impact summary:

- number of historical semesters retained;
- number of sessions retained;
- memberships that will be suspended;
- confirmation that contact information will be retained.

The admin must provide a reason and type `REMOVE`. The primary button is **Remove login account**. The cancel action is visually dominant until the confirmation is valid.

### Successful outcome

After completion, the row stays in the Members view with **Login removed** and its historical lifecycle information. It is excluded from Needs activation and active participant directories because all invited, onboarding, and active memberships were suspended. Alumni memberships remain Alumni.

The success message reads:

> Login removed. Contact information and program history were retained.

## Removal workflow

Removal spans Postgres and Supabase Auth, so it is a recoverable workflow rather than a fictional cross-system transaction.

1. Load a preflight summary by profile ID using the authenticated admin context.
2. Revalidate that the actor is a platform super-administrator and that the target is neither the actor nor a platform administrator.
3. Invoke an authenticated database command that:
   - sets `profiles.is_active = false`;
   - changes every `invited`, `onboarding`, or `active` membership for the profile to `suspended`;
   - leaves Alumni memberships unchanged;
   - records the actor, reason, prior membership states, affected membership IDs, and target profile in existing semester audit events;
   - returns the linked Auth user ID and affected rows.
4. Call server-side `auth.admin.deleteUser(authUserId, false)`.
5. Verify that `profiles.auth_user_id` became null through the existing foreign key and refresh the Members read model.

The database command must be idempotent so **Retry removal** can safely run after a partial failure. It follows the repository's existing authenticated RPC pattern: explicit `auth.uid()`/super-admin checks, fully qualified table names, locked-down execution grants, and no browser access to the service role.

Supabase deletes the user's session rows and refresh tokens with the Auth user. Previously issued access JWTs may remain cryptographically valid until expiry. Almaworks closes that window at its authorization layer because the removed Auth ID no longer resolves to a profile, and the preparation step has already suspended all usable memberships.

If the Auth user owns Supabase Storage objects, Auth deletion can fail. The system must not delete retained program records. It reports the blocking condition and leaves the profile securely disabled for retry after storage ownership is resolved.

## Failure behavior

### Preflight or preparation fails

Do not call Auth deletion. Show the specific safe error and leave all data unchanged when the database command did not commit.

### Preparation succeeds but Auth deletion fails

Do not roll access back. The secure state is intentional: the profile is disabled and memberships are suspended. Return a reconciliation response, show **Removal incomplete**, and offer **Retry removal**. Preserve the original audit context and avoid duplicate audit events on retry.

### Auth deletion succeeds but refresh/verification fails

Report that login removal succeeded but the screen could not refresh. Offer **Retry refresh**, not **Retry removal**, unless a server verification later proves that the Auth identity remains.

### Target is already unlinked

Treat removal as idempotently complete. Do not create a second audit event.

## Restoration workflow

**Restore login** creates a new Auth identity for the retained profile's existing email and produces the same manually shareable invitation result used by the current onboarding flow.

The Auth signup trigger currently creates a placeholder profile for a new Auth user. Restoration therefore uses a narrowly scoped authenticated database command that:

1. verifies the actor is a platform super-administrator;
2. verifies the retained target profile is unlinked and disabled;
3. verifies the Auth-created placeholder has no memberships, platform roles, profile extensions, or other durable relationships;
4. removes only that empty placeholder;
5. attaches the new Auth user ID to the retained profile;
6. sets the retained profile's global access flag back to enabled;
7. records a restoration audit event.

If profile attachment fails after Auth creation, the server attempts to delete the newly created Auth identity. An ambiguous cleanup result is reported as reconciliation required; it must never silently create a second Almaworks identity.

Restoring login does **not** automatically reactivate suspended semester memberships. The UI explicitly tells the admin to use the existing membership lifecycle action if current program access should also be restored. This keeps account identity and semester participation separate.

After the invitation is generated, the interface clearly states that the administrator must send the link to the member.

## API and module boundaries

The implementation should introduce focused units rather than adding more orchestration to the existing admin page:

- a pure account-removal domain module for validation, state presentation, and typed results;
- a server command module that coordinates authenticated database commands with Auth Admin deletion/invitation;
- an admin API route for preflight and removal;
- an admin API route for restoration;
- a small account-status/action component used by the Members table;
- narrowly scoped database command functions using the existing profile, membership, and audit tables.

The APIs operate on durable `profileId`, never email as identity. Email is presentation and invitation data only.

## Database impact

Do not add or replace identity, membership, or history tables. Do not add a membership lifecycle value or a profile lifecycle column.

If database command functions are required, generate their migration with `supabase db diff`; never hand-edit a migration. Regenerate `src/db/types.ts` from the resulting local schema. The functions must use the current schema and audit tables rather than adapting the database model to this feature.

## Tests and verification

Automated coverage must include:

- only platform super-administrators are authorized;
- self-removal and platform-administrator removal are rejected;
- invalid confirmation and missing reason are rejected;
- contact and profile data remain unchanged;
- sessions, semester records, availability, mentor/startup data, and Alumni memberships remain;
- current usable memberships become Suspended;
- Auth deletion success leaves `auth_user_id` null;
- Auth deletion failure produces the recoverable incomplete state;
- retry is idempotent and does not duplicate audit events;
- restoration reconnects the retained profile and removes only an empty placeholder;
- restoration never auto-activates semester memberships;
- cleanup failure is surfaced as reconciliation required;
- removed accounts disappear from activation and active-directory results;
- keyboard focus, typed confirmation, pending states, and responsive dialog layout work correctly.

Run the focused tests first, then the full test suite, TypeScript, lint, database tests, migration safety checks, and authenticated visual verification on desktop and mobile.

## Acceptance criteria

The feature is complete when a platform super-administrator can remove a mentor or startup login from Members, the person can no longer authenticate or receive program access, every requested profile/contact/history record remains queryable to authorized admins, partial failures are recoverable, and a new invitation can later reconnect the same durable profile without creating a duplicate identity.
