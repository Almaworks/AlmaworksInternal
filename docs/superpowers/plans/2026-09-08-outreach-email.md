# Outreach Email Implementation Plan

Use the subagent-driven-development skill. Root supervises; specialists have disjoint write ownership. User has already selected supervisor/specialist implementation; no repeated execution-choice gate.

**Goal:** Outreach staff reuse templates and explicitly send now or schedule a contact email, with recoverable delivery history.
**Architecture:** Semester-scoped RLS templates/message snapshots, authenticated API and Resend native scheduling, existing outreach contact UI integration.
**Tech Stack:** Next.js/React TypeScript, Supabase PostgreSQL/RLS, existing Resend transport.
**Spec:** docs/superpowers/specs/2026-09-08-outreach-email.md

## Global constraints
No real emails, remote operations, releases or commits. Preserve unrelated work. New migration files must come from db diff unchanged; root owns packaging. Keep provider calls injected in tests. Reuse existing user-requested server; no new service without maintenance registration. Incomplete engineering installation was previously refused; do not overwrite/retry. TEAM/SESSION remain absent.

## Tasks
- [x] Backend Sol/high: own src/outreach-email/**, app/api/admin/outreach/email/**, dedicated SQL schema/security/test files and generated types. Define and publish shared types/HTTP contract first. Write failing focused tests, implement templates/snapshot commands and provider adapter, run focused tests and local authenticated RLS tests. No actual provider call. Root owns generated migration packaging and config.
- [x] Frontend Terra/medium: own components/outreach-email/**, app/dashboard/admin/outreach/components/contact-drawer.tsx narrow composer insertion, outreach workspace narrow Email navigation, dedicated emails page/preview and UI tests. Consume backend contract. Add template CRUD/starter selection, editable composer and explicit send/schedule, history/status/cancel/recheck. Handle stale scope, errors, missing configuration, busy state and mobile keyboard/layout. Test presentation/commands.
- [x] Reviewer Sol/medium: independently audit spec/security/provider semantics, then changed backend/SQL and UI. Root adjudicates and implementers resolve actionable findings before completion.
- [x] Coordinator: capture local pre-change baseline, write design/ledger, integrate, run all application tests, source lint/build, generate unchanged migrations and replay with zero diff, perform fictional Browser desktop/mobile QA, update memory and rollout notes. Inspect final dirty tree; no commit.

## Acceptance cases
1. Admin for semester A can save/reuse a template and submit an A opportunity; mentor/startup and foreign-semester admin cannot read or change messages/templates.
2. Invalid dates, unknown placeholders, empty subject/body and arbitrary recipient manipulation fail before provider send.
3. Missing config returns unavailable, never fake sent. Provider acceptance is displayed honestly; only provider delivery evidence marks delivered.
4. Duplicate request uses stable snapshot/idempotency, not fresh contact/template content; conflicting payload rejects. Unknown outcomes preserve recovery identity and cannot resend after dedupe expires.
5. Scheduled send persists provider receipt; cancel/recheck uses stored provider ID. Failed cancel does not claim cancellation. Existing sender/recipient snapshot remains unchanged.
6. All broad checks pass; generated migration matches intended functions, RLS and ACL; no real sends or remote writes in testing.

## Ledger
2026-09-08: User authorized this next phase. Root inspected current outreach/Resend integration and shared workspace. Sol/medium audit reused. Resend native schedule is the implementation choice; local queue/cron alternative would add lifecycle and auth complexity without a present requirement for schedules beyond30days. Current 96 dirty entries preserved. Exact pre-email local dump captured before changes.

## Verified local completion

2026-09-08 evening: backend 26/26 tests and 37/37 pgTAP; coordinator email/UI/migration-focused checks 35/35; production build passed. Earlier broad suite 537/537 passed; latest broad run 550/552 had two concurrent-work races (migration allowlist before registration, and in-progress export formatter assertion), not email behavior failures; rerun broad suite after export stabilizes. Source lint zero errors, email-specific lint zero warnings after cleanup. Fictional Browser desktop/mobile save/edit/archive/personalize/send/schedule/cancel/unavailable checks passed. No real recipient emails or authenticated production-account QA.

CLI-generated migration `20260909025717_outreach_email.sql` copied unchanged, SHA256 `0690F4662C25C2ECF5457FDE168947934AF07B8914F5F1A08C1D9CC1AB23BCC7`; independent review cleared objects/ACL/guards. Full scratch baseline plus migration replay returned no schema differences. Migration safety passed. All database changes remain local, history not marked applied, no release/commit/push.

Coordinator completed frontend after an incomplete Terra draft; attempted additional Sol worker was unavailable due thread limit. Sol/high backend and Sol/medium independent review completed. Existing services retained. Activity/cadence integration and automated notifications/newsletters remain active expanded-goal work, as do live provider configuration and release checks.
