# Almaworks contextual email reminders — design

## Goal and status

Proposed design for review, based on the user's 2026-09-26 request. People should understand a booking, Friday program change, or outreach task from the email itself and reach the exact record in Almaworks with one click. The user accepts initial Gmail Spam placement as a temporary limitation. This document does not authorize a hosted release or sends to real participants.

## Notification contract

Every message has an explicit event/status, recipient-specific subject and action, local date and time with timezone when a time exists, relevant people and organizations, topic, a short bio or context when available, and an HTTPS link to the exact item. Never invent a bio, location, calendar event, or confirmation. If a field is absent, omit it or say that details are pending. Keep mail readable as plain text as well as HTML; escape user-authored text. The message states when the event occurred and points to the app as the source of current truth when details change.

| Trigger | Recipients | Content and action |
| --- | --- | --- |
| Startup requests mentor time | Requested mentor | Startup and requester, startup context if available, proposed date/time, topic, `Review request` link. Say **pending**, not confirmed. |
| Mentor accepts | Active members of the requesting startup; mentor gets a matching confirmation | Mentor/startup, topic, start/end, timezone, mentor bio if present, current calendar status, `View/manage booking` link. Say **confirmed** only after the saved booking is accepted. |
| Confirmed meeting approaches | Same active participants | 24-hour reminder with current details and `View/manage booking` link. Skip if canceled or already past. |
| Booking declines/cancels/changes | Affected participants | Clear changed status and current details; no stale `confirmed` wording. |
| Admin saves a Friday speaker | Active startup members in the semester | Friday date/start time, speaker name/topic, short bio, `View Friday session` link. New speaker and materially changed speaker get distinct wording; removal/cancellation gets correction mail. |
| Admin publishes/regenerates Friday groups | Each active member of each assigned startup | Their startup's group, both rotation facilitators, Friday date/start time, speaker if confirmed, `View my Friday group` link. Regeneration sends only changed assignments, marked **updated**. |
| Outreach follow-up is due | Assigned active admin; unassigned work to authorized semester admins | One daily digest per admin showing contact/company, due date, reason or next action, and deep links into each opportunity. No prospect email is sent by this reminder. |

Friday speaker email is an addition to the earlier in-app-only behavior, superseded by the user's new request. Keep existing in-app notifications. Immediate event mail and reminders use Sequenzy's transactional sender; the existing separate outreach email composition/scheduling system is not migrated in this phase.

## Timing and defaults to review

- Send event emails soon after the corresponding persisted state change, through a durable queue.
- Send one confirmed-booking reminder approximately 24 hours before start. A booking accepted inside that window gets the confirmation only.
- Send a Friday agenda/group reminder approximately 24 hours before the session only when a program is published and the week is not canceled. Avoid duplicating the publication email when publication occurs inside that window.
- Send one outreach digest at 9:00 a.m. `America/New_York` on weekdays for due and overdue, unsilenced opportunities. The owner must be active; never keep mailing a former owner. A newly due item should appear once per digest day until resolved, with overdue status visible.
- These times are proposed defaults, not user-confirmed settings. The implementation plan makes them configurable before hosted activation.

## Links and calendar behavior

Add stable, authenticated deep links to a booking request, a Friday meeting, and an outreach opportunity. Preserve the destination through sign-in; after sign-in, server authorization and RLS determine visibility. An old link should show the current status, including canceled/changed, or an access-safe unavailable state. Do not put session tokens or private record content in URLs. **The primary calendar destination for booking email is the Almaworks Bookings page.** The existing page accepts a mentor filter but no request ID; add request selection and a focused booking detail. That detail shows the accepted item in the app's booking calendar and the available manage action.

Also add an **Add to personal calendar** option from that booking detail. The existing optional Google connection already creates a private hold for accepted bookings; show its real sync status and do not offer a second Google event when the hold is present. For a recipient without a connected hold, offer a Google Calendar add flow based on the confirmed booking. Provide a standards-compliant `.ics` download for Apple Calendar and other calendar apps. The email can link to the authenticated booking detail's calendar action, but must keep `View/manage in Bookings` as the primary action. An exported or manually added calendar event is a convenience copy; changes and cancellation are authoritative in Almaworks, and the UI/email must say that manual calendar copies may need updating. Test Google and Apple paths before representing either as available. Do not claim a calendar invite is sent merely because a Google hold or `.ics` option exists.

Use a configured public application origin, not a URL inferred from an incoming request header. Do not activate mail if the hosted origin is unset or unverified. Render the date/time using the semester timezone when configured; otherwise use the app's current `America/New_York` fallback and print the zone name in the email. Friday meeting date and slot start times are saved in `meetings`; confirm which stored time is the Friday program's start before template finalization.

## Delivery boundary

An outbox row carries a non-null `semester_id`, event kind, source record/version, recipient profile, intended address snapshot, due time, status, and provider attempt/result. Unique event/recipient/version keys prevent duplicate mail. Queue generation is server-side and relies on authorized, saved state; recipient addresses come from current active memberships/profile records, never client-submitted email lists. A worker claims due rows, rechecks current source state and membership, renders the template, and calls Sequenzy with a server-only key. Mark provider acceptance separately from actual delivery. If a send result is ambiguous, quarantine it for reconciliation rather than blindly retrying.

Use caller-RLS for participant and admin actions. The worker uses a narrowly scoped, documented service identity and database functions/policies; it must not turn client-provided IDs into privileged reads or bypass RLS. Scope all event/outbox records to the allowed Supabase project `layjdjfvxkowxidwuvbs`. Record send status and failures for authorized administrators without exposing credentials or unnecessary personal data. Account deletion and membership changes must suppress or remove pending mail to that person.

## Release and verification

Build locally, with fake provider tests and a locally generated migration from declarative schema. Verify recipient selection, semester isolation, correct status and date/time, missing bio, link routing after sign-in, duplicate/retry handling, and cancellation/edit races. For live QA use user-designated disposable accounts/recipients and the authenticated browser runbook; never send to real participants as a test. Verify provider acceptance, recipient-folder receipt, links, persistence after reload, role boundaries, and worker scheduling. Hosted activation requires a verified public app URL, Sequenzy server key, required migrations, and explicit release authorization.

## Existing sources

- `src/mentor-booking/server.ts`, `src/mentor-booking/model.ts`, `app/dashboard/bookings/page.tsx`
- `src/friday-program/server.ts`, `src/friday-program/model.ts`, `components/friday-program/FridayProgramPanel.tsx`
- `src/outreach/cadence.ts`, `src/outreach/server/repository.ts`
- `src/notifications/sequenzy.ts`, `docs/runbooks/session-notifications.md`, `docs/runbooks/authenticated-qa.md`
