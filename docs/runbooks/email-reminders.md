# Contextual email pipeline

## State

The startup booking request now sends its mentor notification directly from the authenticated booking API after the booking RPC saves. The generated `20260927022449_booking_request_direct_email.sql` migration adds startup requester RLS for only that booking's request delivery and is deployed to the pinned Almaworks Supabase project. The local app is enabled for the designated Fall 2026 semester using ignored `.env.local` settings `BOOKING_REQUEST_EMAIL_ENABLED`, `BOOKING_REQUEST_EMAIL_SEMESTER_IDS`, `BOOKING_REQUEST_EMAIL_ORIGIN`, and the server-only `SEQUENZY_API_KEY`. A unique delivery row prevents a repeat booking request from sending twice. The booking remains saved if Sequenzy rejects or the API call fails; inspect `rejected` or `unknown` rows before any manual retry. Do not automatically retry an uncertain send.

Authenticated Acme Inc. startup browser QA created a pending request for the designated mentor at 9:30 a.m. New York time on 2026-10-03. It persisted after reload. The exact hosted delivery row records Sequenzy acceptance, and its Sequenzy detail page shows DELIVERED with the correct recipient, topic, time, mentor bio, and exact Bookings link. The user confirmed receipt in the mentor Gmail account; the Inbox or Spam folder was not specified. The link is localhost because this is a local app deployment. The general scheduled worker for confirmation, Friday and outreach events is still disabled: it needs a public HTTPS deployment, server-only credentials, scoped permissions, a semester allowlist, and a schedule. Provider `accepted` alone does not prove inbox placement.

The one-booking local test now uses a dedicated pending Supabase Auth account with booking-only RLS, instead of an approved site administrator. The generated `20260927015608_notification_test_worker.sql` migration is deployed to the pinned project. Its JWT scope permits reading only the designated semester, mentor profile and booking and writing only that booking's request delivery. It grants no admin membership or general site access. The disposable one-shot runner in `work/email-reminders/local-booking-worker.mjs` sent the pending booking request; the delivery ledger records Sequenzy acceptance and the matching Sequenzy page shows delivered. The mentor's Gmail Inbox/Spam placement for this booking email remains to be checked. The link in this local test points to localhost and works only on the machine hosting the app. This test scope does not enable the scheduled production worker or the Friday and outreach pipelines.

The older development-only admin page at `/dashboard/admin/notification-test` remains for a one-booking diagnostic; it is not part of the automatic startup flow. `NOTIFICATION_ENABLED` remains unset locally, so it does not activate the general scheduled worker. The local direct booking path uses `SEQUENZY_API_KEY` server-side, and `BOOKING_REQUEST_EMAIL_ORIGIN=http://localhost:3000` is accepted only for this local deployment.

## Events

| Source | Email | Eligible recipients | Suppression |
| --- | --- | --- | --- |
| Pending mentor booking | Request details | Active approved mentor | Request no longer pending |
| Accepted booking | Confirmation | Active approved mentor and members of that startup | Status or version changed |
| Declined or canceled booking | Correction | Startup members; cancellation also reaches mentor | Status or version changed |
| Accepted booking 24 hours before start | Reminder | Mentor and startup members | Late acceptance, cancellation, time change, or start passed |
| Published Friday group | Assignment with speaker and group rotations | Members of that startup only | Regenerated assignment or canceled week |
| Changed Friday group | Updated assignment | Members of the changed startup | Current assignment differs |
| Canceled or restored Friday week | Correction with current status | Members of assigned startups | Latest week state differs |
| Friday 24 hours before start | Reminder | Members of assigned startup | Late publication, cancellation, or changed assignment |
| Weekday after 9 a.m. New York | One digest per owner and configured semester | Active approved admin owner | Nothing due; closed, silenced, snoozed, archived, or reassigned |

The worker runs as a normal authenticated account through Supabase RLS. The app never uses a service-role key for notification delivery. It scans current saved state to recover from an interrupted application request, inserts recipient-specific delivery rows with unique event identities, and rechecks status and membership before submitting. A worker claim changes `queued` to `submitting`. A second run cannot claim the same row. Sequenzy acceptance, rejection, and uncertain outcomes are stored separately; an uncertain submission is never retried automatically. A `submitting` row older than 15 minutes is quarantined as `unknown` for manual reconciliation.

The primary booking link opens the exact booking on the Almaworks Bookings page. Its calendar action offers Google or Apple options from the authenticated booking page. Friday links open the exact week. Outreach links open the exact opportunity after sign-in.

## Release prerequisites

1. Confirm the only Supabase target is `https://layjdjfvxkowxidwuvbs.supabase.co` (project `layjdjfvxkowxidwuvbs`). Compare hosted migration history with local migrations before applying anything; the current histories have diverged, so do not run a broad `db push`.
2. Completed with explicit user authorization on 2026-09-26: applied only the four generated notification migrations `20260926220127_notification_delivery.sql`, `20260926221127_notification_delivery_guard.sql`, `20260926221945_notification_delivery_email_normalization.sql`, and `20260926231810_notification_pipeline.sql`. Hosted migration versions differ from local filenames because the Supabase connector assigned deployment versions. Never hand-edit a migration.
3. Design and verify dedicated RLS permissions for a production worker covering the allowed semesters and event sources, or explicitly approve the current administrator-based production design before release. The booking-only local test account cannot serve all events. Do not use a service-role key for notification delivery. Store the worker's login only in server-side deployment secrets.
4. Set server-side environment variables: `NEXT_PUBLIC_SUPABASE_URL` (the exact URL above), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NOTIFICATION_APP_ORIGIN` (the public HTTPS app origin, no trailing slash), `SEQUENZY_API_KEY`, `NOTIFICATION_WORKER_EMAIL`, `NOTIFICATION_WORKER_PASSWORD`, `NOTIFICATION_CRON_SECRET` (at least 32 random characters), `NOTIFICATION_SEMESTER_IDS` (comma-separated explicit UUID allowlist), `NOTIFICATION_ACTIVATED_AT` (UTC timestamp at or after release), and `NOTIFICATION_ENABLED=true`. Keep the Sequenzy key and worker secrets out of browser variables.
5. Register a five-minute schedule for authenticated `GET https://<app-origin>/api/internal/notification-worker` with `Authorization: Bearer <NOTIFICATION_CRON_SECRET>`. Supabase Cron with Vault-backed URL and secret is suitable. Register it only after the app, schema, and approved test semester are ready. The endpoint sends a maximum of 25 queued messages per invocation; monitor backlog if volume exceeds that rate.
6. Start with a designated test semester and test inboxes. Verify a real startup request, mentor acceptance, one Friday group assignment/change, a due admin follow-up, correct recipient and content, exact link after login, current status after reload, and suppression after cancellation or membership change. Check Sequenzy's send ID and the recipient's Inbox/Spam. Follow `docs/runbooks/authenticated-qa.md`. Expand `NOTIFICATION_SEMESTER_IDS` only after these checks pass.

## Operations

- Pause all automated delivery by setting `NOTIFICATION_ENABLED=false` and stopping the schedule. Previously queued rows remain in the database; on re-enable, the activation timestamp and allowlist determine which rows the worker may process.
- Inspect `notification_deliveries` through an authorized semester administrator account. `accepted` means API acceptance; `rejected` is a provider rejection; `unknown` requires checking the provider by send time and recipient before any manual retry. Never change an `unknown` row to `queued` without confirming it was not accepted.
- To stop an individual queued message, use an authorized administrative correction to its source (booking status, assignment, membership, or follow-up); the worker then records `suppressed`. The email link always loads the current app state.
- Sequenzy's hosted sender was previously observed in Gmail Spam and with a `.sequenzymail1.com` rewrite. The user accepts Spam placement temporarily; do not claim inbox delivery from API acceptance.

## Local verification

Run `node --experimental-strip-types --test tests/notifications/*.test.mts tests/outreach/deep-link-selection.test.mts`, `npx tsc --noEmit`, `npm run lint`, `npm run db:migration-safety`, and an application build. The booking-only RLS migration replayed in a disposable Supabase stack and its pgTAP scope test passed 12/12. The 27 notification application tests and TypeScript check passed after the local send. Authenticated end-to-end QA for all events remains pending until the release prerequisites are met.
