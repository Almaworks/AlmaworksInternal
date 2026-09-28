# Calendar-first mentor bookings

## Status

User-approved implementation direction, 2026-09-10.

## Goal

Make the weekly mentor calendar the sole control and display for recurring availability. A startup selects a valid 15-minute appointment in that calendar and submits it for the mentor's acceptance. Lists contain only actual booking requests and accepted bookings.

## Data model

Replace future, date-specific `mentor_booking_windows` as the availability source with `mentor_weekly_availability` ranges. Each range is owned by a mentor's semester membership, has a non-null `semester_id`, a weekday, and a local start/end time in the semester timezone. The calendar saves the complete current set of ranges atomically.

Keep `mentor_booking_requests` as the immutable historical record. New requests carry their chosen start/end timestamps and mentor identity directly; their legacy `window_id` becomes nullable so historic rows remain readable but new calendar-based requests need no synthetic availability record. Retire window claims and all future window publication/withdrawal paths. Existing historical rows remain retained.

## Rules and authorization

- A mentor may replace only their own active-semester weekly availability through an RLS-protected, security-invoker function.
- A range is aligned to 15 minutes, is a positive same-day local interval, and excludes Friday's 3–5 PM program interval.
- A startup may submit a 15-minute request only for a future date inside the semester, whose local weekday/time is fully covered by the chosen mentor's weekly availability. The database derives mentor and startup identities from the authenticated caller; client values are not trusted.
- Only the owning mentor may accept or decline; either party may cancel a pending or accepted request. Existing accepted mentor/startup overlap exclusions remain authoritative.
- Availability is readable only by active participants in the semester and semester administrators. Requests retain their existing private visibility boundaries.

## UI and API

For mentors, the Bookings page shows the weekly calendar, saved availability highlights, and real booking request/session cards. It removes date-range publishing controls, availability-window cards, and availability withdrawal actions. Saving the calendar replaces the mentor's recurring ranges.

For startups, the workspace shows mentor availability as calendars and allows choosing a future 15-minute cell plus a topic. The API accepts `replace_weekly_availability` and `request_booking` commands, while accepted/declined/cancelled commands remain.

## Verification

Add model/API parsing tests for calendar ranges and startup-selected requests; add pgTAP coverage for RLS, cross-semester isolation, Friday exclusion, coverage validation, and overlap behavior. Generate the migration only with `supabase db diff`, regenerate types, run focused tests, TypeScript, lint, and authenticated browser QA when available.
