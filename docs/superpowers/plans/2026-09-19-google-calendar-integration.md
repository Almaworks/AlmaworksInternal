# Google Calendar Integration Implementation Plan

> Follow test-first implementation and verify each task. Preserve the full objective until live cross-role and two-party calendar QA passes.

**Goal:** Optional mentor calendar onboarding/import/sync and editable effective availability, with two-party mentorship holds and real mentor/admin/startup QA.
**Architecture:** OAuth + encrypted connections; interval projection and RLS-backed availability; leased sync/hold jobs; shared role UI.
**Stack:** Next.js/TypeScript, Supabase Postgres/RLS, Google Calendar REST API.
**Spec:** docs/superpowers/specs/2026-09-19-google-calendar-integration-design.md.

## Constraints

- Only Supabase project layjdjfvxkowxidwuvbs. No direct privilege bypass, hand-edited migrations or generated types.
- No event descriptions/titles/attendees collected for availability. Never alter existing Google events.
- Existing Friday reservation and accepted bookings remain authoritative. Preserve unrelated dirty work and services.
- Current default local database is preserved after the previous reset incident; fresh unique stacks only.
- Missing external prerequisites are blockers for affected checks, not reasons to reduce scope.

## 1. Calendar domain and provider boundary

Files: new src/calendar/{types,availability,google-provider,token-crypto,oauth}.ts; tests/calendar/*.test.mts.
- [x] Write failing interval tests (overlap, clipping, stale data, manual overrides, UTC/DST boundary).
- [x] Implement pure interval projection using absolute timestamps and IANA timezone formatting. Iteration over real instants retains both fall-back occurrences and skips nonexistent spring times.
- [x] Test and implement Google FreeBusy parsing, refresh, event upsert/delete, provider failures and retry classification (injected-provider tests; real Google QA remains task5).
- [x] Test OAuth state/PKCE and authenticated encryption; define redacted public status DTOs (atomic state consumption remains task3).

## 2. RLS persistence, authoritative booking and worker

Files: new supabase/schemas/google_calendar.sql and supabase/tests/database/google_calendar.test.sql; modify mentor_booking guard integration, member_deletion cleanup and architecture exemptions; generated migration/types.
- [ ] Define connection, semester settings, busy snapshot, dated override and hold/outbox relations with explicit grants/policies.
- [ ] Implement scoped RLS worker leasing and result application; only verified actor/connection jobs.
- [ ] Add one authoritative dated availability predicate/projection used for rendering and request/accept checks.
- [ ] Integrate disconnect and personal deletion without leaving tokens or scheduled writes.
- [ ] Generate/replay migration on a new stack, verify permission and concurrency tests, generate types.

## 3. Server orchestration

Files: new src/calendar/{repository,server,sync,holds}.ts and app/api/calendar/{connection,connect,callback,sync,settings,overrides,worker}/route.ts; modify src/mentor-booking/server.ts.
- [ ] Bind OAuth begin/callback to actual authenticated participant and persist encrypted refresh credentials.
- [ ] Import primary calendar busy data and selected working hours; support both modes and bounded coverage.
- [ ] Run scheduled refresh and reconnect handling; recheck conflicts for booking commands.
- [ ] Enqueue/reconcile accepted/cancelled booking holds for mentor and requesting startup profile.
- [ ] Verify request authorization, idempotency, provider outage and wrong-account boundaries.

## 4. Shared UI

Files: new components/calendar/{CalendarConnectionCard,EffectiveAvailabilityCalendar}.tsx; modify onboarding-flow.tsx, MentorBookingWorkspace.tsx, availability views, types/model/startup projection and response validators.
- [ ] Add optional connect/skip to onboarding without losing its current draft.
- [ ] Add import/sync mode, hours/timezone, last-sync/reconnect, dated slot exceptions and disconnect in Availability.
- [ ] Render effective availability consistently for mentor, admin and startup; expose no private calendar details.
- [ ] Add optional startup connection and hold state in bookings.
- [ ] Test save/reload, step transitions and desktop/narrow/error layouts.

## 5. Deployment and real QA

- [ ] Verify Google project OAuth consent/config and user-granted scopes; callback addresses and encrypted-key setup.
- [ ] Review generated migrations and deploy only approved scoped release to allowlisted project; configure scheduled worker.
- [ ] Real mentor connect/import + optional onboarding + automatic refresh + manual overrides, using existing busy events read-only.
- [ ] Actual admin/startup availability propagation, permission boundaries and conflict rejection.
- [ ] Authorized fixture accept/cancel, inspect actual holds in mentor and startup calendars; cleanup test-created holds.
- [ ] Final requirement-by-requirement report and memory update; mark goal complete only on full evidence.
