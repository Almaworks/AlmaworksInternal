---
title: Unified Outreach CRM Implementation Plan
status: ready
updated: 2026-08-17
spec: "[[specs/2026-08-17-outreach-crm-design]]"
---

# Unified Outreach CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-page outreach tracker with a semester-aware internal CRM that preserves durable contacts and companies, provides configurable follow-up queues and transferable ownership, and safely migrates existing spreadsheet and legacy outreach data.

**Architecture:** Durable people and companies live in global identity tables; semester-specific opportunities, labels, activities, and import jobs carry non-null semester anchors. Pure TypeScript domain modules calculate queue state and normalize imports, while authenticated server commands perform privileged writes behind RLS. The frontend is split into focused queue, directory, detail, activity, and import components instead of extending the existing monolithic page.

**Tech Stack:** Next.js 16, React 19, strict TypeScript, CSS Modules/Tailwind, Supabase Postgres/RLS, Supabase CLI with Docker Desktop, Node test runner, Playwright visual QA.

**Spec:** `docs/specs/2026-08-17-outreach-crm-design.md`

## Global Constraints

- Operate only on Supabase project `layjdjfvxkowxidwuvbs`; verify the exact project reference before every remote operation.
- Never hand-edit `supabase/migrations/`; generate schema changes with `supabase db diff`.
- Every program-scoped table has `semester_id uuid not null references public.semesters(id)`.
- Global contact, company, relationship-label, and configuration exemptions stay documented in `docs/architecture/identity-membership.md`.
- Every new table enables RLS; browser code never receives or uses the service-role key.
- Authorization comes from `platform_roles` and `semester_memberships`, never browser-controlled metadata or legacy `profiles.role`.
- TypeScript remains strict and introduces no explicit `any` types.
- The first release logs and schedules outreach but sends no email and accesses no mailbox.
- Preserve unrelated dirty worktree changes and run scoped checks before broad checks.
- Run `npm run lint` before any commit; do not commit while unrelated full-lint errors remain unresolved.

---

## File structure

### Domain

- `src/outreach/types.ts` — contact, company, opportunity, activity, queue, and import types.
- `src/outreach/cadence.ts` — next-action calculation, snooze, silence, and queue classification.
- `src/outreach/import.ts` — field normalization, matching candidates, validation, and dry-run summaries.
- `src/outreach/stages.ts` — allowed stage transitions and open/closed stage predicates.
- `src/outreach/server/repository.ts` — database reads for saved views and contact detail.
- `src/outreach/server/commands.ts` — transactional activity, owner, snooze, silence, and offboarding commands.
- `src/outreach/server/import-service.ts` — preview, decision persistence, idempotent commit, and rollback provenance.

### Database

- `supabase/schemas/outreach_crm.sql` — desired outreach schema, indexes, functions, grants, and RLS.
- `supabase/tests/database/outreach_crm.test.sql` — pgTAP schema, RLS, command, and invariant tests.
- `supabase/migrations/<generated>_outreach_crm.sql` — generated exclusively by `supabase db diff -f outreach_crm`.
- `src/db/types.ts` — generated exclusively from the verified local database.

### API

- `app/api/admin/outreach/workspace/route.ts` — saved-view query endpoint.
- `app/api/admin/outreach/contacts/route.ts` — transactional contact/company/opportunity creation.
- `app/api/admin/outreach/contacts/[contactId]/route.ts` — safe global contact updates.
- `app/api/admin/outreach/opportunities/[opportunityId]/activity/route.ts` — touch/reply/note logging.
- `app/api/admin/outreach/opportunities/[opportunityId]/owner/route.ts` — transfer/release ownership.
- `app/api/admin/outreach/opportunities/[opportunityId]/snooze/route.ts` — set/clear snooze.
- `app/api/admin/outreach/opportunities/[opportunityId]/silence/route.ts` — silence/restore queue participation.
- `app/api/admin/outreach/imports/preview/route.ts` — normalize uploaded rows and persist staging preview.
- `app/api/admin/outreach/imports/[importId]/commit/route.ts` — idempotent reviewed import commit.
- `app/api/admin/outreach/migrations/legacy/preview/route.ts` — legacy-table migration preview.
- `app/api/admin/outreach/migrations/legacy/commit/route.ts` — reviewed legacy migration commit.

### Frontend

- `app/dashboard/admin/outreach/page.tsx` — thin page shell and authorization/loading boundary.
- `app/dashboard/admin/outreach/outreach-workspace.tsx` — view state, URL filters, and component composition.
- `app/dashboard/admin/outreach/outreach-workspace.module.css` — responsive CRM workspace styling.
- `app/dashboard/admin/outreach/components/workspace-header.tsx` — semester, search, actions, and health metrics.
- `app/dashboard/admin/outreach/components/queue-view.tsx` — overdue/due/upcoming/waiting groups.
- `app/dashboard/admin/outreach/components/people-view.tsx` — high-density contact directory.
- `app/dashboard/admin/outreach/components/companies-view.tsx` — company directory and related counts.
- `app/dashboard/admin/outreach/components/team-view.tsx` — owner groups and Unassigned queue.
- `app/dashboard/admin/outreach/components/contact-drawer.tsx` — identity, company, opportunity, and history workspace.
- `app/dashboard/admin/outreach/components/activity-composer.tsx` — log touch/reply/meeting/note.
- `app/dashboard/admin/outreach/components/import-review.tsx` — upload, match decisions, corrections, exclusions, and commit.
- `app/dashboard/admin/outreach/components/owner-picker.tsx` — active-owner assignment and transfer reason.
- `app/design-preview/outreach/page.tsx` — development-only visual QA surface.

### Tests and docs

- `tests/outreach/cadence.test.mts`
- `tests/outreach/stages.test.mts`
- `tests/outreach/import.test.mts`
- `tests/outreach/workspace.test.mts`
- `tests/auth/request.test.mts` — existing auth parser regression coverage.
- `docs/runbooks/outreach-data-migration.md` — executable migration and rollback gates.
- `docs/runbooks/outreach-operations.md` — daily queue, owner transfer, snooze, silence, and offboarding procedure.

---

### Task 1: Local Supabase and migration baseline

**Files:**
- Modify: `supabase/config.toml`
- Verify: `supabase/migrations/`
- Verify: `supabase/.temp/project-ref`

**Interfaces:**
- Consumes: approved Docker Desktop use and linked project reference `layjdjfvxkowxidwuvbs`.
- Produces: a reproducible local Supabase database whose migration history matches the repository.

- [ ] **Step 1: Locate and start Docker Desktop**

Run read-only discovery first:

```powershell
Get-Command docker -ErrorAction SilentlyContinue
Get-StartApps | Where-Object { $_.Name -like '*Docker*' }
Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*docker*' } | Select-Object Name,ProcessId,ExecutablePath
```

If Docker Desktop is installed but stopped, start the discovered executable with `Start-Process -WindowStyle Hidden`. If discovery confirms it is absent, use the already approved official Docker Desktop installer and report that persistent system installation before continuing.

- [ ] **Step 2: Verify the Docker engine**

Run:

```powershell
docker version
docker info --format '{{json .ServerVersion}}'
```

Expected: both client and server versions return without a named-pipe connection error.

- [ ] **Step 3: Verify the CLI linkage before remote comparison**

Read `supabase/.temp/project-ref` and require the exact value `layjdjfvxkowxidwuvbs`. Independently call the authorized Supabase project lookup and require the same reference and `AlmaworksInternal` name. Stop on any mismatch.

- [ ] **Step 4: Compare local and remote migration history**

Run:

```powershell
npm.cmd exec supabase migration list
```

Expected: local and remote timestamps are aligned after the earlier `migration fetch`; document any remaining divergence before schema work.

- [ ] **Step 5: Start and reset local Supabase**

Run:

```powershell
npm.cmd exec supabase start
npm.cmd exec supabase db reset
```

Expected: all fetched migrations replay locally and local Studio/API URLs are returned. If a historical migration fails, fix the baseline through supported CLI reconciliation; never edit migration files by hand.

- [ ] **Step 6: Record baseline evidence**

Add the successful CLI versions, migration-list result, and reset date to the implementation notes section of `docs/runbooks/outreach-data-migration.md`.

---

### Task 2: Outreach domain types and stage machine

**Files:**
- Create: `src/outreach/types.ts`
- Create: `src/outreach/stages.ts`
- Create: `tests/outreach/stages.test.mts`

**Interfaces:**
- Produces: `OutreachStage`, `RelationshipLabel`, `OutreachChannel`, `ActivityKind`, `canTransitionOutreachStage()`, `transitionOutreachStage()`, and `isOpenOutreachStage()`.

- [ ] **Step 1: Write the failing stage tests**

Cover these exact assertions:

```ts
assert.equal(canTransitionOutreachStage("prospect", "researching"), true);
assert.equal(canTransitionOutreachStage("contacted", "responded"), true);
assert.equal(canTransitionOutreachStage("responded", "meeting"), true);
assert.equal(canTransitionOutreachStage("meeting", "converted"), true);
assert.equal(canTransitionOutreachStage("converted", "contacted"), false);
assert.equal(isOpenOutreachStage("nurture"), true);
assert.equal(isOpenOutreachStage("closed"), false);
assert.throws(() => transitionOutreachStage("closed", "contacted"), /Cannot transition outreach/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --experimental-strip-types --test tests/outreach/stages.test.mts`

Expected: module-not-found failure for `src/outreach/stages.ts`.

- [ ] **Step 3: Implement the explicit transition map**

Define stages exactly as:

```ts
export type OutreachStage =
  | "prospect" | "researching" | "ready" | "contacted"
  | "responded" | "meeting" | "nurture" | "converted" | "closed";
```

Use a readonly transition map. `converted` and `closed` are terminal. `nurture` may return to `ready`, `contacted`, or `closed`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --experimental-strip-types --test tests/outreach/stages.test.mts`

Expected: all stage tests pass.

- [ ] **Step 5: Run scoped lint**

Run: `npm.cmd run lint -- src/outreach/types.ts src/outreach/stages.ts tests/outreach/stages.test.mts`

Expected: zero errors and zero warnings.

---

### Task 3: Cadence, snooze, silence, and queue classification

**Files:**
- Create: `src/outreach/cadence.ts`
- Create: `tests/outreach/cadence.test.mts`

**Interfaces:**
- Consumes: `OutreachStage` from Task 2.
- Produces: `calculateNextFollowUp()`, `classifyFollowUp()`, `restoreSilencedOpportunity()`, and `FollowUpBucket`.

- [ ] **Step 1: Write failing cadence tests**

Use a fixed clock of `2027-02-15T12:00:00.000Z` and assert:

```ts
assert.equal(calculateNextFollowUp("2027-02-01T12:00:00.000Z", 5), "2027-02-06T12:00:00.000Z");
assert.equal(calculateNextFollowUp("2027-02-01T12:00:00.000Z", 14), "2027-02-15T12:00:00.000Z");
assert.equal(classifyFollowUp(overdueOpportunity, now), "overdue");
assert.equal(classifyFollowUp(dueTodayOpportunity, now), "due_today");
assert.equal(classifyFollowUp(snoozedOpportunity, now), "snoozed");
assert.equal(classifyFollowUp(silencedOpportunity, now), "silenced");
assert.equal(classifyFollowUp(unassignedOpportunity, now), "unassigned");
assert.throws(() => restoreSilencedOpportunity(silencedOpportunity, null), /next follow-up/i);
```

- [ ] **Step 2: Run and verify RED**

Run: `node --experimental-strip-types --test tests/outreach/cadence.test.mts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement deterministic UTC calculations**

Validate cadence as an integer between 1 and 365. Queue precedence is: closed/converted -> `closed`; silenced -> `silenced`; active snooze -> `snoozed`; missing active owner -> `unassigned`; next action before local-day start -> `overdue`; same local date -> `due_today`; within configured horizon -> `upcoming`; otherwise -> `waiting`.

- [ ] **Step 4: Verify GREEN and lint**

Run:

```powershell
node --experimental-strip-types --test tests/outreach/cadence.test.mts
npm.cmd run lint -- src/outreach/cadence.ts tests/outreach/cadence.test.mts
```

Expected: both commands exit zero.

---

### Task 4: Import normalization and dry-run matching

**Files:**
- Create: `src/outreach/import.ts`
- Create: `tests/outreach/import.test.mts`

**Interfaces:**
- Consumes: relationship labels and stage types from Task 2.
- Produces: `normalizeOutreachRow()`, `matchOutreachRow()`, `summarizeImportPreview()`, `NormalizedOutreachRow`, and `ImportMatchDecision`.

- [ ] **Step 1: Write failing normalization tests**

Cover normalized lowercase email, canonical LinkedIn URL, trimmed names, domain extraction, status mapping, relationship-label deduplication, malformed email, and missing identity. Add candidate fixtures proving email wins over LinkedIn and name/company suggestions remain `review_required` rather than auto-merge.

- [ ] **Step 2: Run and verify RED**

Run: `node --experimental-strip-types --test tests/outreach/import.test.mts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement normalization without database access**

Expose this signature:

```ts
export function normalizeOutreachRow(
  input: Record<string, unknown>,
  rowNumber: number,
): NormalizedOutreachRow;
```

Never throw for row-level validation. Return issue codes such as `email_invalid`, `identity_missing`, `owner_unmatched`, and `company_ambiguous` so every bad row remains editable.

- [ ] **Step 4: Implement deterministic matching**

Expose:

```ts
export function matchOutreachRow(
  row: NormalizedOutreachRow,
  candidates: ImportCandidateIndex,
): ImportMatchDecision;
```

Match exact email first, canonical LinkedIn second, and return a reviewed suggestion for name/company similarity. Never automatically merge on a fuzzy suggestion.

- [ ] **Step 5: Verify GREEN and lint**

Run the focused test and scoped lint. Expected: zero failures, errors, or warnings.

---

### Task 5: Declarative CRM schema and RLS

**Files:**
- Create: `supabase/schemas/outreach_crm.sql`
- Modify: `supabase/config.toml`
- Create: `supabase/tests/database/outreach_crm.test.sql`
- Generate: `supabase/migrations/<timestamp>_outreach_crm.sql`
- Generate: `src/db/types.ts`
- Modify: `docs/architecture/identity-membership.md`

**Interfaces:**
- Consumes: local Supabase baseline from Task 1 and exact table model from the design spec.
- Produces: generated database types and RPCs `log_outreach_activity`, `transfer_outreach_owner`, `set_outreach_snooze`, `set_outreach_silence`, and `release_inactive_owner_work`.

- [ ] **Step 1: Write failing schema-contract tests**

Extend the Node schema-contract suite to require global tables `outreach_contacts`, `outreach_companies`, `outreach_contact_companies`, and `outreach_relationship_labels`; require non-null semester anchors and RLS for `outreach_opportunities`, `outreach_opportunity_labels`, `outreach_activities`, `outreach_import_jobs`, and `outreach_import_rows`.

- [ ] **Step 2: Add pgTAP tests before schema implementation**

Assert:

- every listed table exists and has RLS enabled;
- one open opportunity per `(semester_id, contact_id)`;
- cadence is constrained to 1–365;
- silencing requires actor, timestamp, and non-empty reason;
- activities cannot be updated or deleted by authenticated users;
- alumni and anonymous personas cannot mutate opportunities;
- active semester administrators can read and manage their semester only;
- owner release moves open opportunities to null owner and writes an activity.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
npm.cmd test
npm.cmd exec supabase test db
```

Expected: missing-table and missing-RPC failures.

- [ ] **Step 4: Implement `supabase/schemas/outreach_crm.sql`**

Create the exact global and semester-scoped tables from the design. Use explicit `public.` prefixes, `security definer set search_path = public` on helper functions, indexed foreign keys, cursor-query indexes on `(semester_id, next_follow_up_at, id)`, and append-only activity grants.

Use database functions for multi-record invariants. `log_outreach_activity` must update latest inbound/outbound timestamps and next action in the same transaction. `release_inactive_owner_work` must use one transaction and return affected opportunity IDs.

- [ ] **Step 5: Generate the migration with the CLI**

Configure `schema_paths = ["./schemas/*.sql"]`, then run:

```powershell
npm.cmd exec supabase db diff -- -f outreach_crm
```

Review generated SQL for destructive statements, unrelated schemas, missing RLS, broad grants, auth schema changes, and unexpected legacy-table drops. Regenerate from declarative schema changes rather than hand-editing the migration.

- [ ] **Step 6: Reset and run database tests**

Run:

```powershell
npm.cmd exec supabase db reset
npm.cmd exec supabase test db
```

Expected: clean reset and all pgTAP tests pass.

- [ ] **Step 7: Generate strict TypeScript types**

Run:

```powershell
npm.cmd exec supabase gen types typescript -- --local --schema public
```

Write the CLI output directly to `src/db/types.ts` using the approved type-generation command; do not manually edit the generated file.

- [ ] **Step 8: Run Node tests and scoped lint**

Expected: all schema-contract tests and TypeScript lint pass.

---

### Task 6: Workspace repository and pure view model

**Files:**
- Create: `src/outreach/server/repository.ts`
- Create: `src/outreach/workspace.ts`
- Create: `tests/outreach/workspace.test.mts`

**Interfaces:**
- Consumes: generated `Database` type and `classifyFollowUp()`.
- Produces: `loadOutreachWorkspace()`, `loadOutreachContactDetail()`, `buildOutreachHealth()`, and cursor type `OutreachCursor`.

- [ ] **Step 1: Write failing view-model tests**

Use fixtures that verify counts for overdue, due today, unassigned, and awaiting response; grouping by owner; stable ordering by next action then contact name; and cursor encoding/decoding without timestamps losing precision.

- [ ] **Step 2: Run and verify RED**

Expected: module-not-found failures.

- [ ] **Step 3: Implement pure health and grouping functions**

Keep queue classification and grouping independent from Supabase so the UI and API share deterministic behavior.

- [ ] **Step 4: Implement typed repository queries**

Every query requires a `semesterId`, selects explicit columns, limits page size to 100, and uses `(next_follow_up_at, id)` cursor pagination. All-time directory views use a separate explicitly authorized method rather than omitting the semester filter accidentally.

- [ ] **Step 5: Verify tests and scoped lint**

Expected: focused tests pass with no lint findings.

---

### Task 7: Transactional commands and owner offboarding

**Files:**
- Create: `src/outreach/server/commands.ts`
- Create: `tests/outreach/commands.test.mts`
- Modify: `src/auth/server.ts`

**Interfaces:**
- Consumes: `requireSemesterAdmin()`, generated RPC types, cadence rules.
- Produces: `logActivity()`, `transferOwner()`, `snoozeOpportunity()`, `silenceOpportunity()`, and `releaseInactiveOwnerWork()`.

- [ ] **Step 1: Write failing command validation tests**

Assert that outbound activities require a channel, silence requires a reason, restore requires a next action, transfers reject inactive owners, and a stale `updatedAt` returns a typed conflict.

- [ ] **Step 2: Run and verify RED**

Expected: missing command module.

- [ ] **Step 3: Implement typed command inputs**

Define discriminated unions so `email`, `call`, `linkedin`, `meeting`, `reply`, and `note` carry the correct required fields without `any`. Server functions call database RPCs only after semester authorization succeeds.

- [ ] **Step 4: Integrate owner offboarding**

The account deactivation path must call `releaseInactiveOwnerWork` before membership suspension completes. Abort the deactivation if ownership release fails; never leave an inactive owner assigned.

- [ ] **Step 5: Verify focused tests and lint**

Expected: all command validation tests pass.

---

### Task 8: Authenticated outreach APIs

**Files:**
- Create all API routes listed in the File structure section.
- Create: `src/outreach/server/http.ts`
- Create: `tests/outreach/http.test.mts`

**Interfaces:**
- Consumes: repository and commands from Tasks 6–7.
- Produces: versioned JSON response shapes used by the frontend.

- [ ] **Step 1: Write failing HTTP parser tests**

Test unknown JSON, missing semester ID, invalid UUIDs, cadence outside 1–365, empty silence reason, unsupported channels, more than 250 import rows, and stale-update conflicts.

- [ ] **Step 2: Run and verify RED**

Expected: missing parser module.

- [ ] **Step 3: Implement shared parsing and error mapping**

Map `AuthorizationError` to 401/403, validation to 400, missing records to 404, duplicate/stale records to 409, and unexpected errors to 500 without exposing database details.

- [ ] **Step 4: Implement read routes**

Workspace responses contain `health`, `rows`, `nextCursor`, `owners`, and `semester`. Detail responses contain contact, company relationships, current opportunity, labels, and paginated activities.

- [ ] **Step 5: Implement mutation routes**

Every mutation parses JSON before calling `requireSemesterAdmin`, requires an idempotency key for import commit, and returns the updated opportunity plus the appended activity when relevant.

- [ ] **Step 6: Verify route tests, lint, and build**

Run focused tests, scoped lint, then `npm.cmd run build`. Expected: all new routes compile and no client bundle contains service-role references.

---

### Task 9: Import preview, decisions, commit, and rollback provenance

**Files:**
- Create: `src/outreach/server/import-service.ts`
- Create: `tests/outreach/import-service.test.mts`
- Modify: import and legacy migration API routes from Task 8.
- Modify: `docs/runbooks/outreach-data-migration.md`

**Interfaces:**
- Consumes: normalization/matching from Task 4 and generated database types.
- Produces: `previewImport()`, `saveImportDecision()`, `commitImport()`, `previewLegacyMigration()`, and `rollbackImport()`.

- [ ] **Step 1: Write failing service tests with fixtures**

Include duplicate email, LinkedIn-only identity, ambiguous name/company, missing owner, inactive owner, excluded row, corrected row, multi-label contact, and replayed idempotency-key fixtures.

- [ ] **Step 2: Run and verify RED**

Expected: missing import service.

- [ ] **Step 3: Implement preview persistence**

Store raw input, normalized input, issue codes, match decision, selected/excluded state, and row number. Preview never creates production CRM records.

- [ ] **Step 4: Implement idempotent commit**

Commit selected valid rows in a transaction. Upsert contacts by reviewed identity, companies by reviewed identity, one open opportunity per contact/semester, labels, reconstructed activity, conversion link, and import provenance. Repeating the same import job and idempotency key returns the prior result.

- [ ] **Step 5: Implement rollback by provenance**

Rollback is permitted only before legacy archival and only when affected CRM records have no post-import user activities. Return conflicts for records changed after import rather than deleting them.

- [ ] **Step 6: Verify tests and update executable runbook commands**

Document preview, sample verification, commit, rollback, read-only transition, and archival as separate commands/gates.

---

### Task 10: Unified workspace shell and queue views

**Files:**
- Replace: `app/dashboard/admin/outreach/page.tsx`
- Create: `app/dashboard/admin/outreach/outreach-workspace.tsx`
- Create: `app/dashboard/admin/outreach/outreach-workspace.module.css`
- Create: `app/dashboard/admin/outreach/components/workspace-header.tsx`
- Create: `app/dashboard/admin/outreach/components/queue-view.tsx`
- Create: `app/dashboard/admin/outreach/components/team-view.tsx`
- Create: `app/dashboard/admin/outreach/components/people-view.tsx`
- Create: `app/dashboard/admin/outreach/components/companies-view.tsx`
- Create: `app/design-preview/outreach/page.tsx`

**Interfaces:**
- Consumes: workspace API response from Task 8.
- Produces: URL-addressable views `mine`, `team`, `people`, `companies`, and `imports`.

- [ ] **Step 1: Add a development fixture matching the API response**

Include overdue five-day investor, fourteen-day mentor waiting, snoozed contact, silenced contact, unassigned former-owner contact, multiple relationship labels, and empty states.

- [ ] **Step 2: Build the thin page and loading/error boundaries**

The page must not contain CRM business logic. It renders skeleton rows while loading, a retry surface on failure, and the workspace after successful fetch.

- [ ] **Step 3: Build the workspace header**

Include semester selector, search, Add contact, Import, and health indicators. Search updates a debounced URL query and is keyboard accessible.

- [ ] **Step 4: Build My queue and Team queue**

Use semantic tables at desktop width and card rows under 760px. Keep overdue actions visually prominent without relying on red alone. Team queue groups by active owner and places Unassigned first when non-empty.

- [ ] **Step 5: Build People and Companies views**

People shows name, company, biography excerpt, labels, owner, last touch, and next action. Companies shows domain, description, sectors, related people, open opportunities, and most recent activity.

- [ ] **Step 6: Add keyboard and responsive behavior**

Rows open with Enter/Space, focus remains visible, horizontal filters scroll intentionally, and mobile actions remain reachable without hover.

- [ ] **Step 7: Run scoped lint and production build**

Expected: zero new lint findings and successful build.

---

### Task 11: Contact drawer, activity composer, and ownership controls

**Files:**
- Create: `app/dashboard/admin/outreach/components/contact-drawer.tsx`
- Create: `app/dashboard/admin/outreach/components/activity-composer.tsx`
- Create: `app/dashboard/admin/outreach/components/owner-picker.tsx`
- Modify: `app/dashboard/admin/outreach/outreach-workspace.module.css`

**Interfaces:**
- Consumes: detail and mutation APIs from Task 8.
- Produces: accessible contact-management interaction without route loss.

- [ ] **Step 1: Build contact detail loading and error states**

The drawer retains the originating URL/view, traps focus while open, closes on Escape, and restores focus to the invoking row.

- [ ] **Step 2: Build identity, company, and opportunity sections**

Show durable profile context separately from semester-specific owner, stage, cadence, next action, snooze, and silence state.

- [ ] **Step 3: Build the append-only activity timeline**

Render touch, reply, note, meeting, stage, owner transfer, snooze, silence, import, and conversion events with actor and timestamp.

- [ ] **Step 4: Build activity logging**

Channel-specific fields appear through a discriminated form. Optimistically append only after the server returns the committed activity; retain the draft on error.

- [ ] **Step 5: Build transfer, snooze, and silence controls**

Transfer requires an active owner or explicit Unassigned choice and an optional reason. Snooze requires a future date. Silence requires a reason. Restore requires a valid next-action date.

- [ ] **Step 6: Verify keyboard, mobile drawer, error recovery, lint, and build**

Expected: no clipped controls at 390px and no console errors.

---

### Task 12: Import review UI and legacy migration control

**Files:**
- Create: `app/dashboard/admin/outreach/components/import-review.tsx`
- Create: `app/dashboard/admin/outreach/components/import-summary.tsx`
- Create: `app/dashboard/admin/outreach/components/match-resolution.tsx`
- Modify: `app/dashboard/admin/outreach/outreach-workspace.module.css`

**Interfaces:**
- Consumes: import and migration APIs from Tasks 8–9.
- Produces: reviewed import jobs that can be committed only when required issues are resolved.

- [ ] **Step 1: Preserve the existing CSV/Excel entry point**

Accept the existing aliases and template while adding biography, cadence, owner, relationship labels, source, referral, and next-action aliases. Limit to 250 rows per upload.

- [ ] **Step 2: Build summary and row-state filters**

Show creates, updates, exact matches, suggested matches, excluded rows, and invalid rows. Filters never hide selected rows during bulk actions without clearing selection first.

- [ ] **Step 3: Build match resolution**

For ambiguous contact/company rows, provide Merge, Create new, and Exclude. Display the signals that produced a suggestion; never preselect Merge for a fuzzy match.

- [ ] **Step 4: Build correction and owner resolution**

Allow inline normalized-field corrections. Inactive or unmatched legacy owners default to Unassigned and require acknowledgment before commit.

- [ ] **Step 5: Build commit confirmation and immutable result**

Confirm exact counts before commit. After commit, show created IDs, excluded rows, warnings, provenance, and rollback eligibility; do not silently rerun.

- [ ] **Step 6: Verify representative imports visually and through tests**

Use valid, mixed-error, duplicate-heavy, and inactive-owner fixtures on desktop and mobile.

---

### Task 13: Carry-forward, operations documentation, and future-email boundary

**Files:**
- Create: `docs/runbooks/outreach-operations.md`
- Modify: `docs/runbooks/semester-close.md`
- Modify: `docs/runbooks/outreach-data-migration.md`
- Modify: `docs/specs/2026-08-17-outreach-crm-design.md` only if implementation behavior differs after explicit approval.

**Interfaces:**
- Consumes: owner release and opportunity creation commands.
- Produces: repeatable daily and semester-transition procedures.

- [ ] **Step 1: Document daily queue operation**

Specify queue order, activity logging, cadence override, snooze, silence, restore, and Unassigned triage.

- [ ] **Step 2: Document staff offboarding**

Specify inactive membership -> atomic release -> Unassigned verification -> reassignment, including failure escalation.

- [ ] **Step 3: Document semester carry-forward**

Create a reviewed next-semester opportunity using the same global contact/company, choose labels and cadence, and require a new active owner or Unassigned acknowledgment.

- [ ] **Step 4: Preserve the email boundary**

State that no mailbox credentials, OAuth scopes, sending endpoints, reply webhooks, or background sequences are included. Link future Gmail/Microsoft 365 work to a separate ADR/spec requirement.

---

### Task 14: Cutover and final verification

**Files:**
- Modify: `docs/runbooks/outreach-data-migration.md`
- Verify: all files from Tasks 1–13

**Interfaces:**
- Consumes: completed schema, services, APIs, UI, migration tooling, and docs.
- Produces: evidence-backed readiness for legacy-data migration and deployment.

- [ ] **Step 1: Run the full local database verification**

```powershell
npm.cmd exec supabase db reset
npm.cmd exec supabase test db
```

Expected: clean reset and all database tests pass.

- [ ] **Step 2: Run application verification**

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
git diff --check
```

Expected: all commands exit zero. Existing unrelated lint errors must be fixed or explicitly separated before any commit; do not claim a clean lint run otherwise.

- [ ] **Step 3: Run migration dry-run fixtures**

Verify source/destination count reconciliation, duplicates, exclusions, owner mapping, activity chronology, idempotent replay, and rollback eligibility.

- [ ] **Step 4: Perform visual QA**

Inspect development preview and authenticated route at 1440×1000 and 390×844. Cover My queue, Team queue, Unassigned, People, Companies, contact drawer, activity composer, import review, empty state, error state, and loading state. Check console errors, clipped controls, focus order, contrast, and horizontal overflow.

- [ ] **Step 5: Verify the authorized remote target before deployment**

Require project reference `layjdjfvxkowxidwuvbs` and URL `https://layjdjfvxkowxidwuvbs.supabase.co` immediately before any remote dry-run or migration. Stop on mismatch.

- [ ] **Step 6: Preview remote database changes without applying**

Run:

```powershell
npm.cmd exec supabase db push -- --dry-run
```

Expected: only the reviewed generated outreach/lifecycle migrations are pending. Applying the migration requires a separate deployment decision after dry-run review.

- [ ] **Step 7: Record final evidence**

Update the migration runbook with command outputs, migration filename, generated-type date, dry-run counts, visual viewports, unresolved risks, rollback window, and the explicit statement that email sending remains out of scope.

---

## Implementation order and checkpoints

1. Tasks 1–5 establish the toolchain, domain rules, schema, RLS, and generated types.
2. Tasks 6–9 build typed server reads, commands, APIs, and migration behavior.
3. Tasks 10–12 replace the frontend and preserve/import existing workflows.
4. Tasks 13–14 finalize operations, cutover safety, and verification.

Checkpoint after Task 5: review generated SQL and RLS before building on the schema.

Checkpoint after Task 9: run the legacy migration preview against a non-mutating local fixture and review the report.

Checkpoint after Task 12: review desktop/mobile visuals and daily queue usability.

Checkpoint after Task 14 dry-run: decide separately whether to apply remote migrations.
