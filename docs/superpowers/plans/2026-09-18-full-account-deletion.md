# Full Account Deletion Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a Super Admin-only permanent personal-data deletion operation with anonymized history and preserved shared startups.
**Architecture:** Separate preview/prepare/cleanup/finalize workflow; authenticated database authorization, server-only Storage/Auth deletion, minimal anonymous anchors for shared historical relationships. Fail closed and permit retry after partial failures.
**Tech Stack:** Next.js TypeScript, Supabase Postgres/Auth/Storage, Node test runner.
**Spec:** docs/superpowers/specs/2026-09-18-full-account-deletion-design.md

## Global constraints

No hosted migrations or actual account deletion without explicit release/action authorization. Only hosted project layjdjfvxkowxidwuvbs. Preserve unrelated dirty work; no automatic commits. Generated migrations via supabase db diff only; generated src/db/types.ts only. Protect self/platform admins, shared startup records and teammates. No emails/calendar sends. No secrets/participant data in artifacts. Deletion is not an onboarding reset.

## 1. Server and database workflow (Sol/high worker)

Own src/auth/member-deletion.ts, src/auth/member-deletion-server.ts, app/api/admin/members/[profileId]/deletion/route.ts, schema/migration/types and dedicated tests. Inspect auth/database instructions first.

- [x] Write failing validation/authorization/orchestration tests: typed confirmation, stale preview, self/admin denial, failure before preparation leaves all untouched, Storage/Auth failure never finalizes, repeated requests reuse operation, completed deletion reports completed even if refresh fails.
- [x] Implement GET preview / DELETE execution endpoint; use private/no-store on every response. Expose a shared MemberDeletionPreview type for the UI and strict body validation.
- [x] Preview response {data:{profileId,fullName,email,version,status,counts,blockers}} with status ready|in_progress|completed. counts record of descriptive labels to nonnegative numbers; blockers string[]. Execution body {confirmationEmail,confirmation:"DELETE",reason,version}. Response {data:{profileId,status:"completed"}}; error {error:{code,message,reconciliationRequired?}}. Prepare locks/revalidates target and stale preview. No caller-controlled Auth or Storage identifiers.
- [x] Inventory known structured/free-text personal copies and required ownership dependencies; purge personal copies, retain only explicitly anonymous history. Unknown dependencies must block safely instead of silently leaving PII and claiming completion.
- [x] Add durable workflow state, RLS and scoped RPCs; audit reason must not retain target PII after completion. Hide irreversible anonymous anchors from re-invitation/restoration/directories. Future email signup produces a new identity.
- [x] Generate migration with local Supabase tooling and types; local database tests prove shared data preservation, anonymization, permissions, failure recovery, concurrent update protection. Never alter handwritten migration files.
- [x] Run focused tests/lint; report local infra blockers accurately. No remote mutation/commit.

## 2. Admin UI (coordinator)

Create components/MemberDeletionControl.tsx, integrate app/dashboard/admin/page.tsx, add dedicated interaction tests.

- [x] Write failing tests for confirmation/preview readiness, stale responses, irreversible success surviving refresh error, and cleanup retry.
- [x] Show separate Delete account and personal data entry only for eligible Super Admin users. Use native dialog, focus restoration, reason/email/DELETE confirmation and explicit shared-data/anonymized-history copy.
- [x] Load actual preview; never fake counts or enable execution when setup is unavailable, blocked, stale or loading. Prevent duplicate submit. On success remove stale target controls and refresh; refresh failure cannot offer deletion again. Partial failure must show recovery status.
- [x] Run UI tests/lint, then actual browser preview and desktop/narrow inspection with current admin account. Never press final delete on existing QA users.

## 3. Integration and review

- [x] Review server/schema/UI contract and sensitive-data inventory; run authorization, retry, lifecycle regression tests plus typecheck/build where possible. Confirm no new diagnostics beyond known baseline.
- [x] Verify actual hosted preview is BLOCKED until migration deployment; local destructive fixture tests only. Avoid claiming real deletion QA complete without authorized deployed fixture.
- [x] Update report/handoff with changed files, test outcomes, remaining release gates. No commit/push/release merely because implementation is complete.

Review-driven contract addition: preview includes required `impact` arrays for affected semesters, shared startups retained, and upcoming mentor meetings cancelled. Completed previews permit empty email and impact arrays after personal identifiers are scrubbed. Parent status survives row removal; batched audit history restores deletion locks after reload.

Local testing incident and containment: `outputs/local-database-reset-incident-2026-09-19.md`. Default stack is preserved; subsequent validation uses a uniquely named stack, distinct ports and verified-new volumes without `db reset`.
