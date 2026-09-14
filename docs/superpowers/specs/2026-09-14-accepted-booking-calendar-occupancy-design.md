# Accepted booking calendar occupancy

**Date:** 2026-09-14

**Status:** Approved in conversation; pending written-spec review

**Scope:** Mentor and startup booking calendars

## Goal

Once a mentor accepts a startup’s booking request, that dated appointment must no longer appear bookable for that mentor. Mentors need a distinct, week-specific calendar overlay identifying their accepted meeting, while startups need only a privacy-safe unavailable state. Pending requests do not block availability. Cancellation releases the slot, and completed meetings stop appearing as active calendar blocks after their end time.

## Existing behavior and constraints

- Mentor availability is stored as recurring weekly ranges and edited in a Sunday-through-Saturday 15-minute grid.
- Startup booking cells are dated slots projected from those recurring ranges.
- `mentor_booking_requests` contains private startup names and topics. Its RLS intentionally permits startups to read only their own startup’s requests.
- The calendar-first booking schema removed the older safe occupancy-claim table. A startup therefore cannot currently know that another startup’s accepted booking occupies a mentor without either leaking private request data or receiving a separate privacy-safe projection.
- Accepted-booking exclusion constraints already prevent a mentor or startup organization from having overlapping accepted sessions. The new projection complements those authoritative constraints; it does not replace them.
- All program-scoped data must include a non-null `semester_id`, all client access must use RLS, and migrations must be generated with `supabase db diff`.

## Considered approaches

### 1. RLS-protected accepted-occupancy relation — recommended

Maintain a small derived relation containing only request ID, semester ID, mentor-semester ID, and start/end timestamps. Active participants and semester administrators may read it through RLS. Triggered synchronization adds a row when a request becomes accepted and removes it when that accepted request is canceled.

This gives startups an accurate busy state without exposing startup identity, topic, request timestamps, or response history. It is transactionally consistent with request status and independently testable.

### 2. Filter using only requests visible to the current startup

This requires no schema change, but it hides only the startup’s own accepted requests. A mentor booked by a different startup would still look available, so the calendar would knowingly present stale choices and rely on a later conflict error.

### 3. Broaden startup access to accepted request rows

This could avoid a second relation, but the existing request table contains private booking details and uses shared authenticated table privileges. Broadening its RLS would make it difficult to guarantee that only mentor/time fields are exposed. This approach is rejected on privacy and least-privilege grounds.

## Data model and RLS

Add `public.mentor_booking_accepted_occupancy` with:

- `request_id uuid primary key` referencing `mentor_booking_requests(id)` with restricted deletion;
- `semester_id uuid not null`;
- `mentor_semester_id uuid not null`;
- `starts_at timestamptz not null`;
- `ends_at timestamptz not null`;
- composite foreign keys tying the mentor and request to the same semester;
- a valid-interval check and indexes supporting semester/time and mentor/time reads.

Enable RLS. A select policy permits a caller only when they are a semester administrator or have an active semester membership in the row’s semester. The relation contains no counterpart identity or topic. Anonymous access and all broad table privileges remain revoked; authenticated users receive only the privileges required by the RLS-backed read and synchronization paths.

An `AFTER INSERT OR UPDATE OF status` trigger on `mentor_booking_requests` synchronizes occupancy:

- entering `accepted` inserts the exact canonical mentor and interval fields;
- leaving `accepted` for `cancelled` removes the occupancy row;
- pending and declined requests have no occupancy row;
- acceptance and cancellation remain one transaction with their occupancy change.

The trigger is security-invoker. Narrow insert/delete RLS policies validate the linked request, exact copied values, terminal state, and caller’s existing booking-party authorization so direct writes cannot fabricate or prematurely remove occupancy. A migration backfills currently accepted requests. Declarative schema changes are made first, then the migration is generated via `supabase db diff`; `src/db/types.ts` is regenerated from the local database and never hand-edited.

## API and application model

The booking workspace response gains `acceptedOccupancy`, an array of:

```ts
{
  mentorSemesterId: string;
  startsAt: string;
  endsAt: string;
}
```

The server loads the occupancy relation alongside recurring availability and private requests after semester authorization. It returns no request ID or startup information to the browser. Response validation rejects malformed intervals or cross-semester data.

The `POST` response continues to reload the complete workspace after accept or cancel, so occupancy appears or disappears without a separate client mutation model. Database conflicts remain authoritative and are surfaced through the existing error handling.

## Mentor calendar behavior

The mentor grid combines recurring availability with the signed-in mentor’s accepted requests, which already include the owning startup name under existing RLS.

- Determine the current Sunday-through-Saturday week in the semester timezone.
- Include accepted requests whose interval overlaps that local week and whose end is later than the current instant.
- Map each overlapping 15-minute cell to a booked overlay without changing the recurring weekly availability stored underneath.
- Render booked cells in violet, disabled for pointer and keyboard selection, with an accessible label and tooltip such as `Booked with Acme Startup`.
- Keep the Friday 3–5 PM in-person reservation amber and authoritative if states would overlap.
- Keep pending requests visually and behaviorally unchanged.
- After cancellation, the refreshed workspace removes the violet overlay and reveals the recurring availability beneath it.
- Maintain a lightweight minute clock while the workspace is mounted. Once a meeting’s `endsAt` passes, recompute the overlay so it disappears without requiring reload. A meeting in progress remains blocked until its end.

Because the editor is recurring, a booked overlay disables only this week’s presentation; it does not delete or modify future recurring availability.

## Startup calendar behavior

Before building dated startup cells, remove a mentor from a projected slot whenever that mentor has an accepted occupancy interval overlapping the slot.

- Other mentors at the same time remain in the cell and its displayed count decreases.
- If no mentor remains, the dated cell is disabled and labeled unavailable.
- Pending, declined, canceled, and ended sessions do not block the slot.
- The UI receives no startup identity or topic for another startup’s booking.

The startup calendar’s existing future-date projection already removes past slots. Cancellation becomes visible after the mutation response or the next workspace reload.

## Failure behavior

- If occupancy loading fails, the booking workspace fails closed with its existing recoverable load error instead of showing a potentially bookable stale calendar.
- If an acceptance loses a concurrent conflict, no occupancy row is created and the existing database conflict is displayed.
- If the minute clock or timezone formatting encounters invalid data, response validation rejects the workspace rather than silently displaying the wrong week.

## Testing and verification

Use test-driven development for every behavior change.

1. Model tests: only accepted, unended intervals produce occupancy; pending, declined, canceled, and ended meetings do not.
2. Mentor overlay tests: current-week mapping, timezone boundaries, cancellation, after-end removal, violet booked state, and Friday-reservation precedence.
3. Startup projection tests: remove only the occupied mentor, retain other mentors, disable an empty cell, and preserve privacy-safe payloads.
4. Server tests: occupancy query, response mapping/validation, cross-semester failure, and refreshed accept/cancel responses.
5. Database pgTAP: RLS visibility, no private fields, exact trigger synchronization, backfill, unauthorized write rejection, accepted-only behavior, cancellation release, and overlap integrity.
6. Run focused tests, the complete booking suite, scoped ESLint, TypeScript, migration-safety checks, clean local Supabase reset, generated type validation, and `git diff --check`.
7. Follow `docs/runbooks/authenticated-qa.md` using real mentor and startup accounts. Verify accept → colored mentor block → startup unavailable → reload persistence → cancel → availability restored, including desktop and narrow layouts. Mark browser scenarios blocked rather than passed if credentials or Browser access are unavailable.

No remote migration, deployment, email, calendar invitation, or real participant mutation is authorized by this design.
