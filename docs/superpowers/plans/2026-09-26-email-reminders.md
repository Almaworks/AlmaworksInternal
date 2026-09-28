# Contextual Email Reminders Implementation Plan

> **For agentic workers:** Read the linked design and applicable repository instructions before executing. Implement one checked phase at a time; review generated migrations and validate with real role-specific sessions before calling the feature verified.

**Goal:** Send useful, contextual email for booking and Friday events, plus daily admin outreach reminders, with direct authenticated links to the affected records.

**Architecture:** Saved application events create semester-scoped outbox work. A scheduled worker resolves current recipients and state, renders safe HTML/plain-text content, and sends through Sequenzy. Stable event keys, a lease, and explicit ambiguous-send handling prevent ordinary retries from mailing people twice.

**Tech Stack:** Next.js 16, TypeScript, Supabase Postgres/RLS and scheduled Edge Functions, Sequenzy transactional API.

**Spec:** `docs/superpowers/specs/2026-09-26-email-reminders-design.md`

## Scope and prerequisites

- Plan only; no product code, migration, provider settings, hosted deployment, or live participant emails are changed by this document.
- Work against only `https://layjdjfvxkowxidwuvbs.supabase.co` (`layjdjfvxkowxidwuvbs`). Verify that target before each remote operation.
- Retain all existing dirty work. Inspect nested instructions before modifying auth/database code. Generate migrations through `supabase db diff`; never edit files under `supabase/migrations/` by hand.
- Do not store the Sequenzy key in source or a `NEXT_PUBLIC_` variable. The previous test reached Gmail Spam with a rewritten `.sequenzymail1.com` sender; the user accepts that delivery limitation temporarily, while the sender discrepancy remains unresolved.
- Before live activation, verify the app's public HTTPS origin, a server-side Sequenzy key with `transactional:send`, the exact intended test semester/recipients, and authenticated admin/mentor/startup QA accounts. Existing local key and app code do not prove hosted configuration.
- Existing Friday cancellation and startup permissions migrations in this dirty tree have their own release state. Compare hosted schema to prerequisites; do not assume local files are deployed.

## Acceptance checks

1. A startup's request produces exactly one **pending** email to the correct mentor, with startup, topic, proposed time/zone, and a link that opens that request after sign-in.
2. Acceptance produces a **confirmed** email to the startup's active members and the mentor, with mentor name/bio, topic, time/zone, and a link to the exact booking on the Almaworks Bookings page. The booking offers Google/Apple calendar actions as appropriate without duplicating an existing connected Google hold. A 24-hour reminder uses the latest state; canceled or declined bookings never get a confirmed reminder.
3. Speaker confirmation/change and group publication/change mail the correct semester's active startup members, with accurate Friday date/start time, speaker bio/group rotation as applicable, and a link to the exact week. Repeated saves or regeneration do not duplicate unchanged messages.
4. Due/overdue outreach tasks yield one owner-specific weekday digest at the configured local time, with contact/company, due date, next action, and exact opportunity links. Silenced/closed items and inactive owners are excluded; the digest never sends prospect outreach.
5. Provider acceptance, failure, and ambiguous outcomes are recorded distinctly; only authorized admins can inspect delivery state. Actual recipient-folder arrival and all deep links are checked with designated test accounts. No cross-semester details leak.

## File and responsibility map

| Area | Expected files | Responsibility |
| --- | --- | --- |
| Outbox schema and policies | New `supabase/schemas/notification_delivery.sql`, security schema addition, generated `supabase/migrations/*`, generated `src/db/types.ts` | Semester-scoped events, per-recipient deliveries, unique keys, worker claims, RLS and retention |
| Event/recipient logic | New `src/notifications/events.ts`, `recipients.ts`, `templates.ts`, `links.ts`, `delivery.ts` | Pure event definitions, eligible recipients, escaped contextual content, links, provider lifecycle |
| Existing mutations | `src/mentor-booking/server.ts`, `src/friday-program/server.ts`, related SQL functions/schemas | Enqueue after persisted state changes; no email from a browser request |
| Scheduler | New `supabase/functions/notification-worker/*`, schedule configuration/runbook | Claim due mail, recheck source state, send through Sequenzy, reconcile safely |
| Deep links and calendar actions | `app/dashboard/bookings/page.tsx`, `components/mentor-booking/MentorBookingWorkspace.tsx`, a new authenticated calendar-export route, `components/friday-program/FridayProgramPanel.tsx`, outreach workspace | Select/focus exact record; expose Google/Apple options from Bookings; focus exact Friday week/opportunity |
| QA and operation | New `tests/notifications/*`, affected flow tests, `docs/runbooks/email-reminders.md` | Event/recipient/template/worker tests and release/incident procedure |

The paths above are the intended ownership map. If a current file's interface differs at implementation time, update this plan before making a broad change.

## Phase 1 — Shared delivery foundation

- [ ] Confirm exact table relationships for `profiles`, `semester_memberships`, `startup_team_memberships`, `mentor_booking_requests`, `friday_programs`, `friday_speakers`, and outreach opportunities. Identify the RLS policy used by each recipient lookup and the existing calendar worker's deploy/registration pattern.
- [ ] Add a semester-scoped outbox with unique `(event kind, source ID, source version, recipient profile)` delivery identity, `due_at`, claim lease, status (`queued`, `sending`, `accepted`, `failed`, `unknown`, `suppressed`), provider ID, sanitized error, and timestamps. Keep recipient address snapshots only as long as needed for delivery/audit; include deletion cleanup. Restrict reads to authorized semester admins and writes to event creation/worker functions with RLS.
- [ ] Write the outbox schema declaratively, generate migration with `supabase db diff`, review/replay the generated output, and regenerate TypeScript types. Test duplicate insertion, cross-semester denial, concurrent claims, expired leases, member deletion, and recipient deactivation.
- [ ] Add event IDs and template renderer. Required common fields: status, title, person/organization, topic/context, start/end or due date, explicit timezone, short bio when available, and a primary CTA. Render escaped HTML and plain text. Snapshot enough event context for audit, but the worker must recheck current source state before sending a delayed reminder.
- [ ] Extend the existing `src/notifications/sequenzy.ts` boundary without exposing the API key. Keep provider `accepted` separate from delivered. Quarantine a timeout/unreadable success for dashboard reconciliation rather than automatic resubmission. Test rejected, accepted, ambiguous, duplicate, and missing-key states with fake fetch.
- [ ] Add an isolated worker with narrow database access and a scheduled invocation. Reuse the existing hosted Supabase Cron/Vault pattern after verifying the exact project and current schedule. Keep cadence and local timezone in configuration; do not hardcode a secret or production URL. Test two simultaneous worker runs and a stale lease.

## Phase 2 — Booking emails and useful booking links

- [ ] Enqueue `booking_requested` only when a new request is persisted. On mentor acceptance, enqueue `booking_confirmed` for each current active startup member and the mentor; mark request/decline/cancel transitions separately. Return the booking action normally even if mail is pending, while exposing a truthful delivery warning to admins when queued delivery fails.
- [ ] Add a booking-detail deep link using semester ID and request ID. The email's primary link is `View/manage in Bookings`. The page must preserve selection across reload/sign-in, focus the actual booking in the Almaworks calendar, display current status and the existing cancel/management action, and show a safe unavailable state if unauthorized or removed. Do not reveal booking content in the URL.
- [ ] Add `Add to personal calendar` on that booking detail. If this participant's existing Google connection already has a confirmed hold, show its status and avoid creating another Google event. If no hold is present, offer a Google Calendar add action for the accepted booking. Add an authenticated `.ics` export for Apple Calendar and other apps with stable UID, correct timezone/start/end, and current booking status. Tell users that manually added calendar copies may need updating after a change/cancellation. The email may offer a secondary link to this booking-detail action, after sign-in, but no raw calendar payload or access token belongs in the email URL.
- [ ] Confirmation template: mentor/startup names, agreed topic, start and end in semester timezone, mentor's current short biography if present, location/format only when saved, and `View/manage in Bookings` plus the secondary calendar-action link. Mentor-request email says pending; show calendar options only after acceptance. Never describe a connected private hold or downloadable `.ics` as a sent Google invitation.
- [ ] Create a 24-hour reminder for accepted bookings. The worker re-reads status/time/membership before sending. Acceptance within 24 hours sends only the confirmation; changes suppress stale reminders and create a corrected event where applicable.
- [ ] Tests: request→accept→reminder, decline, cancel, reschedule, duplicate accept, changed bio, missing bio, inactive teammate, another-semester account, login return link, and a booking that starts inside the reminder window. Verify the Google-connected hold path does not create a second event, the Google add action appears only when appropriate, Apple imports the `.ics`, and a changed/canceled booking does not masquerade as current in Almaworks. Extend `tests/mentor-booking/server.test.mts`, UI tests, and new notification tests.

## Phase 3 — Friday speaker, group, and agenda emails

- [ ] Treat the saved Friday speaker as confirmed for mail only when the week is active. On first save, send a confirmation; on material edit, send an update; on removal/cancellation, send a correction. Suppress nonmaterial repeat saves. Preserve existing in-app notifications.
- [ ] On first group publication, send each active startup member only their company's group and rotation. On regeneration, compare old and new assignments and send **updated group** only to changed companies. Do not send a generic message with all startup assignments.
- [ ] Add a Friday-week deep link that selects the exact meeting after sign-in/reload. Derive date and actual start time from saved `meetings` fields in the semester timezone; verify which slot field represents the program start. Include speaker name/topic/short bio when available and group facilitators where relevant.
- [ ] Schedule a 24-hour Friday reminder only for an active, published week. Recheck speaker/group/cancellation before send; if publication is inside that window, skip the extra reminder. Tests cover canceled week, removed speaker, regenerated groups, odd roster, newly added member, old link, and cross-semester access. Extend Friday SQL/application/UI tests.

## Phase 4 — Admin outreach digests

- [ ] Reuse `src/outreach/cadence.ts` classification and existing opportunity owner/due fields. Resolve owner email from active `profiles` membership. For unassigned work, use authorized active semester admins. Group due and overdue opportunities into one digest per recipient per weekday; maintain a digest-day identity so worker reruns do not duplicate it.
- [ ] Include contact/company, follow-up reason or latest next-action summary, due date with zone, overdue label, and direct opportunity link. Exclude silenced, snoozed, closed, archived, inactive-semester, and inactive-owner records. Recheck at send time so a completed follow-up drops out.
- [ ] Make 9:00 a.m. `America/New_York` weekday timing a configurable deployment setting. Test daylight saving transitions, no-due day, changed owner, old overdue item, unassigned item, and links that preserve the selected opportunity after login. No automatic external outreach send in this phase.

## Phase 5 — Release and verification

- [ ] Run focused notification/booking/Friday/outreach tests, database RLS and concurrency tests, `npx tsc --noEmit`, `npm run lint`, `npm run db:migration-safety`, and a build. Repeat only tests affected by fixes. Record exact PASS/FAIL/BLOCKED results; never infer browser success from unit tests.
- [ ] Use `docs/runbooks/authenticated-qa.md`: inspect hosted schema first, then real admin/mentor/startup sessions with a disposable semester and designated test inboxes. Verify action, received content, direct link after sign-in, current status after reload, unauthorized access, and canceled/changed cases. Check Sequenzy's exact send ID and the recipient's inbox/spam folder. Do not test by mailing real participants.
- [ ] Before activation, configure and verify the public HTTPS app origin and Sequenzy server key, deploy reviewed migrations/application/worker only with release authorization, then enable schedule and monitor first runs. Document pausing, reconciliation of `unknown` sends, and an admin-visible delivery report. Roll out booking confirmations first, Friday mail second, outreach digest last; keep sends disabled per category until its QA passes.

## Review focus

- **Wrong recipient:** a former startup member or reassigned admin must not get content after membership/owner changes; Phase 1/2/4 tests.
- **Wrong status:** a canceled or declined booking must not produce a confirmed reminder; Phase 2 tests.
- **Wrong time:** daylight saving and a changed start time must display correct local time/zone; Phase 2/3/4 tests.
- **Broken link or duplicate calendar event:** signed-out recipients must return to the exact authorized record after login, and connected Google users must not get a second event from the add action; Phase 2/3/4 browser QA.
- **Duplicate mail:** request retries, worker overlap, ambiguous provider responses, and group regeneration must not multiply sends; Phase 1/2/3 tests.

## Provider and scheduler references

Sequenzy's [developer API overview](https://www.sequenzy.com/features/developer-api) describes transactional sending and delivery tracking. Supabase's [scheduled Edge Functions guide](https://supabase.com/docs/guides/functions/schedule-functions) describes the hosted `pg_cron`/`pg_net` pattern and Vault-backed secrets. Recheck current API specifics when implementation begins; these pages do not prove idempotency behavior for the exact Sequenzy endpoint currently used by the app.
