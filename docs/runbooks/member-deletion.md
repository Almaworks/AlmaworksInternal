# Delete account and personal data

This operation removes a participant's login and personal data while retaining anonymous program history. It is separate from **Suspend** and **Remove login account**, which preserve personal records. It is not an onboarding reset.

## Administrator flow

1. Sign in as a Super Admin and open **Members**.
2. Choose **Delete account and personal data** for an eligible participant. Self-deletion and platform-administrator targets are protected.
3. Review the affected semesters, shared startups that will remain, upcoming mentor meetings, counts and blockers. Resolve any blocker through the supported management workflow before proceeding. Do not clear shared content merely to bypass a blocker.
4. Enter a short reason without personal details, the target email, and `DELETE`. The reason must be 10–500 characters.
5. Choose **Permanently delete**. A stale preview requires loading and reviewing a new preview. No cancellation email or calendar update is sent by this operation.
6. Wait for completion. Afterward, the account cannot be restored; the remaining history uses an anonymous identity. Shared startups and teammate accounts remain.

## Interrupted cleanup

Database preparation, personal-file deletion, Auth deletion and database finalization are separate stages. Preparation blocks the target's application access. If a later stage fails, the operation remains incomplete and existing account-management actions are locked.

Open the deletion action again, reload the preview, review its current state and reconfirm to resume cleanup. Do not restore the old login as a recovery step. A completed operation with a failed Members refresh needs **Retry refresh**, not another deletion.

## Scope and blockers

The workflow handles known target-linked personal records. Shared free text, ambiguous ownership, legacy externally hosted files or unfamiliar dependencies can require a separate privacy/ownership review. A blocked preview must not be described as a completed deletion. Shared startup information is not automatically the departing individual's property.

Current dependency policy:

- The target's queued and completed notification delivery records, including stored recipient address and provider result, are removed. A submitting or uncertain delivery blocks deletion until its send outcome is reviewed; it must not be retried blindly. A delivery under another profile that still names the target's email is a separate privacy blocker.
- Personal Gmail account credentials and OAuth attempts are removed during finalization. A late callback cannot recreate them after preparation. Gmail message snapshots authored by the target, sent from the target address, or addressed to the target email require a separate ownership and privacy review, even if the snapshot belongs to another account.
- Booking decision notes, meeting logistics, and feedback linked to the target's booking or startup team require review before deletion. Target-authored content on another booking also blocks. Attendance without feedback and empty logistics rows remain as program history attached to the anonymized profile.
- Friday week cancellation history remains, but any reference naming the deleted profile as its canceling actor is cleared. The cancellation timestamp remains.

After resolving a blocker through an authorized workflow, reload the preview before preparation. Finalization checks the blockers again while holding the affected tables, so new shared text or an in-flight send cannot pass on an old preview.

Weekly availability and unused personal availability windows are removed. A minimal withdrawn window can remain when a historical booking references its interval; its identity is anonymous and it cannot offer new booking availability.

Application deletion does not synchronously purge database backups, provider logs or copies outside this application's control. Do not promise those have been erased.

## Release and verification

Apply only the reviewed generated migrations to the repository's allowlisted Supabase project, after release authorization. Compare hosted schema and migration state before testing. Follow `docs/runbooks/authenticated-qa.md` with disposable mentor/startup fixtures and actual role-specific sessions.

The release consists of a core migration plus a separate Storage-policy migration. Both are required, in timestamp order. The core diff engine captures function/table access rules but omits managed Storage policies; the Storage-only migration is generated with the CLI's migra engine. Do not substitute the incomplete intermediate outputs preserved under `work/` or hand-edit generated SQL.

Verify: unauthorized/self/admin denial; exact target and stale preview handling; all affected semesters; old-session denial; personal files and Auth identity removed; shared startups/teammates preserved; historical text anonymized; reload and interrupted-stage retry; deleted identity hidden from restore/invite matching; same-email signup creates a fresh identity. Test desktop and narrow layouts. Browser deletion requires action-time confirmation.

Until those hosted scenarios pass, report local implementation and tests separately from end-to-end QA.
