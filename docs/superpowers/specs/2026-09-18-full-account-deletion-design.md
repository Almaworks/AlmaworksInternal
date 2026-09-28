# Full account deletion — approved design

Status: approved for local implementation with anonymized history by user on 2026-09-18. Hosted release and actual account deletion are not authorized by this design acceptance.

## Scope and recommendation

Add a separate Super Admin action, Delete account and personal data, for mentor and startup-member identities across semesters. Keep Suspend and Remove login account as distinct operations. Do not delete either existing QA account as part of building the feature. Do not treat this feature as a password-reset or restart-onboarding operation.

Accepted retention policy: delete the login and personal data while retaining anonymized past program history. Existing login-only removal retains personal data and does not satisfy this feature.

## What the administrator sees

1. Open an impact preview for one person. Show all affected semesters, upcoming meetings, profile files, memberships, team links, and historical records; identify shared startup records that will remain.
2. Require a deletion reason and typed target-email confirmation plus DELETE. Preview warns that successful deletion cannot be restored through the application.
3. Server revalidates authorization, target identity, version and affected relationships when execution begins. Stale preview requires review again. Reject self-deletion and protected platform-administrator targets.
4. Show explicit progress or incomplete-cleanup state with a retry action. Do not report completion until all required stages are verified.

## Data behavior under recommended policy

- Disable account access before destructive cleanup, so existing sessions cannot continue to resolve an active application identity.
- Remove Auth identity, contact details, mentor biography/company/profile links and personal photos, personal expertise links, notification reads, onboarding payloads, personal availability and team links.
- Cancel relevant future mentor meetings and remove their occupancy. For startup members, retain startup-owned meetings where the remaining team can still participate; clear the deleted person's request attribution. The preview distinguishes these cases. No email or calendar sends are part of this initial feature.
- Preserve startup organizations, startup profiles/logos, teammate accounts, shared needs and Friday-program structures. Block deletion if a required shared-resource ownership transfer is unresolved; provide a concrete list rather than deleting shared resources by cascade.
- Retain only minimal anonymous identity anchors where foreign keys require historical continuity; show Deleted member in history and hide the anchor from directories, search, invitations, restoration and login matching. A future signup with the same email creates a fresh identity.
- Remove or redact target-linked names, email addresses, onboarding data and contact snapshots in invitations, bookings, notification payloads and audit metadata. Review free-text fields explicitly; do not claim full erasure based only on clearing public.profiles. Preserve other participants' data. Ambiguous free text or unrelated contact imports require a defined policy before release; do not erase by fuzzy name matching.
- Keep a minimal non-personal completion audit with actor, timestamp, operation ID and affected counts. Do not copy the deleted person's email/name into retained audit text or deletion reasons. Existing backups/provider logs are outside the application-row deletion workflow and must not be represented as synchronously purged.

## Implementation and failure handling

Reuse the current account-removal authorization pattern: an authenticated, RLS-authorized preview/preparation/finalization RPC, plus server-only Auth and Storage operations. No browser service-role credentials and no ad hoc SQL deletion. Generate the migration with supabase db diff, never hand-edit migration files. Target only project layjdjfvxkowxidwuvbs.

Use a durable deletion operation state so retries can finish after browser close or a server failure. Bind it to the exact original profile/Auth identity and preview revision. Store only the temporary cleanup identifiers required; erase target personal identifiers once cleanup completes. Database operations lock and revalidate the target; no partial database cleanup masquerading as a transaction spanning Auth or Storage.

Prepare -> disable access and record work -> remove authorized personal Storage objects -> delete Auth user -> transactional personal-data cleanup/anonymization -> verify completion. Design exact ordering around hosted ownership/FK constraints. Treat already-absent resources as completed only after matching the operation's recorded target. If any step fails, keep access disabled and report the remaining stage. Never recreate a deleted login or silently undo completed deletion.

## Existing code and affected areas

- components/MemberLoginAccountControl.tsx and app/dashboard/admin/page.tsx: separate entry and impact dialog, preserving existing login-only behavior.
- app/api/admin/members/[profileId]/: new deletion preview/execution endpoint.
- src/auth/member-login-account-server.ts: existing recoverable Auth-operation pattern to reuse without changing its retention contract.
- supabase/schemas/: explicit account-deletion schema/RPC and tightly scoped authorization; generated migration; regenerate database types.
- Relevant dependencies include mentor booking requests/windows/occupancy, mentor semesters/availability, startup-team memberships, sessions/RSVPs, invitations, outreach attribution/content, storage, notification reads and audit events. Hosted FK inspection found both RESTRICT and CASCADE edges; a raw profile cascade is not an acceptable implementation.

## Verification and release

Test unauthenticated/non-super-admin denial, self/admin protection, stale previews, all-semester scope, teammate/shared-startup preservation, snapshots redacted, old-session denial, storage/Auth failure at each stage, retries/idempotency, concurrent requests, no messages, fresh signup without restored history, and desktop/narrow UI. Use disposable accounts created for destructive QA, not the current active QA identities by default.

Run local database tests and generated-migration safety checks, focused application tests, lint and type/build validation. Deploy only after explicit release authorization and hosted-schema comparison. Actual irreversible account deletion requires action-time confirmation. Design acceptance authorizes local implementation, not permission to delete an existing account.
