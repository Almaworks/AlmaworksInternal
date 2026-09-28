# Optional Google Calendar availability and meeting holds

User objective: optional mentor onboarding and ongoing Availability integration; import free time inferred from existing busy events, editable dated slots or ongoing sync; consistent mentor/admin/startup availability; Google holds for both meeting parties; real role QA against the designated mentor's own calendar. This is an implementation design under the user's explicit request, not a record of completion or OAuth consent.

## Product behavior

Connecting Calendar is optional and never required to complete onboarding or use manual scheduling. The same connection component appears in mentor onboarding and Availability. Connecting Google is distinct from signing into Almaworks: state is bound to the currently authenticated profile and semester and does not change the Almaworks identity. A mentor may connect a different Google account deliberately after seeing the account selection.

Google supplies busy intervals, not preferred working hours. Proposed defaults, pending the user's optional preference response: weekdays 09:00–17:00 in the mentor's selected timezone; show and let the mentor adjust these before publishing. Preserve existing hours when present. Never interpret an empty calendar as 24/7 availability. Preserve the existing Friday 15:00–17:00 program reservation and all accepted bookings.

Modes: keep synced (default after choosing Connect) and import once/manage manually. A one-time import snapshots dated availability and remains editable without further Google changes. Synced mode combines weekly hours with current Google busy intervals; per-date unavailable exceptions persist across refreshes. A per-date available exception can extend working hours but cannot override a Google conflict while synced. Switching to manual freezes the effective schedule, where individual slots may be edited. Returning to sync explicitly refreshes Google and preserves named manual unavailable exceptions. Disconnect removes tokens and prevents future Google writes; it offers an explicit choice to keep the current manual snapshot or clear imported availability.

Both mentor and admin views need a dated effective calendar, not only the repeating weekly template. Startup calendar consumes the same effective availability. Labels distinguish working hours, Google busy, manual exceptions, accepted bookings, and sync state for the owner; other roles get only bookable intervals. Never expose event titles, descriptions, attendees, locations, or OAuth credentials.

## Consistency and sync

Store absolute UTC intervals plus the chosen IANA timezone. Project weekly hours over a bounded rolling horizon (90 days, clipped to semester) with daylight-saving-aware conversion. Handle all-day/recurring events through Google FreeBusy. Validate and merge overlapping busy intervals; a provider error must not become an empty/free calendar.

Refresh on connection, manual Sync now, and a scheduled worker while the browser is closed. Aim for five-minute refresh with explicit last-success, coverage and error state. Synced availability outside known coverage or after a bounded stale threshold is unavailable until refreshed. Before request/accept, reconcile current Google conflicts; database checks remain authoritative against concurrent updates. Google can change between any two systems' operations, so detect late collisions, flag them, and do not silently cancel accepted mentorship meetings.

One SQL availability predicate governs booking creation/acceptance and effective-slot projection. It combines current membership, semester boundaries, weekly hours or dated manual availability, overrides, Google busy snapshot, program reservations and accepted bookings. Direct API/database calls cannot book a slot the shared calendar rejects. Existing manual users retain existing behavior.

## Google access and storage

Use OAuth authorization-code flow with offline refresh, PKCE, one-use state bound to authenticated profile, expiry and allowlisted callback. Request minimum required scopes for free/busy and owned event holds, plus account identity. Do not rely on Supabase sign-in provider tokens surviving session refresh. Refresh tokens must be encrypted server-side with authenticated encryption and per-record context; no secret key or plaintext token reaches browser responses/logs.

Global connection records are identity/integration configuration and require a documented semester exemption. Semester-scoped settings, busy intervals, overrides and booking hold/outbox records require non-null semester_id. RLS governs user access; ordinary roles cannot enumerate other connections or raw busy metadata. Scheduled worker uses tightly scoped database operations with an explicit RLS role; no blanket RLS bypass. Worker jobs are leased, bounded and retryable. OAuth failures/revocation mark reconnect required and stop writes.

Schema integration must cover full personal deletion and disconnect: stop sync/hold jobs, clean provider-created holds when feasible, remove tokens, remove private busy intervals/settings, retain only anonymized booking history. Missing provider access is reported honestly rather than claiming remote cleanup occurred.

## Meeting holds

Proposed default pending user preference: accepted bookings create holds; pending requests do not reserve Google time. Each connected party (mentor and requesting startup member) receives a private opaque event in their connected calendar. Startup has an optional Calendar connection for holds, without mentor working-hour controls. Deterministic event identifiers and a durable per-booking/per-connection outbox prevent duplicates on retries. Cancellation removes only Almaworks-created holds; acceptance/reschedule retries reconcile current desired state. Google failures must not falsely report a hold as synchronized or undo a persisted app booking.

If a party is not connected, show that automatic placement is unavailable; an invitation can be a separately authorized fallback but is not evidence of a hold appearing on that person's calendar. Do not promise two-sided placement without both parties' authorization. Real QA may create/cancel only clearly named disposable mentorship holds under the user's authorized test workflow; never alter pre-existing Google events.

## Verification and release

Unit/provider tests: intervals, boundaries/DST, all-day events, one-time snapshot, overrides, stale coverage, Google errors, refresh rotation/revocation, OAuth state binding/replay, encryption, idempotent holds and cancellation recovery. Database tests: RLS across all roles, booking guard parity, concurrent conflicts, worker leasing, deletion lifecycle. Generate migrations with supabase db diff using a verified-new uniquely named stack; never reset the existing default stack. Generate database types; preserve unrelated work.

Authenticated browser QA: connect designated real mentor Google calendar; complete optional onboarding or skip; compare busy times without recording private event details; import/sync/override/reload; change a disposable event and observe automatic propagation; verify actual admin and startup views and booking rejection; accept/cancel fixture booking and inspect holds for both authorized parties. Test desktop/narrow layout and disconnected/provider-error states. Record PASS/FAIL/BLOCKED per requirement. Missing OAuth credentials, consent, worker deployment or second-party authorization remains an explicit blocker, not a passing mock test.

Alternatives considered: UI-only filtering is inadequate because it allows API double-booking; connector-only access does not create a reusable product integration; full event mirroring collects unnecessary private data. Chosen approach uses FreeBusy plus app-owned event holds and shared authoritative availability.
