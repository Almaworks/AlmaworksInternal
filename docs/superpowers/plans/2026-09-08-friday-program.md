# Friday Program Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for implementation and review. The user has explicitly selected supervisor/specialist execution.

**Goal:** Deliver persisted weekly random startup groups and the new Friday agenda to admins, mentors, and startups.

**Architecture:** A semester-scoped Friday program is associated with an existing meeting. Atomic admin generation saves company assignments once. A shared read contract drives admin and participant views without changing historical sessions.

**Tech Stack:** Next.js, strict TypeScript, React, Supabase Postgres/RLS, Node tests and pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-08-friday-program.md`

## Global constraints

- Preserve existing uncommitted changes and current project location.
- Only allowed remote Supabase project: `layjdjfvxkowxidwuvbs`; this increment performs no remote mutation.
- Every new program table has a non-null semester foreign key and RLS.
- Generate migrations using `supabase db diff`; do not hand-edit migration files.
- No commits, pushes, actual outbound messages, or production release in this increment.
- Existing incomplete engineering installation is preserved; supervisor provides explicit specialist responsibilities.

## Task 1: Domain, database, and authenticated API

Owner: backend specialist, Sol/high. Files: `src/friday-program/**`, `app/api/friday-program/**`, `app/api/admin/friday-program/**`, dedicated schema additions, generated migration, associated backend/database tests.

- [x] Inspect meeting, startup, membership, and semester authorization conventions; publish the exact response and generation contract to supervisor/frontend.
- [x] Write failing tests for balanced complete assignment, empty roster, repeat generation, unauthorized reads/writes, and cross-semester references.
- [x] Implement one atomic generation operation and persisted read model. Lock the meeting before checking for existing publication; use database uniqueness and foreign keys to constrain references.
- [x] Generate migration from a local database diff without including unrelated schema work.
- [x] Run focused Node and pgTAP checks; report exact outcomes and migration limitations.

## Task 2: Shared Friday UI and integration

Shared interface agreed with the backend: `GET /api/friday-program?semesterId=<uuid>` returns `{semesterId, agenda, meetings}`. Each meeting has `{meetingId, meetingDate, label, status, program}` with status `unpublished` or `published`; program holds `{programId, generatedAt, groups: {A, B}}`. Each group member has `{startupSemesterId, startupOrganizationId, name, slug, position}`. Agenda items provide key, label, offsetMinutes, durationMinutes, and facilitator mappings for the two rounds. `POST /api/admin/friday-program/generate` accepts `{semesterId, meetingId}` and returns `{created, program}` (201 first publication, 200 retry). Both use bearer authentication. Errors use `{error}` with 400 invalid input/empty roster, 401 missing authentication, 403 denied access, 404 unknown meeting, 503 schema unavailable, or 500 operational failure. Frontend reloads the saved read model after successful generation.

Owner: frontend specialist, Terra/medium. Files: `components/friday-program/**`, focused frontend tests, minimal changes to admin schedule, participant dashboard and shared schedule page; optional isolated design preview.

- [x] Agree on backend contract before wiring requests. Use the existing authenticated request helper.
- [x] Add shared agenda/group display, week navigation, admin generation and retry/error states.
- [x] Integrate in all three role experiences while preserving existing sessions. Ensure preview fixtures do not contact mutation endpoints.
- [x] Test facilitator swap, 120-minute agenda, stable refresh, odd roster display, pending generation, errors, and role controls.
- [x] Run scoped lint/typecheck and provide a deterministic preview route for desktop/mobile inspection.

## Task 3: Supervisor verification and independent review

Owner: supervisor plus independent testing specialist after implementation.

- [x] Review requirements and security boundaries against the final code and generated SQL.
- [x] Run focused tests, full application suite, lint, and production type/build checks as appropriate; distinguish pre-existing failures.
- [x] Use built-in Browser for desktop/mobile verification. Record exact availability limitations if the browser cannot be reached.
- [x] Verify migration replay and permission/concurrency evidence; coordinator resolved surfaced findings after specialists reached their usage limit.
- [ ] Complete independent review of the final changes before release.
- [x] Update project memory with changes, validation, remaining rollout steps, and the larger outstanding roadmap.

## Execution ledger

- 2026-09-08: User authorized implementation. Backend and frontend specialists dispatched with disjoint ownership. Engineering bootstrap refused a pre-existing installation without installer manifest; TEAM/SESSION reads failed. No overwrite attempted.
- Baseline verification: application tests 483/483 and TypeScript check passed before implementation. Independent Sol/medium reviewer assigned authorization and concurrency review. Built-in Browser inventory available after initial timeout; page navigation subsequently timed out, so live QA remains pending. Temporary local Next service registered as `codex-friday-program-20260908`; identity/logs in `work/friday-program/`.

## Completed local increment (2026-09-08)

- Backend Sol/high and frontend Terra/medium specialists contributed implementation. Independent Sol/medium reviewer began review. All three stopped at an account usage limit; coordinator completed integration and verification. Independent final review remains incomplete and is a release follow-up.
- Implemented the fixed agenda, persisted balanced company assignments, admin publication, weekly navigation, participant own-group highlighting, and shared schedule/dashboard views. Reads never reshuffle groups; repeated and concurrent publication returns one saved program. UI validates response shapes and discards stale requests after semester changes.
- Added RLS-protected program/assignment tables, immutable publication constraints, and semester-aware roster SELECT policies so platform super admins can publish without a cohort membership. No service-role bypass or remote operation was used.
- Verification: full application suite **502/502**; Friday database suite **35/35** (rollback fixtures); production build passed; source lint passed with zero errors and two existing image warnings. Plain lint still includes pre-existing scratch-file errors; verified command excludes `.tmp/**` and `work/**`. Scoped diff check passed.
- A two-connection concurrency exercise produced one created result and one existing result, with exactly one program and three distinct startup assignments.
- Built-in Browser desktop and 390px mobile previews passed agenda/group inspection, week selection, admin generation, role controls, own-group display, and overflow checks. Final browser console had no errors. These use synthetic preview data; authenticated end-to-end verification with real deployed accounts remains outstanding. Live unauthenticated API checks returned JSON 401 and malformed requests returned 400.
- Generated migrations: `20260909003419_friday_program.sql`, `20260909003551_friday_program_permissions.sql`, `20260909003833_friday_program_admin_roster.sql`. All copied unchanged from `supabase db diff`. Migra generated structure and deferred triggers; pg-delta generated function ACL corrections and roster policies. Replay of the actual pre-feature local schema snapshot plus all three migrations finished with **No schema changes found**. This verifies the additive migration set, not a reset of the repository's historical migration chain. Migration deployment-safety check passed; database types generated by CLI.
- Temporary task-owned Next server and disposable database container stopped after verification. Pre-existing Supabase services preserved. No commit, push, external email, or production deployment performed.

## Rollout and next increment

1. Before release, finish independent review and authenticated admin/mentor/startup browser verification. Apply the three generated migrations in order only to verified project `layjdjfvxkowxidwuvbs`, using the repository's existing release process and explicit release authorization. Do not reset production or deploy the scratch baseline under `work/`. Local schema changes exist already; local migration history was not marked applied.
2. Deploy the application after schema rollout. Missing schema returns an actionable unavailable state. Admins publish each week's groups explicitly; this is an implementation default, not an accepted automatic weekly scheduler. No regeneration or automatic roster rebalancing is included.
3. Next product increment: independent mentor availability and startup requests requiring mentor acceptance. Then outreach templates/scheduled sending and complete semester Notion export. Scheduling provider, sender configuration, and export destination remain open.
