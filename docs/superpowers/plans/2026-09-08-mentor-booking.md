# Independent Mentor Booking Implementation Plan

Use subagent-driven development with explicit bounded ownership; coordinator integrates and verifies.

**Goal:** Working mentor availability and startup request flow requiring mentor acceptance.
**Architecture:** Separate semester-scoped windows and requests, authenticated API, shared booking workspace.
**Spec:** docs/superpowers/specs/2026-09-08-mentor-booking.md

## Global constraints
Preserve unrelated dirty work; RLS throughout; only local DB work; never hand-edit migration/types; no commits/releases/outbound messages. Existing incomplete engineering bootstrap was previously refused; do not retry or overwrite it.

## Tasks
- [x] Backend specialist: domain, schema, RPC/RLS, API and focused tests. Own src/mentor-booking/**, app/api/mentor-booking/**, dedicated schemas/tests/migrations, generated src/db/types.ts and config schema_paths.
- [x] UI specialist: shared booking workspace and participant/admin navigation, retire new Friday-specific request affordances; preserve historical views. Own components/mentor-booking/**, app/dashboard/bookings/**, preview, narrow integration and tests. Agree typed contract first.
- [x] Onboarding specialist: remove Friday availability requirement/grid writes and replace with review/finish; preserve old availability records, update required checklists/tests. Own onboarding-flow.tsx and src/lifecycle/onboarding.ts only.
- [x] Coordinator: review contract/integration; run application tests, source lint/build, local database and concurrency checks; generated migration replay. Built-in Browser desktop/mobile QA.
- [x] Independent review then resolve findings; update memory and rollout notes. No deployment in this task.

## Ledger
2026-09-08: Scope accepted by user's begin-work request. Integrated discrete windows are an implementation default consistent with user-proposed integrated availability option. Audit specialist Sol/medium dispatched; database implementation Sol/high planned due authorization/concurrency risk. Current tree has 76 dirty entries from existing work; preserve them.

Audit found onboarding forced old Friday availability; user direction requires removing this gate. Assigned to existing Sol/medium audit specialist with exclusive onboarding file ownership. RPC finalization does not require availability keys; no schema change is needed for this part.

Onboarding: 9 focused tests and scoped lint/diff checks passed; coordinator reviewed scoped diff. Model/API reviewer raised timestamp rollover and defense-in-depth request projection concerns; assigned to backend. Root owns generated migration packaging/replay/allowlist, using actual local schema captured before booking changes at work/mentor-booking/pre-booking-schema.sql. First full integration run513/514: Bookings icon collision assigned to frontend.

Verification milestone: independent re-review cleared direct-DML request/claim synchronization after an AFTER request trigger was added. Browser desktop/mobile previews verified mentor acceptance, startup request/cancel and admin read-only private-detail visibility. First final application suite514/514 passed. Build caught a duplicate local data declaration in the frontend scope-change fix; assigned owning specialist, not yet complete. Source lint has zero errors, two existing image warnings and one new unused test variable (assigned backend).


## Final verification and rollout — 2026-09-08

Implemented locally and independently reviewed. Final source fixes supersede the intermediate failures above.

- Application suite: **514/514 passed** (`work/mentor-booking/verified-tests.log`).
- Production build: **passed**, including TypeScript and prerendering (`verified-build.log`).
- Source lint: **0 errors, 2 existing image warnings**, with existing scratch `.tmp/**` and `work/**` excluded (`verified-lint.log`). Plain lint remains affected by existing scratch files. Scoped tracked diff checks passed.
- Local pgTAP: **47/47 passed** (`database-tests.log`), including authenticated RLS, request/claim synchronization under direct writes, retries, invalid transitions, private topics, and durable-identity overlap conflicts. Real exclusion constraints provide concurrency protection; a separate retained two-connection race harness was not run for this phase.
- Built-in Browser: mentor publication and acceptance, startup request/cancellation, admin read-only view, desktop and 390px mobile layout verified using fictional development previews. Repeated development refreshes reset preview state during early publication attempts; a later attempt visibly added the new window. Real authenticated account end-to-end testing remains pending.
- Independent review: resolved timestamp/projection, direct-DML claim synchronization, and stale semester action findings. Final migration fidelity review found no omission or semantic drift (`review-report.md`).
- Two unchanged CLI-generated migrations: `20260909012650_mentor_booking_extension.sql`, then `20260909012850_independent_mentor_booking.sql`. Replay against the captured local pre-booking baseline completed with **No schema changes found** (`final-migration-replay.log`). Migration-safety checker passed with no unknown migrations. Never deploy the disposable scratch baseline or rejected diffs.
- Three semester-scoped RLS tables, four invoker triggers, five authenticated invoker RPCs; types CLI-generated. Mentor/startup accepted-overlap constraints use durable profile/company identities across semesters. Existing Friday records preserved; onboarding no longer requires Friday availability.
- Actual specialist routes: Sol/high backend, Terra/medium frontend, Sol/medium onboarding and independent review; root supervised, integrated and verified.
- No production operation, commit, push, outbound email, calendar integration, or external scheduling provider setup. Additive schema exists only in the local database; local migration history was not marked applied. Existing user-requested Next server and Supabase stack preserved; this task started no persistent service.

Before release, verify real authenticated role flows and the complete pending migration chain on a representative environment, then apply the reviewed changes only through an authorized rollout targeting `layjdjfvxkowxidwuvbs`. Existing unrelated profile-photo packaging and Friday review limitations remain separate handoff items. Outreach templates/scheduled sending and semester Notion export are subsequent phases.
